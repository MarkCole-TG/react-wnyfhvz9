import mssql from "mssql";

type SqlModule = typeof mssql;

let activeSqlModule: SqlModule = mssql;
let pool: mssql.ConnectionPool | null = null;

interface SqlRuntimeConfig {
  module: SqlModule;
  config: mssql.config;
}

export async function getConnection(): Promise<mssql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }

  const runtime = getSqlRuntimeConfig();
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
  return getSqlRuntimeConfig().config;
}

function getSqlRuntimeConfig(): SqlRuntimeConfig {
  // Determine if using Azure SQL or local SQL Server
  const isProduction = process.env.WEBSITE_INSTANCE_ID !== undefined; // App Service indicator
  const connectionString = process.env.SQL_CONNECTION_STRING;
  const server = process.env.SQL_SERVER || "localhost";
  const database = process.env.SQL_DATABASE || "ScheduleDb";
  const username = process.env.SQL_USERNAME || "sa";
  const password = process.env.SQL_PASSWORD || "Password123!";
  const useAzureAuth = process.env.SQL_USE_AZURE_AUTH === "true";
  const authMode = (process.env.SQL_AUTH_MODE || "sql").toLowerCase();

  const isLocalDb = server.toLowerCase().includes("(localdb)");
  if (isLocalDb || authMode === "windows") {
    // LocalDB requires Windows auth and msnodesqlv8 driver.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mssqlNative = require("mssql/msnodesqlv8") as SqlModule;
    return {
      module: mssqlNative as unknown as SqlModule,
      config: {
        connectionString: `Driver={ODBC Driver 18 for SQL Server};Server=${server};Database=${database};Trusted_Connection=Yes;Encrypt=No;` as any,
        options: {
          trustServerCertificate: true,
          connectTimeout: 15000,
        },
      },
    };
  }

  // If connection string provided, parse and use it (for Azure SQL)
  if (connectionString) {
    return {
      module: mssql,
      config: parseConnectionString(connectionString),
    };
  }

  // Otherwise build config from individual parameters
  const config: mssql.config = {
    server,
    database,
    authentication: {
      type: useAzureAuth ? "azure-active-directory-default" : "default",
      options:
        !useAzureAuth && username && password
          ? {
              userName: username,
              password: password,
            }
          : {},
    },
    options: {
      encrypt: isProduction || server.includes("database.windows.net"), // Encrypt for Azure SQL
      trustServerCertificate: true, // For local development with self-signed certs
      connectTimeout: 15000,
    },
  };

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
      connectTimeout: 15000,
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
  const conn = await getConnection();
  const request = conn.request();

  // Add parameters to request
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }
  }

  await request.query(sql);
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
