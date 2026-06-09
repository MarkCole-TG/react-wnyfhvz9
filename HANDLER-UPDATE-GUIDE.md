# Handler Update Pattern

This file shows how to update each function handler to use the SQL store.

## Before (In-Memory Store)

```typescript
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { authorizeRequest } from "../security/authorize";
import { fail, ok } from "../http/response";
import { listStaff } from "../data/store";

export async function GetStaff(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = await authorizeRequest(req, context.invocationId, ["viewer", "planner", "admin"]);
  if (!auth.ok) {
    const failure = auth as unknown as { status: number; body: { error: { code: string; message: string; correlationId: string } } };
    return fail(failure.status, failure.body.error.code, failure.body.error.message, failure.body.error.correlationId);
  }

  return ok({ staff: listStaff() });  // ← Not awaited
}
```

## After (SQL Store)

```typescript
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { authorizeRequest } from "../security/authorize";
import { fail, ok } from "../http/response";
import { listStaff } from "../data/store-sql";  // ← Changed import

export async function GetStaff(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = await authorizeRequest(req, context.invocationId, ["viewer", "planner", "admin"]);
  if (!auth.ok) {
    const failure = auth as unknown as { status: number; body: { error: { code: string; message: string; correlationId: string } } };
    return fail(failure.status, failure.body.error.code, failure.body.error.message, failure.body.error.correlationId);
  }

  const staff = await listStaff();  // ← Now awaited
  return ok({ staff });
}
```

## Key Changes

1. **Import**: Change from `"../data/store"` to `"../data/store-sql"`
2. **Await**: Add `await` to all store function calls
3. **Assign**: Store result in variable before using

## All Handlers to Update

### 1. GetStaff.ts
```typescript
// Change:
import { listStaff } from "../data/store";
// To:
import { listStaff } from "../data/store-sql";

// Change:
return ok({ staff: listStaff() });
// To:
const staff = await listStaff();
return ok({ staff });
```

### 2. CreateStaff.ts
```typescript
// Change:
import { createStaff } from "../data/store";
// To:
import { createStaff } from "../data/store-sql";

// Change:
const staff = createStaff(payload);
// To:
const staff = await createStaff(payload);
```

### 3. UpdateStaff.ts
```typescript
// Change:
import { getStaff, updateStaff } from "../data/store";
// To:
import { getStaff, updateStaff } from "../data/store-sql";

// Add awaits:
const staff = await updateStaff(staffId, payload);
```

### 4. DeleteStaff.ts
```typescript
// Change:
import { deleteStaff } from "../data/store";
// To:
import { deleteStaff } from "../data/store-sql";

// Add awaits:
const deleted = await deleteStaff(staffId, expectedUpdatedAt);
```

### 5. GetSchedule.ts
```typescript
// Change:
import { getWeekRecord, listSchedule } from "../data/store";
// To:
import { getWeekRecord, listSchedule } from "../data/store-sql";

// Add awaits:
const weekRecord = await getWeekRecord(week);
const rows = await listSchedule(week);
```

### 6. UpsertSchedule.ts
```typescript
// Change:
import { upsertScheduleRow } from "../data/store";
// To:
import { upsertScheduleRow } from "../data/store-sql";

// Add awaits:
const row = await upsertScheduleRow(week, staffId, payload);
```

### 7. LockWeek.ts
```typescript
// Change:
import { setWeekStatus } from "../data/store";
// To:
import { setWeekStatus } from "../data/store-sql";

// Add awaits:
const record = await setWeekStatus(week, "locked", actor);
```

### 8. UnlockWeek.ts
```typescript
// Change:
import { setWeekStatus } from "../data/store";
// To:
import { setWeekStatus } from "../data/store-sql";

// Add awaits:
const record = await setWeekStatus(week, "open", actor);
```

### 9. UpdateUserRoles.ts
```typescript
// Change:
import { setUserRoles } from "../security/userStore";
// To:
import { setUserRoles } from "../data/userStore-sql";

// Add awaits:
await setUserRoles(entraObjectId, roles);
```

## Error Handling Pattern

When updating handlers, wrap store calls in try-catch for proper error handling:

```typescript
try {
  const staff = await createStaff(payload);
  return ok(staff, 201);
} catch (error) {
  if (error instanceof Error) {
    if (error.message === "duplicate_staff") {
      return fail(409, "duplicate_staff", "Staff with this name or number already exists.", context.invocationId);
    }
    if (error.message === "invalid_staff") {
      return fail(400, "invalid_staff", "Name and number are required.", context.invocationId);
    }
  }
  return fail(500, "server_error", "Failed to create staff.", context.invocationId);
}
```

## Testing Pattern

Tests can continue using `AUTH_DEV_BYPASS` but should call the reset function:

```typescript
import { resetAppState } from "../data/store-sql";

beforeEach(async () => {
  await resetAppState();
  resetUserOverrides();
});
```

## Backward Compatibility Notes

- Original `store.ts` (in-memory) is preserved for reference
- Tests can use either store by switching imports
- Use `SQL_USE_DATABASE` environment variable to control behavior
- For testing, set `SQL_USE_DATABASE=false` or mock database
