---
phase: 05-control-plane-api-core
verified: 2026-03-01T11:00:00Z
status: human_needed
score: 5/5 success criteria verified
re_verification: true
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "CTRL-06 pre-built regulatory policy packs cover all 8 frameworks: EU AI Act, GDPR, NIST AI RMF, Singapore PDPA, India DPDP, China AI Regs, Canada AIDA/PIPEDA, GCC"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Verify sub-second audit response time on filtered queries against LowCardinality ClickHouse columns"
    expected: "Response times under 1 second for vendor, department, or policy_action filters on a populated evidence_bundles table"
    why_human: "Requires a running ClickHouse instance with production-scale data; cannot be verified by static code inspection"
  - test: "Verify SSE streaming endpoint delivers audit events in real time"
    expected: "Client connected to GET /api/v1/audit/stream receives audit-event SSE messages within ~2.5 seconds of new entries appearing in ClickHouse"
    why_human: "Requires live ClickHouse data and an SSE client to observe"
---

# Phase 5: Control Plane API Core Verification Report

**Phase Goal:** The Bun + Elysia API manages policies (CRUD with Rego source), compiles them to Wasm modules via OPA CLI, manages the vendor registry with per-model granularity, maps regulatory frameworks to policy configurations, and provides searchable audit trail queries against ClickHouse with SSE streaming.

**Verified:** 2026-03-01T11:00:00Z
**Status:** human_needed (all automated checks pass; sub-second performance and SSE streaming require runtime verification)
**Re-verification:** Yes — after gap closure (plan 05-06 added 6 missing regulatory framework seed packs)

---

## Re-Verification Summary

**Previous status:** gaps_found (score 4/5 — CTRL-06 partial, only 2/8 frameworks seeded)
**Current status:** human_needed (score 5/5 — all gaps closed; only runtime tests remain)

**Gap closed:** Plan 05-06 created seed directories and Rego policies for NIST AI RMF, Singapore PDPA, India DPDP, China AI Regs, Canada AIDA/PIPEDA, and GCC frameworks. All 6 new directories are committed and verified in the codebase (commits `725bf50` and `efce2a4`).

**Regressions:** None detected. All previously-verified artifacts (policies module, compiler worker, vendor registry, regulatory service, audit module, database schemas, index.ts wiring) are untouched by plan 05-06.

---

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A compliance officer can create a policy via the API using Rego or YAML source, and the API compiles it into a Wasm module ready for distribution | VERIFIED | `policiesModule` in `control-plane/src/modules/policies/index.ts` provides POST / with Rego pre-validation via `validateRego`, creates policy + version via `PolicyService.create`, returns 201 with `compilation_status: 'pending'`. `compilePolicy` in `worker.ts` runs `opa build -t wasm` and writes Wasm to filesystem with SHA-256 hash. `startCompilationWorker` started from `src/index.ts` line 81. |
| 2 | The vendor registry API allows adding, updating, and removing approved/blocked AI vendors with per-vendor model version allowlists | VERIFIED | `vendorsModule` in `control-plane/src/modules/vendors/index.ts` provides 8 REST endpoints. `VendorService` in `service.ts` implements create, getById, update (with cascade block to all models), delete, addModel, updateModel, removeModel, listModels. Unique index on (vendor_id, model_name) enforced at schema level. |
| 3 | Selecting a regulatory jurisdiction (e.g., EU AI Act) via the API auto-enables the corresponding pre-built policy configurations covering that framework's requirements | VERIFIED | `regulatoryModule` provides activate/deactivate endpoints with additive merge logic. All 8 required frameworks now seeded: EU AI Act (5 policies, Articles 9/10/13/14/62), GDPR (5 policies), NIST AI RMF (4 policies, GOVERN/MAP/MEASURE/MANAGE), Singapore PDPA (4 policies), India DPDP (4 policies), China AI Regs (4 policies), Canada AIDA/PIPEDA (4 policies), GCC (4 policies). `run-seed.ts` SEED_DIRS array contains all 8 slugs at lines 38-47. |
| 4 | The audit trail query API returns searchable, filterable execution history by user, department, vendor, policy decision, time range, and violation type with sub-second response times | VERIFIED (automated); UNCERTAIN (sub-second) | `auditModule` in `audit/index.ts` provides GET /search with 7 filter dimensions (vendor, department, actor, policy_action, from_date, to_date, kernel_id). `queryAuditTrail` uses parameterized ClickHouse queries, explicit column list excluding prompt_text/response_text, date-range partition pruning, cursor pagination. `enrichAuditRecords` batches 3 PostgreSQL lookups. SSE streaming via GET /stream polling at 2.5s intervals. Sub-second performance requires human verification against a live ClickHouse instance. |
| 5 | PostgreSQL stores configuration, policies, users, and vendor registry; ClickHouse stores high-volume audit logs and analytics data; the two are never confused | VERIFIED | `src/db/postgres.ts` uses Drizzle ORM with 10-table schema (policies, policy_versions, vendors, vendor_models, frameworks, framework_policies, framework_activations, departments, teams, users). `src/db/clickhouse.ts` creates client for `evidence_bundles` and materialized views only. No ClickHouse imports in Drizzle schema files; no Drizzle/pgTable patterns in ClickHouse module. Audit queries go to ClickHouse; CRUD ops go to PostgreSQL. |

**Score:** 5/5 truths verified (Truth 4 passes automated checks but sub-second performance is human-only)

---

## Required Artifacts

### Gap Closure Artifacts (Plan 05-06 — Previously Missing, Now Verified)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `control-plane/src/seed/nist-ai-rmf/framework.json` | NIST AI RMF framework definition with 4 policies | VERIFIED | slug=nist-ai-rmf, jurisdiction=US, version=2023, 4 policies (GOVERN/MAP/MEASURE/MANAGE 1.0) with requirement_refs and is_required=true |
| `control-plane/src/seed/nist-ai-rmf/policies/govern-ai-risk.rego` | Substantive Rego policy | VERIFIED | 111 lines; package interdict.policy.verdict; import rego.v1; default allow; 2 block verdicts; 6 violation patterns; 5 exemption markers |
| `control-plane/src/seed/nist-ai-rmf/policies/map-ai-impact.rego` | Substantive Rego policy | VERIFIED | 111 lines; correct package/import/default/block pattern |
| `control-plane/src/seed/nist-ai-rmf/policies/measure-performance.rego` | Substantive Rego policy | VERIFIED | 113 lines; correct package/import/default/block pattern |
| `control-plane/src/seed/nist-ai-rmf/policies/manage-ai-risk.rego` | Substantive Rego policy | VERIFIED | 111 lines; correct package/import/default/block pattern |
| `control-plane/src/seed/singapore-pdpa/framework.json` | Singapore PDPA framework definition with 4 policies | VERIFIED | slug=singapore-pdpa, jurisdiction=SG, version=2012, 4 policies (Sections 13-17, 18, 21-22, 24) |
| `control-plane/src/seed/singapore-pdpa/policies/consent-obligation.rego` | Substantive Rego policy | VERIFIED | 107 lines; correct pattern |
| `control-plane/src/seed/singapore-pdpa/policies/purpose-limitation.rego` | Substantive Rego policy | VERIFIED | 108 lines; correct pattern |
| `control-plane/src/seed/singapore-pdpa/policies/access-correction.rego` | Substantive Rego policy | VERIFIED | 106 lines; correct pattern |
| `control-plane/src/seed/singapore-pdpa/policies/data-protection.rego` | Substantive Rego policy | VERIFIED | 113 lines; correct pattern |
| `control-plane/src/seed/india-dpdp/framework.json` | India DPDP framework definition with 4 policies | VERIFIED | slug=india-dpdp, jurisdiction=IN, version=2023, 4 policies (Sections 6, 5, 12, 8) |
| `control-plane/src/seed/india-dpdp/policies/consent-requirement.rego` | Substantive Rego policy | VERIFIED | 109 lines; correct pattern |
| `control-plane/src/seed/india-dpdp/policies/purpose-limitation.rego` | Substantive Rego policy | VERIFIED | 113 lines; correct pattern |
| `control-plane/src/seed/india-dpdp/policies/data-erasure.rego` | Substantive Rego policy | VERIFIED | 110 lines; correct pattern |
| `control-plane/src/seed/india-dpdp/policies/breach-notification.rego` | Substantive Rego policy | VERIFIED | 108 lines; correct pattern |
| `control-plane/src/seed/china-ai-regs/framework.json` | China AI Regs framework definition with 4 policies | VERIFIED | slug=china-ai-regs, jurisdiction=CN, version=2023, 4 policies (Algorithmic Recommendation Arts. 4-6, Deep Synthesis Art. 7, Generative AI Art. 9, PIPL Arts. 13-14) |
| `control-plane/src/seed/china-ai-regs/policies/algorithm-transparency.rego` | Substantive Rego policy | VERIFIED | 110 lines; correct pattern |
| `control-plane/src/seed/china-ai-regs/policies/content-labeling.rego` | Substantive Rego policy | VERIFIED | 109 lines; correct pattern |
| `control-plane/src/seed/china-ai-regs/policies/user-rights.rego` | Substantive Rego policy | VERIFIED | 113 lines; correct pattern |
| `control-plane/src/seed/china-ai-regs/policies/data-compliance.rego` | Substantive Rego policy | VERIFIED | 116 lines; correct pattern |
| `control-plane/src/seed/canada-aida-pipeda/framework.json` | Canada AIDA/PIPEDA framework definition with 4 policies | VERIFIED | slug=canada-aida-pipeda, jurisdiction=CA, version=2022, 4 policies (PIPEDA Principle 1, AIDA Sec. 7, PIPEDA Principle 3, AIDA Sec. 8) |
| `control-plane/src/seed/canada-aida-pipeda/policies/accountability.rego` | Substantive Rego policy | VERIFIED | 114 lines; correct pattern |
| `control-plane/src/seed/canada-aida-pipeda/policies/transparency-explanation.rego` | Substantive Rego policy | VERIFIED | 113 lines; correct pattern |
| `control-plane/src/seed/canada-aida-pipeda/policies/consent-knowledge.rego` | Substantive Rego policy | VERIFIED | 114 lines; correct pattern |
| `control-plane/src/seed/canada-aida-pipeda/policies/harm-mitigation.rego` | Substantive Rego policy | VERIFIED | 114 lines; correct pattern |
| `control-plane/src/seed/gcc/framework.json` | GCC data protection framework definition with 4 policies | VERIFIED | slug=gcc, jurisdiction=GCC, version=2021, 4 policies (UAE PDPL Art. 22/Saudi PDPL Art. 29, UAE PDPL Arts. 5-6, Saudi PDPL Art. 29, UAE AI Strategy 2031) |
| `control-plane/src/seed/gcc/policies/data-localization.rego` | Substantive Rego policy | VERIFIED | 112 lines; correct pattern |
| `control-plane/src/seed/gcc/policies/consent-processing.rego` | Substantive Rego policy | VERIFIED | 118 lines; correct pattern |
| `control-plane/src/seed/gcc/policies/cross-border-transfer.rego` | Substantive Rego policy | VERIFIED | 115 lines; correct pattern |
| `control-plane/src/seed/gcc/policies/ai-governance.rego` | Substantive Rego policy | VERIFIED | 121 lines; correct pattern |
| `control-plane/src/seed/run-seed.ts` | Updated seed script with all 8 framework slugs in SEED_DIRS | VERIFIED | Lines 38-47: SEED_DIRS array contains eu-ai-act, gdpr, nist-ai-rmf, singapore-pdpa, india-dpdp, china-ai-regs, canada-aida-pipeda, gcc. JSDoc updated to "Loads all regulatory framework definitions". Generic seedFramework() loop handles all 8 entries without modification. |

### Previously Verified Artifacts (Regression Check — All Intact)

| Artifact | Status | Regression Check |
|----------|--------|-----------------|
| `control-plane/src/index.ts` | VERIFIED | Imports and `.use()`s all 5 modules at lines 12-17, 73-77; `startCompilationWorker` at line 81. No changes from plan 05-06. |
| `control-plane/src/modules/policies/service.ts` | VERIFIED | File exists, untouched by 05-06. |
| `control-plane/src/modules/compiler/worker.ts` | VERIFIED | File exists, untouched by 05-06. |
| `control-plane/src/modules/compiler/validator.ts` | VERIFIED | File exists, untouched by 05-06. |
| `control-plane/src/modules/vendors/service.ts` | VERIFIED | File exists, untouched by 05-06. |
| `control-plane/src/modules/regulatory/service.ts` | VERIFIED | File exists, untouched by 05-06. |
| `control-plane/src/modules/audit/queries.ts` | VERIFIED | File exists, untouched by 05-06. |
| `control-plane/src/db/postgres.ts` | VERIFIED | File exists, untouched by 05-06. |
| `control-plane/src/db/clickhouse.ts` | VERIFIED | File exists, untouched by 05-06. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/index.ts` | `modules/policies/index.ts` | `.use(policiesModule)` | WIRED | Line 73: `.use(policiesModule)` |
| `src/index.ts` | `modules/compiler/index.ts` | `.use(compilerModule)` | WIRED | Line 74: `.use(compilerModule)` |
| `src/index.ts` | `modules/compiler/worker.ts` | `startCompilationWorker(db, ...)` | WIRED | Line 81: `startCompilationWorker(db, config.wasmStorageDir)` |
| `src/index.ts` | `modules/vendors/index.ts` | `.use(vendorsModule)` | WIRED | Line 75: `.use(vendorsModule)` |
| `src/index.ts` | `modules/regulatory/index.ts` | `.use(regulatoryModule)` | WIRED | Line 76: `.use(regulatoryModule)` |
| `src/index.ts` | `modules/audit/index.ts` | `.use(auditModule)` | WIRED | Line 77: `.use(auditModule)` |
| `seed/run-seed.ts` | `seed/nist-ai-rmf/framework.json` | SEED_DIRS includes 'nist-ai-rmf' | WIRED | Lines 42-43 in SEED_DIRS array |
| `seed/run-seed.ts` | `seed/singapore-pdpa/framework.json` | SEED_DIRS includes 'singapore-pdpa' | WIRED | Line 43 in SEED_DIRS array |
| `seed/run-seed.ts` | `seed/india-dpdp/framework.json` | SEED_DIRS includes 'india-dpdp' | WIRED | Line 44 in SEED_DIRS array |
| `seed/run-seed.ts` | `seed/china-ai-regs/framework.json` | SEED_DIRS includes 'china-ai-regs' | WIRED | Line 45 in SEED_DIRS array |
| `seed/run-seed.ts` | `seed/canada-aida-pipeda/framework.json` | SEED_DIRS includes 'canada-aida-pipeda' | WIRED | Line 46 in SEED_DIRS array |
| `seed/run-seed.ts` | `seed/gcc/framework.json` | SEED_DIRS includes 'gcc' | WIRED | Line 47 in SEED_DIRS array |
| `modules/policies/service.ts` | `modules/compiler/worker.ts` | Async compilation dispatch | WIRED | `compilationStatus: "pending"` on create/update triggers background worker; worker polls every 2s |
| `modules/compiler/worker.ts` | OPA CLI | `opa build -t wasm` Bun shell | WIRED | `$\`opa build -t wasm -e ${job.entrypoint} ${regoPath} -o ${tmpDir}/bundle.tar.gz\`` |
| `modules/audit/queries.ts` | ClickHouse evidence_bundles | `@clickhouse/client` parameterized query | WIRED | `client.query({ query: 'SELECT ... FROM evidence_bundles WHERE ...' })` with explicit 21-column list |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CTRL-01 | 05-02, 05-05 | Policy CRUD API with Rego source | SATISFIED | `policiesModule`: POST, GET, PUT, DELETE, GET versions, POST restore — all wired and substantive |
| CTRL-02 | 05-02, 05-05 | Policy compiler transforms Rego to compiled Wasm modules | SATISFIED | `compilePolicy` + `startCompilationWorker` wired in index.ts; OPA CLI subprocess; 1MB size check; SHA-256 hash; filesystem storage |
| CTRL-04 | 05-02, 05-05 | Vendor registry with per-vendor model version allowlists | SATISFIED | `vendorsModule`: 8 endpoints, per-model status, cascade block, ConflictError on duplicate |
| CTRL-05 | 05-03, 05-05 | Regulatory framework mapping engine | SATISFIED | `regulatoryModule`: activate/deactivate/toggle with additive merge; `getActivePolicies` merges custom + framework policies |
| CTRL-06 | 05-03, 05-06 | Pre-built regulatory policy packs for 8 frameworks | SATISFIED | All 8 frameworks seeded: EU AI Act (5 policies), GDPR (5 policies), NIST AI RMF (4 policies), Singapore PDPA (4 policies), India DPDP (4 policies), China AI Regs (4 policies), Canada AIDA/PIPEDA (4 policies), GCC (4 policies). 34 total Rego policies. run-seed.ts SEED_DIRS lists all 8 slugs. Previously partial — gap closed by plan 05-06 (commits 725bf50, efce2a4). |
| CTRL-07 | 05-04, 05-05 | Audit trail query API — searchable/filterable execution history | SATISFIED | 7 filter dimensions, cursor pagination, batch enrichment, SSE streaming, materialized view aggregates |
| CTRL-10 | 05-01 | PostgreSQL for configuration, policies, users, RBAC, vendor registry | SATISFIED | 10-table Drizzle schema; migration generated; db exported from postgres.ts; no ClickHouse access in schema files |
| CTRL-11 | 05-01 | ClickHouse for audit log analytics | SATISFIED | ClickHouse client singleton; audit queries read evidence_bundles and 3 materialized views; never writes to ClickHouse; schema managed by evidence-collector only |

All 8 requirement IDs declared in plans across this phase are SATISFIED. REQUIREMENTS.md marks CTRL-06 as `[x]` complete.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `control-plane/src/modules/audit/enrichment.ts` | 99 | `department_display_name: null, // TODO: enrich when department lookup is needed` | Warning | Department display name is always null in audit responses. Users see department identifiers from ClickHouse but never human-readable department display names. The departments table exists in schema and is never queried by enrichment. |

No blocker anti-patterns found. No empty return stubs in hot path code. All major service methods make real database calls. No new anti-patterns introduced by plan 05-06 (which only adds static data files).

---

## Human Verification Required

### 1. Audit Query Sub-Second Response Time

**Test:** With a populated ClickHouse `evidence_bundles` table (10M+ rows), issue GET /api/v1/audit/search?vendor=openai&from_date=2026-01-01 and measure end-to-end latency.

**Expected:** Response time under 1 second. Query should prune partitions via `event_date` filter and use ClickHouse LowCardinality index on vendor column.

**Why human:** Requires a running ClickHouse instance with production-scale data. Static code confirms date-range filters and LowCardinality column usage, but actual performance depends on hardware and data volume.

### 2. SSE Streaming Real-Time Delivery

**Test:** Connect an SSE client to GET /api/v1/audit/stream and insert a new record into ClickHouse. Observe whether an `audit-event` event arrives within ~2.5 seconds.

**Expected:** New audit events appear in the stream within the 2.5-second polling interval.

**Why human:** Requires a live ClickHouse instance and SSE client tooling (curl --no-buffer or EventSource in browser).

---

## Gap Closure Verification

The single gap identified in the initial verification is now closed:

**CTRL-06 — Full 8-framework coverage confirmed:**

- `control-plane/src/seed/nist-ai-rmf/` — 1 framework.json + 4 Rego policies (GOVERN, MAP, MEASURE, MANAGE functions)
- `control-plane/src/seed/singapore-pdpa/` — 1 framework.json + 4 Rego policies (consent, purpose limitation, access/correction, protection)
- `control-plane/src/seed/india-dpdp/` — 1 framework.json + 4 Rego policies (consent, purpose limitation, erasure, breach notification)
- `control-plane/src/seed/china-ai-regs/` — 1 framework.json + 4 Rego policies (algorithm transparency, content labeling, user rights, PIPL compliance)
- `control-plane/src/seed/canada-aida-pipeda/` — 1 framework.json + 4 Rego policies (accountability, transparency, consent, harm mitigation)
- `control-plane/src/seed/gcc/` — 1 framework.json + 4 Rego policies (data localization, consent, cross-border transfer, AI governance)

All 24 new Rego files verified to have: `package interdict.policy.verdict`, `import rego.v1`, `default verdict := {"action": "allow", ...}`, and 2 conditional block verdicts using framework-specific reason strings. All files are substantive (106-121 lines each).

`run-seed.ts` SEED_DIRS at lines 38-47 now contains all 8 entries. The generic `seedFramework()` loop processes all entries without modification. Seed is idempotent (slug existence check before insert).

---

_Verified: 2026-03-01T11:00:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification: Yes — gap closure after plan 05-06_
