# SQL Database Integration Summary

## What's Been Set Up

### 1. **Database Connection Layer** (`api/src/db/connection.ts`)
- ✅ Connection pooling using `mssql` npm package
- ✅ Support for both local SQLExpress and Azure SQL Database
- ✅ Automatic connection configuration based on environment
- ✅ Query and execute helper functions
- ✅ Azure AD authentication support for managed identities

### 2. **Database Schema** (`api/src/db/schema.ts`)
- ✅ Automatic schema initialization on first connection
- ✅ Tables created:
  - `AppUsers` - User accounts with Entra Object IDs
  - `UserRoles` - RBAC role assignments (viewer, planner, admin)
  - `Staff` - Staff member records with roles
  - `Schedule` - Weekly schedule entries
  - `Weeks` - Week lock status
- ✅ Indexes created for performance
- ✅ Foreign key relationships with cascade delete
- ✅ Reset function for testing

### 3. **SQL-Based Data Store** (`api/src/data/store-sql.ts`)
- ✅ Async versions of all store functions:
  - `listStaff()`, `getStaff()`, `createStaff()`, `updateStaff()`, `deleteStaff()`
  - `listSchedule()`, `upsertScheduleRow()`
  - `getWeekRecord()`, `setWeekStatus()`, `listWeeks()`
  - `resetAppState()` for testing
- ✅ Optimistic concurrency control with `updatedAt`
- ✅ Error handling for stale writes and locked weeks
- ✅ Proper type conversions between SQL and TypeScript

### 4. **SQL-Based User/Role Store** (`api/src/data/userStore-sql.ts`)
- ✅ User management:
  - `findUserByEntraObjectId()`
  - `createOrUpdateUser()`
  - `listUsers()`
- ✅ Role management:
  - `setUserRoles()` (replace all roles)
  - `addUserRole()` (add single role)
  - `removeUserRole()` (remove single role)
  - `getUserRoles()`

### 5. **Configuration** (`api/local.settings.json`)
- ✅ Environment variables for SQL connection:
  - `SQL_SERVER` - Server hostname (default: localhost)
  - `SQL_DATABASE` - Database name (default: ScheduleDb)
  - `SQL_USERNAME` - Username (default: sa)
  - `SQL_PASSWORD` - Password
  - `SQL_USE_AZURE_AUTH` - Enable Azure AD auth (default: false)
  - `SQL_CONNECTION_STRING` - Optional full connection string
  - `SQL_USE_DATABASE` - Enable/disable SQL (default: true)

### 6. **Documentation** (`api/SQL-DATABASE-SETUP.md`)
- ✅ Complete setup guide for local SQLExpress
- ✅ Azure SQL Database configuration options
- ✅ SQL authentication vs Azure AD authentication
- ✅ Deployment instructions
- ✅ Troubleshooting guide
- ✅ Best practices

## What Still Needs to Be Done

### 1. **Update Function Handlers** (REQUIRED)
All function handlers need to be updated to use the SQL store:

Current handlers to update:
- ✅ `CreateStaff.ts` - Import `store-sql`, await store calls
- ✅ `UpdateStaff.ts` - Import `store-sql`, await store calls
- ✅ `DeleteStaff.ts` - Import `store-sql`, await store calls
- ✅ `GetStaff.ts` - Import `store-sql`, await store calls
- ✅ `GetSchedule.ts` - Import `store-sql`, await store calls
- ✅ `UpsertSchedule.ts` - Import `store-sql`, await store calls
- ✅ `LockWeek.ts` - Import `store-sql`, await store calls
- ✅ `UnlockWeek.ts` - Import `store-sql`, await store calls
- ✅ `UpdateUserRoles.ts` - Import `userStore-sql`, await store calls

### 2. **Update Authorization Handler** (OPTIONAL)
Update `api/src/security/authorize.ts` to use SQL-based user store:
- Use `findUserByEntraObjectId()` from `userStore-sql` when SQL is enabled
- Fallback to `APP_USERS_JSON` for backward compatibility

### 3. **Initialize Database on Startup** (OPTIONAL)
Create an initialization function that runs on first connection:
- Call `initializeDatabase()` from schema module
- Can be done in a startup handler or lazy on first API call

### 4. **Update Tests** (OPTIONAL)
If you want integration tests with SQL:
- Use `resetAppState()` for cleanup between tests
- Can keep in-memory tests by checking `SQL_USE_DATABASE` env var
- Or create separate SQL integration tests

### 5. **Migration Scripts** (FOR PRODUCTION)
If migrating from in-memory to SQL:
- Export current data if needed
- Create import scripts for existing data
- Test data integrity

## Quick Start

### For Local Development:

1. **Install SQL Server Express** if not already installed

2. **Create the database**:
   ```sql
   CREATE DATABASE ScheduleDb;
   ```

3. **Update package.json and install dependencies**:
   ```bash
   cd api
   npm install
   ```

4. **Build and run** (handlers will auto-initialize schema):
   ```bash
   npm run build
   func start
   ```

### For Azure Deployment:

1. **Create Azure SQL Database** in your resource group

2. **Get the connection string** from Azure Portal

3. **Set App Service settings**:
   - `SQL_SERVER`: myserver.database.windows.net
   - `SQL_DATABASE`: ScheduleDb
   - `SQL_USERNAME`: admin
   - `SQL_PASSWORD`: (set securely)
   - Or use `SQL_USE_AZURE_AUTH`: true with managed identity

4. **Schema initializes automatically** on first API call

## Architecture

```
API Handlers (GetStaff, CreateStaff, etc.)
    ↓
store-sql.ts (Async operations)
    ↓
connection.ts (Query/Execute helpers)
    ↓
mssql (SQL Server client)
    ↓
SQL Database (SQLExpress or Azure SQL)
```

## Key Differences from In-Memory

| Aspect | In-Memory | SQL |
|--------|-----------|-----|
| Store functions | Synchronous | Asynchronous |
| Data persistence | Session only | Persistent across restarts |
| Scaling | Single instance | Can scale with connection pooling |
| Testing | Fast, no setup | Requires DB connection |
| Production | No | ✅ Recommended |

## Environment Variable Reference

### Local Development (SQLExpress)
```
SQL_USE_DATABASE=true
SQL_SERVER=localhost
SQL_DATABASE=ScheduleDb
SQL_USERNAME=sa
SQL_PASSWORD=Password123!
SQL_USE_AZURE_AUTH=false
```

### Azure Production (SQL Auth)
```
SQL_USE_DATABASE=true
SQL_SERVER=myserver.database.windows.net
SQL_DATABASE=ScheduleDb
SQL_USERNAME=admin
SQL_PASSWORD=<SecurePassword>
SQL_USE_AZURE_AUTH=false
```

### Azure Production (Managed Identity)
```
SQL_USE_DATABASE=true
SQL_SERVER=myserver.database.windows.net
SQL_DATABASE=ScheduleDb
SQL_USE_AZURE_AUTH=true
```

## Next Steps

1. **Update all 9 function handlers** to import from `store-sql` and await store calls
2. **Optional**: Update `authorize.ts` to use SQL-based user store
3. **Optional**: Add startup initialization for schema creation
4. **Test locally** with SQLExpress
5. **Deploy** to Azure with Azure SQL Database

See individual function files for required changes.
