import { HttpRequest } from "@azure/functions";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { AppRole, TokenPrincipal } from "./types";

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

interface TokenValidationResult {
  ok: true;
  principal: TokenPrincipal;
}

interface TokenValidationFailure {
  ok: false;
  code: "missing_token" | "invalid_token";
  message: string;
}

const FALLBACK_ISSUER_BASE = "https://login.microsoftonline.com";

function isLocalBypassContext() {
  return (
    process.env.NODE_ENV === "test" ||
    Boolean(process.env.AzureWebJobsScriptRoot) ||
    Boolean(process.env.FUNCTIONS_CORE_TOOLS_ENVIRONMENT)
  );
}

function isDevBypassEnabled() {
  if (process.env.AUTH_DEV_BYPASS !== "true") {
    return false;
  }

  if (process.env.WEBSITE_INSTANCE_ID) {
    return false;
  }

  return isLocalBypassContext();
}

function getBearerToken(req: HttpRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = auth.slice(7).trim();
  return token.length > 0 ? token : null;
}

function decodeBase64Json(value: string): unknown | null {
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function getClaimMap(claims: unknown): Record<string, string> {
  if (!Array.isArray(claims)) {
    return {};
  }

  return claims.reduce<Record<string, string>>((acc, claim) => {
    if (claim && typeof claim === "object") {
      const type = (claim as { typ?: unknown; type?: unknown }).typ ?? (claim as { typ?: unknown; type?: unknown }).type;
      const value = (claim as { val?: unknown; value?: unknown }).val ?? (claim as { val?: unknown; value?: unknown }).value;
      if (typeof type === "string" && typeof value === "string") {
        acc[type] = value;
      }
    }
    return acc;
  }, {});
}

function normalizeAppRole(value: string): AppRole | null {
  const normalized = value.trim().toLowerCase();

  // Accept common role claim shapes like "Admin", "role:admin", or "app/admin".
  if (normalized === "viewer" || normalized.endsWith("/viewer") || normalized.endsWith(":viewer")) {
    return "viewer";
  }

  if (normalized === "planner" || normalized.endsWith("/planner") || normalized.endsWith(":planner")) {
    return "planner";
  }

  if (normalized === "admin" || normalized.endsWith("/admin") || normalized.endsWith(":admin")) {
    return "admin";
  }

  return null;
}

function getClaimValues(claims: unknown, claimType: string): string[] {
  if (!Array.isArray(claims)) {
    return [];
  }

  return claims
    .map((claim) => {
      if (!claim || typeof claim !== "object") {
        return null;
      }

      const type = (claim as { typ?: unknown; type?: unknown }).typ ?? (claim as { typ?: unknown; type?: unknown }).type;
      const value = (claim as { val?: unknown; value?: unknown }).val ?? (claim as { val?: unknown; value?: unknown }).value;
      if (type !== claimType || typeof value !== "string") {
        return null;
      }

      return value;
    })
    .filter((value): value is string => Boolean(value));
}

function getRolesFromSwaClaims(claims: unknown): AppRole[] {
  const directRoles = getClaimValues(claims, "roles");
  const legacyRoles = getClaimValues(claims, "role");
  const schemaRoles = getClaimValues(claims, "http://schemas.microsoft.com/ws/2008/06/identity/claims/role");

  return [...new Set([...directRoles, ...legacyRoles, ...schemaRoles])]
    .map((role) => normalizeAppRole(role))
    .filter((role): role is AppRole => role !== null);
}

function getRolesFromJwtPayload(payload: Record<string, unknown>): AppRole[] {
  const raw = payload.roles;
  if (Array.isArray(raw)) {
    return raw
      .filter((role): role is string => typeof role === "string")
      .map((role) => normalizeAppRole(role))
      .filter((role): role is AppRole => role !== null);
  }

  if (typeof raw === "string") {
    const role = normalizeAppRole(raw);
    return role ? [role] : [];
  }

  return [];
}

function validateWithSwaPrincipal(req: HttpRequest): TokenValidationResult | TokenValidationFailure | null {
  const rawPrincipal = req.headers.get("x-ms-client-principal");
  if (!rawPrincipal) {
    return null;
  }

  const decoded = decodeBase64Json(rawPrincipal);
  if (!decoded || typeof decoded !== "object") {
    return {
      ok: false,
      code: "invalid_token",
      message: "SWA client principal header could not be decoded.",
    };
  }

  const decodedObject = decoded as { clientPrincipal?: unknown; claims?: unknown; userId?: unknown };
  const principal = (decodedObject.clientPrincipal ?? decodedObject) as { claims?: unknown; userId?: unknown };
  if (!principal) {
    return {
      ok: false,
      code: "invalid_token",
      message: "SWA client principal header is missing principal data.",
    };
  }

  const claims = getClaimMap(principal.claims);
  const entraObjectId =
    claims.oid ||
    claims["http://schemas.microsoft.com/identity/claims/objectidentifier"] ||
    claims["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] ||
    claims.sub ||
    (typeof principal.userId === "string" ? principal.userId : "");

  if (!entraObjectId) {
    return {
      ok: false,
      code: "invalid_token",
      message: "SWA client principal does not include an object identifier.",
    };
  }

  return {
    ok: true,
    principal: {
      entraObjectId,
      roles: getRolesFromSwaClaims(principal.claims),
      tenantId: claims.tid || undefined,
      audience: claims.aud || undefined,
      issuer: claims.iss || undefined,
    },
  };
}

function getExpectedIssuer(): string {
  const configuredIssuer = process.env.ENTRA_ISSUER;
  if (configuredIssuer) {
    return configuredIssuer;
  }

  const tenantId = process.env.ENTRA_TENANT_ID;
  if (!tenantId) {
    return "";
  }

  return `${FALLBACK_ISSUER_BASE}/${tenantId}/v2.0`;
}

function getJwksUri(issuer: string): string {
  const base = issuer.replace(/\/v2\.0\/?$/, "");
  return `${base}/discovery/v2.0/keys`;
}

function getIssuerJwks(issuer: string) {
  const cached = jwksByIssuer.get(issuer);
  if (cached) {
    return cached;
  }

  const created = createRemoteJWKSet(new URL(getJwksUri(issuer)));
  jwksByIssuer.set(issuer, created);
  return created;
}

async function validateWithBypass(req: HttpRequest, token: string): Promise<TokenValidationResult | TokenValidationFailure> {
  const entraObjectId = req.headers.get("x-dev-entra-object-id") || "";
  if (!entraObjectId) {
    return {
      ok: false,
      code: "invalid_token",
      message: "Token rejected in dev bypass mode. Missing x-dev-entra-object-id header.",
    };
  }

  return {
    ok: true,
    principal: {
      entraObjectId,
      roles: ["admin"],
      audience: "dev",
      issuer: "dev-bypass",
      tenantId: req.headers.get("x-dev-tenant-id") || "dev",
    },
  };
}

async function validateWithEntra(token: string): Promise<TokenValidationResult | TokenValidationFailure> {
  const audience = process.env.ENTRA_API_AUDIENCE;
  const issuer = getExpectedIssuer();

  if (!audience || !issuer) {
    return {
      ok: false,
      code: "invalid_token",
      message: "Token validation is not configured. Set ENTRA_API_AUDIENCE and ENTRA_TENANT_ID or ENTRA_ISSUER.",
    };
  }

  try {
    const jwks = getIssuerJwks(issuer);
    const verified = await jwtVerify(token, jwks, {
      issuer,
      audience,
      clockTolerance: 5,
    });

    const entraObjectId = typeof verified.payload.oid === "string" ? verified.payload.oid : "";
    if (!entraObjectId) {
      return {
        ok: false,
        code: "invalid_token",
        message: "Token does not include oid claim.",
      };
    }

    return {
      ok: true,
      principal: {
        entraObjectId,
        roles: getRolesFromJwtPayload(verified.payload as Record<string, unknown>),
        tenantId: typeof verified.payload.tid === "string" ? verified.payload.tid : undefined,
        audience: typeof verified.payload.aud === "string" ? verified.payload.aud : undefined,
        issuer: typeof verified.payload.iss === "string" ? verified.payload.iss : undefined,
      },
    };
  } catch {
    return {
      ok: false,
      code: "invalid_token",
      message: "Bearer token verification failed.",
    };
  }
}

export async function validateAccessToken(req: HttpRequest): Promise<TokenValidationResult | TokenValidationFailure> {
  const swaPrincipal = validateWithSwaPrincipal(req);
  if (swaPrincipal) {
    if (swaPrincipal.ok) {
      return swaPrincipal;
    }

    return swaPrincipal;
  }

  const token = getBearerToken(req);
  if (!token) {
    return {
      ok: false,
      code: "missing_token",
      message: "Authorization header is required and must be a bearer token.",
    };
  }

  if (isDevBypassEnabled()) {
    return validateWithBypass(req, token);
  }

  return validateWithEntra(token);
}
