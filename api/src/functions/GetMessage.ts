import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

export async function GetMessage(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {

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