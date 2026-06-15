import mssql from "mssql";

type SqlModule = typeof mssql;

let activeSqlModule: SqlModule = mssql;
let pool: mssql.ConnectionPool | null = null;
let lastSqlAuthRuntimeState: SqlAuthRuntimeState | null = null;

interface SqlRuntimeConfig {
  module: SqlModule;
  config: mssql.config;
}

export interface SqlAuthRuntimeState {
  server: string;
  database: string;
  hasConnectionString: boolean;
  useAzureAuth: boolean;
  authMode: string;
  resolvedAuthType: string;
  usingSqlAuth: boolean;
  usingAzureAuth: boolean;
  module: "mssql" | "mssql/msnodesqlv8";
  hasUsername: boolean;
}

function setSqlAuthRuntimeState(state: SqlAuthRuntimeState): void {
  lastSqlAuthRuntimeState = state;
}

export function getSqlAuthRuntimeState(): SqlAuthRuntimeState | null {
  return lastSqlAuthRuntimeState;
}

interface TokenAcquisitionAttempt {
  source: string;
  endpoint: string;
  apiVersion: string;
  headers: Record<string, string>;
}

function getConfiguredTimeoutMs(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

async function requestManagedIdentityToken(): Promise<string | null> {
  const identityEndpoint = process.env.IDENTITY_ENDPOINT;
  const identityHeader = process.env.IDENTITY_HEADER;
  const msiEndpoint = process.env.MSI_ENDPOINT;
  const msiSecret = process.env.MSI_SECRET;

  const attempts: TokenAcquisitionAttempt[] = [];

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

    // Some hosts expose IDENTITY_ENDPOINT but do not require X-IDENTITY-HEADER.
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

    // Legacy MSI endpoint fallback used by some app service variants.
    attempts.push({
      source: "legacy-msi-metadata-header",
      endpoint: msiEndpoint,
      apiVersion: "2017-09-01",
      headers: {
        Metadata: "true",
      },
    });
  }

  for (const attempt of attempts) {
    try {
      const url = new URL(attempt.endpoint);
      url.searchParams.set("api-version", attempt.apiVersion);
      url.searchParams.set("resource", "https://database.windows.net/");

      const response = await fetch(url, {
        headers: attempt.headers,
      });

      if (!response.ok) {
        console.warn(
          `[connection] Managed identity token attempt '${attempt.source}' failed with status ${response.status}`
        );
        continue;
      }

      const payload = (await response.json()) as { access_token?: unknown };
      if (typeof payload.access_token === "string" && payload.access_token.length > 0) {
        console.log(`[connection] Managed identity token acquired via '${attempt.source}'`);
        return payload.access_token;
      }

      console.warn(`[connection] Managed identity token attempt '${attempt.source}' returned no access_token`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[connection] Managed identity token attempt '${attempt.source}' threw: ${message}`);
    }
  }

  return null;
}

async function buildAzureAuthenticationConfig() {
  const token = await requestManagedIdentityToken();
  if (token) {
    return {
      type: "azure-active-directory-access-token" as any,
      options: {
        token,
      },
    };
  }

  const msiEndpoint = process.env.MSI_ENDPOINT;
  const msiSecret = process.env.MSI_SECRET;

  // Some hosted environments expose legacy MSI_* variables instead of IDENTITY_*.
  if (msiEndpoint && msiSecret) {
    return {
      type: "azure-active-directory-msi-app-service" as any,
      options: {
        msiEndpoint,
        msiSecret,
      },
    };
  }

  return {
    type: "azure-active-directory-default" as any,
    options: {},
  };
}

export async function getConnection(): Promise<mssql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }

  const runtime = await getSqlRuntimeConfig();
  activeSqlModule = runtime.module;
  pool = new activeSqlModule.ConnectionPool(runtime.config);
  
  pool.on("error", (err) => {
    console.error("[connection] SQL Connection Pool Error:", err);
    pool = null;
  });

  try {
    await pool.connect();
    console.log("[connection] Connected to SQL database");
  } catch (err) {
    console.error("[connection] Failed to connect to SQL database:", err);
    pool = null;
    throw err;
  }
  return pool;
}

export function getConnectionConfig(): mssql.config {
  return {
    server: process.env.SQL_SERVER || "localhost",
    database: process.env.SQL_DATABASE || "ScheduleDb",
    options: {
      encrypt:
        Boolean(process.env.WEBSITE_INSTANCE_ID) ||
        (process.env.SQL_SERVER || "").includes("database.windows.net"),
      trustServerCertificate: true,
      connectTimeout: getConfiguredTimeoutMs("SQL_CONNECT_TIMEOUT_MS", 60000),
    },
  } as mssql.config;
}

async function getSqlRuntimeConfig(): Promise<SqlRuntimeConfig> {
  // Determine if using Azure SQL or local SQL Server
  const isProduction = process.env.WEBSITE_INSTANCE_ID !== undefined; // App Service indicator
  const connectionString = process.env.SQL_CONNECTION_STRING;
  const server = process.env.SQL_SERVER || "localhost";
  const database = process.env.SQL_DATABASE || "ScheduleDb";
  const username = process.env.SQL_USERNAME || "sa";
  const password = process.env.SQL_PASSWORD || "";
  const useAzureAuth = process.env.SQL_USE_AZURE_AUTH === "true";
  const authMode = (process.env.SQL_AUTH_MODE || "sql").toLowerCase();
  const connectTimeoutMs = getConfiguredTimeoutMs("SQL_CONNECT_TIMEOUT_MS", 60000);

  const isLocalDb = server.toLowerCase().includes("(localdb)");
  if (isLocalDb || authMode === "windows") {
    // LocalDB requires Windows auth and msnodesqlv8 driver.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mssqlNative = require("mssql/msnodesqlv8") as SqlModule;
    setSqlAuthRuntimeState({
      server,
      database,
      hasConnectionString: Boolean(connectionString),
      useAzureAuth,
      authMode,
      resolvedAuthType: "windows-trusted-connection",
      usingSqlAuth: false,
      usingAzureAuth: false,
      module: "mssql/msnodesqlv8",
      hasUsername: false,
    });

    return {
      module: mssqlNative as unknown as SqlModule,
      config: {
        connectionString: `Driver={ODBC Driver 18 for SQL Server};Server=${server};Database=${database};Trusted_Connection=Yes;Encrypt=No;` as any,
        options: {
          trustServerCertificate: true,
          connectTimeout: connectTimeoutMs,
        },
      },
    };
  }

  // If connection string provided, parse and use it (for Azure SQL)
  if (connectionString) {
    const parsedConfig = parseConnectionString(connectionString);
    setSqlAuthRuntimeState({
      server: String(parsedConfig.server || server),
      database: String(parsedConfig.database || database),
      hasConnectionString: true,
      useAzureAuth,
      authMode,
      resolvedAuthType: String(parsedConfig.authentication?.type || "default"),
      usingSqlAuth: true,
      usingAzureAuth: false,
      module: "mssql",
      hasUsername: Boolean(parsedConfig.authentication?.options?.userName),
    });

    return {
      module: mssql,
      config: parsedConfig,
    };
  }

  // Otherwise build config from individual parameters
  const authentication = useAzureAuth
    ? await buildAzureAuthenticationConfig()
    : {
        type: "default" as any,
        options:
          username && password
            ? {
                userName: username,
                password: password,
              }
            : {},
      };

  const config: mssql.config = {
    server,
    database,
    authentication,
    options: {
      encrypt: isProduction || server.includes("database.windows.net"), // Encrypt for Azure SQL
      trustServerCertificate: true, // For local development with self-signed certs
      connectTimeout: connectTimeoutMs,
    },
  };

  const resolvedAuthType = String(authentication.type || "unknown");
  setSqlAuthRuntimeState({
    server,
    database,
    hasConnectionString: false,
    useAzureAuth,
    authMode,
    resolvedAuthType,
    usingSqlAuth: resolvedAuthType === "default",
    usingAzureAuth: resolvedAuthType.startsWith("azure-active-directory"),
    module: "mssql",
    hasUsername: Boolean(username),
  });

  return {
    module: mssql,
    config,
  };
}

function parseConnectionString(connectionString: string): mssql.config {
  // Parse Azure SQL connection string format
  // Server=tcp:servername.database.windows.net,1433;Initial Catalog=dbname;Persist Security Info=False;User ID=username;Password=password;
  const matches = {
    server: connectionString.match(/Server=tcp:([^,;]+)/)?.[1] || "localhost",
    database: connectionString.match(/Initial Catalog=([^;]+)/)?.[1] || "ScheduleDb",
    username: connectionString.match(/User ID=([^;]+)/)?.[1] || "sa",
    password: connectionString.match(/Password=([^;]+)/)?.[1] || "",
  };

  return {
    server: matches.server,
    database: matches.database,
    authentication: {
      type: "default",
      options: {
        userName: matches.username,
        password: matches.password,
      },
    },
    options: {
      encrypt: true,
      trustServerCertificate: false,
      connectTimeout: getConfiguredTimeoutMs("SQL_CONNECT_TIMEOUT_MS", 60000),
    },
  };
}

export async function closeConnection(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

export async function query<T>(sql: string, params?: Record<string, unknown>): Promise<T[]> {
  const conn = await getConnection();
  const request = conn.request();

  // Add parameters to request
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }
  }

  const result = await request.query(sql);
  return result.recordset as T[];
}

export async function execute(sql: string, params?: Record<string, unknown>): Promise<void> {
  try {
    const conn = await getConnection();
    const request = conn.request();

    // Add parameters to request
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        request.input(key, value);
      }
    }

    await request.query(sql);
  } catch (error) {
    console.error("[connection] execute() failed:");
    console.error("[connection] Error type:", typeof error);
    console.error("[connection] Error object:", JSON.stringify(error, null, 2));
    if (error instanceof Error) {
      console.error("[connection] Error.message:", error.message);
      console.error("[connection] Error.stack:", error.stack);
    }
    throw error;
  }
}

export async function executeWithResult(
  sql: string,
  params?: Record<string, unknown>
): Promise<{ rowsAffected: number }> {
  const conn = await getConnection();
  const request = conn.request();

  // Add parameters to request
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }
  }

  const result = await request.query(sql);
  return { rowsAffected: result.rowsAffected[0] || 0 };
}
