import { apiRequest } from "./client";

export async function fetchApiMessage() {
  try {
    const payload = await apiRequest("/message");
    return payload?.message || "";
  } catch {
    const fallback = await apiRequest("/GetMessage");
    return fallback?.message || "";
  }
}
