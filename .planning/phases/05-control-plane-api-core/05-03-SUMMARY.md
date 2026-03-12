---
phase: 05-control-plane-api-core
plan: 03
subsystem: api
tags: [elysia, drizzle, rego, opa, regulatory, eu-ai-act, gdpr, typebox, typescript]

# Dependency graph
requires:
  - phase: 05-control-plane-api-core
    provides: PostgreSQL regulatory schema (frameworks, framework_policies, framework_activations), policy schema, shared utilities
provides:
  - RegulatoryService with framework listing, activation/deactivation, per-policy toggle, and additive active policy merge
  - Elysia plugin with 6 REST endpoints under /api/v1/regulatory
  - EU AI Act seed pack with 5 working Rego policies (Articles 9, 10, 13, 14, 62)
  - GDPR seed pack with 5 working Rego policies (Articles 5(1)(b), 5(1)(c), 6-7, 17, 35)
  - Idempotent seed script for first-deployment framework provisioning
  - TypeBox model schemas for regulatory API validation
affects: [05-05, 06-policy-distribution, 08-dashboard-ui]

# Tech tracking
tech-stack:
  added: [opa]
  patterns: [data-store-interface-for-testability, framework-activation-additive-merge, rego-policy-per-requirement, idempotent-seed-with-slug-check]

key-files:
  created:
    - control-plane/src/modules/regulatory/service.ts
    - control-plane/src/modules/regulatory/service.test.ts
    - control-plane/src/modules/regulatory/model.ts
    - control-plane/src/modules/regulatory/index.ts
    - control-plane/src/seed/run-seed.ts
    - control-plane/src/seed/eu-ai-act/framework.json
    - control-plane/src/seed/eu-ai-act/policies/transparency-notice.rego
    - control-plane/src/seed/eu-ai-act/policies/human-oversight.rego
    - control-plane/src/seed/eu-ai-act/policies/risk-assessment.rego
    - control-plane/src/seed/eu-ai-act/policies/data-governance.rego
    - control-plane/src/seed/eu-ai-act/policies/incident-reporting.rego
    - control-plane/src/seed/gdpr/framework.json
    - control-plane/src/seed/gdpr/policies/purpose-limitation.rego
    - control-plane/src/seed/gdpr/policies/data-minimization.rego
    - control-plane/src/seed/gdpr/policies/consent-verification.rego
    - control-plane/src/seed/gdpr/policies/right-to-erasure.rego
    - control-plane/src/seed/gdpr/policies/dpia-required.rego
  modified:
    - control-plane/package.json

key-decisions:
  - "Data-store interface pattern: RegulatoryService accepts mock arrays or real Drizzle DB for testability without PostgreSQL"
  - "Additive policy merge: custom policies and framework policies coexist without conflict resolution"
  - "Individual Rego file per regulatory requirement with correct interdict/policy/verdict package and verdict format"
  - "OPA installed via brew for opa check --strict validation of seed Rego policies"

patterns-established:
  - "Data-store interface: Service class accepts typed data store for unit testing with mock arrays, production with Drizzle ORM"
  - "Framework activation is additive: activating a framework never disables other frameworks or custom policies"
  - "Rego per requirement: each regulatory article gets a dedicated Rego policy file with content pattern matching"
  - "Idempotent seeding: seed script checks framework slug existence before insert, safe to run multiple times"

requirements-completed: [CTRL-05, CTRL-06]

# Metrics
duration: 6m54s
completed: 2026-03-01
---

# Phase 5 Plan 03: Regulatory Framework Mapping Engine Summary

**Regulatory framework management API with additive activation and 10 working Rego policies seeding EU AI Act and GDPR compliance packs**

## Performance

- **Duration:** 6m 54s
- **Started:** 2026-03-01T04:16:36Z
- **Completed:** 2026-03-01T04:23:30Z
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments
- RegulatoryService with full framework lifecycle: list, getBySlug, activate, deactivate, togglePolicy, getActiveFrameworks, getActivePolicies
- Additive policy merge correctly combines custom active policies with active framework policies (is_required=true only)
- 5 EU AI Act Rego policies covering Articles 9, 10, 13, 14, and 62 with real content pattern matching
- 5 GDPR Rego policies covering Articles 5(1)(b), 5(1)(c), 6-7, 17, and 35 with consent/lawful basis detection
- All 10 Rego policies pass `opa check --strict` with correct package declaration (`interdict.policy.verdict`)
- Elysia plugin with 6 REST endpoints for framework management (not wired to main app -- deferred to 05-05)
- 17 unit tests passing covering all service behaviors including edge cases (no-op activate, re-activation, inactive filtering)
- Idempotent seed script safe to run on repeated deployments

## Task Commits

Each task was committed atomically:

1. **Task 1: Regulatory framework management service and API endpoints** - `ccbc64e` (test), `e2ef36e` (feat)
2. **Task 2: Seed EU AI Act and GDPR regulatory policy packs** - `b8ebc40` (feat)

_TDD task had separate RED and GREEN phase commits._

## Files Created/Modified
- `control-plane/src/modules/regulatory/service.ts` - RegulatoryService with framework management business logic
- `control-plane/src/modules/regulatory/service.test.ts` - 17 unit tests with mock data store
- `control-plane/src/modules/regulatory/model.ts` - TypeBox schemas for API validation
- `control-plane/src/modules/regulatory/index.ts` - Elysia plugin with 6 REST endpoints
- `control-plane/src/seed/run-seed.ts` - Idempotent seed script for first-deployment provisioning
- `control-plane/src/seed/eu-ai-act/framework.json` - EU AI Act framework metadata with 5 policy-to-requirement mappings
- `control-plane/src/seed/eu-ai-act/policies/transparency-notice.rego` - Article 13 transparency enforcement
- `control-plane/src/seed/eu-ai-act/policies/human-oversight.rego` - Article 14 human oversight enforcement
- `control-plane/src/seed/eu-ai-act/policies/risk-assessment.rego` - Article 9 risk management enforcement
- `control-plane/src/seed/eu-ai-act/policies/data-governance.rego` - Article 10 data governance enforcement
- `control-plane/src/seed/eu-ai-act/policies/incident-reporting.rego` - Article 62 incident reporting detection
- `control-plane/src/seed/gdpr/framework.json` - GDPR framework metadata with 5 policy-to-requirement mappings
- `control-plane/src/seed/gdpr/policies/purpose-limitation.rego` - Article 5(1)(b) purpose limitation
- `control-plane/src/seed/gdpr/policies/data-minimization.rego` - Article 5(1)(c) data minimisation
- `control-plane/src/seed/gdpr/policies/consent-verification.rego` - Articles 6-7 consent verification
- `control-plane/src/seed/gdpr/policies/right-to-erasure.rego` - Article 17 right to erasure
- `control-plane/src/seed/gdpr/policies/dpia-required.rego` - Article 35 DPIA requirement
- `control-plane/package.json` - Added "seed" script command

## Decisions Made
- **Data-store interface for testability:** RegulatoryService accepts a typed `RegulatoryDataStore` interface compatible with both mock arrays (unit tests) and Drizzle ORM (production). This avoids needing PostgreSQL for unit tests.
- **Additive policy merge semantics:** `getActivePolicies()` merges custom active policies (not in any framework) with framework policies (from active frameworks where is_required=true). No conflict resolution needed -- frameworks layer on top.
- **Individual Rego validation:** Each Rego file validated individually with `opa check --strict` since all files share the same package namespace (by design -- kernel loads each policy separately).
- **OPA installed as development dependency:** Installed OPA CLI via brew to validate Rego syntax. Required for seed verification and future policy compilation pipeline.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `opa check --strict` fails when run on all Rego files simultaneously because they share the same package (`interdict.policy.verdict`). This is expected behavior -- each file is a standalone policy loaded separately by the kernel. Validated each file individually instead.

## User Setup Required
OPA CLI is required for policy compilation and validation. Install via:
```bash
brew install opa  # macOS
# or download from https://www.openpolicyagent.org/docs/latest/#running-opa
```

## Next Phase Readiness
- Regulatory module ready for wiring into main app (Plan 05-05)
- Seed script ready for first deployment after database migration
- All Rego policies compatible with kernel's expected input/output format
- Framework activation API ready for dashboard integration (Phase 8)

## Self-Check: PASSED

All 17 created files verified present on disk. All 3 task commits (ccbc64e, e2ef36e, b8ebc40) verified in git log.
