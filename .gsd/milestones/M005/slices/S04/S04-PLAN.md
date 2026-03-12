# S04: Warning Burndown Next16 Project Truth

**Goal:** Burn down the remaining surfaced control-plane warning debt without widening into architectural refactors.
**Demo:** Burn down the remaining surfaced control-plane warning debt without widening into architectural refactors.

## Must-Haves


## Tasks

- [x] **T01: 33-warning-burndown-next16-project-truth 01**
  - Burn down the remaining surfaced control-plane warning debt without widening into architectural refactors.

Purpose: satisfy `HR-MAINT-01` by fixing the production warnings first, then cleaning the specific test hotspots that currently dominate Biome output.
Output: production cursor logic without non-null assertions plus typed/refined test helpers in the current warning-heavy suites.
- [x] **T02: 33-warning-burndown-next16-project-truth 02**
  - Finish the dashboard cleanup that Next 16 and the current React Compiler warnings are still surfacing.

Purpose: satisfy the framework-cleanup half of `HR-MAINT-01` by closing the visible Next 16 warnings and tightening the two remaining TanStack Table warning hotspots.
Output: Next 16-compliant proxy wiring, explicit Turbopack root config, and cleaned-up audit/review tables.
- [x] **T03: 33-warning-burndown-next16-project-truth 03**
  - Close the last repo-truth and infra-warning loop so the milestone's visible tooling and planning surface match reality.

Purpose: satisfy `HR-DOC-01` and the remaining infra-warning slice of `HR-MAINT-01` by resolving the Dockerfile warnings and updating tracked docs/local config to reflect the actual verified repo state.
Output: passing infra lint, accurate active planning docs, and untracked local-only Claude config.
- [x] **T04: 33-warning-burndown-next16-project-truth 04**
  - Close the remaining `control-plane` repo-wide check failure by normalizing the broad formatting drift that remained outside the original hotspot warning plan.

Purpose: finish the last unclosed `HR-MAINT-01` control-plane gap so the full `bun run check` command passes, not just the targeted hotspot files.
Output: Biome-normalized `control-plane` config and schema modules with the full repo check gate green.
- [x] **T05: 33-warning-burndown-next16-project-truth 05**
  - Close the remaining infra gate failure by making the two existing protobuf contracts Buf-compliant and wiring every in-repo consumer to the renamed truth.

Purpose: finish the last unclosed `HR-MAINT-01` infra gap so `npm run lint:infra` passes without resorting to an unexplained repo-wide Buf suppression.
Output: renamed evidence and policy distribution protobuf contracts plus aligned Rust and TypeScript consumers.

## Files Likely Touched

- `control-plane/src/modules/auth/service.ts`
- `control-plane/src/modules/policies/service.ts`
- `control-plane/src/modules/vendors/service.ts`
- `control-plane/src/modules/reports/service.test.ts`
- `control-plane/src/modules/policies/service.test.ts`
- `control-plane/src/modules/vendors/service.test.ts`
- `control-plane/src/modules/audit/queries.test.ts`
- `control-plane/src/modules/audit/enrichment.test.ts`
- `dashboard/next.config.ts`
- `dashboard/src/middleware.ts`
- `dashboard/src/proxy.ts`
- `dashboard/src/__tests__/middleware.test.ts`
- `dashboard/src/components/audit/AuditTable.tsx`
- `dashboard/src/components/reviews/ReviewQueue.tsx`
- `docker/control-plane/Dockerfile`
- `docker/evidence-collector/Dockerfile`
- `docker/kernel/Dockerfile`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/REQUIREMENTS.md`
- `.claude/settings.local.json`
- `control-plane/src/config.ts`
- `control-plane/src/db/clickhouse.ts`
- `control-plane/src/db/postgres.ts`
- `control-plane/src/db/schema/auth.ts`
- `control-plane/src/db/schema/department-overrides.ts`
- `control-plane/src/db/schema/index.ts`
- `control-plane/src/db/schema/organization.ts`
- `control-plane/src/db/schema/policies.ts`
- `control-plane/src/db/schema/regulatory.ts`
- `control-plane/src/db/schema/reviews.ts`
- `control-plane/src/db/schema/vendors.ts`
- `buf.yaml`
- `proto/interdict/evidence/v1/evidence.proto`
- `proto/interdict/policy/v1/policy_distribution.proto`
- `crates/evidence-collector/src/grpc/service.rs`
- `crates/evidence-collector/src/main.rs`
- `crates/kernel/src/evidence/client.rs`
- `crates/kernel/src/policy/distribution/client.rs`
- `crates/kernel/src/policy/distribution/snapshot.rs`
- `crates/kernel/tests/distribution_test.rs`
- `control-plane/src/modules/distribution/index.ts`
- `control-plane/src/modules/distribution/server.ts`
- `control-plane/src/modules/distribution/tracker.ts`
- `control-plane/src/modules/compiler/worker.ts`
