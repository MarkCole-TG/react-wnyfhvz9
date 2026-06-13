import * as memoryStore from "./store";
import * as sqlStore from "./store-sql";
import { ScheduleRow, StaffMember, WeekRecord, WeekStatus } from "./types";

export type { SchedulePayload, StaffCreatePayload, StaffUpdatePayload, RoleUpdatePayload } from "./store";

type SchedulePayload = memoryStore.SchedulePayload;
type StaffCreatePayload = memoryStore.StaffCreatePayload;
type StaffUpdatePayload = memoryStore.StaffUpdatePayload;

interface StoreAdapter {
  listStaff(): Promise<StaffMember[]>;
  getStaff(staffId: string): Promise<StaffMember | null>;
  deleteStaff(staffId: string, expectedUpdatedAt?: string): Promise<boolean>;
  createStaff(payload: StaffCreatePayload): Promise<StaffMember>;
  updateStaff(staffId: string, payload: StaffUpdatePayload): Promise<StaffMember | null>;
  getWeekRecord(week: string): Promise<WeekRecord>;
  listSchedule(week: string): Promise<ScheduleRow[]>;
  upsertScheduleRow(week: string, staffId: string, payload: SchedulePayload): Promise<ScheduleRow | null>;
  setWeekStatus(week: string, status: WeekStatus, actor: string): Promise<WeekRecord>;
  listWeeks(): Promise<WeekRecord[]>;
  getAppSnapshot(): Promise<unknown>;
}

const memoryAdapter: StoreAdapter = {
  async listStaff() {
    return memoryStore.listStaff();
  },
  async getStaff(staffId) {
    return memoryStore.getStaff(staffId);
  },
  async deleteStaff(staffId, expectedUpdatedAt) {
    return memoryStore.deleteStaff(staffId, expectedUpdatedAt);
  },
  async createStaff(payload) {
    return memoryStore.createStaff(payload);
  },
  async updateStaff(staffId, payload) {
    return memoryStore.updateStaff(staffId, payload);
  },
  async getWeekRecord(week) {
    return memoryStore.getWeekRecord(week);
  },
  async listSchedule(week) {
    return memoryStore.listSchedule(week);
  },
  async upsertScheduleRow(week, staffId, payload) {
    return memoryStore.upsertScheduleRow(week, staffId, payload);
  },
  async setWeekStatus(week, status, actor) {
    return memoryStore.setWeekStatus(week, status, actor);
  },
  async listWeeks() {
    return memoryStore.listWeeks();
  },
  async getAppSnapshot() {
    return memoryStore.getAppSnapshot();
  },
};

let resolvedStorePromise: Promise<StoreAdapter> | null = null;
let warnedAboutFallback = false;

function shouldUseSqlStore() {
  return process.env.SQL_USE_DATABASE === "true";
}

function canFallbackToMemoryStore() {
  return process.env.WEBSITE_INSTANCE_ID === undefined && process.env.SQL_FALLBACK_TO_MEMORY !== "false";
}

async function resolveStore(): Promise<StoreAdapter> {
  if (!shouldUseSqlStore()) {
    return memoryAdapter;
  }

  try {
    await sqlStore.listStaff();
    return sqlStore;
  } catch (error) {
    if (!canFallbackToMemoryStore()) {
      throw error;
    }

    if (!warnedAboutFallback) {
      warnedAboutFallback = true;
      console.warn("[store-runtime] Falling back to in-memory store because SQL initialization failed.", error);
    }

    return memoryAdapter;
  }
}

async function getStore() {
  if (!resolvedStorePromise) {
    resolvedStorePromise = resolveStore();
  }

  return resolvedStorePromise;
}

export async function resetAppState(): Promise<void> {
  memoryStore.resetAppState();

  if (shouldUseSqlStore()) {
    try {
      await sqlStore.resetAppState();
    } catch {
      // Ignore SQL reset failures when local runtime is operating in memory fallback mode.
    }
  }

  resolvedStorePromise = null;
  warnedAboutFallback = false;
}

export async function listStaff() {
  return (await getStore()).listStaff();
}

export async function getStaff(staffId: string) {
  return (await getStore()).getStaff(staffId);
}

export async function deleteStaff(staffId: string, expectedUpdatedAt?: string) {
  return (await getStore()).deleteStaff(staffId, expectedUpdatedAt);
}

export async function createStaff(payload: memoryStore.StaffCreatePayload) {
  return (await getStore()).createStaff(payload);
}

export async function updateStaff(staffId: string, payload: memoryStore.StaffUpdatePayload) {
  return (await getStore()).updateStaff(staffId, payload);
}

export async function getWeekRecord(week: string) {
  return (await getStore()).getWeekRecord(week);
}

export async function listSchedule(week: string) {
  return (await getStore()).listSchedule(week);
}

export async function upsertScheduleRow(week: string, staffId: string, payload: memoryStore.SchedulePayload) {
  return (await getStore()).upsertScheduleRow(week, staffId, payload);
}

export async function setWeekStatus(week: string, status: WeekStatus, actor: string) {
  return (await getStore()).setWeekStatus(week, status, actor);
}

export async function listWeeks() {
  return (await getStore()).listWeeks();
}

export async function getAppSnapshot() {
  return (await getStore()).getAppSnapshot();
}