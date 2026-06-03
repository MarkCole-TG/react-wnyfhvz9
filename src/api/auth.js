const DEV_BYPASS_OBJECT_ID = "oid-planner";
const DEV_BYPASS_TENANT_ID = "dev";
const DEV_BYPASS_BEARER = "dev-bypass-token";

function getMode() {
   const configured = import.meta.env.VITE_API_AUTH_MODE;
   if (configured) return configured;
   return import.meta.env.DEV ? "dev-bypass" : "bearer";
}

function getDevBypassHeaders() {
  const objectId = import.meta.env.VITE_DEV_ENTRA_OBJECT_ID || DEV_BYPASS_OBJECT_ID;
  const tenantId = import.meta.env.VITE_DEV_TENANT_ID || DEV_BYPASS_TENANT_ID;
  const bearer = import.meta.env.VITE_DEV_BEARER_TOKEN || DEV_BYPASS_BEARER;

  return {
    Authorization: `Bearer ${bearer}`,
    "x-dev-entra-object-id": objectId,
    "x-dev-tenant-id": tenantId
  };
}

async function getBearerHeaders() {
  const tokenProvider = globalThis.__plannerGetAccessToken;
  if (typeof tokenProvider === "function") {
    const token = await tokenProvider();
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  }

  const staticToken = import.meta.env.VITE_API_BEARER_TOKEN;
  if (staticToken) {
    return { Authorization: `Bearer ${staticToken}` };
  }

  return {};
}

export async function getApiAuthHeaders() {
  if (getMode() === "bearer") {
    return getBearerHeaders();
  }

  return getDevBypassHeaders();
}
