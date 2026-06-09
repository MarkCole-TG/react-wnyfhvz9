import { randomUUID } from "node:crypto";
import { ScheduleRow, StaffMember, WeekRecord, WeekStatus } from "./types";
import { query, executeWithResult, execute } from "../db/connection";
import { ensureDatabaseInitialized } from "../db/bootstrap";

export interface SchedulePayload {
  MonAM?: string;
  MonPM?: string;
  TueAM?: string;
  TuePM?: string;
  WedAM?: string;
  WedPM?: string;
  ThuAM?: string;
  ThuPM?: string;
  FriAM?: string;
  FriPM?: string;
  comment?: string;
  updatedAt?: string;
}

export interface StaffCreatePayload {
  name?: string;
  number?: string;
  title?: string;
  active?: boolean;
  roles?: {
    mhfa?: boolean;
    fire?: boolean;
    first?: boolean;
    director?: boolean;
    guest?: boolean;
  };
}

export interface StaffUpdatePayload {
  name?: string;
  number?: string;
  title?: string;
  active?: boolean;
  roles?: {
    mhfa?: boolean;
    fire?: boolean;
    first?: boolean;
    director?: boolean;
    guest?: boolean;
  };
  updatedAt?: string;
}

export interface RoleUpdatePayload {
  roles?: string[];
}

function nowIso() {
  return new Date().toISOString();
}

function toIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    return value;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value ?? "") : parsed.toISOString();
}

function assertUpdatedAtPrecondition(currentUpdatedAt: string, expectedUpdatedAt?: string) {
  const expected = (expectedUpdatedAt ?? "").trim();
  if (!expected) {
    throw new Error("missing_updated_at");
  }

  if (currentUpdatedAt !== expected) {
    throw new Error("version_mismatch");
  }
}

function newId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

// Convert SQL row to StaffMember type
function sqlRowToStaffMember(row: any): StaffMember {
  return {
    id: row.id,
    name: row.name,
    number: row.number,
    title: row.title,
    active: row.active === 1 || row.active === true,
    roles: {
      mhfa: row.mhfaRole === 1 || row.mhfaRole === true,
      fire: row.fireRole === 1 || row.fireRole === true,
      first: row.firstRole === 1 || row.firstRole === true,
      director: row.directorRole === 1 || row.directorRole === true,
      guest: row.guestRole === 1 || row.guestRole === true,
    },
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

// Convert SQL row to ScheduleRow type
function sqlRowToScheduleRow(row: any): ScheduleRow {
  return {
    staffId: row.staffId,
    MonAM: row.monAM || "",
    MonPM: row.monPM || "",
    TueAM: row.tueAM || "",
    TuePM: row.tuePM || "",
    WedAM: row.wedAM || "",
    WedPM: row.wedPM || "",
    ThuAM: row.thuAM || "",
    ThuPM: row.thuPM || "",
    FriAM: row.friAM || "",
    FriPM: row.friPM || "",
    comment: row.comment || "",
    updatedAt: toIso(row.updatedAt),
  };
}

export async function listStaff(): Promise<StaffMember[]> {
  await ensureDatabaseInitialized();

  const rows = await query<any>(
    `SELECT * FROM Staff WHERE active = 1 ORDER BY name ASC`
  );
  return rows.map(sqlRowToStaffMember);
}

export async function getStaff(staffId: string): Promise<StaffMember | null> {
  await ensureDatabaseInitialized();

  const rows = await query<any>(
    `SELECT * FROM Staff WHERE id = @staffId`,
    { staffId }
  );
  return rows.length > 0 ? sqlRowToStaffMember(rows[0]) : null;
}

export async function deleteStaff(staffId: string, expectedUpdatedAt?: string): Promise<boolean> {
  await ensureDatabaseInitialized();

  // Check if staff exists and get current updatedAt
  const staff = await getStaff(staffId);
  if (!staff) {
    return false;
  }

  assertUpdatedAtPrecondition(staff.updatedAt, expectedUpdatedAt);

  // Delete the staff (cascade will handle schedule rows due to FK)
  const result = await executeWithResult(
    `DELETE FROM Staff WHERE id = @staffId`,
    { staffId }
  );

  return result.rowsAffected > 0;
}

export async function createStaff(payload: StaffCreatePayload): Promise<StaffMember> {
  await ensureDatabaseInitialized();

  const timestamp = nowIso();
  const normalizedName = (payload.name ?? "").trim();
  const normalizedNameKey = normalizedName.toLowerCase();
  const normalizedNumber = (payload.number ?? "").trim();

  if (!normalizedName || !normalizedNumber) {
    throw new Error("invalid_staff");
  }

  // Check for duplicates (name or number)
  const duplicates = await query<any>(
    `SELECT id FROM Staff WHERE LOWER(name) = @nameLower OR number = @number`,
    { nameLower: normalizedNameKey, number: normalizedNumber }
  );

  if (duplicates.length > 0) {
    throw new Error("duplicate_staff");
  }

  const staffId = newId("staff");
  const active = payload.active ?? true;
  const roles = payload.roles || {
    mhfa: false,
    fire: false,
    first: false,
    director: false,
    guest: false,
  };

  await execute(
    `INSERT INTO Staff (id, name, number, title, active, mhfaRole, fireRole, firstRole, directorRole, guestRole, createdAt, updatedAt)
     VALUES (@id, @name, @number, @title, @active, @mhfa, @fire, @first, @director, @guest, @createdAt, @updatedAt)`,
    {
      id: staffId,
      name: normalizedName,
      number: normalizedNumber,
      title: (payload.title ?? "").trim() || null,
      active: active ? 1 : 0,
      mhfa: roles.mhfa ? 1 : 0,
      fire: roles.fire ? 1 : 0,
      first: roles.first ? 1 : 0,
      director: roles.director ? 1 : 0,
      guest: roles.guest ? 1 : 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  );

  return {
    id: staffId,
    name: normalizedName,
    number: normalizedNumber,
    title: (payload.title ?? "").trim() || undefined,
    active,
    roles,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function updateStaff(staffId: string, payload: StaffUpdatePayload): Promise<StaffMember | null> {
  await ensureDatabaseInitialized();

  const staff = await getStaff(staffId);
  if (!staff) {
    return null;
  }

  assertUpdatedAtPrecondition(staff.updatedAt, payload.updatedAt);

  const timestamp = nowIso();
  const updates: Record<string, any> = { updatedAt: timestamp };

  if (payload.name !== undefined) updates.name = payload.name.trim();
  if (payload.number !== undefined) updates.number = payload.number.trim();
  if (payload.title !== undefined) updates.title = (payload.title ?? "").trim() || null;
  if (payload.active !== undefined) updates.active = payload.active ? 1 : 0;

  if (payload.roles !== undefined) {
    updates.mhfaRole = (payload.roles.mhfa ?? staff.roles?.mhfa ?? false) ? 1 : 0;
    updates.fireRole = (payload.roles.fire ?? staff.roles?.fire ?? false) ? 1 : 0;
    updates.firstRole = (payload.roles.first ?? staff.roles?.first ?? false) ? 1 : 0;
    updates.directorRole = (payload.roles.director ?? staff.roles?.director ?? false) ? 1 : 0;
    updates.guestRole = (payload.roles.guest ?? staff.roles?.guest ?? false) ? 1 : 0;
  }

  // Build SQL SET clause
  const setClauses = Object.keys(updates).map((key) => `${key} = @${key}`);
  const params = { staffId, ...updates };

  await execute(
    `UPDATE Staff SET ${setClauses.join(", ")} WHERE id = @staffId`,
    params
  );

  return getStaff(staffId);
}

export async function getWeekRecord(week: string): Promise<WeekRecord> {
  await ensureDatabaseInitialized();

  const rows = await query<any>(
    `SELECT * FROM Weeks WHERE week = @week`,
    { week }
  );

  if (rows.length > 0) {
    const row = rows[0];
    return {
      week: row.week,
      status: row.status,
      lockedBy: row.lockedBy,
      lockedAt: row.lockedAt ? toIso(row.lockedAt) : undefined,
      unlockedBy: row.unlockedBy,
      unlockedAt: row.unlockedAt ? toIso(row.unlockedAt) : undefined,
      updatedAt: toIso(row.updatedAt),
    };
  }

  // Create new week record if doesn't exist
  const timestamp = nowIso();
  await execute(
    `INSERT INTO Weeks (week, status, updatedAt) VALUES (@week, 'open', @updatedAt)`,
    { week, updatedAt: timestamp }
  );

  return {
    week,
    status: "open",
    updatedAt: timestamp,
  };
}

export async function listSchedule(week: string): Promise<ScheduleRow[]> {
  await ensureDatabaseInitialized();

  // Ensure week record exists
  await getWeekRecord(week);

  const rows = await query<any>(
    `SELECT staffId, monAM, monPM, tueAM, tuePM, wedAM, wedPM, thuAM, thuPM, friAM, friPM, comment, updatedAt
     FROM Schedule WHERE week = @week ORDER BY staffId ASC`,
    { week }
  );

  return rows.map(sqlRowToScheduleRow);
}

export async function upsertScheduleRow(
  week: string,
  staffId: string,
  payload: SchedulePayload
): Promise<ScheduleRow | null> {
  await ensureDatabaseInitialized();

  // Get week record (creates if needed)
  const weekRecord = await getWeekRecord(week);
  if (weekRecord.status === "locked") {
    throw new Error("week_locked");
  }

  // Verify staff exists
  const staff = await getStaff(staffId);
  if (!staff) {
    return null;
  }

  // Check if row exists
  const existing = await query<any>(
    `SELECT updatedAt FROM Schedule WHERE week = @week AND staffId = @staffId`,
    { week, staffId }
  );

  if (existing.length > 0) {
    assertUpdatedAtPrecondition(toIso(existing[0].updatedAt), payload.updatedAt);
  }

  const timestamp = nowIso();

  if (existing.length > 0) {
    // Update
    const setClauses = [];
    const params: Record<string, any> = { week, staffId, updatedAt: timestamp };

    if (payload.MonAM !== undefined) {
      setClauses.push("monAM = @monAM");
      params.monAM = payload.MonAM;
    }
    if (payload.MonPM !== undefined) {
      setClauses.push("monPM = @monPM");
      params.monPM = payload.MonPM;
    }
    if (payload.TueAM !== undefined) {
      setClauses.push("tueAM = @tueAM");
      params.tueAM = payload.TueAM;
    }
    if (payload.TuePM !== undefined) {
      setClauses.push("tuePM = @tuePM");
      params.tuePM = payload.TuePM;
    }
    if (payload.WedAM !== undefined) {
      setClauses.push("wedAM = @wedAM");
      params.wedAM = payload.WedAM;
    }
    if (payload.WedPM !== undefined) {
      setClauses.push("wedPM = @wedPM");
      params.wedPM = payload.WedPM;
    }
    if (payload.ThuAM !== undefined) {
      setClauses.push("thuAM = @thuAM");
      params.thuAM = payload.ThuAM;
    }
    if (payload.ThuPM !== undefined) {
      setClauses.push("thuPM = @thuPM");
      params.thuPM = payload.ThuPM;
    }
    if (payload.FriAM !== undefined) {
      setClauses.push("friAM = @friAM");
      params.friAM = payload.FriAM;
    }
    if (payload.FriPM !== undefined) {
      setClauses.push("friPM = @friPM");
      params.friPM = payload.FriPM;
    }
    if (payload.comment !== undefined) {
      setClauses.push("comment = @comment");
      params.comment = payload.comment;
    }

    setClauses.push("updatedAt = @updatedAt");

    await execute(
      `UPDATE Schedule SET ${setClauses.join(", ")} WHERE week = @week AND staffId = @staffId`,
      params
    );
  } else {
    // Insert
    await execute(
      `INSERT INTO Schedule (week, staffId, monAM, monPM, tueAM, tuePM, wedAM, wedPM, thuAM, thuPM, friAM, friPM, comment, updatedAt)
       VALUES (@week, @staffId, @monAM, @monPM, @tueAM, @tuePM, @wedAM, @wedPM, @thuAM, @thuPM, @friAM, @friPM, @comment, @updatedAt)`,
      {
        week,
        staffId,
        monAM: payload.MonAM || null,
        monPM: payload.MonPM || null,
        tueAM: payload.TueAM || null,
        tuePM: payload.TuePM || null,
        wedAM: payload.WedAM || null,
        wedPM: payload.WedPM || null,
        thuAM: payload.ThuAM || null,
        thuPM: payload.ThuPM || null,
        friAM: payload.FriAM || null,
        friPM: payload.FriPM || null,
        comment: payload.comment || null,
        updatedAt: timestamp,
      }
    );
  }

  const rows = await query<any>(
    `SELECT staffId, monAM, monPM, tueAM, tuePM, wedAM, wedPM, thuAM, thuPM, friAM, friPM, comment, updatedAt
     FROM Schedule WHERE week = @week AND staffId = @staffId`,
    { week, staffId }
  );

  return rows.length > 0 ? sqlRowToScheduleRow(rows[0]) : null;
}

export async function setWeekStatus(
  week: string,
  status: WeekStatus,
  actor: string
): Promise<WeekRecord> {
  await ensureDatabaseInitialized();

  await getWeekRecord(week);

  const timestamp = nowIso();

  if (status === "locked") {
    await execute(
      `UPDATE Weeks SET status = @status, lockedBy = @actor, lockedAt = @timestamp, updatedAt = @timestamp WHERE week = @week`,
      { week, status, actor, timestamp }
    );
  } else {
    await execute(
      `UPDATE Weeks SET status = @status, unlockedBy = @actor, unlockedAt = @timestamp, updatedAt = @timestamp WHERE week = @week`,
      { week, status, actor, timestamp }
    );
  }

  return getWeekRecord(week);
}

export async function listWeeks(): Promise<WeekRecord[]> {
  await ensureDatabaseInitialized();

  const rows = await query<any>(`SELECT * FROM Weeks ORDER BY week DESC`);

  return rows.map((row) => ({
    week: row.week,
    status: row.status,
    lockedBy: row.lockedBy,
    lockedAt: row.lockedAt ? toIso(row.lockedAt) : undefined,
    unlockedBy: row.unlockedBy,
    unlockedAt: row.unlockedAt ? toIso(row.unlockedAt) : undefined,
    updatedAt: toIso(row.updatedAt),
  }));
}

// For testing: reset the app state (clear all data)
export async function resetAppState(): Promise<void> {
  await ensureDatabaseInitialized();

  try {
    await execute(`DELETE FROM Schedule`);
    await execute(`DELETE FROM Staff`);
    await execute(`DELETE FROM Weeks`);
  } catch (error) {
    // If database isn't initialized, just skip
    console.log("Could not reset app state (database may not be initialized)");
  }
}

// Snapshot for debugging (returns all data)
export async function getAppSnapshot(): Promise<any> {
  await ensureDatabaseInitialized();

  const staff = await listStaff();
  const weeks = await listWeeks();
  const schedules: Record<string, ScheduleRow[]> = {};

  for (const weekRecord of weeks) {
    schedules[weekRecord.week] = await listSchedule(weekRecord.week);
  }

  return { staff, weeks, schedules };
}
