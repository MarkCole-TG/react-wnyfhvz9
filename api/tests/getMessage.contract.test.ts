import test from "node:test";
import assert from "node:assert/strict";
import { GetMessage } from "../src/functions/GetMessage";

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

function request(headers: Record<string, string>) {
  return { headers: new Headers(headers) } as any;
}

const context = { invocationId: "contract-test-correlation" } as any;

test("returns 401 when bearer token is missing", async () => {
  await withEnv(
    {
      AUTH_DEV_BYPASS: "true",
      NODE_ENV: "test",
      APP_USERS_JSON: JSON.stringify([
        {
          userId: "user-1",
          entraObjectId: "oid-1",
          roles: ["viewer"],
        },
      ]),
    },
    async () => {
      const response = await GetMessage(request({}), context);

      assert.equal(response.status, 401);
      assert.equal((response.jsonBody as any).error.code, "missing_token");
    }
  );
});

test("returns 403 when Entra object id is not mapped to AppUsers", async () => {
  await withEnv(
    {
      AUTH_DEV_BYPASS: "true",
      NODE_ENV: "test",
      APP_USERS_JSON: JSON.stringify([
        {
          userId: "user-1",
          entraObjectId: "oid-known",
          roles: ["viewer"],
        },
      ]),
    },
    async () => {
      const response = await GetMessage(
        request({
          authorization: "Bearer test-token",
          "x-dev-entra-object-id": "oid-unknown",
        }),
        context
      );

      assert.equal(response.status, 403);
      assert.equal((response.jsonBody as any).error.code, "user_not_mapped");
    }
  );
});

test("returns 200 for mapped viewer role", async () => {
  await withEnv(
    {
      AUTH_DEV_BYPASS: "true",
      NODE_ENV: "test",
      APP_USERS_JSON: JSON.stringify([
        {
          userId: "user-2",
          entraObjectId: "oid-viewer",
          roles: ["viewer"],
        },
      ]),
    },
    async () => {
      const response = await GetMessage(
        request({
          authorization: "Bearer test-token",
          "x-dev-entra-object-id": "oid-viewer",
        }),
        context
      );

      assert.equal(response.status, 200);
      assert.equal((response.jsonBody as any).message, "Hello from Azure Functions v4!");
    }
  );
});

test("ignores dev bypass in hosted environments", async () => {
  await withEnv(
    {
      AUTH_DEV_BYPASS: "true",
      NODE_ENV: "test",
      WEBSITE_INSTANCE_ID: "hosted-instance",
      APP_USERS_JSON: JSON.stringify([
        {
          userId: "user-2",
          entraObjectId: "oid-viewer",
          roles: ["viewer"],
        },
      ]),
    },
    async () => {
      const response = await GetMessage(
        request({
          authorization: "Bearer test-token",
          "x-dev-entra-object-id": "oid-viewer",
        }),
        context
      );

      assert.equal(response.status, 401);
      assert.equal((response.jsonBody as any).error.code, "invalid_token");
    }
  );
});
