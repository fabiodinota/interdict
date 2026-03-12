# T02: Plan 02

**Slice:** S01 — **Milestone:** M002

## Description

Build the authentication middleware and API key management endpoints.

Purpose: This plan creates the auth macro that extracts and validates API keys on every request (IDENT-02) and enforces role-based access (IDENT-03). It also provides key management endpoints so administrators can create and revoke API keys. Plan 03 depends on this middleware to protect all existing routes.

Output: An Elysia auth macro plugin, auth service with key generation/validation, API key CRUD endpoints, and error classes for 401/403 responses.
