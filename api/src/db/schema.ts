import { execute } from "./connection";

export async function initializeDatabase(): Promise<void> {
  console.log("[schema] Initializing database schema...");

  try {
    // Create AppUsers table
    console.log("[schema] Creating AppUsers table...");
    await execute(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AppUsers' AND xtype='U')
      CREATE TABLE AppUsers (
        userId NVARCHAR(255) PRIMARY KEY,
        entraObjectId NVARCHAR(255) NOT NULL UNIQUE,
        displayName NVARCHAR(255),
        email NVARCHAR(255),
        createdAt DATETIME2 DEFAULT GETUTCDATE(),
        updatedAt DATETIME2 DEFAULT GETUTCDATE()
      )
    `);
    console.log("[schema] AppUsers table created successfully");

    // Create UserRoles table
    console.log("[schema] Creating UserRoles table...");
    await execute(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UserRoles' AND xtype='U')
      CREATE TABLE UserRoles (
        id INT PRIMARY KEY IDENTITY(1,1),
        entraObjectId NVARCHAR(255) NOT NULL,
        role NVARCHAR(50) NOT NULL,
        createdAt DATETIME2 DEFAULT GETUTCDATE(),
        CONSTRAINT FK_UserRoles_AppUsers FOREIGN KEY (entraObjectId) 
          REFERENCES AppUsers(entraObjectId) ON DELETE CASCADE,
        CONSTRAINT UQ_UserRoles_ObjectId_Role UNIQUE (entraObjectId, role)
      )
    `);
    console.log("[schema] UserRoles table created successfully");

    // Create Staff table
    console.log("[schema] Creating Staff table...");
    await execute(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Staff' AND xtype='U')
      CREATE TABLE Staff (
        id NVARCHAR(255) PRIMARY KEY,
        name NVARCHAR(255) NOT NULL,
        number NVARCHAR(50),
        title NVARCHAR(255),
        active BIT DEFAULT 1,
        mhfaRole BIT DEFAULT 0,
        fireRole BIT DEFAULT 0,
        firstRole BIT DEFAULT 0,
        directorRole BIT DEFAULT 0,
        guestRole BIT DEFAULT 0,
        createdAt DATETIME2 DEFAULT GETUTCDATE(),
        updatedAt DATETIME2 DEFAULT GETUTCDATE()
      )
    `);
    console.log("[schema] Staff table created successfully");

    // Create Schedule table
    console.log("[schema] Creating Schedule table...");
    await execute(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Schedule' AND xtype='U')
      CREATE TABLE Schedule (
        id INT PRIMARY KEY IDENTITY(1,1),
        week NVARCHAR(10) NOT NULL,
        staffId NVARCHAR(255) NOT NULL,
        monAM NVARCHAR(50),
        monPM NVARCHAR(50),
        tueAM NVARCHAR(50),
        tuePM NVARCHAR(50),
        wedAM NVARCHAR(50),
        wedPM NVARCHAR(50),
        thuAM NVARCHAR(50),
        thuPM NVARCHAR(50),
        friAM NVARCHAR(50),
        friPM NVARCHAR(50),
        comment NVARCHAR(MAX),
        updatedAt DATETIME2 DEFAULT GETUTCDATE(),
        CONSTRAINT FK_Schedule_Staff FOREIGN KEY (staffId) 
          REFERENCES Staff(id) ON DELETE CASCADE,
        CONSTRAINT UQ_Schedule_Week_Staff UNIQUE (week, staffId)
      )
    `);
    console.log("[schema] Schedule table created successfully");

    // Create Weeks table
    console.log("[schema] Creating Weeks table...");
    await execute(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Weeks' AND xtype='U')
      CREATE TABLE Weeks (
        week NVARCHAR(10) PRIMARY KEY,
        status NVARCHAR(20) DEFAULT 'open',
        lockedBy NVARCHAR(255),
        lockedAt DATETIME2,
        unlockedBy NVARCHAR(255),
        unlockedAt DATETIME2,
        updatedAt DATETIME2 DEFAULT GETUTCDATE()
      )
    `);
    console.log("[schema] Weeks table created successfully");

    // Create indexes for better query performance
    console.log("[schema] Creating indexes...");
    await execute(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_Staff_Active' AND object_id = OBJECT_ID('Staff'))
      CREATE INDEX IX_Staff_Active ON Staff(active)
    `);

    await execute(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_Schedule_Week' AND object_id = OBJECT_ID('Schedule'))
      CREATE INDEX IX_Schedule_Week ON Schedule(week)
    `);

    await execute(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_UserRoles_EntraObjectId' AND object_id = OBJECT_ID('UserRoles'))
      CREATE INDEX IX_UserRoles_EntraObjectId ON UserRoles(entraObjectId)
    `);
    console.log("[schema] Indexes created successfully");

    console.log("[schema] Database schema initialization completed");
  } catch (error) {
    console.error("[schema] Database schema initialization failed:");
    console.error("[schema] Error type:", typeof error);
    console.error("[schema] Error object:", JSON.stringify(error, null, 2));
    if (error instanceof Error) {
      console.error("[schema] Error.message:", error.message);
      console.error("[schema] Error.stack:", error.stack);
    }
    throw error;
  }
}

export async function resetDatabase(): Promise<void> {
  console.log("Resetting database (for testing)...");

  // Delete all data in reverse order of foreign key dependencies
  await execute(`DELETE FROM UserRoles`);
  await execute(`DELETE FROM AppUsers`);
  await execute(`DELETE FROM Schedule`);
  await execute(`DELETE FROM Staff`);
  await execute(`DELETE FROM Weeks`);

  console.log("Database reset completed");
}
