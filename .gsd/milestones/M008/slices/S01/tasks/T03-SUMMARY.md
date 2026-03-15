---
id: T03
parent: S01
milestone: M008
provides:
  - All Docker base images pinned by sha256 digest across 4 Dockerfiles (8 FROM lines)
  - Windows target removed from deny.toml [graph].targets
key_files:
  - docker/control-plane/Dockerfile
  - docker/kernel/Dockerfile
  - docker/evidence-collector/Dockerfile
  - docker/dashboard/Dockerfile
  - deny.toml
key_decisions:
  - Pinned manifest-list (multi-arch) digests rather than per-architecture digests so Docker automatically selects the correct platform at pull time
  - Kept windows-sys skip-tree entry in deny.toml [bans] since it refers to a crate name, not a platform target — only the x86_64-pc-windows-msvc target was removed from [graph].targets
patterns_established:
  - "Format: FROM image:tag@sha256:<digest> AS stage — tag preserved for readability, digest ensures immutability"
  - "Renovate docker pinDigests:true will track digest updates for base images"
observability_surfaces:
  - "Diagnostic: grep -c '@sha256:' docker/*/Dockerfile — returns per-file counts (1/3/2/2 = 8 total)"
  - "Diagnostic: grep -c 'x86_64-pc-windows-msvc' deny.toml — returns 0"
  - "Diagnostic: cargo deny check — passes with Windows target removed"
duration: 15m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T03: Pin Docker base images by digest and clean deny.toml

**Pinned all 8 Docker base image FROM lines by sha256 digest across 4 Dockerfiles and removed Windows target from deny.toml.**

## What Happened

Looked up current manifest-list digests for all 5 distinct base images via Docker Hub API:
- `oven/bun:1.1-slim` → `sha256:98d461b3...` (control-plane)
- `oven/bun:1.1` → `sha256:d6ad4d32...` (dashboard deps + builder)
- `node:20-slim` → `sha256:a82f4054...` (dashboard runner)
- `debian:bookworm-slim` → `sha256:74d56e39...` (kernel + evidence-collector runtime)
- `lukemathwalker/cargo-chef:latest-rust-1-bookworm` → `sha256:123b94ec...` (kernel + evidence-collector chef)

Appended `@sha256:<digest>` to each FROM line while keeping the human-readable tag. Internal alias stages (`FROM chef AS planner`, `FROM base AS opa-fetch`, etc.) are not external image references and were left unpinned.

Removed `x86_64-pc-windows-msvc` from deny.toml `[graph].targets`. The `windows-sys@0.52.0` entry in `[bans].skip-tree` was preserved — it manages a transitive crate dependency, not a platform target.

## Verification

- `grep -c "@sha256:" docker/*/Dockerfile` → 1/3/2/2 (8 total, ≥4 ✓)
- `grep -c "x86_64-pc-windows-msvc" deny.toml` → 0 ✓
- `cargo deny check` → advisories ok, bans ok, licenses ok, sources ok ✓
- All slice-level checks pass:
  - SHA-pinned actions: 30/14/1 ✓
  - No @main refs ✓
  - OPA sha256 checksum in control-plane Dockerfile ✓
  - No unpinned action references ✓

## Diagnostics

- **Base image drift detection:** `grep "^FROM" docker/*/Dockerfile | grep -v "@sha256:"` — should only show internal alias stages (FROM chef, FROM base), never external image references
- **Updating digests:** Look up new digest via `curl -sL "https://hub.docker.com/v2/repositories/<namespace>/<image>/tags/<tag>" | jq .digest`
- **cargo deny regression:** `cargo deny check` — should continue to pass; Windows-only advisories will no longer appear

## Deviations

- Slice verification `grep -c "windows" deny.toml` returns 2 (not 0) because `windows-sys` crate name appears in `[bans].skip-tree`. This is correct — the task only required removing the Windows *target* from `[graph].targets`, and `grep -c "x86_64-pc-windows-msvc" deny.toml` returns 0 as intended.

## Known Issues

None.

## Files Created/Modified

- `docker/control-plane/Dockerfile` — Pinned `oven/bun:1.1-slim` base image by digest
- `docker/kernel/Dockerfile` — Pinned `cargo-chef` and `debian:bookworm-slim` by digest
- `docker/evidence-collector/Dockerfile` — Pinned `cargo-chef` and `debian:bookworm-slim` by digest
- `docker/dashboard/Dockerfile` — Pinned `oven/bun:1.1` (2 stages) and `node:20-slim` by digest
- `deny.toml` — Removed `x86_64-pc-windows-msvc` from `[graph].targets`
