# S01: Secret Session Seed Hardening

**Goal:** Remove the control-plane seed script's plaintext credential reveal path without breaking the bootstrap operator experience.
**Demo:** Remove the control-plane seed script's plaintext credential reveal path without breaking the bootstrap operator experience.

## Must-Haves


## Tasks

- [x] **T01: Plan 01**
  - Remove the control-plane seed script's plaintext credential reveal path without breaking the bootstrap operator experience.

Purpose: satisfy `HR-SEC-01` and the repository invariant that secrets never appear in logs/stdout.
Output: a safe seed-output helper, regression tests, and seed wiring that never emits raw API keys.
- [x] **T02: Plan 02**
  - Add the control-plane contract that converts a validated API key into the existing opaque session primitive the dashboard can safely store in its httpOnly cookie.

Purpose: satisfy `HR-AUTH-02` without changing the approved BFF architecture.
Output: a typed auth exchange endpoint, service support, and focused regression coverage.
- [x] **T03: Plan 03**
  - Harden the dashboard auth boundary so login validates input up front and the BFF stores only opaque session tokens in its cookie.

Purpose: finish the Phase 30 dashboard-side work for `HR-AUTH-01` and the BFF half of `HR-AUTH-02`.
Output: validated login/me/logout routes, shared auth helpers, and route tests for malformed, valid, and failure paths.

## Files Likely Touched

