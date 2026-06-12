import { initializeDatabase } from "./schema";

let initialized = false;
let initializing: Promise<void> | null = null;

export async function ensureDatabaseInitialized(): Promise<void> {
  if (process.env.SQL_USE_DATABASE !== "true") {
    console.log("[bootstrap] SQL_USE_DATABASE is not 'true', skipping initialization");
    return;
  }

  if (initialized) {
    console.log("[bootstrap] Database already initialized");
    return;
  }

  if (!initializing) {
    console.log("[bootstrap] Starting database initialization...");
    initializing = initializeDatabase()
      .then(() => {
        initialized = true;
        console.log("[bootstrap] Database initialization succeeded");
      })
      .catch((error) => {
        console.error("[bootstrap] Database initialization failed:", error);
        throw error;
      })
      .finally(() => {
        initializing = null;
      });
  }

  await initializing;
}
