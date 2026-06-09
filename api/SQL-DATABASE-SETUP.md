# SQL Database Setup Guide

This API supports local SQL Server (SQLExpress), local SQL LocalDB, and Azure SQL Database for data persistence.

## Configuration

Database connection is configured via environment variables:

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `SQL_USE_DATABASE` | Enable SQL database (vs in-memory) | `false` | `true` |
| `SQL_SERVER` | SQL Server hostname or IP | `localhost` | `myserver.database.windows.net` |
| `SQL_DATABASE` | Database name | `ScheduleDb` | `ScheduleDb` |
| `SQL_AUTH_MODE` | Local auth mode (`sql` or `windows`) | `sql` | `windows` |
| `SQL_USERNAME` | Database username | `sa` | `admin@myserver` |
| `SQL_PASSWORD` | Database password | `Password123!` | (set securely) |
| `SQL_CONNECTION_STRING` | Full connection string (optional) | (none) | `Server=tcp:...` |
| `SQL_USE_AZURE_AUTH` | Use Azure AD authentication | `false` | `true` |

## Local Development (SQL LocalDB - Recommended)

### Prerequisites

1. Install SQL LocalDB (usually included with SQL Server Express/SSMS tooling)
2. Install [SQL Server Management Studio](https://learn.microsoft.com/en-us/sql/ssms/download-sql-server-management-studio-ssms)

### Setup

1. **Create the database**:
   ```bash
   sqlcmd -S "(localdb)\\MSSQLLocalDB" -E -Q "IF DB_ID('ScheduleDb') IS NULL CREATE DATABASE ScheduleDb;"
   ```

2. **Verify local.settings.json has correct values**:
   ```json
   {
     "Values": {
       "SQL_USE_DATABASE": "true",
       "SQL_SERVER": "(localdb)\\MSSQLLocalDB",
       "SQL_DATABASE": "ScheduleDb",
       "SQL_AUTH_MODE": "windows",
       "SQL_USERNAME": "",
       "SQL_PASSWORD": ""
     }
   }
   ```

3. **Install npm dependencies**:
   ```bash
   cd api
   npm install
   ```

4. **Run the API**:
   ```bash
   npm run build
   func start
   ```

Important:
- LocalDB uses Windows Authentication, not `sa` / SQL logins.
- In SSMS, connect to server `(localdb)\\MSSQLLocalDB` with Windows Authentication.

## Local Development (SQL Server Express)

### Prerequisites

1. Install [SQL Server Express](https://www.microsoft.com/en-us/sql-server/sql-server-downloads)
2. Install [SQL Server Management Studio](https://learn.microsoft.com/en-us/sql/ssms/download-sql-server-management-studio-ssms)

### Setup

1. **Create the database**:
   ```sql
   CREATE DATABASE ScheduleDb;
   ```

2. **Verify local.settings.json has correct values**:
   ```json
   {
     "Values": {
       "SQL_USE_DATABASE": "true",
          "SQL_SERVER": "localhost\\SQLEXPRESS",
       "SQL_DATABASE": "ScheduleDb",
          "SQL_AUTH_MODE": "sql",
       "SQL_USERNAME": "sa",
       "SQL_PASSWORD": "Password123!"
     }
   }
   ```

3. **Install npm dependencies**:
   ```bash
   cd api
   npm install
   ```

4. **Schema is auto-initialized** on first connection via `initializeDatabase()` call from function startup.

### Running Locally

```bash
cd api
npm run build
func start
```

The schema will initialize automatically on the first API request.

### Testing Locally

```bash
cd api
npm test
```

Tests use in-memory storage by default (controlled via `USE_MEMORY_STORE=true` env var).

## Azure SQL Database

### Prerequisites

1. Azure subscription
2. Azure SQL Database instance already created
3. Network connectivity (configure firewall rules)

### Connection Methods

#### Method 1: SQL Authentication (Recommended for Simplicity)

1. **Get connection string from Azure Portal**:
   - Navigate to your SQL Database
   - Copy the "ADO.NET" connection string
   - Format: `Server=tcp:servername.database.windows.net,1433;Initial Catalog=dbname;Persist Security Info=False;User ID=username;Password=password;`

2. **Set via environment variable**:
   ```bash
   export SQL_CONNECTION_STRING="Server=tcp:myserver.database.windows.net,1433;Initial Catalog=ScheduleDb;Persist Security Info=False;User ID=admin;Password=YourSecurePassword!;"
   ```

3. **Or use individual variables**:
   ```bash
   export SQL_SERVER="myserver.database.windows.net"
   export SQL_DATABASE="ScheduleDb"
   export SQL_AUTH_MODE="sql"
   export SQL_USERNAME="admin"
   export SQL_PASSWORD="YourSecurePassword!"
   export SQL_USE_DATABASE="true"
   ```

#### Method 2: Azure AD Authentication (Recommended for Security)

1. **Configure managed identity** (for App Service):
   - Enable system-assigned managed identity in App Service settings
   - Grant database access:
     ```sql
     CREATE USER [app-service-name] FROM EXTERNAL PROVIDER;
     ALTER ROLE db_owner ADD MEMBER [app-service-name];
     ```

2. **Set environment variables**:
   ```bash
   export SQL_SERVER="myserver.database.windows.net"
   export SQL_DATABASE="ScheduleDb"
   export SQL_AUTH_MODE="sql"
   export SQL_USE_AZURE_AUTH="true"
   ```

### Deployment

1. **Update app settings in Azure App Service**:
   - Go to App Service → Configuration → Application settings
   - Add:
     - `SQL_USE_DATABASE`: `true`
     - `SQL_SERVER`: Your Azure SQL server name
     - `SQL_DATABASE`: Your database name
     - For SQL Auth: `SQL_USERNAME` and `SQL_PASSWORD`
     - For Azure AD: `SQL_USE_AZURE_AUTH`: `true`

2. **Schema is auto-initialized** on first API request.

3. **Seed user-role mappings** after first startup:
   - Run `api/scripts/seed-auth.sql` against your Azure SQL database.
   - Replace placeholder `oid-viewer`, `oid-planner`, `oid-admin` values with real Entra Object IDs.

3. **Monitor logs**:
   ```bash
   az webapp log tail --resource-group myRG --name myAppService
   ```

## Database Schema

The schema includes:

- **AppUsers**: User accounts with Entra Object IDs
- **UserRoles**: RBAC role assignments (viewer, planner, admin)
- **Staff**: Staff member records with roles (mhfa, fire, first, director, guest)
- **Schedule**: Weekly schedule entries
- **Weeks**: Week lock status

Schema is automatically created on first connection.

## Troubleshooting

### "Connection Failed" Error

- **LocalDB**: Verify instance exists: `sqllocaldb info`; test: `sqlcmd -S "(localdb)\\MSSQLLocalDB" -E -Q "SELECT 1"`
- **SQLExpress**: Verify service and login: `sqlcmd -S "localhost\\SQLEXPRESS" -U sa -P <password> -Q "SELECT 1"`
- **Azure**: Check firewall rules allow your IP
- **Azure AD**: Verify managed identity is enabled and has database permissions

### "Login Failed" Error

- LocalDB does not support SQL logins (`sa` / password). Use Windows auth and `SQL_AUTH_MODE=windows`.
- For SQLExpress/Azure SQL auth, verify credentials in environment variables.
- For Azure AD, ensure managed identity has been granted database access

### Slow Performance

- Check indexes: `SELECT * FROM sys.indexes WHERE object_id = OBJECT_ID('Staff')`
- Monitor query plans in SQL Server Management Studio
- Consider connection pooling settings in `connection.ts`

## Best Practices

1. **Local Development**: Prefer LocalDB with Windows authentication for easiest setup
2. **Production**: Use Azure SQL with Azure AD authentication or managed identities
3. **Secrets**: Never commit passwords to Git - use Azure Key Vault or secure env vars
4. **Backups**: Enable automated backups for Azure SQL Database
5. **Monitoring**: Use Azure Monitor and Application Insights for production

## Switching Between Local and Azure

The connection automatically detects environment and:
- Uses LocalDB with `SQL_AUTH_MODE=windows` (or if `SQL_SERVER` contains `(localdb)`)
- Uses SQL Server/SQLExpress with `SQL_AUTH_MODE=sql`
- Enables encryption for Azure SQL connections
- Supports both SQL and Azure AD authentication

No code changes needed - just update environment variables.

## Azure SQL Quick Checklist

1. Set App Service settings: `SQL_USE_DATABASE=true`, `SQL_SERVER`, `SQL_DATABASE`, plus either SQL auth (`SQL_USERNAME`/`SQL_PASSWORD`) or managed identity (`SQL_USE_AZURE_AUTH=true`).
2. Start the API once so schema auto-initialization creates tables.
3. Seed `AppUsers` and `UserRoles` with real Entra Object IDs (use `api/scripts/seed-auth.sql`).
4. Test an endpoint with a token whose `oid` exists in `AppUsers` and has a role in `UserRoles`.
