# M005: Hardening & Release Readiness

**Vision:** Interdict.

## Success Criteria


## Slices

- [x] **S01: Secret Session Seed Hardening** `risk:medium` `depends:[]`
  > After this: Remove the control-plane seed script's plaintext credential reveal path without breaking the bootstrap operator experience.
- [x] **S02: Distribution Tls Evidence Query** `risk:medium` `depends:[S01]`
  > After this: Make the kernel's policy-distribution mTLS peer identity deployment-configurable instead of hard-coded to one hostname.
- [x] **S03: Repo Quality Gates Infra Lint** `risk:medium` `depends:[S02]`
  > After this: Create the canonical repo-root quality commands and config files that Phase 32 CI and local hooks will build on.
- [x] **S04: Warning Burndown Next16 Project Truth** `risk:medium` `depends:[S03]`
  > After this: Burn down the remaining surfaced control-plane warning debt without widening into architectural refactors.
