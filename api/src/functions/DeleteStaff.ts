import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { authorizeRequest } from "../security/authorize";
import { fail } from "../http/response";
import { deleteStaff } from "../data/store";

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

  const removed = deleteStaff(staffId);
  if (!removed) {
    return fail(404, "staff_not_found", "Staff record was not found.", context.invocationId);
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
