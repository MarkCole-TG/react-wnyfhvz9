import { apiRequest } from "./client";

export async function lockWeek(weekIsoDate) {
  const payload = await apiRequest(`/v1/weeks/${encodeURIComponent(weekIsoDate)}/lock`, {
    method: "POST"
  });

  return payload?.week;
}

export async function unlockWeek(weekIsoDate) {
  const payload = await apiRequest(`/v1/weeks/${encodeURIComponent(weekIsoDate)}/unlock`, {
    method: "POST"
  });

  return payload?.week;
}

export async function updateUserRoles(entraObjectId, roles) {
  const payload = await apiRequest(`/v1/users/${encodeURIComponent(entraObjectId)}/roles`, {
    method: "PUT",
    body: {
      roles
    }
  });

  return payload;
}
