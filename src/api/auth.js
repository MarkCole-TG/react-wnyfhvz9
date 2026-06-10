const DEV_BYPASS_OBJECT_ID = "oid-planner";
const DEV_BYPASS_TENANT_ID = "dev";

function getMode() {
   const configured = import.meta.env.VITE_API_AUTH_MODE;
   if (configured) return configured;
  return import.meta.env.DEV ? "dev-bypass" : "swa";
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
