<overview>
Interdict-specific security, architectural boundary, and invariant rules. Read alongside rules-core.md for every scan. These rules codify the invariants from CLAUDE.md and the lessons learned from building the system.
</overview>

<section name="architecture-boundaries">
<rule id="plane-separation" name="Control-Plane / Data-Plane Separation">
The data plane (kernel crate) enforces inline; the control plane (control-plane/) distributes policy and serves administration.

- kernel crate importing from control-plane/ — High ("data plane must not depend on control plane")
- control-plane making inline enforcement decisions (block/allow/redact) — High ("enforcement logic belongs in kernel")
- evidence-collector writing to PostgreSQL directly — High ("use ClickHouse only; Postgres belongs to control plane")
- control-plane writing to ClickHouse evidence tables — High ("evidence writes must go through evidence-collector")
</rule>

<rule id="language-boundaries" name="Language / Hot Path Boundaries">
- Python or TypeScript code in the request/response hot path (kernel crate boundary) — High ("Rust-only hot path per CLAUDE.md Invariant 1")
- Full-buffering of model request or response body in kernel — High ("streaming-first per CLAUDE.md Invariant 7")
- LLM API calls from within policy evaluation code — High ("deterministic policy only per CLAUDE.md Invariant 3")
</rule>

<rule id="dashboard-boundary" name="Dashboard Boundaries">
- Dashboard calling control-plane directly (not through /api/proxy/*) — High ("all API calls must go through Next.js proxy")
- Dashboard importing from control-plane or kernel packages — High ("cross-service import boundary violation")
- Dashboard performing policy logic, prompt transformation, or enforcement decisions — High ("dashboard is pure UI")
</rule>
</section>

<section name="evidence-integrity">
<rule id="pre-mutation-hash" name="Pre-Mutation Hashing">
CLAUDE.md Invariant 5: evidence hashes must be computed BEFORE any mutation or redaction.

- Hash computed after content modification — High ("tamper-evident chain broken")
- evidence_bundle.chain_hash not linked to evidence_bundle.previous_hash — High ("hash chain linkage missing")
- Evidence bundle persisted without computing all three hashes (prompt_hash, response_hash, chain_hash) — High
- Signature computed over post-redaction content — High ("sign pre-redaction content only")
</rule>

<rule id="chain-linkage" name="Chain Linkage Fields">
- EvidenceBundle struct missing chain_hash or previous_hash fields — High
- sequence_number not incremented per kernel_id — Medium
- dev_signed flag not set correctly (must be false in production signing mode) — Medium
</rule>

<rule id="cryptographic-integrity" name="Cryptographic Strength">
- MD5 or SHA-1 used for evidence hashing (must use SHA-256 or stronger) — High
- Ed25519 signing key loaded from plaintext string variable — Medium ("use secure key loading")
- Signature verification skipped or made optional in non-dev mode — High
</rule>
</section>

<section name="policy-enforcement">
<rule id="fail-closed" name="Fail-Closed Defaults">
CLAUDE.md Invariant 4: fail closed for high-risk/banking profiles.

- Missing policy for a request treated as allow (fail-open) without explicit audit — High
- Error in policy evaluation falling through to allow action — High ("must fail closed on error")
- High-risk or banking profile with allow as default action — High
- Fail-open behavior added without explicit comment and rate-limiting — High
</rule>

<rule id="deterministic-policy" name="Deterministic Policy Only">
CLAUDE.md Invariant 3.

- LLM or ML model called to make inline block/allow/redact decision — High
- Non-deterministic or randomized policy evaluation — High
- External HTTP call during inline enforcement (except to pre-loaded policy store) — High
</rule>

<rule id="enforcement-posture" name="Enforcement Posture">
- Policy bypass flag or environment variable that disables enforcement globally — High
- Jailbreak/prompt-injection detection disabled without audit log entry — High
- Block action silently downgraded to allow without logging — High
</rule>
</section>

<section name="secrets-logging">
<rule id="no-plaintext-secrets" name="No Plaintext Secrets in Logs">
CLAUDE.md Invariant 6.

- log!() / tracing::info!() / console.log() containing prompt_text or response_text — High
- API key or bearer token logged at any level — High
- Private signing key material logged or serialized to JSON — High
- .env values echoed in startup logs — Medium ("log config keys, not values")
</rule>

<rule id="secret-storage" name="Secret Storage">
- Secrets hardcoded in source (not env vars) — High (pet peeve #1)
- Signing key written to a world-readable path — High
- Database credentials in docker-compose without ${VAR:-default} pattern — Medium
</rule>
</section>

<section name="clickhouse-queries">
<rule id="datetime-type" name="ClickHouse DateTime Type Hints">
Lesson learned: ClickHouse materialized view `hour` columns derived from DateTime64(3) timestamps must use DateTime64(3) type hints, not DateTime.

- `{param:DateTime}` binding for a column derived from DateTime64(3) — Medium (pet peeve #6)
- ISO 8601 string with T separator or Z suffix passed as ClickHouse query param — Medium (pet peeve #7)
- Missing `toChDateTime()` normalization before binding ISO strings — Medium
</rule>

<rule id="no-select-star" name="No SELECT * on Evidence Tables">
CLAUDE.md Invariant 6: prompt_text and response_text must never appear in audit API responses.

- `SELECT *` on evidence_bundles — High ("may expose prompt_text/response_text")
- prompt_text or response_text included in AUDIT_COLUMNS list — High
- ClickHouse query returning prompt_text or response_text to control-plane — High
</rule>

<rule id="partition-pruning" name="Partition Pruning">
- ClickHouse query on evidence_bundles without event_date filter — Medium ("full table scan -- always include date range for partition pruning")
- Date range filter missing from materialized view queries — Medium
</rule>
</section>

<section name="auth-middleware">
<rule id="auth-required" name="Auth Required on All Routes">
- Elysia route handler without `.use(authPlugin)` — High (pet peeve #4)
- Route that returns user data without role check — High
- Department-scoped route returning data outside the user's departmentIds — High
- Super admin operations accessible to non-super-admin roles — High
</rule>

<rule id="role-hierarchy" name="Role Hierarchy">
Roles: super_admin > compliance_officer > department_manager > read_only_auditor.
- Privilege escalation path (lower role accessing higher-role endpoint) — High
- Role check using string comparison instead of roleHierarchyLevel() — Medium
</rule>
</section>

<section name="streaming">
<rule id="streaming-first" name="Streaming-First Behavior">
CLAUDE.md Invariant 7.

- Full response body buffered in kernel before processing — High ("streaming-first required")
- Response held in memory until complete before forwarding to client — High
- Unbounded channel or Vec growing with full response content in hot path — High
</rule>

<rule id="backpressure" name="Backpressure">
- Unbounded channel (tokio::mpsc::unbounded_channel) in hot path — Medium ("use bounded channel")
- Missing queue size limit on request queue — Medium (KERNEL_MAX_REQUEST_QUEUE must be set)
</rule>
</section>

<section name="deployability">
<rule id="deploy-compat" name="VPC-Native / Air-Gapped Compatibility">
CLAUDE.md Invariant 8.

- Hard-coded external domain or IP in enforcement-critical path — High (pet peeve #1 + Invariant 8)
- Cloud-only dependency (AWS SDK, GCP client) imported in kernel or evidence-collector — High
- TLS certificate pinned to a specific public CA (breaks air-gapped) — Medium
- Docker image that requires internet access at runtime — Medium
</rule>
</section>
