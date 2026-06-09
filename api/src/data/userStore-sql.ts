import { query, execute } from "../db/connection";
import { AppRole, AppUser } from "../security/types";
import { ensureDatabaseInitialized } from "../db/bootstrap";

function isRole(value: string): value is AppRole {
  return value === "viewer" || value === "planner" || value === "admin";
}

/**
 * Find a user by Entra Object ID in the database
 * Returns user with their assigned roles
 */
export async function findUserByEntraObjectId(entraObjectId: string): Promise<AppUser | null> {
  await ensureDatabaseInitialized();

  const rows = await query<any>(
    `SELECT userId, entraObjectId, displayName, email FROM AppUsers WHERE entraObjectId = @entraObjectId`,
    { entraObjectId }
  );

  if (rows.length === 0) {
    return null;
  }

  const user = rows[0];

  // Get roles for this user
  const roleRows = await query<any>(
    `SELECT role FROM UserRoles WHERE entraObjectId = @entraObjectId ORDER BY role ASC`,
    { entraObjectId }
  );

  const roles = roleRows
    .map((r) => r.role)
    .filter((r): r is AppRole => isRole(r));

  return {
    userId: user.userId,
    entraObjectId: user.entraObjectId,
    roles,
    isActive: true, // Always active if in database
  };
}

/**
 * Create or update a user in the database
 */
export async function createOrUpdateUser(
  userId: string,
  entraObjectId: string,
  displayName?: string,
  email?: string
): Promise<void> {
  await ensureDatabaseInitialized();

  // Check if user exists
  const existing = await query<any>(
    `SELECT userId FROM AppUsers WHERE entraObjectId = @entraObjectId`,
    { entraObjectId }
  );

  if (existing.length > 0) {
    // Update
    await execute(
      `UPDATE AppUsers SET displayName = @displayName, email = @email WHERE entraObjectId = @entraObjectId`,
      { entraObjectId, displayName: displayName || null, email: email || null }
    );
  } else {
    // Insert
    await execute(
      `INSERT INTO AppUsers (userId, entraObjectId, displayName, email) VALUES (@userId, @entraObjectId, @displayName, @email)`,
      { userId, entraObjectId, displayName: displayName || null, email: email || null }
    );
  }
}

/**
 * Set user roles (replaces existing roles)
 */
export async function setUserRoles(entraObjectId: string, roles: AppRole[]): Promise<void> {
  await ensureDatabaseInitialized();

  await execute(
    `IF NOT EXISTS (SELECT 1 FROM AppUsers WHERE entraObjectId = @entraObjectId)
     INSERT INTO AppUsers (userId, entraObjectId, displayName, email)
     VALUES (@userId, @entraObjectId, NULL, NULL)`,
    { userId: `user_${entraObjectId}`, entraObjectId }
  );

  // Delete existing roles
  await execute(`DELETE FROM UserRoles WHERE entraObjectId = @entraObjectId`, { entraObjectId });

  // Insert new roles
  for (const role of roles) {
    if (isRole(role)) {
      await execute(
        `INSERT INTO UserRoles (entraObjectId, role) VALUES (@entraObjectId, @role)`,
        { entraObjectId, role }
      );
    }
  }
}

/**
 * Add a role to a user
 */
export async function addUserRole(entraObjectId: string, role: AppRole): Promise<void> {
  await ensureDatabaseInitialized();

  if (!isRole(role)) {
    return;
  }

  try {
    await execute(
      `INSERT INTO UserRoles (entraObjectId, role) VALUES (@entraObjectId, @role)`,
      { entraObjectId, role }
    );
  } catch (error) {
    // Role might already exist (unique constraint), ignore
  }
}

/**
 * Remove a role from a user
 */
export async function removeUserRole(entraObjectId: string, role: AppRole): Promise<void> {
  await ensureDatabaseInitialized();

  await execute(
    `DELETE FROM UserRoles WHERE entraObjectId = @entraObjectId AND role = @role`,
    { entraObjectId, role }
  );
}

/**
 * List all users
 */
export async function listUsers(): Promise<AppUser[]> {
  await ensureDatabaseInitialized();

  const users = await query<any>(
    `SELECT userId, entraObjectId, displayName, email FROM AppUsers ORDER BY displayName ASC`
  );

  const result: AppUser[] = [];

  for (const user of users) {
    const roleRows = await query<any>(
      `SELECT role FROM UserRoles WHERE entraObjectId = @entraObjectId ORDER BY role ASC`,
      { entraObjectId: user.entraObjectId }
    );

    const roles = roleRows
      .map((r) => r.role)
      .filter((r): r is AppRole => isRole(r));

    result.push({
      userId: user.userId,
      entraObjectId: user.entraObjectId,
      roles,
      isActive: true,
    });
  }

  return result;
}

/**
 * Get user roles
 */
export async function getUserRoles(entraObjectId: string): Promise<AppRole[]> {
  await ensureDatabaseInitialized();

  const rows = await query<any>(
    `SELECT role FROM UserRoles WHERE entraObjectId = @entraObjectId ORDER BY role ASC`,
    { entraObjectId }
  );

  return rows
    .map((r) => r.role)
    .filter((r): r is AppRole => isRole(r));
}
