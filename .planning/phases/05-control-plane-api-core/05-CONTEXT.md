# Phase 5: Control Plane API Core - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

The Bun + Elysia API manages policies (CRUD with Rego source), compiles them to Wasm modules via OPA CLI, manages the vendor registry with per-model granularity, maps regulatory frameworks to policy configurations, and provides searchable audit trail queries against ClickHouse with SSE streaming. This phase delivers the API layer only — no dashboard UI (Phase 8), no gRPC push to kernels (Phase 6), no SAML/RBAC enforcement (Phase 7).

</domain>

<decisions>
## Implementation Decisions

### Database Schema Design
- Compiled Wasm module storage approach is Claude's discretion (BYTEA blob vs filesystem + DB reference)
- Full version history for policies — every edit creates a new version, previous versions are queryable and restorable for compliance auditing ("what policy was active at time X?")
- Vendor registry uses a vendor + model version table for granular per-model control (e.g., OpenAI: gpt-4, gpt-4-turbo approved; gpt-3.5 blocked)
- Organizational structure (departments, teams, users tables) included in Phase 5 schema to avoid migrations later, even though department-scoped policy enforcement arrives in Phase 6

### Regulatory Framework Mappings
- Bundle of tagged policies — each framework (EU AI Act, GDPR, etc.) is a collection of policies tagged with framework metadata. Selecting a framework enables all its tagged policies. Individual policies can be toggled off
- Seed common frameworks (EU AI Act, GDPR) on first deployment; less common frameworks (Singapore PDPA, India DPDP, etc.) available as on-demand imports
- Enabling a framework is additive — framework policies layer alongside existing custom policies, no override/conflict resolution
- Full Rego policies per regulatory requirement — each requirement gets a working Rego policy that enforces it, functional out of the box

### Policy Compilation Pipeline
- Compilation is asynchronous — save returns immediately with "compiling" status, background worker compiles and updates status
- OPA CLI (`opa build`) for Rego-to-Wasm compilation — battle-tested, native Rego-to-Wasm support, external binary dependency
- Pre-validation of Rego syntax before compilation, returning structured friendly error messages (line number, expected token, etc.)
- Rego only as policy source language — no YAML alternative. The dashboard visual builder (Phase 8) will handle accessibility for non-technical users

### Audit Trail Query API
- Cursor-based pagination using timestamp + bundle_id for efficient forward/backward paging across millions of records
- Enriched responses — join ClickHouse evidence data with PostgreSQL data (policy names, user display names, department labels, vendor metadata) for human-readable API responses
- SSE streaming endpoint for real-time audit event monitoring included in Phase 5
- Pre-built aggregate endpoints for summary stats + time series leveraging existing materialized views (mv_hourly_violations, mv_vendor_usage, mv_department_summary)

### Claude's Discretion
- Wasm module storage approach (BYTEA in PostgreSQL vs filesystem + DB reference)
- Elysia project structure and middleware patterns
- Database migration tooling choice
- Error handling and response format conventions
- Testing strategy and framework selection
- SSE streaming implementation details (polling ClickHouse vs event-driven)

</decisions>

<specifics>
## Specific Ideas

- Existing ClickHouse materialized views (mv_hourly_violations, mv_vendor_usage, mv_department_summary) should be the data source for aggregate endpoints — no need to rebuild aggregation logic
- The kernel currently reads policies from a `policies_dir` directory as Rego source files — the control plane needs to eventually replace this with gRPC-pushed compiled Wasm (Phase 6), but Phase 5 should establish the compiled artifact format
- Evidence bundle schema in ClickHouse (`evidence_bundles` table) has all the fields needed for audit trail queries — the API should map directly to this schema
- Policy versioning should capture who made the change and when, suitable for compliance audit trails
- OPA CLI is an external dependency that must be bundled or documented as a prerequisite for deployment

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `proto/interdict/evidence/v1/evidence.proto`: Protobuf schema defining EvidenceBundle with all fields the audit API will query
- `crates/evidence-collector/src/storage/clickhouse.rs`: ClickHouse schema DDL, materialized view definitions, and EvidenceRow structure — API queries should align with this schema
- `interdict.toml`: Kernel configuration format showing policy engine settings that the control plane will eventually manage

### Established Patterns
- ClickHouse batching: min 1000 rows, max 1 INSERT/sec — API read queries should use materialized views for aggregation, not raw table scans
- LowCardinality columns (department, vendor, model, policy_action) in ClickHouse — filter queries on these are efficient
- Evidence bundles partitioned by `toYYYYMMDD(event_date)` and ordered by `(kernel_id, sequence_number)` — cursor pagination should align with this ordering

### Integration Points
- ClickHouse at `http://localhost:8123` (database: `interdict`) — control plane reads audit data from this
- PostgreSQL — new dependency for Phase 5, stores all configuration/policy/vendor/regulatory data
- Compiled Wasm artifacts — must be compatible with the kernel's Wasmtime pooling allocator (1MB max memory per slot)
- Policy Rego source format must be compatible with Regorus evaluation expectations in `crates/kernel/src/policy/layer1/regorus.rs`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-control-plane-api-core*
*Context gathered: 2026-03-01*
