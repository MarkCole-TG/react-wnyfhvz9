import { HttpRequest } from "@azure/functions";

export class InvalidJsonBodyError extends Error {
  constructor() {
    super("invalid_json");
  }
}

export async function getJsonBody<T>(req: HttpRequest): Promise<T> {
  if (typeof req.json === "function") {
    try {
      return (await req.json()) as T;
    } catch {
      throw new InvalidJsonBodyError();
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
