import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { authorizeRequest } from "../security/authorize";
import { fail, ok } from "../http/response";
import { getQueryParam, parseWeek } from "../http/params";
import { listSchedule, getWeekRecord } from "../data/store-sql";

export async function GetSchedule(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = await authorizeRequest(req, context.invocationId, ["viewer", "planner", "admin"]);
  if (!auth.ok) {
    const failure = auth as unknown as { status: number; body: { error: { code: string; message: string; correlationId: string } } };
    return fail(failure.status, failure.body.error.code, failure.body.error.message, failure.body.error.correlationId);
  }

  const week = parseWeek(getQueryParam(req, "week"));
  if (!week) {
    return fail(400, "missing_week", "Query parameter 'week' is required.", context.invocationId);
  }

  const weekRecord = await getWeekRecord(week);
  const rows = await listSchedule(week);

  return ok({
    week: weekRecord,
    rows,
  });
}

app.http("GetSchedule", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "v1/schedule",
  handler: GetSchedule,
});
