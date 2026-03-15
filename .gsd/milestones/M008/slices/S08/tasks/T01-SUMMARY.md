---
id: T01
parent: S08
milestone: M008
provides:
  - Proto validation annotations on all string/bytes fields in evidence.proto and policy_distribution.proto
  - Deprecation markers on prompt_text/response_text fields
  - Wasm inline transfer size documentation on wasm_bytes field
  - Vendored protovalidate dependency for protoc/tonic compatibility
key_files:
  - proto/interdict/evidence/v1/evidence.proto
  - proto/interdict/policy/v1/policy_distribution.proto
  - buf.yaml
  - proto/third_party/buf/validate/validate.proto
  - crates/kernel/build.rs
  - crates/evidence-collector/build.rs
  - crates/interdict-verify/build.rs
key_decisions:
  - Vendored buf/validate/validate.proto into proto/third_party/ for protoc compatibility (buf BSR deps not visible to tonic_prost_build)
  - Excluded proto/third_party from buf module to avoid duplicate symbol errors with BSR dependency
  - Used `#[allow(deprecated)]` on backward-compat field usages rather than suppressing at crate level
patterns_established:
  - Proto third-party deps vendored under proto/third_party/ with buf.yaml excludes and build.rs include paths
  - Deprecated proto fields use both proto-level `deprecated = true` and comment-level `// DEPRECATED:` notices
observability_surfaces:
  - Proto-level `deprecated = true` triggers compiler warnings in Rust consumers and IDE hints
  - buf lint validates all annotation constraints at CI time
duration: 30m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T01: Add proto validation annotations and field documentation

**Added buf.validate annotations to all string/bytes fields in both proto files, deprecated prompt_text/response_text, and documented Wasm inline transfer limits**

## What Happened

Added `buf.build/bufbuild/protovalidate` as a dependency and imported `buf/validate/validate.proto` in both `evidence.proto` and `policy_distribution.proto`. Applied validation annotations to every string and bytes field:

- **ID fields** (kernel_id, bundle_id, policy_id, org_id): `min_len = 1, max_len = 255`
- **Name/description fields** (vendor, model, department, name): `max_len = 500`
- **Error messages**: `max_len = 10000`
- **JSON blobs** (policy_rules_json): `max_len = 65536` (64KB)
- **Text fields** (prompt_text, response_text, rego_source): `max_len = 1048576` (1MB)
- **Hash fields** (chain_hash, previous_hash): `max_bytes = 64`
- **Signatures**: `max_bytes = 128`
- **Payload/Wasm bytes**: `max_bytes = 16777216` (16MB matching gRPC default)
- **Repeated string items** (removed_policy_ids, vendor_ids): `items.string.max_len = 255`

Added `deprecated = true` proto annotation plus `// DEPRECATED:` comment to `prompt_text` and `response_text` fields in `EvidenceBundle`.

Added Wasm inline transfer documentation comment to `wasm_bytes` in `PolicyEntry`.

Vendored `buf/validate/validate.proto` into `proto/third_party/` because `tonic_prost_build` calls `protoc` directly and cannot resolve buf BSR dependencies. Updated all three `build.rs` files (kernel, evidence-collector, interdict-verify) to include `proto/third_party/` in the protoc include path. Excluded `proto/third_party` from the buf module in `buf.yaml` to prevent duplicate symbol errors.

Added `#[allow(deprecated)]` annotations to the four Rust sites that intentionally access the deprecated fields for backward compatibility.

## Verification

- `buf lint` — PASS (0 errors)
- `buf build` — PASS
- `cargo build -p kernel -p evidence-collector -p interdict-verify` — PASS (0 warnings)
- `cargo test -p kernel -p evidence-collector -p interdict-verify` — PASS (527 tests, 0 failures)
- `grep "deprecated\|DEPRECATED" evidence.proto` — 4 matches (PASS)
- `grep "validate" evidence.proto` — 23 matches (PASS)
- `grep "validate" policy_distribution.proto` — 26 matches (PASS)

### Slice-level verification (T01-applicable checks):
- ✅ `buf lint` passes with validation annotations
- ✅ `grep "deprecated\|DEPRECATED" proto/interdict/evidence/v1/evidence.proto` returns ≥1
- ✅ `grep "validate" proto/interdict/evidence/v1/evidence.proto` returns ≥1
- ⏳ `grep "3650" docker/kernel/entrypoint.sh` returns 0 — NOT YET (T02 scope)
- ⏳ `grep "365" docker/kernel/entrypoint.sh` returns ≥1 — NOT YET (T02 scope)
- ⏳ `grep "cert.*rotat\|rotat.*cert" docs/operator/guide.md` — NOT YET (T02 scope)
- ⏳ `grep "v1.6" .gsd/PROJECT.md` — already 1 match but T03 may add more
- ⏳ All 28 findings verified — T03 scope

## Diagnostics

- `buf lint` reports annotation constraint violations at CI time
- Rust compiler warns on any new usage of deprecated `prompt_text`/`response_text` fields (unless explicitly `#[allow(deprecated)]`)
- Proto files are self-documenting with field-level comments on every field

## Deviations

- **Vendored protovalidate proto:** Not in original task plan. Required because `tonic_prost_build` uses `protoc` directly and cannot resolve buf BSR dependencies. Added `proto/third_party/` with the exported proto and updated three `build.rs` files.
- **Updated `buf.yaml` with excludes:** Added `excludes: [proto/third_party]` to prevent duplicate symbol errors in buf lint/build.
- **Added `#[allow(deprecated)]` annotations:** Suppressed expected deprecation warnings at 4 call sites (2 production, 2 test) that intentionally use the deprecated fields for backward compatibility.

## Known Issues

None.

## Files Created/Modified

- `proto/interdict/evidence/v1/evidence.proto` — Added buf.validate annotations, deprecation markers, field documentation
- `proto/interdict/policy/v1/policy_distribution.proto` — Added buf.validate annotations, Wasm transfer documentation
- `buf.yaml` — Added protovalidate dependency and third_party excludes
- `buf.lock` — Auto-generated by `buf dep update`
- `proto/third_party/buf/validate/validate.proto` — Vendored protovalidate proto for protoc compatibility
- `crates/kernel/build.rs` — Added `proto/third_party/` to protoc include path
- `crates/evidence-collector/build.rs` — Added `proto/third_party/` to protoc include path
- `crates/interdict-verify/build.rs` — Added `proto/third_party/` to protoc include path
- `crates/kernel/src/evidence/bundle.rs` — Added `#[allow(deprecated)]` on backward-compat field accesses
- `crates/evidence-collector/src/grpc/service.rs` — Added `#[allow(deprecated)]` on backward-compat field accesses
- `crates/evidence-collector/tests/integration_test.rs` — Added `#[allow(deprecated)]` on test function
- `.gsd/milestones/M008/slices/S08/S08-PLAN.md` — Added Observability/Diagnostics section, diagnostic verification check
