import { apiRequest } from "./client";

export async function fetchScheduleWeek(weekIsoDate) {
  const payload = await apiRequest("/v1/schedule", {
    query: { week: weekIsoDate }
  });

  return {
    week: payload?.week,
    rows: payload?.rows || []
  };
}

export async function upsertScheduleEntry(weekIsoDate, staffId, rowPatch) {
  const payload = await apiRequest(`/v1/schedule/${encodeURIComponent(weekIsoDate)}/${encodeURIComponent(staffId)}`, {
    method: "PUT",
    body: rowPatch
  });

  return payload?.row;
}
