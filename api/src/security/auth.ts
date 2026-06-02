import { HttpRequest } from "@azure/functions";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { TokenPrincipal } from "./types";

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
  return `${issuer}/discovery/v2.0/keys`;
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
    const jwks = createRemoteJWKSet(new URL(getJwksUri(issuer)));
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

  if (process.env.AUTH_DEV_BYPASS === "true") {
    return validateWithBypass(req, token);
  }

  return validateWithEntra(token);
}
