-- Seed AppUsers and UserRoles for local/dev or initial Azure SQL setup.
-- Update values below to match real Entra Object IDs before running in shared environments.

SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM AppUsers WHERE entraObjectId = 'oid-viewer')
BEGIN
    INSERT INTO AppUsers (userId, entraObjectId, displayName, email)
    VALUES ('user-viewer', 'oid-viewer', 'Viewer User', NULL);
END;

IF NOT EXISTS (SELECT 1 FROM AppUsers WHERE entraObjectId = 'oid-planner')
BEGIN
    INSERT INTO AppUsers (userId, entraObjectId, displayName, email)
    VALUES ('user-planner', 'oid-planner', 'Planner User', NULL);
END;

IF NOT EXISTS (SELECT 1 FROM AppUsers WHERE entraObjectId = 'oid-admin')
BEGIN
    INSERT INTO AppUsers (userId, entraObjectId, displayName, email)
    VALUES ('user-admin', 'oid-admin', 'Admin User', NULL);
END;

DELETE FROM UserRoles
WHERE entraObjectId IN ('oid-viewer', 'oid-planner', 'oid-admin');

INSERT INTO UserRoles (entraObjectId, role)
VALUES
    ('oid-viewer', 'viewer'),
    ('oid-planner', 'planner'),
    ('oid-admin', 'admin');

SELECT entraObjectId, role
FROM UserRoles
WHERE entraObjectId IN ('oid-viewer', 'oid-planner', 'oid-admin')
ORDER BY entraObjectId, role;
