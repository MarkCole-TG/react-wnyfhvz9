import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { authorizeRequest } from "../security/authorize";
import { fail, ok } from "../http/response";
import { getJsonBody, InvalidJsonBodyError } from "../http/params";
import { createStaff, StaffCreatePayload } from "../data/store-runtime";

export async function CreateStaff(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = await authorizeRequest(req, context.invocationId, ["planner", "admin"]);
  if (!auth.ok) {
    const failure = auth as unknown as { status: number; body: { error: { code: string; message: string; correlationId: string } } };
    return fail(failure.status, failure.body.error.code, failure.body.error.message, failure.body.error.correlationId);
  }

  let body: StaffCreatePayload;
  try {
    body = await getJsonBody<StaffCreatePayload>(req);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return fail(400, "invalid_json", "Request body must be valid JSON.", context.invocationId);
    }

    return fail(500, "server_error", "Unable to create staff.", context.invocationId);
  }

  try {
    const staff = await createStaff(body);
    return ok({ staff }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_staff") {
      return fail(400, "invalid_staff", "Staff name and number are required.", context.invocationId);
    }

    if (error instanceof Error && error.message === "duplicate_staff") {
      return fail(409, "duplicate_staff", "A staff member with the same name or number already exists.", context.invocationId);
    }

    return fail(500, "server_error", "Unable to create staff.", context.invocationId);
  }
}

app.http("CreateStaff", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "v1/staff",
  handler: CreateStaff,
});
