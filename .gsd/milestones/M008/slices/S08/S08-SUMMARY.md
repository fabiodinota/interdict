---
id: S08
parent: M008
milestone: M008
provides:
  - buf.validate annotations on all string/bytes fields in evidence.proto and policy_distribution.proto
  - Deprecation markers on prompt_text/response_text fields with proto-level deprecated=true
  - Wasm inline transfer size documentation on wasm_bytes field
  - CA validity reduced from 10 years to 1 year in entrypoint.sh and generate-internal-ca.sh
  - 30-day cert expiry monitoring in generate-internal-ca.sh
  - Certificate rotation procedure documented in operator guide
  - PROJECT.md, STATE.md, README.md updated to v1.6
  - All 28 assessment findings verified as addressed with zero deferred
requires:
  - slice: S01
    provides: SHA-pinned CI references and Docker image digests
  - slice: S02
    provides: Rate limiting, session cleanup, SAML test suite
  - slice: S03
    provides: CSV sanitization, TypeBox maxLength, body size limits
  - slice: S04
    provides: 3-network Docker Compose, parameterized Grafana, resource limits
  - slice: S05
    provides: Helm cert-init securityContext, read-only sidecar, ServiceAccount
  - slice: S06
    provides: Cross-service integration tests
  - slice: S07
    provides: Dead code removal, cookie security, production error sanitization
affects: []
key_files:
  - proto/interdict/evidence/v1/evidence.proto
  - proto/interdict/policy/v1/policy_distribution.proto
  - buf.yaml
  - proto/third_party/buf/validate/validate.proto
  - docker/kernel/entrypoint.sh
  - docker/certs/generate-internal-ca.sh
  - docs/operator/guide.md
  - .gsd/PROJECT.md
  - .gsd/STATE.md
  - README.md
key_decisions:
  - D058: Vendored buf/validate/validate.proto into proto/third_party/ for protoc compatibility (tonic_prost_build cannot resolve buf BSR deps)
  - D059: CA validity reduced from 10 years to 1 year with 30-day expiry warning (balances security vs operational overhead)
patterns_established:
  - Proto third-party deps vendored under proto/third_party/ with buf.yaml excludes and build.rs include paths
  - Deprecated proto fields use both proto-level deprecated=true and comment-level DEPRECATED notices
  - Cert scripts emit structured warnings to stderr with "[certs] WARNING:" prefix for log grep-ability
  - Rotation procedures documented for both Docker Compose and Kubernetes deployment models
observability_surfaces:
  - Proto-level deprecated=true triggers compiler warnings in Rust consumers and IDE hints
  - buf lint validates all annotation constraints at CI time
  - "[certs] WARNING: Certificate expires in N days" emitted to stderr at cert-init startup
  - Diagnostic command: openssl x509 -enddate -noout -in /certs/internal-ca.pem
drill_down_paths:
  - .gsd/milestones/M008/slices/S08/tasks/T01-SUMMARY.md
  - .gsd/milestones/M008/slices/S08/tasks/T02-SUMMARY.md
  - .gsd/milestones/M008/slices/S08/tasks/T03-SUMMARY.md
duration: 65m
verification_result: passed
completed_at: 2026-03-15
---

# S08: Proto Safety, Config Hygiene & Documentation

**Added buf.validate annotations to all proto fields, reduced CA validity to 1 year with expiry monitoring, documented cert rotation, and verified all 28 assessment findings addressed — closing M008**

## What Happened

Three tasks completing the final slice of M008:

**T01 — Proto validation annotations and field documentation.** Added `buf.build/bufbuild/protovalidate` as a dependency and applied `buf.validate` annotations to every string and bytes field in both `evidence.proto` and `policy_distribution.proto`. ID fields get `min_len=1, max_len=255`, names `max_len=500`, text fields `max_len=1MB`, Wasm bytes `max_bytes=16MB` (matching gRPC default). Marked `prompt_text` and `response_text` as deprecated with both proto-level `deprecated=true` and comment-level notices. Documented Wasm inline transfer with size guidance. Vendored `buf/validate/validate.proto` into `proto/third_party/` because `tonic_prost_build` calls protoc directly and cannot resolve buf BSR dependencies — updated all three `build.rs` files and added buf.yaml excludes.

**T02 — CA validity reduction and cert expiry monitoring.** Changed `-days 3650` to `-days 365` in both `entrypoint.sh` and `generate-internal-ca.sh`. Added a cert expiry monitoring section to `generate-internal-ca.sh` that iterates all `.pem` files after generation and emits structured `[certs] WARNING` to stderr when any cert expires within 30 days. Added a comprehensive "Certificate Rotation" section to the operator guide covering Docker Compose and Kubernetes procedures, grace periods, and production monitoring recommendations.

**T03 — Project tracking and finding verification.** Updated `PROJECT.md` with M008 completion and 11 AR-* validated requirements. Updated `STATE.md` with M008 complete and a 28-finding-to-slice mapping. Updated `README.md` to v1.6. Verified all 28 assessment findings (6 high, 10 medium, 12 low) are addressed across 8 slices with zero deferred.

## Verification

All 10 slice-level verification checks pass:

1. ✅ `buf lint` — 0 errors
2. ✅ `grep "3650" docker/kernel/entrypoint.sh` — 0 matches (no 10-year validity)
3. ✅ `grep "365" docker/kernel/entrypoint.sh` — 1 match (1-year validity)
4. ✅ `grep "deprecated\|DEPRECATED" proto/interdict/evidence/v1/evidence.proto` — 4 matches
5. ✅ `grep "validate" proto/interdict/evidence/v1/evidence.proto` — 23 matches
6. ✅ `grep "cert.*rotat\|rotat.*cert" docs/operator/guide.md` — 5 matches
7. ✅ `grep "v1.6" .gsd/PROJECT.md` — 16 matches
8. ✅ All 28 findings verified as addressed (0 deferred)
9. ✅ `grep "WARNING.*expires\|expires.*WARNING" docker/certs/generate-internal-ca.sh` — 1 match
10. ✅ `bash -n docker/certs/generate-internal-ca.sh` — exit 0 (syntax valid)

Build verification:
- `buf lint` and `buf build` pass
- `cargo build -p kernel -p evidence-collector -p interdict-verify` passes (0 warnings)
- `cargo test -p kernel -p evidence-collector -p interdict-verify` passes (527 tests, 0 failures)

## Requirements Advanced

- none (all requirements validated in this slice)

## Requirements Validated

- AR-PROTO-01 — buf.validate annotations on all proto string/bytes fields, deprecated markers on prompt_text/response_text, Wasm transfer documented. Verified by buf lint pass and grep checks.
- AR-CERT-01 — CA validity reduced to 1 year, 30-day expiry monitoring in cert-init, rotation procedure in operator guide. Verified by grep checks and bash syntax validation.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- **Vendored protovalidate proto (T01):** Not in original plan. Required because `tonic_prost_build` uses protoc directly and cannot resolve buf BSR dependencies. Added `proto/third_party/` with the exported proto, updated three `build.rs` files, and excluded from buf module.
- **Added `#[allow(deprecated)]` annotations (T01):** Suppressed expected deprecation warnings at 4 call sites that intentionally use deprecated fields for backward compatibility.

## Known Limitations

- Proto validation annotations are declarative only — runtime enforcement requires integrating `protovalidate-go` or equivalent library at deserialization boundaries. Current annotations serve as documentation and `buf lint` CI validation.
- Cert expiry check runs only at cert-init startup, not continuously. Production deployments should add external cert monitoring (Prometheus blackbox_exporter, cert-manager) as documented in operator guide.

## Follow-ups

- none — M008 is complete with all 28 findings addressed.

## Files Created/Modified

- `proto/interdict/evidence/v1/evidence.proto` — Added buf.validate annotations, deprecation markers, field documentation
- `proto/interdict/policy/v1/policy_distribution.proto` — Added buf.validate annotations, Wasm transfer documentation
- `buf.yaml` — Added protovalidate dependency and third_party excludes
- `buf.lock` — Auto-generated by buf dep update
- `proto/third_party/buf/validate/validate.proto` — Vendored protovalidate proto for protoc compatibility
- `crates/kernel/build.rs` — Added proto/third_party/ to protoc include path
- `crates/evidence-collector/build.rs` — Added proto/third_party/ to protoc include path
- `crates/interdict-verify/build.rs` — Added proto/third_party/ to protoc include path
- `crates/kernel/src/evidence/bundle.rs` — Added #[allow(deprecated)] on backward-compat field accesses
- `crates/evidence-collector/src/grpc/service.rs` — Added #[allow(deprecated)] on backward-compat field accesses
- `crates/evidence-collector/tests/integration_test.rs` — Added #[allow(deprecated)] on test function
- `docker/kernel/entrypoint.sh` — Changed -days 3650 to -days 365, added rotation comment
- `docker/certs/generate-internal-ca.sh` — Changed CA validity to 365 days, added cert expiry monitoring
- `docs/operator/guide.md` — Added Certificate Rotation section
- `.gsd/PROJECT.md` — Added v1.6 requirements, M008 completion context
- `.gsd/STATE.md` — Marked M008 complete, added finding-to-slice mapping
- `README.md` — Updated to v1.6

## Forward Intelligence

### What the next slice should know
- M008 is the final assessment remediation milestone. All 28 findings from the v1.5 deep assessment are addressed. The project is at v1.6 with 27 validated requirements across 8 milestones.

### What's fragile
- Proto validation is declarative-only — if runtime enforcement is needed later, a protovalidate runtime library must be integrated at gRPC service boundaries. The vendored proto in `proto/third_party/` must stay in sync with the buf BSR version.

### Authoritative diagnostics
- `buf lint` — validates all proto annotation constraints at CI time
- `openssl x509 -enddate -noout -in /certs/internal-ca.pem` — shows cert validity period
- Container logs grep for `[certs] WARNING` — detects impending cert expiry

### What assumptions changed
- Original plan assumed buf BSR deps would work with protoc directly — they don't. Vendoring was required (D058).
