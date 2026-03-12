# T01: Plan 01

**Slice:** S01 — **Milestone:** M005

## Description

Remove the control-plane seed script's plaintext credential reveal path without breaking the bootstrap operator experience.

Purpose: satisfy `HR-SEC-01` and the repository invariant that secrets never appear in logs/stdout.
Output: a safe seed-output helper, regression tests, and seed wiring that never emits raw API keys.
