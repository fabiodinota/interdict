---
id: T03
parent: S06
milestone: M007
provides:
  - Startup tracing::warn! in kernel and evidence-collector when full_text_storage is enabled
  - Doc comment on build_evidence_event documenting privacy implications of full_text_storage
  - Operator guide at docs/operator/full-text-storage.md covering security, GDPR, configuration
key_files:
  - crates/evidence-collector/src/main.rs
  - crates/kernel/src/bootstrap.rs
  - crates/kernel/src/proxy/connect.rs
  - docs/operator/full-text-storage.md
key_decisions:
  - Kernel full_text_storage warning uses a block expression around the env var parse to avoid a second env read
patterns_established:
  - Startup warn! pattern for risky config flags with cross-reference to operator docs
observability_surfaces:
  - "tracing::warn! at startup in kernel and evidence-collector when full_text_storage is enabled — search structured logs for 'full_text_storage' at WARN level"
duration: 15m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T03: full_text_storage startup warnings and operator guide

**Added startup warnings when full_text_storage is enabled and created comprehensive operator guide documenting security, privacy, and compliance implications**

## What Happened

1. **evidence-collector main.rs**: Added `tracing::warn!` immediately after `CollectorConfig::from_env()` when `cfg.full_text_storage` is true. Warning covers encryption-at-rest, GDPR/data-residency, and references the operator guide.

2. **kernel bootstrap.rs**: Wrapped the `INTERDICT_EVIDENCE_FULL_TEXT_STORAGE` env var parse in a block expression that emits `tracing::warn!` when the resolved value is true, avoiding a redundant second env read while keeping the inline expression form compatible with the `ProxyService::with_distribution` call.

3. **kernel proxy/connect.rs**: Added a doc comment on `build_evidence_event` explaining the `full_text_storage` parameter's privacy implications — encryption-at-rest requirement, access controls, GDPR Article 17, and cross-reference to the operator guide.

4. **docs/operator/full-text-storage.md**: Created 163-line operator guide covering: what the flag does, the two independent env vars, security requirements (encryption-at-rest, access controls, audit logging), GDPR Article 17 erasure obligations, data residency, retention policies, recommendation to leave disabled, and example configuration snippets for Docker Compose and Helm.

## Verification

- `cargo build -p kernel -p evidence-collector` — compiled successfully (zero errors)
- `grep -c "tracing::warn" crates/evidence-collector/src/main.rs` → 2 (≥1 ✅)
- `grep -c "tracing::warn" crates/kernel/src/bootstrap.rs` → 1 (increased by 1 ✅)
- `test -f docs/operator/full-text-storage.md && echo "exists"` → "exists" ✅
- `wc -l docs/operator/full-text-storage.md` → 163 lines (≥40 ✅)

### Slice-level checks (T03 is final task):
- `cargo build -p kernel -p evidence-collector` — ✅ passed
- `grep -c "unsafe-inline" dashboard/src/proxy.ts` → 0 ✅
- `grep -c "x-nonce" dashboard/src/app/layout.tsx` → 1 ✅
- `helm template` — not runnable on this machine (no helm binary); T02 verified this at execution time

## Diagnostics

- **Startup warning presence**: `kubectl logs deploy/interdict-kernel | grep "full_text_storage"` or equivalent for evidence-collector
- **Warning absence when flag is enabled**: Indicates env var not set or config parsing issue — check deployment manifest for typos
- **Operator guide**: `docs/operator/full-text-storage.md` — covers encryption, GDPR, retention, and configuration examples

## Deviations

- Kernel warning uses a block expression `{ let full_text = ...; if full_text { warn!(...) } full_text }` instead of a separate statement, because the env var parse is inline inside the `ProxyService::with_distribution()` call. This avoids duplicating the parse logic while keeping the warning co-located with the flag resolution.

## Known Issues

None.

## Files Created/Modified

- `crates/evidence-collector/src/main.rs` — Added startup tracing::warn! when full_text_storage is enabled
- `crates/kernel/src/bootstrap.rs` — Added startup tracing::warn! when INTERDICT_EVIDENCE_FULL_TEXT_STORAGE resolves to true
- `crates/kernel/src/proxy/connect.rs` — Added doc comment on build_evidence_event explaining full_text_storage privacy implications
- `docs/operator/full-text-storage.md` — New operator guide (163 lines) covering security, compliance, and configuration
