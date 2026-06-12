import { getApiAuthHeaders } from "./auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export class ApiError extends Error {
  constructor(message, status, code, correlationId) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.correlationId = correlationId;
  }
}

function buildUrl(path, query) {
  const url = new URL(`${API_BASE_URL}${path}`, window.location.origin);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }

  if (API_BASE_URL.startsWith("http")) {
    return url.toString();
  }

  return `${url.pathname}${url.search}`;
}

export async function apiRequest(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const hasBody = options.body !== undefined;
  const authHeaders = await getApiAuthHeaders();
  const headers = {
    ...authHeaders,
    ...(options.headers || {})
  };

  // Avoid forcing a preflight on simple GET requests.
  if (hasBody && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(buildUrl(path, options.query), {
    method,
    headers,
    body: hasBody ? JSON.stringify(options.body) : undefined
  });

  const contentType = response.headers.get("content-type") || "";
  const hasJsonBody = contentType.includes("application/json");
  const payload = hasJsonBody ? await response.json() : null;

  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(
      error?.message || `API request failed with status ${response.status}`,
      response.status,
      error?.code || "api_error",
      error?.correlationId
    );
  }

  return payload;
}
