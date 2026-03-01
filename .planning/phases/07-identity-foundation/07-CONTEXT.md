# Phase 7: Identity Foundation - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

API key authentication and 5-role RBAC with route guards and data-level scoping for the control plane API. Users can authenticate, and are restricted to role-appropriate features and data. Internal service callers continue working via service account API keys.

</domain>

<decisions>
## Implementation Decisions

### Role Model & Permissions
- Hierarchical role model: Super Admin > Compliance Officer > Policy Admin > Department Manager > Read-Only Auditor
- Each higher role inherits all permissions from roles below it
- Single role per user — one role assignment, hierarchy provides lower-role access
- Role permissions are configurable via policy (stored in config/database), not hardcoded — allows enterprise customers to customize role access
- Initial users and roles loaded from a seed file at first boot, then managed via API afterward

### API Key Auth Flow
- Prefixed random format: `ik_live_<random>` — prefix identifies key type at a glance
- Keys stored as SHA-256 hash in the database
- Passed via standard `Authorization: Bearer <key>` header
- No expiration — keys are valid until explicitly revoked by an admin
- Multiple keys per user — one per integration/environment, individually revocable

### Department Data Scoping
- Departments defined via seed file + API (same pattern as users/roles)
- Department Managers can belong to multiple departments and see data from all assigned departments
- Higher roles (Compliance Officer, Super Admin) default to full visibility across all departments, but can optionally be scoped to specific departments per user
- Read-Only Auditors are also configurable — default full visibility, optionally scoped to departments
- Scoping pattern: user has a `department_ids` list; empty list = all departments visible (for roles that default to full access)

### Service Account Handling
- Service accounts use the same API key system as human users
- Service accounts have full system access (Super Admin-level permissions)
- Hidden from user management UI — purely system-internal, managed via seed file only
- Adding/removing service accounts requires updating the seed file and restarting the control plane
- Service accounts are distinguished internally by a `is_service` flag but not exposed to end users

### Claude's Discretion
- Database schema design (tables, indexes, migrations)
- Exact seed file format (TOML, YAML, JSON)
- API key generation algorithm details (beyond SHA-256 hashing)
- Route guard middleware implementation approach
- Error response format for unauthorized/forbidden requests
- Rate limiting on auth endpoints (if any)

</decisions>

<specifics>
## Specific Ideas

- API key prefix pattern inspired by Stripe (`sk_live_`) and OpenAI (`sk-`) — use `ik_live_` for Interdict keys
- Seed file approach avoids chicken-and-egg bootstrapping problem for pilot deployments
- Department scoping uses an opt-in restriction model: full visibility by default for higher roles, narrowed down per user when needed

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- Tower middleware infrastructure (`crates/kernel/src/middleware/`): auth middleware can follow the same pattern as existing `request_id` and `allowlist` layers
- Kernel config (`crates/kernel/src/config.rs`): already has `org_id`, `dept_id`, `team_id` fields in `DistributionConfig` — department identity concepts exist

### Established Patterns
- Fail-closed configuration loading: `config::load()` fails on any config error — auth should follow same principle
- Serde-based TOML config deserialization: seed file can follow same pattern
- SHA-256 hashing already used in session context store (`crates/kernel/src/policy/session.rs`)

### Integration Points
- No control plane API crate exists yet — Phase 7 will likely create one (e.g., `crates/control-plane/`)
- Kernel's gRPC distribution client (`crates/kernel/src/policy/distribution/client.rs`) will need service account auth for control plane communication
- Evidence collector's gRPC service will need service account auth

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-identity-foundation*
*Context gathered: 2026-03-01*
