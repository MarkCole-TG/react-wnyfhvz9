import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { authorizeRequest } from "../security/authorize";
import { fail, ok } from "../http/response";
import { setWeekStatus } from "../data/store-runtime";

export async function UnlockWeek(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = await authorizeRequest(req, context.invocationId, ["admin"]);
  if (!auth.ok) {
    const failure = auth as unknown as { status: number; body: { error: { code: string; message: string; correlationId: string } } };
    return fail(failure.status, failure.body.error.code, failure.body.error.message, failure.body.error.correlationId);
  }

  const week = (req.params.week ?? "").trim();
  if (!week) {
    return fail(400, "missing_week", "Route parameter 'week' is required.", context.invocationId);
  }

  return ok({ week: await setWeekStatus(week, "open", auth.user.userId) });
}

app.http("UnlockWeek", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "v1/weeks/{week}/unlock",
  handler: UnlockWeek,
});
