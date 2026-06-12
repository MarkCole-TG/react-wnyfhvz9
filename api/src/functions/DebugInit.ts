import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ensureDatabaseInitialized } from "../db/bootstrap";
import { ok, fail } from "../http/response";

export async function DebugInit(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    console.log("[DebugInit] Starting database initialization test...");
    await ensureDatabaseInitialized();
    console.log("[DebugInit] Database initialization test completed");
    return ok({ message: "Database initialization successful" });
  } catch (error) {
    console.error("[DebugInit] Database initialization test failed:", error);
    return fail(500, "init_error", `Database initialization failed: ${error instanceof Error ? error.message : String(error)}`, context.invocationId);
  }
}

app.http("DebugInit", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: DebugInit,
});
