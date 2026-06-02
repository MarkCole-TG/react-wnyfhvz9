import { AppRole, AppUser } from "./types";

interface AppUsersConfigRow {
  userId: string;
  entraObjectId: string;
  roles: string[];
  isActive?: boolean;
}

function isRole(value: string): value is AppRole {
  return value === "viewer" || value === "planner" || value === "admin";
}

const roleOverrides = new Map<string, AppRole[]>();
const activeOverrides = new Map<string, boolean>();

export function resetUserOverrides() {
  roleOverrides.clear();
  activeOverrides.clear();
}

function parseAppUsersJson(): AppUsersConfigRow[] {
  const raw = process.env.APP_USERS_JSON;
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function findUserByEntraObjectId(entraObjectId: string): AppUser | null {
  const users = parseAppUsersJson();
  const matched = users.find((item) => item.entraObjectId === entraObjectId);
  if (!matched) {
    return null;
  }

  const roles = roleOverrides.get(entraObjectId) ?? (Array.isArray(matched.roles) ? matched.roles : []).filter(isRole);
  return {
    userId: matched.userId,
    entraObjectId: matched.entraObjectId,
    roles,
    isActive: activeOverrides.get(entraObjectId) ?? matched.isActive !== false,
  };
}

export function setUserRoles(entraObjectId: string, roles: AppRole[]) {
  roleOverrides.set(entraObjectId, roles);
}

export function setUserActive(entraObjectId: string, isActive: boolean) {
  activeOverrides.set(entraObjectId, isActive);
}
