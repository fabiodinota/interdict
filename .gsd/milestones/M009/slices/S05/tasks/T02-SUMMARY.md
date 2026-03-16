---
id: T02
parent: S05
milestone: M009
provides:
  - Docker Compose cert-init runs non-root with read-only rootfs, no-new-privileges, tmpfs for apk, and network isolation from application services
key_files:
  - docker-compose.yml
key_decisions:
  - none — all changes prescribed by plan using D053 apk-root pattern
patterns_established:
  - none
observability_surfaces:
  - "docker compose config | grep -A 30 cert-init — shows all hardening properties and network membership"
  - "docker compose logs cert-init — apk install and cert generation output; non-zero exit on failure"
duration: 10m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T02: Docker Compose cert-init hardening

**Hardened cert-init service with non-root user, read-only rootfs, no-new-privileges, tmpfs-backed apk install, and network isolation from application services.**

## What Happened

Modified the cert-init service block in `docker-compose.yml` (lines 126–151) with the following changes:

- Added `user: "1000:1000"` — runs as non-root, consistent with other services
- Added `read_only: true` — immutable container rootfs
- Added `security_opt: [no-new-privileges:true]` — prevents privilege escalation
- Added `tmpfs: [/tmp]` — writable tmpfs for the `apk --root /tmp/apkroot` install pattern
- Modified `command` to use `apk --root /tmp/apkroot --initdb add --no-cache openssl` and set `PATH=/tmp/apkroot/usr/bin:$$PATH` before invoking the cert generation script
- Removed `networks: [data]` — cert-init now uses default bridge only, giving internet access for apk but no access to application services (Postgres, ClickHouse, MinIO)

The `certs:/certs` volume mount remains writable despite `read_only: true` (volumes are exempt from rootfs restriction), so the cert generation script writes to `/certs/` as before.

## Verification

- `docker compose --env-file .env.test config` — validated without errors ✅
- Config output confirmed:
  - `read_only: true` ✅
  - `user: 1000:1000` ✅
  - `security_opt: [no-new-privileges:true]` ✅
  - `tmpfs: [/tmp]` ✅
  - `networks: default: null` (NOT `data`) ✅
  - `command` contains `apk --root /tmp/apkroot --initdb add --no-cache openssl` ✅

Slice-level check: `docker compose config` passes ✅

## Diagnostics

- `docker compose config | grep -A 30 "cert-init:"` — inspect all security properties and network membership
- `docker compose logs cert-init` — apk install output and cert generation logs; non-zero exit code on failure
- `docker run --rm -v interdict_certs:/certs alpine ls -la /certs/` — inspect generated cert files in the named volume

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `docker-compose.yml` — cert-init service hardened with user, read_only, security_opt, tmpfs, apk-root command, network isolation
- `.gsd/milestones/M009/slices/S05/tasks/T02-PLAN.md` — added Observability Impact section per pre-flight requirement
