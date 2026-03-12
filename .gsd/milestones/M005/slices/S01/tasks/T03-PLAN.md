# T03: Plan 03

**Slice:** S01 — **Milestone:** M005

## Description

Harden the dashboard auth boundary so login validates input up front and the BFF stores only opaque session tokens in its cookie.

Purpose: finish the Phase 30 dashboard-side work for `HR-AUTH-01` and the BFF half of `HR-AUTH-02`.
Output: validated login/me/logout routes, shared auth helpers, and route tests for malformed, valid, and failure paths.
