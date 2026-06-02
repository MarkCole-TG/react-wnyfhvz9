import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { authorizeRequest } from "../security/authorize";
import { fail, ok } from "../http/response";
import { getJsonBody, InvalidJsonBodyError, parseWeek } from "../http/params";
import { upsertScheduleRow } from "../data/store";
import { SchedulePayload } from "../data/store";

export async function UpsertSchedule(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = await authorizeRequest(req, context.invocationId, ["planner", "admin"]);
  if (!auth.ok) {
    const failure = auth as unknown as { status: number; body: { error: { code: string; message: string; correlationId: string } } };
    return fail(failure.status, failure.body.error.code, failure.body.error.message, failure.body.error.correlationId);
  }

  const week = parseWeek(req.params.week ?? "");
  const staffId = (req.params.staffId ?? "").trim();
  if (!week || !staffId) {
    return fail(400, "missing_route_params", "Route parameters 'week' and 'staffId' are required.", context.invocationId);
  }

  let body: SchedulePayload;
  try {
    body = await getJsonBody<SchedulePayload>(req);
    const row = upsertScheduleRow(week, staffId, body);
    if (!row) {
      return fail(404, "staff_not_found", "Staff record was not found.", context.invocationId);
    }

    return ok({ week, row }, 200);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return fail(400, "invalid_json", "Request body must be valid JSON.", context.invocationId);
    }

    if (error instanceof Error && error.message === "week_locked") {
      return fail(409, "week_locked", "The week is locked.", context.invocationId);
    }

    return fail(500, "server_error", "Unable to update schedule.", context.invocationId);
  }
}

app.http("UpsertSchedule", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "v1/schedule/{week}/{staffId}",
  handler: UpsertSchedule,
});
