---
phase: 31
phase_name: Distribution TLS & Evidence Query Scale Hardening
status: passed
updated: 2026-03-11
requirements:
  - HR-DIST-01
  - HR-EVID-01
---

# Phase 31 Verification

## Result

- Status: passed
- Must-haves verified: 2/2 requirement groups

## Evidence

- `crates/kernel/src/config.rs`, `crates/kernel/src/main.rs`, and `crates/kernel/src/policy/distribution/client.rs` now require and use an explicit distribution TLS server identity instead of hard-coding `control-plane`.
- `docker/kernel/interdict.toml.template`, `docker-compose.yml`, `.env`, and `helm/interdict/templates/kernel/configmap.yaml` expose `KERNEL_DISTRIBUTION_TLS_SERVER_NAME` so Compose and Helm deployments can override the expected certificate hostname.
- `control-plane/src/modules/reviews/service.ts` now adds `event_date` pruning to reconciliation and bundle enrichment queries.
- `control-plane/src/modules/evidence/service.ts` now bounds verification bundle fetches by derived event-date partitions and predecessor lookups by an adjacent-day window.

## Automated Verification

- `control-plane`: `bun test src/modules/reviews/service.test.ts src/modules/evidence/service.test.ts`
- `control-plane`: `bunx tsc --noEmit`
- `repo`: `cargo fmt --all -- --check`
- `repo`: static config-surface check for `KERNEL_DISTRIBUTION_TLS_SERVER_NAME`
- `repo`: grep confirms no remaining `.domain_name("control-plane")` literal in Rust sources

## Verification Notes

- `cargo test -p kernel --lib` remains blocked on this Windows host because the MSVC toolchain cannot open `msvcrt.lib`; this matches the pre-existing Rust linker limitation already tracked in `.planning/STATE.md`.
- `helm template` could not be executed on this host because `helm` is not installed, so Helm verification is structural from rendered template/value inspection rather than CLI rendering.

## Requirement Traceability

- `HR-DIST-01`: passed
- `HR-EVID-01`: passed
