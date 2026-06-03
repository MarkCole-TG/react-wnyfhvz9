import { apiRequest } from "./client";

export async function fetchStaff() {
  const payload = await apiRequest("/v1/staff");
  return payload?.staff || [];
}

export async function createStaffMember(input) {
  const payload = await apiRequest("/v1/staff", {
    method: "POST",
    body: {
      name: input.name,
      number: input.number
    }
  });

  return payload?.staff;
}

export async function updateStaffMember(staffId, input) {
  const payload = await apiRequest(`/v1/staff/${encodeURIComponent(staffId)}`, {
    method: "PATCH",
    body: {
      name: input.name,
      number: input.number,
      updatedAt: input.updatedAt
    }
  });

  return payload?.staff;
}

export async function deleteStaffMember(staffId, updatedAt) {
  await apiRequest(`/v1/staff/${encodeURIComponent(staffId)}`, {
    method: "DELETE",
    query: { updatedAt }
  });

  return true;
}
