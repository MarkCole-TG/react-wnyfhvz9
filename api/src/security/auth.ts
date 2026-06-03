import { HttpRequest } from "@azure/functions";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { TokenPrincipal } from "./types";

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
