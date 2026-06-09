import { initializeDatabase } from "./schema";

let initialized = false;
let initializing: Promise<void> | null = null;

export async function ensureDatabaseInitialized(): Promise<void> {
  if (process.env.SQL_USE_DATABASE !== "true") {
    return;
  }

  if (initialized) {
    return;
  }

  if (!initializing) {
    initializing = initializeDatabase()
      .then(() => {
        initialized = true;
      })
      .finally(() => {
        initializing = null;
      });
  }

  await initializing;
}
