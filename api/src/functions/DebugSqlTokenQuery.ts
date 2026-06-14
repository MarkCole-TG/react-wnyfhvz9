import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import mssql from "mssql";
import { fail, ok } from "../http/response";

interface ManagedIdentityTokenResult {
  token: string;
  source: string;
  attemptedSources: string[];
}

interface DecodedTokenClaims {
  oid?: string;
  appid?: string;
  tid?: string;
  aud?: string;
  iss?: string;
  xms_mirid?: string;
}

function isEnabled(): boolean {
  return process.env.SQL_TOKEN_TEST_ENDPOINT_ENABLED === "true";
}

function decodeJwtPayload(token: string): DecodedTokenClaims {
  const parts = token.split(".");
  if (parts.length < 2) {
    return {};
  }

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json) as Record<string, unknown>;

    return {
      oid: typeof parsed.oid === "string" ? parsed.oid : undefined,
      appid: typeof parsed.appid === "string" ? parsed.appid : undefined,
      tid: typeof parsed.tid === "string" ? parsed.tid : undefined,
      aud: typeof parsed.aud === "string" ? parsed.aud : undefined,
      iss: typeof parsed.iss === "string" ? parsed.iss : undefined,
      xms_mirid: typeof parsed.xms_mirid === "string" ? parsed.xms_mirid : undefined,
    };
  } catch {
    return {};
  }
}

async function getManagedIdentityToken(): Promise<ManagedIdentityTokenResult> {
  const identityEndpoint = process.env.IDENTITY_ENDPOINT;
  const identityHeader = process.env.IDENTITY_HEADER;
  const msiEndpoint = process.env.MSI_ENDPOINT;
  const msiSecret = process.env.MSI_SECRET;

  const attempts: Array<{
    source: string;
    endpoint: string;
    apiVersion: string;
    headers: Record<string, string>;
  }> = [];
  const attemptedSources: string[] = [];

  if (identityEndpoint) {
    if (identityHeader) {
      attempts.push({
        source: "identity-endpoint-with-header",
        endpoint: identityEndpoint,
        apiVersion: "2019-08-01",
        headers: {
          "X-IDENTITY-HEADER": identityHeader,
        },
      });
    }

    attempts.push({
      source: "identity-endpoint-no-header",
      endpoint: identityEndpoint,
      apiVersion: "2019-08-01",
      headers: {},
    });
  }

  if (msiEndpoint) {
    if (msiSecret) {
      attempts.push({
        source: "legacy-msi-with-secret",
        endpoint: msiEndpoint,
        apiVersion: "2017-09-01",
        headers: {
          Secret: msiSecret,
        },
      });
    }

    attempts.push({
      source: "legacy-msi-metadata-header",
      endpoint: msiEndpoint,
      apiVersion: "2017-09-01",
      headers: {
        Metadata: "true",
      },
    });
  }

  if (attempts.length === 0) {
    throw new Error("No managed identity endpoint variables are available in this environment.");
  }

  for (const attempt of attempts) {
    attemptedSources.push(attempt.source);
    const url = new URL(attempt.endpoint);
    url.searchParams.set("api-version", attempt.apiVersion);
    url.searchParams.set("resource", "https://database.windows.net/");

    const response = await fetch(url, {
      headers: attempt.headers,
    });

    if (!response.ok) {
      continue;
    }

    const payload = (await response.json()) as { access_token?: unknown };
    if (typeof payload.access_token === "string" && payload.access_token.length > 0) {
      return {
        token: payload.access_token,
        source: attempt.source,
        attemptedSources,
      };
    }
  }

  const credential = new DefaultAzureCredential();
  attemptedSources.push("default-azure-credential");
  const accessToken = await credential.getToken("https://database.windows.net/.default");

  if (!accessToken?.token) {
    throw new Error("Managed identity token request failed for all known endpoint variants and DefaultAzureCredential did not return a token.");
  }

  return {
    token: accessToken.token,
    source: "default-azure-credential",
    attemptedSources,
  };
}

async function runTokenSqlProbe(token: string) {
  const server = process.env.SQL_SERVER;
  const database = process.env.SQL_DATABASE;

  if (!server || !database) {
    throw new Error("SQL_SERVER and SQL_DATABASE are required.");
  }

  const pool = new mssql.ConnectionPool({
    server,
    database,
    authentication: {
      type: "azure-active-directory-access-token" as any,
      options: {
        token,
      },
    },
    options: {
      encrypt: true,
      trustServerCertificate: false,
      connectTimeout: 30000,
    },
  });

  try {
    await pool.connect();
    const result = await pool.request().query(`
      SELECT TOP (1)
        DB_NAME() AS databaseName,
        SUSER_SNAME() AS loginName,
        GETUTCDATE() AS utcNow
    `);

    return result.recordset[0] ?? null;
  } finally {
    await pool.close();
  }
}

export async function DebugSqlTokenQuery(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (!isEnabled()) {
    return fail(404, "not_found", "Endpoint not found.", context.invocationId);
  }

  try {
    const tokenResult = await getManagedIdentityToken();
    const sqlResult = await runTokenSqlProbe(tokenResult.token);

    return ok({
      temporary: true,
      message:
        "Managed identity SQL token probe endpoint. Disable with SQL_TOKEN_TEST_ENDPOINT_ENABLED=false after troubleshooting.",
      steps: {
        tokenAcquired: true,
        tokenSource: tokenResult.source,
        tokenSourceAttempts: tokenResult.attemptedSources,
        sqlConnectedWithToken: true,
        sqlQueryExecuted: true,
      },
      tokenClaims: decodeJwtPayload(tokenResult.token),
      sqlResult,
      config: {
        server: process.env.SQL_SERVER,
        database: process.env.SQL_DATABASE,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return fail(
      500,
      "sql_token_probe_failed",
      `Managed identity SQL token probe failed: ${message}`,
      context.invocationId
    );
  }
}

app.http("DebugSqlTokenQuery", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "v1/debug/sql-token-query",
  handler: DebugSqlTokenQuery,
});
