# Interdict — REST API Reference

> **Base URL:** `http://localhost:3000` (default; configure via `PORT` env var)
>
> **Transport:** HTTP/1.1. TLS termination is handled by the reverse proxy
> (see [Operator Guide](../operator/guide.md#tls-termination)).

---

## Table of Contents

- [Authentication](#authentication)
- [Response Envelope](#response-envelope)
- [Pagination](#pagination)
- [Error Responses](#error-responses)
- [Role Hierarchy](#role-hierarchy)
- [Modules](#modules)
  - [Auth](#auth)
  - [Policies](#policies)
  - [Vendors](#vendors)
  - [Regulatory Frameworks](#regulatory-frameworks)
  - [Department Overrides](#department-overrides)
  - [Compiler](#compiler)
  - [Audit](#audit)
  - [Anomalies](#anomalies)
  - [Evidence](#evidence)
  - [Reviews](#reviews)
  - [Reports](#reports)
  - [Signing Keys](#signing-keys)
  - [Distribution](#distribution)
- [Related Documentation](#related-documentation)

---

## Authentication

All endpoints (except SAML SSO and session exchange) require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <token>
```

### Token Types

| Type | Format | How to Obtain |
|------|--------|---------------|
| **API Key** | Prefixed with `ik_live_` | `POST /api/v1/auth/keys` |
| **Session Token** | Opaque hex string | SAML SSO flow or `POST /api/v1/auth/session/exchange-api-key` |

The auth middleware auto-detects token type by the `ik_live_` prefix. API keys are SHA-256 hashed before lookup; session tokens are matched directly.

### Unauthenticated Endpoints

The following endpoints do **not** require a Bearer token:

- `POST /api/v1/auth/session/exchange-api-key` — exchange API key for session
- `POST /api/v1/auth/saml/exchange-code` — exchange one-time SAML code for session
- `GET /api/v1/auth/saml/sso` — initiate SAML SSO redirect
- `POST /api/v1/auth/saml/acs` — SAML Assertion Consumer Service
- `GET /api/v1/auth/saml/slo` — SAML Single Logout
- `GET /api/v1/auth/saml/metadata` — SP metadata XML

---

## Response Envelope

### Success

```json
{
  "success": true,
  "data": { ... }
}
```

With optional metadata:

```json
{
  "success": true,
  "data": { ... },
  "meta": { "warnings": ["..."] }
}
```

### Paginated Success

```json
{
  "success": true,
  "data": {
    "items": [ ... ],
    "nextCursor": "base64url-encoded-cursor-or-null",
    "total": 42
  }
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human-readable description",
    "details": { ... }
  }
}
```

---

## Pagination

List endpoints use cursor-based pagination. Cursors are Base64url-encoded `{timestamp}|{id}` strings.

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `cursor` | string | — | — | Opaque cursor from previous response's `nextCursor` |
| `page_size` | number | 50 | 200 | Items per page |

When `nextCursor` is `null`, there are no more results.

---

## Error Responses

| HTTP Status | Error Code | When |
|-------------|------------|------|
| 400 | `VALIDATION_ERROR` | Invalid request body, query params, or date format |
| 401 | `UNAUTHORIZED` | Missing/invalid Authorization header or expired credentials |
| 403 | `FORBIDDEN` | Authenticated but insufficient role permissions |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `CONFLICT` | Duplicate resource or concurrent modification (e.g., review already claimed) |
| 422 | `COMPILATION_ERROR` | Rego compilation failure |

---

## Role Hierarchy

Roles are checked by hierarchy level — a higher role automatically satisfies lower-role requirements.

| Level | Role | Description |
|-------|------|-------------|
| 1 | `read_only_auditor` | Read audit logs, view policies/vendors |
| 2 | `department_manager` | Manage department-level policy overrides |
| 3 | `policy_admin` | Create/update/delete policies and vendors |
| 4 | `compliance_officer` | Review queue, anomaly alerts, reports |
| 5 | `super_admin` | Signing key management, full admin access |

---

## Modules

### Auth

**Prefix:** `/api/v1/auth`

Identity management, API keys, session management, and SAML SSO.

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/me` | Get current user profile | Any authenticated |
| POST | `/session/exchange-api-key` | Exchange API key for session token | None (API key in body) |
| POST | `/keys` | Create a new API key (plaintext returned once) | Any authenticated |
| GET | `/keys` | List API keys for current user | Any authenticated |
| DELETE | `/keys/:keyId` | Revoke an API key (soft delete) | Any authenticated |
| POST | `/logout` | Revoke server-side session | Any authenticated |
| POST | `/saml/exchange-code` | Exchange one-time SAML code for session | None (code is credential) |
| GET | `/saml/sso` | Initiate SAML SSO (redirect to IdP) | None |
| POST | `/saml/acs` | SAML Assertion Consumer Service | None |
| GET | `/saml/slo` | SAML Single Logout | None |
| GET | `/saml/metadata` | SP metadata XML | None |

#### Key Request/Response Schemas

**POST `/session/exchange-api-key`**

```json
// Request
{ "apiKey": "ik_live_..." }
// Response 200
{ "success": true, "data": { "token": "hex-session-token" } }
```

**POST `/keys`**

```json
// Request
{ "label": "My CI key" }
// Response 201
{
  "success": true,
  "data": {
    "id": "uuid",
    "plaintext": "ik_live_...",
    "prefix": "ik_live_abc",
    "label": "My CI key",
    "created_at": "2025-01-01T00:00:00.000Z"
  }
}
```

**GET `/keys`**

| Query Param | Type | Description |
|-------------|------|-------------|
| `cursor` | string | Pagination cursor |
| `page_size` | number | Items per page (default 50) |
| `all` | `"true"` | Show all users' keys (super_admin only) |

**POST `/saml/exchange-code`**

```json
// Request
{ "code": "one-time-code" }
// Response 200
{ "success": true, "data": { "token": "session-token" } }
// Response 410
{ "success": false, "error": { "code": "CODE_EXPIRED", "message": "..." } }
```

---

### Policies

**Prefix:** `/api/v1/policies`

Policy CRUD with version history and Rego syntax validation.

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/` | Create policy (validates Rego syntax) | Policy Admin+ |
| GET | `/` | List active policies | Read-Only Auditor+ |
| GET | `/:id` | Get policy by ID | Read-Only Auditor+ |
| PUT | `/:id` | Update policy (creates new version) | Policy Admin+ |
| DELETE | `/:id` | Soft-delete policy | Policy Admin+ |
| GET | `/:id/versions` | Get version history | Read-Only Auditor+ |
| POST | `/:id/restore/:versionId` | Restore a previous version | Policy Admin+ |

#### Key Request/Response Schemas

**POST `/`**

```json
// Request
{
  "name": "Block PII in prompts",
  "description": "Prevents PII from being sent to LLM vendors",
  "rego_source": "package interdict.policy...",
  "vendor_id": "uuid",
  "category": "data_protection"
}
// Response 201
{ "success": true, "data": { "id": "uuid", "name": "...", ... } }
```

**GET `/`**

| Query Param | Type | Description |
|-------------|------|-------------|
| `cursor` | string | Pagination cursor |
| `page_size` | number | Items per page |

**PUT `/:id`**

```json
// Request
{
  "rego_source": "package interdict.policy...",
  "description": "Updated description",
  "change_note": "Fixed false positive on email detection"
}
```

> Rego syntax is validated before saving. Invalid Rego returns 400 `VALIDATION_ERROR` with error details.

---

### Vendors

**Prefix:** `/api/v1/vendors`

Vendor registry with per-model control.

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/` | Create vendor | Policy Admin+ |
| GET | `/` | List vendors (optional status filter) | Read-Only Auditor+ |
| GET | `/:id` | Get vendor with models | Read-Only Auditor+ |
| PUT | `/:id` | Update vendor | Policy Admin+ |
| DELETE | `/:id` | Delete vendor | Policy Admin+ |
| POST | `/:id/models` | Add model to vendor | Policy Admin+ |
| PUT | `/:id/models/:modelId` | Update model status | Policy Admin+ |
| DELETE | `/:id/models/:modelId` | Remove model | Policy Admin+ |

#### Key Request/Response Schemas

**POST `/`**

```json
// Request
{
  "name": "OpenAI",
  "slug": "openai",
  "base_url": "https://api.openai.com",
  "status": "active"
}
```

**GET `/`**

| Query Param | Type | Description |
|-------------|------|-------------|
| `cursor` | string | Pagination cursor |
| `page_size` | number | Items per page |
| `status` | string | Filter by status (e.g., `active`, `disabled`) |

**POST `/:id/models`**

```json
// Request
{
  "name": "gpt-4o",
  "model_id": "gpt-4o-2024-08-06",
  "status": "active"
}
```

---

### Regulatory Frameworks

**Prefix:** `/api/v1/regulatory`

Regulatory framework management with policy mapping and activation.

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/frameworks` | List all frameworks with activation status | Read-Only Auditor+ |
| GET | `/frameworks/:slug` | Get framework details with policies | Read-Only Auditor+ |
| POST | `/frameworks/:slug/activate` | Activate a framework | Policy Admin+ |
| POST | `/frameworks/:slug/deactivate` | Deactivate a framework | Policy Admin+ |
| PUT | `/frameworks/:slug/policies/:policyId/toggle` | Toggle individual policy requirement | Policy Admin+ |
| GET | `/active-policies` | Get all active policy IDs (additive merge) | Read-Only Auditor+ |

#### Key Request/Response Schemas

**GET `/frameworks`** — returns list of frameworks with `isActive`, `policyCount`, and `activePolicyCount`.

**POST `/frameworks/:slug/activate`**

```json
// Optional request body
{ "is_active": true }
// Response
{ "success": true, "data": { "status": "activated", "frameworkId": "uuid" } }
```

**PUT `/frameworks/:slug/policies/:policyId/toggle`**

```json
// Request
{ "isRequired": true }
// Response
{ "success": true, "data": { "id": "uuid", "isRequired": true } }
```

**GET `/active-policies`** — returns merged policy IDs from all active frameworks plus standalone active policies.

```json
{ "success": true, "data": { "policyIds": ["uuid1", "uuid2"], "count": 2 } }
```

---

### Department Overrides

**Prefix:** `/api/v1/department-overrides`

Department-scoped policy overrides. Department managers toggle non-mandatory policies; compliance officers set mandatory flags.

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/effective/:departmentId` | Effective policy list for a department | Department Manager+ |
| PUT | `/override` | Create or update a department policy override | Department Manager+ |
| DELETE | `/override/:id` | Remove an override (revert to global default) | Department Manager+ |
| PUT | `/mandatory/:policyId` | Toggle mandatory flag on a policy | Compliance Officer+ |

#### Key Request/Response Schemas

**PUT `/override`**

```json
// Request
{
  "department_id": "uuid",
  "policy_id": "uuid",
  "enabled": false
}
```

**PUT `/mandatory/:policyId`**

```json
// Request
{ "is_mandatory": true }
```

---

### Compiler

**Prefix:** `/api/v1/policies`

Policy compilation status (shares the `/api/v1/policies` prefix with the Policies module).

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/:id/compilation-status` | Get latest compilation status for a policy | Read-Only Auditor+ |

#### Response

```json
{
  "success": true,
  "data": {
    "version_id": "uuid",
    "version": 1,
    "compilation_status": "compiled",
    "compilation_error": null,
    "wasm_hash": "sha256:abc...",
    "wasm_size_bytes": 12345
  }
}
```

Possible `compilation_status` values: `pending`, `compiling`, `compiled`, `failed`.

---

### Audit

**Prefix:** `/api/v1/audit`

Audit trail search, real-time streaming, and aggregate statistics from ClickHouse.

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/search` | Search audit trail with filters | Read-Only Auditor+ |
| GET | `/stream` | SSE real-time audit event stream | Read-Only Auditor+ |
| GET | `/stats/violations` | Hourly violation time series | Read-Only Auditor+ |
| GET | `/stats/vendor-usage` | Vendor usage time series | Read-Only Auditor+ |
| GET | `/stats/department-summary` | Department summary time series | Read-Only Auditor+ |

#### Key Query Parameters

**GET `/search`**

| Query Param | Type | Description |
|-------------|------|-------------|
| `vendor` | string | Filter by vendor name |
| `department` | string | Filter by department |
| `actor` | string | Filter by actor identity |
| `policy_action` | `allow` \| `block` \| `redact` | Filter by enforcement action |
| `from_date` | string | Start date (ISO 8601) |
| `to_date` | string | End date (ISO 8601) |
| `kernel_id` | string | Filter by kernel instance ID |
| `cursor` | string | Pagination cursor |
| `page_size` | number | Items per page |

**GET `/stream`** — Server-Sent Events (SSE)

Sends `connected` event on initial connect, then `audit-event` events as they occur. Supports the same filters as `/search` (except dates, cursor, and page_size). Polls every 2.5 seconds.

**GET `/stats/violations`** and **GET `/stats/vendor-usage`**

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `from` | string | Yes | Start date (ISO 8601) |
| `to` | string | Yes | End date (ISO 8601) |
| `vendor` | string | No | Filter by vendor (vendor-usage only) |

**GET `/stats/department-summary`**

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `from` | string | Yes | Start date (ISO 8601) |
| `to` | string | Yes | End date (ISO 8601) |
| `department` | string | No | Filter by department |

> All stats endpoints scope results to the authenticated user's visible departments.

---

### Anomalies

**Prefix:** `/api/v1/anomalies`

Anomaly detection alerts and summary statistics.

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/` | List anomaly alerts (optional severity filter) | Compliance Officer+ |
| GET | `/summary` | Summary counts by severity and type | Compliance Officer+ |

#### Query Parameters

**GET `/`**

| Query Param | Type | Description |
|-------------|------|-------------|
| `severity` | string | Filter by severity level |

---

### Evidence

**Prefix:** `/api/v1/evidence`

Evidence bundle verification and listing.

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/verify` | Verify evidence bundles (three-step cryptographic check) | Read-Only Auditor+ |
| GET | `/bundles` | List evidence bundles with pagination | Read-Only Auditor+ |

#### Key Request/Response Schemas

**POST `/verify`**

```json
// Request
{ "bundle_ids": ["uuid1", "uuid2"] }
// Response
{
  "success": true,
  "data": [
    { "bundle_id": "uuid1", "valid": true, "checks": { ... } },
    { "bundle_id": "uuid2", "valid": false, "checks": { ... }, "errors": ["..."] }
  ]
}
```

**GET `/bundles`**

| Query Param | Type | Description |
|-------------|------|-------------|
| `cursor` | string | Pagination cursor |
| `page_size` | number | Items per page |
| `from_date` | string | Start date filter (ISO 8601) |
| `to_date` | string | End date filter (ISO 8601) |

> Results are scoped to the authenticated user's visible departments.

---

### Reviews

**Prefix:** `/api/v1/reviews`

Human review queue workflow for escalated evidence bundles.

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/ingest` | Create review item (service credentials only) | Service account |
| GET | `/queue` | Paginated review queue sorted by SLA urgency | Compliance Officer+ |
| GET | `/:id` | Single review item with full bundle details | Compliance Officer+ |
| POST | `/:id/claim` | Claim a review item (optimistic locking) | Compliance Officer+ |
| POST | `/:id/resolve` | Resolve with mandatory category + reasoning | Compliance Officer+ |

#### Key Request/Response Schemas

**POST `/ingest`** (internal — called by evidence-collector or kernel services)

```json
// Request
{
  "bundle_id": "uuid",
  "escalated_at": "2025-01-01T00:00:00.000Z",
  "source": "kernel_l3"
}
// Response 201
{ "success": true, "data": { "id": "uuid", "created": true } }
```

> Requires `isService` flag on the authenticated user. Human API keys cannot invoke this endpoint.

**GET `/queue`**

| Query Param | Type | Description |
|-------------|------|-------------|
| `status` | `pending` \| `claimed` \| `all` | Filter by status (default: `pending`) |
| `cursor` | string | Pagination cursor |
| `page_size` | number | Items per page |

**POST `/:id/resolve`**

```json
// Request
{
  "resolution": "false_positive",
  "resolution_notes": "Normal business communication, not PII leak"
}
```

---

### Reports

**Prefix:** `/api/v1/reports`

Compliance report generation (PDF/CSV).

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/generate` | Generate a compliance report | Read-Only Auditor+ |

#### Request

```json
{
  "format": "pdf",
  "from_date": "2025-01-01",
  "to_date": "2025-01-31"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `format` | `"pdf"` \| `"csv"` | Yes | Output format |
| `from_date` | string | Yes | Start date (ISO 8601) |
| `to_date` | string | Yes | End date (ISO 8601) |

**Constraints:**
- `from_date` must be before `to_date`
- Date range must not exceed 365 days

**Response:** Binary download with appropriate `Content-Type` (`application/pdf` or `text/csv`).

---

### Signing Keys

**Prefix:** `/api/v1/admin/signing-keys`

Ed25519 signing key rotation and management.

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/` | List all signing keys | Super Admin |
| POST | `/rotate` | Trigger key rotation | Super Admin |
| GET | `/active` | Get current active key info | Policy Admin+ |
| GET | `/public-keys` | Get all public keys for verification | Read-Only Auditor+ |

#### Response Examples

**POST `/rotate`** — returns 201:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "public_key": "base64-ed25519-public-key",
    "created_at": "2025-01-01T00:00:00.000Z"
  }
}
```

**GET `/active`** — returns 404 if no active key exists.

---

### Distribution

The Distribution module does **not** expose REST endpoints. It runs a gRPC server for policy distribution to the kernel fleet.

See [gRPC API Reference](grpc.md#policydistributionservice) for details.

**Configuration:**
- Default port: `50052` (set via `INTERDICT_GRPC_PORT`)
- Started automatically with the control plane

---

## Related Documentation

- [gRPC API Reference](grpc.md) — EvidenceCollectorService and PolicyDistributionService
- [Operator Guide](../operator/guide.md) — deployment, configuration, and operations
- [Troubleshooting Guide](../operator/troubleshooting.md) — diagnostic procedures
