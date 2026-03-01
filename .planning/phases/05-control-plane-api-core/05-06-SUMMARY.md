---
phase: 05-control-plane-api-core
plan: 06
subsystem: api
tags: [rego, opa, regulatory-frameworks, seed-data, nist, pdpa, dpdp, pipl, aida, pipeda, gcc]

# Dependency graph
requires:
  - phase: 05-03
    provides: Regulatory framework API + seed infrastructure (eu-ai-act, gdpr)
provides:
  - 6 new regulatory framework seed directories (nist-ai-rmf, singapore-pdpa, india-dpdp, china-ai-regs, canada-aida-pipeda, gcc)
  - 24 new Rego policy files covering NIST AI RMF, Singapore PDPA, India DPDP, China AI Regs, Canada AIDA/PIPEDA, GCC
  - Full CTRL-06 coverage with 8 total regulatory framework seed packs
affects: [06-policy-distribution-kernel-integration, policy-compilation, seed-deployment]

# Tech tracking
tech-stack:
  added: []
  patterns: [rego-policy-seed-pattern, framework-json-schema]

key-files:
  created:
    - control-plane/src/seed/nist-ai-rmf/framework.json
    - control-plane/src/seed/nist-ai-rmf/policies/govern-ai-risk.rego
    - control-plane/src/seed/nist-ai-rmf/policies/map-ai-impact.rego
    - control-plane/src/seed/nist-ai-rmf/policies/measure-performance.rego
    - control-plane/src/seed/nist-ai-rmf/policies/manage-ai-risk.rego
    - control-plane/src/seed/singapore-pdpa/framework.json
    - control-plane/src/seed/singapore-pdpa/policies/consent-obligation.rego
    - control-plane/src/seed/singapore-pdpa/policies/purpose-limitation.rego
    - control-plane/src/seed/singapore-pdpa/policies/access-correction.rego
    - control-plane/src/seed/singapore-pdpa/policies/data-protection.rego
    - control-plane/src/seed/india-dpdp/framework.json
    - control-plane/src/seed/india-dpdp/policies/consent-requirement.rego
    - control-plane/src/seed/india-dpdp/policies/purpose-limitation.rego
    - control-plane/src/seed/india-dpdp/policies/data-erasure.rego
    - control-plane/src/seed/india-dpdp/policies/breach-notification.rego
    - control-plane/src/seed/china-ai-regs/framework.json
    - control-plane/src/seed/china-ai-regs/policies/algorithm-transparency.rego
    - control-plane/src/seed/china-ai-regs/policies/content-labeling.rego
    - control-plane/src/seed/china-ai-regs/policies/user-rights.rego
    - control-plane/src/seed/china-ai-regs/policies/data-compliance.rego
    - control-plane/src/seed/canada-aida-pipeda/framework.json
    - control-plane/src/seed/canada-aida-pipeda/policies/accountability.rego
    - control-plane/src/seed/canada-aida-pipeda/policies/transparency-explanation.rego
    - control-plane/src/seed/canada-aida-pipeda/policies/consent-knowledge.rego
    - control-plane/src/seed/canada-aida-pipeda/policies/harm-mitigation.rego
    - control-plane/src/seed/gcc/framework.json
    - control-plane/src/seed/gcc/policies/data-localization.rego
    - control-plane/src/seed/gcc/policies/consent-processing.rego
    - control-plane/src/seed/gcc/policies/cross-border-transfer.rego
    - control-plane/src/seed/gcc/policies/ai-governance.rego
  modified:
    - control-plane/src/seed/run-seed.ts

key-decisions:
  - "Each Rego policy uses dual verdict rules (primary + contextual) matching existing eu-ai-act/gdpr depth"
  - "Jurisdiction-scoped exemption markers per framework for fine-grained policy control"

patterns-established:
  - "Regulatory seed pattern: framework.json + policies/*.rego with 5-8 violation helpers + 3-5 exemption helpers per policy"

requirements-completed: [CTRL-01, CTRL-02, CTRL-04, CTRL-05, CTRL-06, CTRL-07, CTRL-10, CTRL-11]

# Metrics
duration: 6min
completed: 2026-03-01
---

# Phase 5 Plan 6: Regulatory Framework Gap Closure Summary

**24 Rego policies across 6 new frameworks (NIST AI RMF, Singapore PDPA, India DPDP, China AI Regs, Canada AIDA/PIPEDA, GCC) closing CTRL-06 gap to full 8-framework coverage**

## Performance

- **Duration:** 6m15s
- **Started:** 2026-03-01T04:47:40Z
- **Completed:** 2026-03-01T04:53:55Z
- **Tasks:** 2
- **Files modified:** 31

## Accomplishments
- Created 6 new regulatory framework seed directories with framework.json and 4 Rego policies each
- All 24 Rego policies follow the established pattern: package interdict.policy.verdict, import rego.v1, default allow verdict, conditional block verdicts with framework-specific reasons
- Updated run-seed.ts SEED_DIRS to include all 8 framework slugs (eu-ai-act, gdpr, nist-ai-rmf, singapore-pdpa, india-dpdp, china-ai-regs, canada-aida-pipeda, gcc)
- CTRL-06 requirement fully satisfied: pre-built regulatory policy packs exist for all 8 frameworks

## Task Commits

Each task was committed atomically:

1. **Task 1: Create NIST AI RMF, Singapore PDPA, and India DPDP seed directories** - `725bf50` (feat)
2. **Task 2: Create China AI Regs, Canada AIDA/PIPEDA, GCC seeds and update run-seed.ts** - `efce2a4` (feat)

## Files Created/Modified
- `control-plane/src/seed/nist-ai-rmf/framework.json` - NIST AI RMF framework definition (US, 4 policies)
- `control-plane/src/seed/nist-ai-rmf/policies/*.rego` - Govern, Map, Measure, Manage function policies
- `control-plane/src/seed/singapore-pdpa/framework.json` - Singapore PDPA framework definition (SG, 4 policies)
- `control-plane/src/seed/singapore-pdpa/policies/*.rego` - Consent, purpose limitation, access/correction, protection policies
- `control-plane/src/seed/india-dpdp/framework.json` - India DPDP Act framework definition (IN, 4 policies)
- `control-plane/src/seed/india-dpdp/policies/*.rego` - Consent, purpose limitation, erasure, breach notification policies
- `control-plane/src/seed/china-ai-regs/framework.json` - China AI Regulations framework definition (CN, 4 policies)
- `control-plane/src/seed/china-ai-regs/policies/*.rego` - Algorithm transparency, content labeling, user rights, PIPL compliance policies
- `control-plane/src/seed/canada-aida-pipeda/framework.json` - Canada AIDA/PIPEDA framework definition (CA, 4 policies)
- `control-plane/src/seed/canada-aida-pipeda/policies/*.rego` - Accountability, transparency, consent, harm mitigation policies
- `control-plane/src/seed/gcc/framework.json` - GCC data protection framework definition (GCC, 4 policies)
- `control-plane/src/seed/gcc/policies/*.rego` - Data localization, consent, cross-border transfer, AI governance policies
- `control-plane/src/seed/run-seed.ts` - Updated SEED_DIRS array (8 entries) and JSDoc comment

## Decisions Made
- Each Rego policy uses dual verdict rules (primary violation + contextual/secondary violation) matching the depth established in existing eu-ai-act and gdpr policies
- Jurisdiction-scoped exemption markers used per framework (e.g., pdpa-consent-obtained, dpdp-consent-obtained, pipl-consent) for fine-grained policy control without cross-framework conflicts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 8 regulatory frameworks from CTRL-06 are complete and ready for seed deployment
- Phase 5 control plane API core is fully complete with all 6 plans executed
- Ready for Phase 6: Policy Distribution and Kernel Integration

## Self-Check: PASSED

- All 8 framework.json files exist
- All 24 new Rego policy files exist
- run-seed.ts exists and updated
- SUMMARY.md exists
- Commit 725bf50 found (Task 1)
- Commit efce2a4 found (Task 2)

---
*Phase: 05-control-plane-api-core*
*Completed: 2026-03-01*
