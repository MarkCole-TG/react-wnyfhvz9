import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { authorizeRequest } from "../security/authorize";
import { fail, ok } from "../http/response";
import { getJsonBody, InvalidJsonBodyError } from "../http/params";
import { StaffUpdatePayload, updateStaff } from "../data/store-sql";

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

  let staff;
  try {
    staff = await updateStaff(staffId, body);
    if (!staff) {
      return fail(404, "staff_not_found", "Staff record was not found.", context.invocationId);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "missing_updated_at") {
      return fail(409, "missing_updated_at", "The current staff updatedAt value is required for this update.", context.invocationId);
    }

    if (error instanceof Error && error.message === "version_mismatch") {
      return fail(409, "version_mismatch", "The staff record was changed by another request. Refresh and retry.", context.invocationId);
    }

    return fail(500, "server_error", "Unable to update staff.", context.invocationId);
  }

  return ok({ staff });
}

app.http("UpdateStaff", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "v1/staff/{staffId}",
  handler: UpdateStaff,
});
