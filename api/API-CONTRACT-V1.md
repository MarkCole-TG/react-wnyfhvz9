# API Endpoint Contract (v1)

## Scope

This document defines the v1 contract for the backend API, including authentication, authorization, identity mapping, and role-based access policies.

## Authentication Model

1. Frontend obtains an access token from Microsoft Entra ID.
2. Frontend sends Authorization header as Bearer token on each API call.
3. API validates token signature, issuer, audience, expiry, and required claims.
4. API resolves the authenticated Entra Object ID to application authorization data.

## Identity Mapping

- Token claim used as principal key: oid (Entra Object ID).
- API lookup key: EntraObjectId.
- Data source tables:
	- AppUsers (user profile and account state).
	- UserRoles (one or more assigned roles).
- If no matching AppUsers row exists, API returns 403 Forbidden.

## Role Policy

- viewer: read only.
- planner: read and write schedule and staff.
- admin: full access, including lock week and role assignment.

## Authorization Rules by Capability

- Read schedule: viewer, planner, admin.
- Write schedule: planner, admin.
- Read staff: viewer, planner, admin.
- Write staff: planner, admin.
- Lock or unlock week: admin only.
- Assign or revoke roles: admin only.

## Endpoint Conventions

- Base path: /api/v1
- Content type (request and response): application/json
- Authorization header required for all endpoints unless explicitly marked public.

## Minimum v1 Endpoint Set

- GET /api/v1/schedule?week=YYYY-MM-DD
	- Purpose: fetch schedule for week.
	- Roles: viewer, planner, admin.

- PUT /api/v1/schedule/{week}/{staffId}
	- Purpose: create or update a staff schedule row.
	- Roles: planner, admin.

- GET /api/v1/staff
	- Purpose: list staff.
	- Roles: viewer, planner, admin.

- POST /api/v1/staff
	- Purpose: create staff record.
	- Roles: planner, admin.

- PATCH /api/v1/staff/{staffId}
	- Purpose: update staff record.
	- Roles: planner, admin.

- POST /api/v1/weeks/{week}/lock
	- Purpose: lock week against edits.
	- Roles: admin.

- POST /api/v1/weeks/{week}/unlock
	- Purpose: unlock week.
	- Roles: admin.

- PUT /api/v1/users/{userId}/roles
	- Purpose: replace user role assignments.
	- Roles: admin.

## Standard Response Shapes

### Success

- 200 OK for successful read/update.
- 201 Created for successful creates.
- 204 No Content where no payload is returned.

### Error

All errors return:

- error.code (stable machine code)
- error.message (human-readable message)
- error.correlationId (trace identifier)

Recommended error codes:

- 400 Bad Request: invalid input.
- 401 Unauthorized: missing or invalid bearer token.
- 403 Forbidden: valid token but role not permitted, or no AppUsers mapping.
- 404 Not Found: resource does not exist.
- 409 Conflict: write conflict, locked week, or concurrency mismatch.
- 422 Unprocessable Entity: payload format valid but business rule failed.
- 500 Internal Server Error: unhandled server error.

## Required Token Claims

- oid: Entra object identifier.
- tid: tenant id.
- aud: API application id URI or client id configured for this API.
- iss: expected Entra issuer.
- exp and nbf: time validity.

## Non-Functional Contract Notes

- All mutating endpoints must be auditable with actor, action, target, timestamp, and correlationId. (Not yet implemented; planned requirement.)
- Week lock check is mandatory before schedule mutations.
- Contract is backward compatible within v1; breaking changes require v2.

## Contract Acceptance Criteria

1. Token validation enforced for protected routes.
2. EntraObjectId to AppUsers and UserRoles mapping enforced.
3. Role policy enforced exactly as defined in this document.
4. Error payload shape consistent across all endpoints.
5. OpenAPI definition mirrors this contract and is kept in sync. (Not yet implemented; planned requirement.)
