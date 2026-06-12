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
    console.error("[DebugInit] Database initialization test failed:");
    console.error("[DebugInit] Error type:", typeof error);
    console.error("[DebugInit] Error object:", JSON.stringify(error, null, 2));
    console.error("[DebugInit] Error toString:", String(error));
    if (error instanceof Error) {
      console.error("[DebugInit] Error.message:", error.message);
      console.error("[DebugInit] Error.stack:", error.stack);
    }
    
    let errorMsg = "Unknown error";
    if (error instanceof Error) {
      errorMsg = error.message || error.toString();
    } else if (error && typeof error === "object") {
      errorMsg = JSON.stringify(error);
    } else {
      errorMsg = String(error);
    }
    
    return fail(500, "init_error", `Database initialization failed: ${errorMsg}`, context.invocationId);
  }
}

app.http("DebugInit", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: DebugInit,
});
