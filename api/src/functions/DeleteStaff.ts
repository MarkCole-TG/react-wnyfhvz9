import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { authorizeRequest } from "../security/authorize";
import { fail } from "../http/response";
import { deleteStaff } from "../data/store-runtime";

export async function DeleteStaff(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = await authorizeRequest(req, context.invocationId, ["planner", "admin"]);
  if (!auth.ok) {
    const failure = auth as unknown as { status: number; body: { error: { code: string; message: string; correlationId: string } } };
    return fail(failure.status, failure.body.error.code, failure.body.error.message, failure.body.error.correlationId);
  }

  const staffId = (req.params.staffId ?? "").trim();
  if (!staffId) {
    return fail(400, "missing_staff_id", "Route parameter 'staffId' is required.", context.invocationId);
  }

  const updatedAt = (req.query.get("updatedAt") ?? "").trim();

  try {
    const removed = await deleteStaff(staffId, updatedAt);
    if (!removed) {
      return fail(404, "staff_not_found", "Staff record was not found.", context.invocationId);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "missing_updated_at") {
      return fail(409, "missing_updated_at", "The current staff updatedAt value is required for delete.", context.invocationId);
    }

    if (error instanceof Error && error.message === "version_mismatch") {
      return fail(409, "version_mismatch", "The staff record was changed by another request. Refresh and retry.", context.invocationId);
    }

    return fail(500, "server_error", "Unable to delete staff.", context.invocationId);
  }

  return {
    status: 204,
  };
}

app.http("DeleteStaff", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "v1/staff/{staffId}",
  handler: DeleteStaff,
});
