import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { authorizeRequest } from "../security/authorize";
import { fail, ok } from "../http/response";
import { listStaff } from "../data/store-sql";

export async function GetStaff(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = await authorizeRequest(req, context.invocationId, ["viewer", "planner", "admin"]);
  if (!auth.ok) {
    const failure = auth as unknown as { status: number; body: { error: { code: string; message: string; correlationId: string } } };
    return fail(failure.status, failure.body.error.code, failure.body.error.message, failure.body.error.correlationId);
  }

  return ok({ staff: await listStaff() });
}

app.http("GetStaff", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "v1/staff",
  handler: GetStaff,
});
