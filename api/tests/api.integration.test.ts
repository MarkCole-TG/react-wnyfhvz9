import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { CreateStaff } from "../src/functions/CreateStaff";
import { DeleteStaff } from "../src/functions/DeleteStaff";
import { GetSchedule } from "../src/functions/GetSchedule";
import { GetStaff } from "../src/functions/GetStaff";
import { LockWeek } from "../src/functions/LockWeek";
import { UpdateStaff } from "../src/functions/UpdateStaff";
import { UpdateUserRoles } from "../src/functions/UpdateUserRoles";
import { UpsertSchedule } from "../src/functions/UpsertSchedule";
import { resetAppState } from "../src/data/store";
import { resetUserOverrides } from "../src/security/userStore";

function withEnv(values: Record<string, string | undefined>, run: () => Promise<void>) {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return run().finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

function request(options: {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  json?: () => Promise<unknown>;
}) {
  return {
    headers: new Headers(options.headers ?? {}),
    params: options.params ?? {},
    query: new URLSearchParams(options.query ?? {}),
    body: options.body,
    json: options.json,
  } as any;
}

const context = { invocationId: "integration-test-correlation" } as any;

beforeEach(() => {
  resetAppState();
  resetUserOverrides();
});

test("planner can create staff and save a schedule row", async () => {
  await withEnv(
    {
      AUTH_DEV_BYPASS: "true",
      NODE_ENV: "test",
      APP_USERS_JSON: JSON.stringify([
        { userId: "user-viewer", entraObjectId: "oid-viewer", roles: ["viewer"] },
        { userId: "user-planner", entraObjectId: "oid-planner", roles: ["planner"] },
        { userId: "user-admin", entraObjectId: "oid-admin", roles: ["admin"] },
      ]),
    },
    async () => {
      const createResponse = await CreateStaff(
        request({
          headers: {
            authorization: "Bearer test-token",
            "x-dev-entra-object-id": "oid-planner",
          },
          body: {
            name: "Jordan Miles",
            number: "1001",
            title: "Planner",
          },
        }),
        context
      );

      assert.equal(createResponse.status, 201);
      const createdStaff = (createResponse.jsonBody as any).staff;
      assert.ok(createdStaff.id);
      assert.equal(createdStaff.name, "Jordan Miles");

      const scheduleResponse = await UpsertSchedule(
        request({
          headers: {
            authorization: "Bearer test-token",
            "x-dev-entra-object-id": "oid-planner",
          },
          params: {
            week: "2026-06-01",
            staffId: createdStaff.id,
          },
          body: {
            MonAM: "WFH",
            MonPM: "Office",
            comment: "Integration test",
          },
        }),
        context
      );

      assert.equal(scheduleResponse.status, 200);
      const scheduleRow = (scheduleResponse.jsonBody as any).row;
      assert.equal(scheduleRow.staffId, createdStaff.id);
      assert.equal(scheduleRow.MonAM, "WFH");
      assert.equal(scheduleRow.MonPM, "Office");
      assert.equal(scheduleRow.comment, "Integration test");

      const staffResponse = await GetStaff(
        request({
          headers: {
            authorization: "Bearer test-token",
            "x-dev-entra-object-id": "oid-viewer",
          },
        }),
        context
      );

      assert.equal(staffResponse.status, 200);
      const staffList = (staffResponse.jsonBody as any).staff;
      assert.equal(staffList.length, 1);
      assert.equal(staffList[0].name, "Jordan Miles");

      const scheduleReadResponse = await GetSchedule(
        request({
          headers: {
            authorization: "Bearer test-token",
            "x-dev-entra-object-id": "oid-viewer",
          },
          query: {
            week: "2026-06-01",
          },
        }),
        context
      );

      assert.equal(scheduleReadResponse.status, 200);
      const readBody = scheduleReadResponse.jsonBody as any;
      assert.equal(readBody.week.week, "2026-06-01");
      assert.equal(readBody.rows.length, 1);
      assert.equal(readBody.rows[0].staffId, createdStaff.id);

      const staleScheduleWrite = await UpsertSchedule(
        request({
          headers: {
            authorization: "Bearer test-token",
            "x-dev-entra-object-id": "oid-planner",
          },
          params: {
            week: "2026-06-01",
            staffId: createdStaff.id,
          },
          body: {
            TueAM: "Office",
            updatedAt: "2000-01-01T00:00:00.000Z",
          },
        }),
        context
      );

      assert.equal(staleScheduleWrite.status, 409);
      assert.equal((staleScheduleWrite.jsonBody as any).error.code, "version_mismatch");

      const latestRow = readBody.rows[0];
      const freshScheduleWrite = await UpsertSchedule(
        request({
          headers: {
            authorization: "Bearer test-token",
            "x-dev-entra-object-id": "oid-planner",
          },
          params: {
            week: "2026-06-01",
            staffId: createdStaff.id,
          },
          body: {
            TueAM: "Office",
            updatedAt: latestRow.updatedAt,
          },
        }),
        context
      );

      assert.equal(freshScheduleWrite.status, 200);
    }
  );
});

test("admin can lock a week and update roles for another user", async () => {
  await withEnv(
    {
      AUTH_DEV_BYPASS: "true",
      NODE_ENV: "test",
      APP_USERS_JSON: JSON.stringify([
        { userId: "user-viewer", entraObjectId: "oid-viewer", roles: ["viewer"] },
        { userId: "user-planner", entraObjectId: "oid-planner", roles: ["planner"] },
        { userId: "user-admin", entraObjectId: "oid-admin", roles: ["admin"] },
      ]),
    },
    async () => {
      const created = await CreateStaff(
        request({
          headers: {
            authorization: "Bearer test-token",
            "x-dev-entra-object-id": "oid-planner",
          },
          body: {
            name: "Locked Week Staff",
            number: "2001",
          },
        }),
        context
      );

      const staffId = (created.jsonBody as any).staff.id;

      const lockResponse = await LockWeek(
        request({
          headers: {
            authorization: "Bearer test-token",
            "x-dev-entra-object-id": "oid-admin",
          },
          params: {
            week: "2026-06-08",
          },
        }),
        context
      );

      assert.equal(lockResponse.status, 200);
      assert.equal((lockResponse.jsonBody as any).week.status, "locked");

      const lockedWrite = await UpsertSchedule(
        request({
          headers: {
            authorization: "Bearer test-token",
            "x-dev-entra-object-id": "oid-planner",
          },
          params: {
            week: "2026-06-08",
            staffId,
          },
          body: {
            TueAM: "Office",
          },
        }),
        context
      );

      assert.equal(lockedWrite.status, 409);
      assert.equal((lockedWrite.jsonBody as any).error.code, "week_locked");

      const roleUpdate = await UpdateUserRoles(
        request({
          headers: {
            authorization: "Bearer test-token",
            "x-dev-entra-object-id": "oid-admin",
          },
          params: {
            entraObjectId: "oid-viewer",
          },
          body: {
            roles: ["planner"],
          },
        }),
        context
      );

      assert.equal(roleUpdate.status, 200);
      assert.deepEqual((roleUpdate.jsonBody as any).roles, ["planner"]);

      const promotedCreate = await CreateStaff(
        request({
          headers: {
            authorization: "Bearer test-token",
            "x-dev-entra-object-id": "oid-viewer",
          },
          body: {
            name: "Promoted User",
            number: "3001",
          },
        }),
        context
      );

      assert.equal(promotedCreate.status, 201);
      assert.equal((promotedCreate.jsonBody as any).staff.name, "Promoted User");

      const staffToUpdate = (promotedCreate.jsonBody as any).staff;
      const updateResponse = await UpdateStaff(
        request({
          headers: {
            authorization: "Bearer test-token",
            "x-dev-entra-object-id": "oid-admin",
          },
          params: {
            staffId: staffToUpdate.id,
          },
          body: {
            name: "Promoted User Updated",
            number: "3001",
            updatedAt: "2000-01-01T00:00:00.000Z",
          },
        }),
        context
      );

      assert.equal(updateResponse.status, 409);
      assert.equal((updateResponse.jsonBody as any).error.code, "version_mismatch");
    }
  );
});

test("returns 400 when schedule payload JSON is malformed", async () => {
  await withEnv(
    {
      AUTH_DEV_BYPASS: "true",
      NODE_ENV: "test",
      APP_USERS_JSON: JSON.stringify([
        { userId: "user-planner", entraObjectId: "oid-planner", roles: ["planner"] },
      ]),
    },
    async () => {
      const created = await CreateStaff(
        request({
          headers: {
            authorization: "Bearer test-token",
            "x-dev-entra-object-id": "oid-planner",
          },
          body: {
            name: "Malformed Json Staff",
            number: "4001",
          },
        }),
        context
      );

      const staffId = (created.jsonBody as any).staff.id;

      const response = await UpsertSchedule(
        request({
          headers: {
            authorization: "Bearer test-token",
            "x-dev-entra-object-id": "oid-planner",
          },
          params: {
            week: "2026-06-15",
            staffId,
          },
          json: async () => {
            throw new Error("Unexpected token }");
          },
        }),
        context
      );

      assert.equal(response.status, 400);
      assert.equal((response.jsonBody as any).error.code, "invalid_json");
    }
  );
});

test("planner can delete staff and remove schedule rows", async () => {
  await withEnv(
    {
      AUTH_DEV_BYPASS: "true",
      NODE_ENV: "test",
      APP_USERS_JSON: JSON.stringify([
        { userId: "user-planner", entraObjectId: "oid-planner", roles: ["planner"] },
        { userId: "user-viewer", entraObjectId: "oid-viewer", roles: ["viewer"] },
      ]),
    },
    async () => {
      const createResponse = await CreateStaff(
        request({
          headers: {
            authorization: "Bearer test-token",
            "x-dev-entra-object-id": "oid-planner",
          },
          body: {
            name: "Delete Me",
            number: "5001",
          },
        }),
        context
      );

      const staffId = (createResponse.jsonBody as any).staff.id;
      const staffUpdatedAt = (createResponse.jsonBody as any).staff.updatedAt;

      const upsertResponse = await UpsertSchedule(
        request({
          headers: {
            authorization: "Bearer test-token",
            "x-dev-entra-object-id": "oid-planner",
          },
          params: {
            week: "2026-06-22",
            staffId,
          },
          body: {
            MonAM: "Office",
          },
        }),
        context
      );

      assert.equal(upsertResponse.status, 200);

      const deleteResponse = await DeleteStaff(
        request({
          headers: {
            authorization: "Bearer test-token",
            "x-dev-entra-object-id": "oid-planner",
          },
          params: {
            staffId,
          },
          query: {
            updatedAt: staffUpdatedAt,
          },
        }),
        context
      );

      assert.equal(deleteResponse.status, 204);

      const staffReadResponse = await GetStaff(
        request({
          headers: {
            authorization: "Bearer test-token",
            "x-dev-entra-object-id": "oid-viewer",
          },
        }),
        context
      );

      assert.equal(staffReadResponse.status, 200);
      assert.equal((staffReadResponse.jsonBody as any).staff.length, 0);

      const scheduleReadResponse = await GetSchedule(
        request({
          headers: {
            authorization: "Bearer test-token",
            "x-dev-entra-object-id": "oid-viewer",
          },
          query: {
            week: "2026-06-22",
          },
        }),
        context
      );

      assert.equal(scheduleReadResponse.status, 200);
      assert.equal((scheduleReadResponse.jsonBody as any).rows.length, 0);

      const staleDeleteResponse = await DeleteStaff(
        request({
          headers: {
            authorization: "Bearer test-token",
            "x-dev-entra-object-id": "oid-planner",
          },
          params: {
            staffId,
          },
          query: {
            updatedAt: staffUpdatedAt,
          },
        }),
        context
      );

      assert.equal(staleDeleteResponse.status, 404);
    }
  );
});
