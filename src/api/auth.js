const DEV_BYPASS_OBJECT_ID = "oid-planner";
const DEV_BYPASS_TENANT_ID = "dev";
const DEV_BYPASS_USER_NAME = "Development User";

function getMode() {
   const configured = import.meta.env.VITE_API_AUTH_MODE;
   if (configured) return configured;
  return import.meta.env.DEV ? "dev-bypass" : "swa";
}

function normalizePrincipalName(principal) {
  if (!principal || typeof principal !== "object") {
    return "";
  }

  const names = [
    principal.userDetails,
    principal.userName,
    principal.name,
    principal.displayName
  ];

  const resolved = names.find((value) => typeof value === "string" && value.trim().length > 0);
  return resolved ? resolved.trim() : "";
}

function getDevBypassHeaders() {
  const objectId = import.meta.env.VITE_DEV_ENTRA_OBJECT_ID || DEV_BYPASS_OBJECT_ID;
  const tenantId = import.meta.env.VITE_DEV_TENANT_ID || DEV_BYPASS_TENANT_ID;

  return {
    "x-dev-entra-object-id": objectId,
    "x-dev-tenant-id": tenantId
  };
}

export async function getApiAuthHeaders() {
  if (getMode() === "dev-bypass") {
    return getDevBypassHeaders();
  }

  return {};
}

export async function getCurrentUser() {
  if (getMode() === "dev-bypass") {
    return {
      isAuthenticated: true,
      displayName: import.meta.env.VITE_DEV_USER_NAME || DEV_BYPASS_USER_NAME
    };
  }

  const response = await fetch("/.auth/me", {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Unable to load current user (${response.status}).`);
  }

  const payload = await response.json();
  const principal = Array.isArray(payload)
    ? payload[0]?.clientPrincipal || null
    : payload?.clientPrincipal || null;

  const displayName = normalizePrincipalName(principal);

  return {
    isAuthenticated: Boolean(principal),
    displayName
  };
}
