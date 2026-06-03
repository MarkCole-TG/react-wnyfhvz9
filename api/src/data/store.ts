import { randomUUID } from "node:crypto";
import { ScheduleRow, StaffMember, WeekRecord, WeekStatus } from "./types";

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
}

export interface StaffUpdatePayload {
  name?: string;
  number?: string;
  title?: string;
  active?: boolean;
  updatedAt?: string;
}

export interface RoleUpdatePayload {
  roles?: string[];
}

interface AppState {
  staff: StaffMember[];
  schedules: Record<string, Record<string, ScheduleRow>>;
  weeks: Record<string, WeekRecord>;
}

const emptyRow = (): Omit<ScheduleRow, "staffId" | "updatedAt"> => ({
  MonAM: "",
  MonPM: "",
  TueAM: "",
  TuePM: "",
  WedAM: "",
  WedPM: "",
  ThuAM: "",
  ThuPM: "",
  FriAM: "",
  FriPM: "",
  comment: "",
});

const state: AppState = {
  staff: [],
  schedules: {},
  weeks: {},
};

export function resetAppState() {
  state.staff = [];
  state.schedules = {};
  state.weeks = {};
}

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function ensureWeekRecord(week: string): WeekRecord {
  const existing = state.weeks[week];
  if (existing) {
    return existing;
  }

  const created: WeekRecord = {
    week,
    status: "open",
    updatedAt: nowIso(),
  };
  state.weeks[week] = created;
  return created;
}

function ensureWeekSchedule(week: string) {
  if (!state.schedules[week]) {
    state.schedules[week] = {};
  }
  ensureWeekRecord(week);
  return state.schedules[week];
}

function normalizeRowInput(input: SchedulePayload): Partial<Omit<ScheduleRow, "staffId" | "updatedAt">> {
  return {
    ...(input.MonAM !== undefined ? { MonAM: input.MonAM } : {}),
    ...(input.MonPM !== undefined ? { MonPM: input.MonPM } : {}),
    ...(input.TueAM !== undefined ? { TueAM: input.TueAM } : {}),
    ...(input.TuePM !== undefined ? { TuePM: input.TuePM } : {}),
    ...(input.WedAM !== undefined ? { WedAM: input.WedAM } : {}),
    ...(input.WedPM !== undefined ? { WedPM: input.WedPM } : {}),
    ...(input.ThuAM !== undefined ? { ThuAM: input.ThuAM } : {}),
    ...(input.ThuPM !== undefined ? { ThuPM: input.ThuPM } : {}),
    ...(input.FriAM !== undefined ? { FriAM: input.FriAM } : {}),
    ...(input.FriPM !== undefined ? { FriPM: input.FriPM } : {}),
    ...(input.comment !== undefined ? { comment: input.comment } : {}),
  };
}

function assertWeekOpen(week: string) {
  const record = ensureWeekRecord(week);
  if (record.status === "locked") {
    const error = new Error("week_locked");
    throw error;
  }
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

export function listStaff() {
  return clone(state.staff);
}

export function getStaff(staffId: string) {
  return state.staff.find((item) => item.id === staffId) ?? null;
}

export function deleteStaff(staffId: string, expectedUpdatedAt?: string) {
  const index = state.staff.findIndex((item) => item.id === staffId);
  if (index < 0) {
    return false;
  }

  assertUpdatedAtPrecondition(state.staff[index].updatedAt, expectedUpdatedAt);

  state.staff.splice(index, 1);

  for (const weekSchedule of Object.values(state.schedules)) {
    if (weekSchedule[staffId]) {
      delete weekSchedule[staffId];
    }
  }

  return true;
}

export function createStaff(payload: StaffCreatePayload) {
  const timestamp = nowIso();
  const normalizedName = (payload.name ?? "").trim();
  const normalizedNameKey = normalizedName.toLowerCase();
  const normalizedNumber = (payload.number ?? "").trim();
  const staff: StaffMember = {
    id: newId("staff"),
    name: normalizedName,
    number: normalizedNumber,
    title: payload.title?.trim() || undefined,
    active: payload.active ?? true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (!staff.name || !staff.number) {
    throw new Error("invalid_staff");
  }

  const duplicate = state.staff.some((item) => {
    const sameName = item.name.trim().toLowerCase() === normalizedNameKey;
    const sameNumber = item.number.trim() === normalizedNumber;
    return sameName || sameNumber;
  });
  if (duplicate) {
    throw new Error("duplicate_staff");
  }

  state.staff.push(staff);
  return clone(staff);
}

export function updateStaff(staffId: string, payload: StaffUpdatePayload) {
  const staff = state.staff.find((item) => item.id === staffId);
  if (!staff) {
    return null;
  }

  assertUpdatedAtPrecondition(staff.updatedAt, payload.updatedAt);

  if (payload.name !== undefined) staff.name = payload.name.trim();
  if (payload.number !== undefined) staff.number = payload.number.trim();
  if (payload.title !== undefined) staff.title = payload.title.trim() || undefined;
  if (payload.active !== undefined) staff.active = payload.active;
  staff.updatedAt = nowIso();
  return clone(staff);
}

export function getWeekRecord(week: string) {
  return clone(ensureWeekRecord(week));
}

export function listSchedule(week: string) {
  const weekSchedule = ensureWeekSchedule(week);
  return clone(Object.values(weekSchedule));
}

export function upsertScheduleRow(week: string, staffId: string, payload: SchedulePayload) {
  assertWeekOpen(week);
  const staff = getStaff(staffId);
  if (!staff) {
    return null;
  }

  const weekSchedule = ensureWeekSchedule(week);
  const timestamp = nowIso();
  const existing = weekSchedule[staffId];
  if (existing) {
    assertUpdatedAtPrecondition(existing.updatedAt, payload.updatedAt);
  }

  const base = existing
    ? existing
    : {
        staffId,
        ...emptyRow(),
        updatedAt: timestamp,
      };

  const next: ScheduleRow = {
    ...base,
    ...normalizeRowInput(payload),
    staffId,
    updatedAt: timestamp,
  };

  weekSchedule[staffId] = next;
  return clone(next);
}

export function setWeekStatus(week: string, status: WeekStatus, actor: string) {
  const record = ensureWeekRecord(week);
  const timestamp = nowIso();
  record.status = status;
  record.updatedAt = timestamp;

  if (status === "locked") {
    record.lockedBy = actor;
    record.lockedAt = timestamp;
  } else {
    record.unlockedBy = actor;
    record.unlockedAt = timestamp;
  }

  return clone(record);
}

export function listWeeks() {
  return clone(Object.values(state.weeks));
}

export function getAppSnapshot() {
  return clone(state);
}
