export type AppRole = "viewer" | "planner" | "admin";

export interface TokenPrincipal {
  entraObjectId: string;
  tenantId?: string;
  audience?: string;
  issuer?: string;
}

export interface AppUser {
  userId: string;
  entraObjectId: string;
  roles: AppRole[];
  isActive: boolean;
}

export interface AuthErrorPayload {
  error: {
    code: string;
    message: string;
    correlationId: string;
  };
}

export type AuthResult =
  | { ok: true; user: AppUser }
  | { ok: false; status: 401 | 403; body: AuthErrorPayload };
