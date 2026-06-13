import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ensureDatabaseInitialized } from "../db/bootstrap";
import { ok, fail } from "../http/response";

interface SqlErrorDetails {
  name?: string;
  code?: string;
  message?: string;
  originalCode?: string;
  originalMessage?: string;
}

interface ManagedIdentityDiagnostics {
  endpointConfigured: boolean;
  headerConfigured: boolean;
  legacyEndpointConfigured: boolean;
  legacySecretConfigured: boolean;
  tokenSource?: "identity" | "msi";
  tokenAttemptSource?: string;
  tokenRequestAttempted: boolean;
  tokenRequestSucceeded: boolean;
  error?: string;
  claims?: {
    oid?: string;
    appid?: string;
    tid?: string;
    aud?: string;
    xms_mirid?: string;
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function getSqlErrorDetails(error: unknown): SqlErrorDetails {
  if (!error || typeof error !== "object") {
    return {};
  }

  const candidate = error as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
    originalError?: { code?: unknown; message?: unknown };
  };

  return {
    name: typeof candidate.name === "string" ? candidate.name : undefined,
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    message: typeof candidate.message === "string" ? candidate.message : undefined,
    originalCode: typeof candidate.originalError?.code === "string" ? candidate.originalError.code : undefined,
    originalMessage:
      typeof candidate.originalError?.message === "string" ? candidate.originalError.message : undefined,
  };
}

async function getManagedIdentityDiagnostics(): Promise<ManagedIdentityDiagnostics> {
  const identityEndpoint = process.env.IDENTITY_ENDPOINT;
  const identityHeader = process.env.IDENTITY_HEADER;
  const msiEndpoint = process.env.MSI_ENDPOINT;
  const msiSecret = process.env.MSI_SECRET;

  const diagnostics: ManagedIdentityDiagnostics = {
    endpointConfigured: Boolean(identityEndpoint),
    headerConfigured: Boolean(identityHeader),
    legacyEndpointConfigured: Boolean(msiEndpoint),
    legacySecretConfigured: Boolean(msiSecret),
    tokenRequestAttempted: false,
    tokenRequestSucceeded: false,
  };

  const canUseIdentityEndpoint = Boolean(identityEndpoint);
  const canUseLegacyEndpoint = Boolean(msiEndpoint);

  if (!canUseIdentityEndpoint && !canUseLegacyEndpoint) {
    return diagnostics;
  }

  diagnostics.tokenRequestAttempted = true;

  try {
    const attempts: Array<{
      source: "identity" | "msi";
      attemptSource: string;
      endpoint: string;
      apiVersion: string;
      headers: Record<string, string>;
    }> = [];

    if (identityEndpoint) {
      if (identityHeader) {
        attempts.push({
          source: "identity",
          attemptSource: "identity-endpoint-with-header",
          endpoint: identityEndpoint,
          apiVersion: "2019-08-01",
          headers: { "X-IDENTITY-HEADER": identityHeader },
        });
      }

      attempts.push({
        source: "identity",
        attemptSource: "identity-endpoint-no-header",
        endpoint: identityEndpoint,
        apiVersion: "2019-08-01",
        headers: {},
      });
    }

    if (msiEndpoint) {
      if (msiSecret) {
        attempts.push({
          source: "msi",
          attemptSource: "legacy-msi-with-secret",
          endpoint: msiEndpoint,
          apiVersion: "2017-09-01",
          headers: { Secret: msiSecret },
        });
      }

      attempts.push({
        source: "msi",
        attemptSource: "legacy-msi-metadata-header",
        endpoint: msiEndpoint,
        apiVersion: "2017-09-01",
        headers: { Metadata: "true" },
      });
    }

    for (const attempt of attempts) {
      const url = new URL(attempt.endpoint);
      url.searchParams.set("api-version", attempt.apiVersion);
      url.searchParams.set("resource", "https://database.windows.net/");

      const response = await fetch(url, {
        headers: attempt.headers,
      });

      diagnostics.tokenSource = attempt.source;
      diagnostics.tokenAttemptSource = attempt.attemptSource;

      if (!response.ok) {
        diagnostics.error = `Managed identity token request (${attempt.attemptSource}) failed with status ${response.status}`;
        continue;
      }

      const payload = (await response.json()) as { access_token?: unknown };
      if (typeof payload.access_token !== "string") {
        diagnostics.error = `Managed identity token request (${attempt.attemptSource}) returned no access_token`;
        continue;
      }

      diagnostics.tokenRequestSucceeded = true;
      diagnostics.error = undefined;

      const claims = decodeJwtPayload(payload.access_token);
      if (claims) {
        diagnostics.claims = {
          oid: typeof claims.oid === "string" ? claims.oid : undefined,
          appid: typeof claims.appid === "string" ? claims.appid : undefined,
          tid: typeof claims.tid === "string" ? claims.tid : undefined,
          aud: typeof claims.aud === "string" ? claims.aud : undefined,
          xms_mirid: typeof claims.xms_mirid === "string" ? claims.xms_mirid : undefined,
        };
      }

      break;
    }
  } catch (error) {
    diagnostics.error = error instanceof Error ? error.message : "Unknown managed identity diagnostics error";
  }

  return diagnostics;
}

export async function DebugInit(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const managedIdentity = await getManagedIdentityDiagnostics();

  try {
    console.log("[DebugInit] Starting database initialization test...");
    await ensureDatabaseInitialized();
    console.log("[DebugInit] Database initialization test completed");
    return ok({
      message: "Database initialization successful",
      managedIdentity,
      sqlConfig: {
        useDatabase: process.env.SQL_USE_DATABASE,
        useAzureAuth: process.env.SQL_USE_AZURE_AUTH,
        server: process.env.SQL_SERVER,
        database: process.env.SQL_DATABASE,
      },
    });
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

    const sqlError = getSqlErrorDetails(error);
    
    const diagnosticSummary = JSON.stringify({
      managedIdentity,
      sqlError,
      sqlConfig: {
        useDatabase: process.env.SQL_USE_DATABASE,
        useAzureAuth: process.env.SQL_USE_AZURE_AUTH,
        server: process.env.SQL_SERVER,
        database: process.env.SQL_DATABASE,
      },
    });

    return fail(
      500,
      "init_error",
      `Database initialization failed: ${errorMsg}. diagnostics=${diagnosticSummary}`,
      context.invocationId
    );
  }
}

app.http("DebugInit", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: DebugInit,
});
