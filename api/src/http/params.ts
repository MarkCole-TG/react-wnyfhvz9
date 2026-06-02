import { HttpRequest } from "@azure/functions";

export async function getJsonBody<T>(req: HttpRequest): Promise<T> {
  if (typeof req.json === "function") {
    try {
      return (await req.json()) as T;
    } catch {
      return {} as T;
    }
  }

  return (req.body ?? {}) as T;
}

export function getQueryParam(req: HttpRequest, name: string): string {
  return req.query.get(name) ?? "";
}

export function parseWeek(week: string): string {
  return week.trim();
}
