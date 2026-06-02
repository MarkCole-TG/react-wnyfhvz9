import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { authorizeRequest } from "../security/authorize";
import { fail, ok } from "../http/response";
import { getJsonBody, InvalidJsonBodyError } from "../http/params";
import { StaffUpdatePayload, updateStaff } from "../data/store";

export async function UpdateStaff(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = await authorizeRequest(req, context.invocationId, ["planner", "admin"]);
  if (!auth.ok) {
    const failure = auth as unknown as { status: number; body: { error: { code: string; message: string; correlationId: string } } };
    return fail(failure.status, failure.body.error.code, failure.body.error.message, failure.body.error.correlationId);
  }

  const staffId = (req.params.staffId ?? "").trim();
  if (!staffId) {
    return fail(400, "missing_staff_id", "Route parameter 'staffId' is required.", context.invocationId);
  }

  let body: StaffUpdatePayload;
  try {
    body = await getJsonBody<StaffUpdatePayload>(req);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return fail(400, "invalid_json", "Request body must be valid JSON.", context.invocationId);
    }

    return fail(500, "server_error", "Unable to update staff.", context.invocationId);
  }

  const staff = updateStaff(staffId, body);
  if (!staff) {
    return fail(404, "staff_not_found", "Staff record was not found.", context.invocationId);
  }

  return ok({ staff });
}

app.http("UpdateStaff", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "v1/staff/{staffId}",
  handler: UpdateStaff,
});
