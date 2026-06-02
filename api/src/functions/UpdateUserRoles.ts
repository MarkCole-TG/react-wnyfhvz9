import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { authorizeRequest } from "../security/authorize";
import { fail, ok } from "../http/response";
import { getJsonBody } from "../http/params";
import { setUserRoles } from "../security/userStore";
import { AppRole } from "../security/types";

interface RolePayload {
  entraObjectId?: string;
  roles?: AppRole[];
}

function isRole(value: string): value is AppRole {
  return value === "viewer" || value === "planner" || value === "admin";
}

export async function UpdateUserRoles(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = await authorizeRequest(req, context.invocationId, ["admin"]);
  if (!auth.ok) {
    const failure = auth as unknown as { status: number; body: { error: { code: string; message: string; correlationId: string } } };
    return fail(failure.status, failure.body.error.code, failure.body.error.message, failure.body.error.correlationId);
  }

  const body = await getJsonBody<RolePayload>(req);
  const entraObjectId = (body.entraObjectId ?? req.params.userId ?? "").trim();
  if (!entraObjectId) {
    return fail(400, "missing_user", "An Entra object id is required.", context.invocationId);
  }

  const roles = (Array.isArray(body.roles) ? body.roles : []).filter((item): item is AppRole => isRole(item));
  if (roles.length === 0) {
    return fail(400, "missing_roles", "At least one valid role is required.", context.invocationId);
  }

  setUserRoles(entraObjectId, roles);
  return ok({ entraObjectId, roles });
}

app.http("UpdateUserRoles", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "v1/users/{userId}/roles",
  handler: UpdateUserRoles,
});
