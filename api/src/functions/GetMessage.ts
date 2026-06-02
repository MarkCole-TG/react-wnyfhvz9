import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { authorizeRequest } from "../security/authorize";

export async function GetMessage(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = await authorizeRequest(req, context.invocationId, ["viewer", "planner", "admin"]);
  if (!auth.ok) {
    const failure = auth as unknown as { status: number; body: object };
    return {
      status: failure.status,
      jsonBody: failure.body,
    };
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