---
estimated_steps: 4
estimated_files: 4
---

# T03: full_text_storage startup warnings and operator guide

**Slice:** S06 — Security & CSP Hardening
**Milestone:** M007

## Description

Add startup warnings when `full_text_storage` is enabled in both the kernel and evidence-collector binaries. Create an operator guide documenting the security, privacy, and compliance implications of storing raw LLM prompt/response text. Add inline code comments at the `build_evidence_event` function where the flag controls text inclusion.

## Steps

1. In `crates/evidence-collector/src/main.rs`, after `CollectorConfig::from_env()`, add:
   ```rust
   if cfg.full_text_storage {
       tracing::warn!(
           "full_text_storage is ENABLED — raw LLM prompts and responses will be stored. \
            Ensure encryption-at-rest is configured for ClickHouse and S3/MinIO. \
            Review GDPR, data-residency, and retention requirements before production use. \
            See docs/operator/full-text-storage.md for guidance."
       );
   }
   ```

2. In `crates/kernel/src/bootstrap.rs`, after the `INTERDICT_EVIDENCE_FULL_TEXT_STORAGE` env var is parsed (~line 147-150), add a similar `tracing::warn!` when the resolved value is `true`.

3. In `crates/kernel/src/proxy/connect.rs`, add a doc comment above `build_evidence_event` (~line 666) explaining the `full_text_storage` parameter's privacy implications and referencing the operator guide.

4. Create `docs/operator/full-text-storage.md` covering:
   - What `full_text_storage` does (stores raw prompt/response text in evidence bundles)
   - The two independent env vars: `INTERDICT_EVIDENCE_FULL_TEXT_STORAGE` (kernel) and `COLLECTOR_FULL_TEXT_STORAGE` (evidence-collector)
   - Security requirements: encryption-at-rest for ClickHouse and S3, access controls, audit logging
   - Compliance considerations: GDPR Article 17 (right to erasure), data residency, retention policies
   - Recommendation: leave disabled unless required by specific compliance or investigation workflows
   - Example configuration snippets for Docker Compose and Helm

## Must-Haves

- [ ] evidence-collector emits `tracing::warn!` when `full_text_storage` is true
- [ ] kernel emits `tracing::warn!` when `full_text_storage` is true
- [ ] `build_evidence_event` has doc comment on privacy implications
- [ ] `docs/operator/full-text-storage.md` exists with complete operator guidance

## Verification

- `cargo build -p kernel -p evidence-collector` — compiles without errors
- `grep -c "tracing::warn" crates/evidence-collector/src/main.rs` — at least 1
- `grep -c "tracing::warn" crates/kernel/src/bootstrap.rs` — increased by 1
- `test -f docs/operator/full-text-storage.md && echo "exists"` — prints "exists"
- `wc -l docs/operator/full-text-storage.md` — at least 40 lines (substantive content)

## Observability Impact

- Signals added/changed: `tracing::warn!` at startup in both kernel and evidence-collector when `full_text_storage` is enabled
- How a future agent inspects this: search structured logs for `full_text_storage` at warn level during startup
- Failure state exposed: if the warning is absent when the flag is enabled, the warning code was skipped (indicates config parsing issue)

## Inputs

- `crates/evidence-collector/src/main.rs` — entry point, `cfg` available after `from_env()`
- `crates/evidence-collector/src/config.rs` — `CollectorConfig` struct with `full_text_storage: bool`
- `crates/kernel/src/bootstrap.rs` — env var parsing at ~line 147
- `crates/kernel/src/proxy/connect.rs` — `build_evidence_event` function at ~line 666
- S06-RESEARCH.md — dual-config documentation requirement

## Expected Output

- `crates/evidence-collector/src/main.rs` — startup warning added
- `crates/kernel/src/bootstrap.rs` — startup warning added
- `crates/kernel/src/proxy/connect.rs` — doc comment on `build_evidence_event`
- `docs/operator/full-text-storage.md` — complete operator guide (new file)
