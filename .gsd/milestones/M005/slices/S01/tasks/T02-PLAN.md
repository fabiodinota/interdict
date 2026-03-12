# T02: Plan 02

**Slice:** S01 — **Milestone:** M005

## Description

Add the control-plane contract that converts a validated API key into the existing opaque session primitive the dashboard can safely store in its httpOnly cookie.

Purpose: satisfy `HR-AUTH-02` without changing the approved BFF architecture.
Output: a typed auth exchange endpoint, service support, and focused regression coverage.
