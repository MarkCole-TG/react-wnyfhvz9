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

  const user = await resolveUser(tokenValidation.principal.entraObjectId);
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

  const isAuthorized = user.roles.some((role) => allowedRoles.includes(role));
  if (!isAuthorized) {
    return {
      ok: false,
      status: 403,
      body: errorBody(
        "insufficient_role",
        "Your role does not allow this operation.",
        correlationId
      ),
    };
  }

  return {
    ok: true,
    user,
  };
}

function useSqlUserStore() {
  return process.env.SQL_USE_DATABASE === "true";
}

async function resolveUser(entraObjectId: string) {
  if (!useSqlUserStore()) {
    return findConfigUserByEntraObjectId(entraObjectId);
  }

  try {
    return await findSqlUserByEntraObjectId(entraObjectId);
  } catch (error) {
    console.error("Failed to resolve user from SQL store:", error);
    return null;
  }
}
