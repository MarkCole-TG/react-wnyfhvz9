import { HttpResponseInit } from "@azure/functions";

export function ok(jsonBody: unknown, status = 200): HttpResponseInit {
  return {
    status,
    jsonBody,
  };
}

export function fail(status: number, code: string, message: string, correlationId: string): HttpResponseInit {
  return {
    status,
    jsonBody: {
      error: {
        code,
        message,
        correlationId,
      },
    },
  };
}
