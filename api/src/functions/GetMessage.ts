import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { authorizeRequest } from "../security/authorize";
import { fail } from "../http/response";

export async function GetMessage(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = await authorizeRequest(req, context.invocationId, ["viewer", "planner", "admin"]);
  if (!auth.ok) {
    const failure = auth as unknown as { status: number; body: { error: { code: string; message: string; correlationId: string } } };
    return fail(failure.status, failure.body.error.code, failure.body.error.message, failure.body.error.correlationId);
  }

  return {
    status: 200,
    jsonBody: {
      message: "Hello from Azure Functions v4!"
    }
  };
}

app.http("GetMessage", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: GetMessage
});