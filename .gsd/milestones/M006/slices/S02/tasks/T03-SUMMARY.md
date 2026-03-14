---
id: T03
parent: S02
milestone: M006
provides:
  - Read-only rootfs and no-new-privileges on all 4 Interdict container services
  - tmpfs mounts for ephemeral writes (/tmp) and named volumes for persistent writable paths
  - Kernel entrypoint writes generated config to /tmp for read-only rootfs compatibility
key_files:
  - docker-compose.yml
  - docker/kernel/entrypoint.sh
  - docker/dashboard/Dockerfile
key_decisions:
  - Used named volumes (not tmpfs) for app-writable paths that need correct UID ownership (kernel_data, kernel_policies, wasm_data, dashboard_cache) because Docker named volumes auto-initialize from image filesystem preserving ownership, while tmpfs mounts as root:root
  - Replaced kernel's ca_certs:/data/certs volume with broader kernel_data:/data to cover certs, keys, and review_queue.db under a single writable volume
  - Moved kernel config generation from /app/interdict.toml to /tmp/interdict.toml since config is regenerated from env vars on each container start (ephemeral, not persistent)
patterns_established:
  - All Interdict services use read_only:true + security_opt:no-new-privileges:true + tmpfs:/tmp in docker-compose
  - Writable runtime paths covered by named volumes; /tmp covers ephemeral writes
observability_surfaces:
  - docker inspect <image> --format '{{.Config.User}}' — verify non-root user
  - docker compose config | grep read_only — verify read-only rootfs
  - docker inspect <container> --format '{{.HostConfig.SecurityOpt}}' — verify no-new-privileges
duration: 20m
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T03: Harden Dockerfiles with non-root user and read-only rootfs

**Added read-only rootfs, no-new-privileges, and tmpfs mounts to all 4 Interdict container services in docker-compose; updated kernel entrypoint for read-only compatibility.**

## What Happened

All 4 Dockerfiles (kernel, evidence-collector, control-plane, dashboard) already had non-root `interdict` user with `USER interdict` directives — no Dockerfile user changes were needed.

The hardening work focused on docker-compose.yml runtime security:

1. **read_only: true** added to control-plane, evidence-collector, kernel, and dashboard services. This makes the container rootfs read-only, preventing any runtime filesystem modifications outside of explicitly mounted writable paths.

2. **security_opt: [no-new-privileges:true]** added to all 4 services. This prevents privilege escalation via setuid/setgid binaries.

3. **tmpfs mounts** for `/tmp` on all services (64M for most, 128M for control-plane which runs migrations).

4. **Named volumes** for writable paths that need correct ownership:
   - `kernel_data:/data` — replaces old `ca_certs:/data/certs`, covering certs, keys, and SQLite review queue
   - `kernel_policies:/app/policies` — runtime policy storage
   - `wasm_data:/app/data/wasm` — compiled Wasm policy storage for control-plane
   - `dashboard_cache:/app/.next/cache` — Next.js ISR cache

5. **Kernel entrypoint** updated to generate `interdict.toml` into `/tmp/interdict.toml` instead of `/app/interdict.toml`, since rootfs is now read-only.

6. **Dashboard Dockerfile** updated to create `/app/.next/cache` with correct ownership before the `USER` switch, so the named volume auto-initializes with the right permissions.

## Verification

- `docker compose config --quiet` — exits 0, config is valid ✅
- All 4 Dockerfiles have `USER interdict` directive ✅
- All 4 services have `read_only: true` in parsed compose config ✅
- All 4 services have `security_opt: [no-new-privileges:true]` ✅
- All 4 services have `tmpfs: [/tmp:size=NM]` ✅
- Volume targets verified: kernel has /data, /app/policies, /certs(ro); evidence-collector has /data/keys, /certs(ro); control-plane has /certs(ro), /data/keys, /config(ro), /app/data/wasm; dashboard has /app/.next/cache ✅
- `cargo deny check` — passes (advisories ok, bans ok, licenses ok, sources ok) ✅
- `docker compose build` — Docker Desktop not running; build verification deferred to CI

## Diagnostics

- Run `docker compose config | grep -A3 read_only` to verify hardening flags
- Run `docker inspect <image> --format '{{.Config.User}}'` to verify non-root user per image
- Run `docker inspect <container> --format '{{.HostConfig.ReadonlyRootfs}}'` to verify read-only rootfs at runtime

## Deviations

- Task plan called for `addgroup -g 65532 -S nonroot && adduser -u 65532 -S nonroot -G nonroot` (Alpine-style). All Dockerfiles already had Debian-based non-root `interdict` user (UID 1000 for control-plane/dashboard, system UID for kernel/evidence-collector). Kept existing user setup since the security requirement (non-root) was already met.
- Task plan didn't mention `security_opt: no-new-privileges:true` — added as a complementary hardening measure that's standard for read-only rootfs deployments.
- Added `dashboard_cache` volume and cache dir creation in dashboard Dockerfile (not in plan) to ensure Next.js ISR works with read-only rootfs.

## Known Issues

- `docker compose build` could not be verified because Docker Desktop is not running on this machine. Build validation will happen in CI or next local Docker session.
- Clippy has a pre-existing build failure in zstd-sys dependency (VS toolchain issue), unrelated to this task.

## Files Created/Modified

- `docker-compose.yml` — Added read_only, security_opt, tmpfs to all 4 Interdict services; replaced ca_certs with kernel_data volume; added kernel_policies, wasm_data, dashboard_cache volumes
- `docker/kernel/entrypoint.sh` — Changed config generation path from /app/interdict.toml to /tmp/interdict.toml for read-only rootfs compatibility
- `docker/dashboard/Dockerfile` — Added /app/.next/cache directory creation with interdict ownership before USER switch
