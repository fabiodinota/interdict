# S05: Control Plane Api Core

**Goal:** Scaffold the Bun + Elysia control plane project with all database schemas, connection clients, and shared infrastructure utilities.
**Demo:** Scaffold the Bun + Elysia control plane project with all database schemas, connection clients, and shared infrastructure utilities.

## Must-Haves


## Tasks

- [x] **T01: Plan 01**
  - Scaffold the Bun + Elysia control plane project with all database schemas, connection clients, and shared infrastructure utilities.

Purpose: Establish the foundation that all subsequent plans build on -- project structure, type-safe database schemas, connection management, and shared patterns.
Output: A running Elysia server with health check, PostgreSQL schema ready for migrations, ClickHouse client configured, and all shared utilities exported.
- [x] **T02: Plan 02**
  - Implement policy CRUD with full version history, async Rego-to-Wasm compilation pipeline, and vendor registry with per-model control.

Purpose: Deliver the core control plane capabilities -- policy management with compilation and vendor governance -- that compliance officers and administrators will use to configure the Interdict system.
Output: Working policy and vendor REST API endpoints with background Wasm compilation.
- [x] **T03: Plan 03**
  - Implement regulatory framework mapping engine and seed EU AI Act and GDPR policy packs with functional Rego policies.

Purpose: Enable compliance officers to activate regulatory frameworks that auto-configure policy enforcement, satisfying the core regulatory governance value proposition of Interdict.
Output: Working regulatory framework API with seeded EU AI Act and GDPR policies ready for compilation.
- [x] **T04: Plan 04**
  - Implement audit trail query API with ClickHouse integration, cursor-based pagination, PostgreSQL enrichment, SSE streaming, and aggregate endpoints.

Purpose: Enable compliance officers, auditors, and security teams to search, filter, and monitor all AI interactions with policy decisions and evidence attribution in near-real-time.
Output: Working audit trail API with search, filtering, pagination, enrichment, SSE streaming, and aggregate summary endpoints.
- [x] **T05: Plan 05**
  - Wire all Phase 5 modules into the Elysia app entry point and run end-to-end integration verification.

Purpose: Consolidate all Wave 2 module plugins into a single integration point, avoiding concurrent modification of src/index.ts across parallel plans. This is the final gating step before Phase 5 completion.
Output: A fully wired Elysia app with all REST endpoints accessible and the compilation worker running.
- [x] **T06: Plan 06**
  - Close the CTRL-06 gap by creating seed directories and Rego policies for the 6 missing regulatory frameworks: NIST AI RMF, Singapore PDPA, India DPDP, China AI Regs, Canada AIDA/PIPEDA, and GCC frameworks.

Purpose: REQUIREMENTS.md specifies pre-built policy packs for 8 regulatory frameworks under CTRL-06. Only EU AI Act and GDPR are implemented. This gap closure adds the remaining 6 using the established seed infrastructure (framework.json + policies/*.rego + run-seed.ts registration).

Output: 6 new seed directories with 24 Rego policies total (4 per framework), and an updated run-seed.ts that includes all 8 framework slugs.

## Files Likely Touched

