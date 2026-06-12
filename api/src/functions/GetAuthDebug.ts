import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { fail, ok } from "../http/response";
import { validateAccessToken } from "../security/auth";

function isEnabled(): boolean {
  return process.env.AUTH_DEBUG_ENDPOINT_ENABLED === "true";
}

export async function GetAuthDebug(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (!isEnabled()) {
    return fail(404, "not_found", "Endpoint not found.", context.invocationId);
  }

  const tokenValidation = await validateAccessToken(req);
  if (!tokenValidation.ok) {
    const failure = tokenValidation as unknown as { code: string; message: string };
    return fail(401, failure.code, failure.message, context.invocationId);
  }

  return ok({
    temporary: true,
    message: "Temporary auth debug endpoint. Disable with AUTH_DEBUG_ENDPOINT_ENABLED=false after troubleshooting.",
    principal: tokenValidation.principal,
    auth: {
      tokenRolesEnabled: process.env.AUTH_USE_TOKEN_ROLES !== "false",
      usedSwaPrincipalHeader: Boolean(req.headers.get("x-ms-client-principal")),
    },
  });
}

app.http("GetAuthDebug", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "v1/auth/debug",
  handler: GetAuthDebug,
});
