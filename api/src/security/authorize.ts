import { HttpRequest } from "@azure/functions";
import { findUserByEntraObjectId as findConfigUserByEntraObjectId } from "./userStore";
import { findUserByEntraObjectId as findSqlUserByEntraObjectId } from "../data/userStore-sql";
import { validateAccessToken } from "./auth";
import { AppRole, AuthResult } from "./types";

function errorBody(code: string, message: string, correlationId: string) {
  return {
    error: {
      code,
      message,
      correlationId,
    },
  };
}

export async function authorizeRequest(req: HttpRequest, correlationId: string, allowedRoles: AppRole[]): Promise<AuthResult> {
  const tokenValidation = await validateAccessToken(req);
  if (!tokenValidation.ok) {
    const failure = tokenValidation as unknown as { code: string; message: string };
    return {
      ok: false,
      status: 401,
      body: errorBody(
        failure.code,
        failure.message,
        correlationId
      ),
    };
  }

  const user = useTokenRoleAuthorization()
    ? buildUserFromTokenRoles(tokenValidation.principal.entraObjectId, tokenValidation.principal.roles)
    : await resolveUser(tokenValidation.principal.entraObjectId);
  if (!user) {
    return {
      ok: false,
      status: 403,
      body: errorBody(
        "user_not_mapped",
        "Authenticated user is not mapped in AppUsers/UserRoles.",
        correlationId
      ),
    };
  }

  if (!user.isActive) {
    return {
      ok: false,
      status: 403,
      body: errorBody(
        "user_inactive",
        "Authenticated user account is inactive.",
        correlationId
      ),
    };
  }

  // Role checks are intentionally disabled: all authenticated active users are authorized.
  void allowedRoles;

  return {
    ok: true,
    user,
  };
}

function useSqlUserStore() {
  return process.env.SQL_USE_DATABASE === "true";
}

function useTokenRoleAuthorization() {
  return process.env.AUTH_USE_TOKEN_ROLES !== "false";
}

function buildUserFromTokenRoles(entraObjectId: string, roles: AppRole[]) {
  return {
    userId: entraObjectId,
    entraObjectId,
    roles,
    isActive: true,
  };
}

async function resolveUser(entraObjectId: string) {
  if (useSqlUserStore()) {
    return await findSqlUserByEntraObjectId(entraObjectId);
  }

  try {
    return findConfigUserByEntraObjectId(entraObjectId);
  } catch (error) {
    console.error("Failed to resolve user from AppUsers config:", error);
    return null;
  }
}
