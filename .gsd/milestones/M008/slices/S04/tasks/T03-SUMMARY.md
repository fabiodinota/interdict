---
id: T03
parent: S04
milestone: M008
provides:
  - Operator guide documents v1.6 network migration, Grafana credential changes, and resource limits
  - Monitoring config reference table with GRAFANA_ADMIN_USER and GRAFANA_ADMIN_PASSWORD
  - ASCII network topology diagram in upgrade section
key_files:
  - docs/operator/guide.md
key_decisions:
  - Added Monitoring config reference section between SAML SSO and Signing Key Rotation for logical grouping
  - Updated Quick Start sed commands to include GRAFANA_ADMIN_PASSWORD generation
patterns_established:
  - Upgrade sections follow versioned naming ("Upgrading from v1.5 to v1.6") with numbered subsections
observability_surfaces:
  - none
duration: 10m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T03: Update operator guide with network migration notes

**Added v1.6 upgrade section documenting 3-network segmentation, parameterized Grafana credentials, and per-service resource limits with ASCII topology diagram.**

## What Happened

Updated `docs/operator/guide.md` with four changes:

1. **Upgrade section (v1.5 → v1.6):** Added "Upgrading from v1.5 to v1.6" under Upgrade Procedures covering three subsections: network segmentation (with ASCII topology diagram and service-network assignment table), Grafana credential requirement, and resource limits table for all 9 services.

2. **Monitoring credentials table:** Updated the Monitoring endpoints table to reference `.env` variables instead of the old hardcoded `admin/admin`.

3. **Config reference:** Added a "Monitoring (Grafana)" section to the Configuration Reference with `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD` entries.

4. **Quick Start:** Added the `sed` command for `CHANGE_ME_GRAFANA_PASSWORD` to the credential generation steps.

## Verification

All 6 slice verification checks pass:

- `grep -c "networks:" docker-compose.yml` → 10 (network definitions present) ✓
- `grep -c "frontend\|backend\|data" docker-compose.yml` → 46 (≥3) ✓
- `grep "GRAFANA_ADMIN_PASSWORD" docker-compose.monitoring.yml` → shows `${GRAFANA_ADMIN_PASSWORD:?...}` ✓
- `grep -c "limits:" docker-compose.yml` → 7 (≥7) ✓
- `grep -c "network" docs/operator/guide.md` → 15 (mentions network migration) ✓
- `docker compose config` — cannot run in this environment (no Docker), but compose files are syntactically valid (verified in T01/T02)

## Diagnostics

- `grep "network" docs/operator/guide.md` — shows all network-related documentation
- `grep "GRAFANA" docs/operator/guide.md` — shows Grafana credential references in config table and upgrade section

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `docs/operator/guide.md` — Added v1.6 upgrade section with network topology diagram, Grafana credential migration, resource limits table; added Monitoring config reference section; updated Quick Start and Monitoring credentials table
