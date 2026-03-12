# S07: Kernel Integration Wiring

**Goal:** Wire ContentInspector and live PolicySet into the kernel binary entry points, closing the 2 P0 integration gaps (INT-01, INT-02) from the v1.
**Demo:** Wire ContentInspector and live PolicySet into the kernel binary entry points, closing the 2 P0 integration gaps (INT-01, INT-02) from the v1.

## Must-Haves


## Tasks

- [x] **T01: Plan 01**
  - Wire ContentInspector and live PolicySet into the kernel binary entry points, closing the 2 P0 integration gaps (INT-01, INT-02) from the v1.0 milestone audit, plus fix the Rego entrypoint derivation bug for distributed policies.

Purpose: After this plan, PII detection/injection blocking/stream severing are active in the running binary (not dead code), and hot-reloaded policies from the control plane actually drive enforcement (not ignored for debug logging). These are the last blockers for v1.0 milestone completion.

Output: Updated main.rs with ContentInspector instantiation, updated connect.rs with live PolicySet enforcement, PolicyPipeline.with_live_set() method, entrypoint field on PolicyConfig, updated snapshot.rs, extended TestProxy, and 2 E2E integration tests.

Gap Closure: INT-01, INT-02, FLOW-01, FLOW-02 from v1.0-MILESTONE-AUDIT.md

## Files Likely Touched

