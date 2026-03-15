# S08: Proto Safety, Config Hygiene & Documentation — UAT

**Milestone:** M008
**Written:** 2026-03-15

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All changes are proto annotations, shell script constants, documentation files, and tracking docs — verifiable by grep, lint, and syntax checks without live runtime.

## Preconditions

- Repository cloned with all S01–S07 changes present
- `buf` CLI installed (for proto lint/build)
- `openssl` available (for cert script verification)
- `bash` available (for shell syntax checks)

## Smoke Test

Run `buf lint && grep -c "validate" proto/interdict/evidence/v1/evidence.proto` — should return 0 errors and ≥20 matches, confirming proto annotations are valid.

## Test Cases

### 1. Proto validation annotations present on evidence.proto

1. Run `grep -c "validate" proto/interdict/evidence/v1/evidence.proto`
2. **Expected:** Count ≥20 (23 matches: annotations on all string/bytes fields)

### 2. Proto validation annotations present on policy_distribution.proto

1. Run `grep -c "validate" proto/interdict/policy/v1/policy_distribution.proto`
2. **Expected:** Count ≥20 (26 matches)

### 3. buf lint passes with annotations

1. Run `buf lint`
2. **Expected:** Exit 0, no errors

### 4. buf build succeeds

1. Run `buf build`
2. **Expected:** Exit 0

### 5. prompt_text/response_text deprecated

1. Run `grep "deprecated\|DEPRECATED" proto/interdict/evidence/v1/evidence.proto`
2. **Expected:** ≥4 matches showing both proto-level `deprecated = true` and `// DEPRECATED:` comments on prompt_text and response_text fields

### 6. Wasm transfer documented

1. Run `grep -A2 "wasm_bytes" proto/interdict/policy/v1/policy_distribution.proto`
2. **Expected:** Comment mentioning inline gRPC transfer, 16MB max, and shared storage guidance for >1MB modules

### 7. CA validity reduced in entrypoint.sh

1. Run `grep "3650" docker/kernel/entrypoint.sh`
2. **Expected:** 0 matches (no 10-year validity)
3. Run `grep "365" docker/kernel/entrypoint.sh`
4. **Expected:** ≥1 match (1-year validity)

### 8. CA validity reduced in generate-internal-ca.sh

1. Run `grep "3650" docker/certs/generate-internal-ca.sh`
2. **Expected:** 0 matches
3. Run `grep "365" docker/certs/generate-internal-ca.sh`
4. **Expected:** ≥1 match

### 9. Cert expiry monitoring present

1. Run `grep "WARNING.*expires\|expires.*WARNING" docker/certs/generate-internal-ca.sh`
2. **Expected:** ≥1 match showing structured warning format

### 10. Shell scripts syntactically valid

1. Run `bash -n docker/certs/generate-internal-ca.sh`
2. Run `bash -n docker/kernel/entrypoint.sh`
3. **Expected:** Both exit 0

### 11. Certificate rotation documented in operator guide

1. Run `grep -c "cert.*rotat\|rotat.*cert" docs/operator/guide.md`
2. **Expected:** ≥5 matches covering rotation procedures

### 12. Operator guide covers Docker Compose and Kubernetes rotation

1. Run `grep -i "docker compose\|kubernetes\|kubectl" docs/operator/guide.md | grep -i "cert\|rotat\|pvc"`
2. **Expected:** Matches showing both deployment models covered

### 13. PROJECT.md reflects v1.6

1. Run `grep -c "v1.6" .gsd/PROJECT.md`
2. **Expected:** ≥1 match

### 14. STATE.md shows M008 complete

1. Run `grep "M008" .gsd/STATE.md`
2. **Expected:** Shows ✅ status for M008

### 15. README.md shows v1.6

1. Run `grep "v1.6" README.md`
2. **Expected:** ≥1 match showing current version

### 16. Rust crates build with proto changes

1. Run `cargo build -p kernel -p evidence-collector -p interdict-verify`
2. **Expected:** Exit 0 with 0 warnings (deprecation warnings suppressed by #[allow(deprecated)])

### 17. Rust tests pass with proto changes

1. Run `cargo test -p kernel -p evidence-collector -p interdict-verify`
2. **Expected:** All tests pass (527 expected)

## Edge Cases

### Vendored protovalidate compatibility

1. Run `ls proto/third_party/buf/validate/validate.proto`
2. **Expected:** File exists (vendored for protoc compatibility)
3. Run `grep "excludes" buf.yaml`
4. **Expected:** `proto/third_party` listed in excludes (prevents duplicate symbols)

### Deprecated field compiler warnings

1. Run `cargo build -p kernel 2>&1 | grep -i "deprecated"`
2. **Expected:** 0 warnings (all deprecated field accesses have #[allow(deprecated)])

### Cert expiry warning format is grep-able

1. Run `grep '\[certs\] WARNING' docker/certs/generate-internal-ca.sh`
2. **Expected:** ≥1 match confirming structured log format for operator log monitoring

## Failure Signals

- `buf lint` returns non-zero → proto annotation syntax errors
- `cargo build -p kernel` fails → proto changes broke code generation or #[allow(deprecated)] missing
- `grep "3650"` returns matches → CA validity not reduced
- Shell syntax check (`bash -n`) fails → cert script has syntax errors
- `grep "v1.6" .gsd/PROJECT.md` returns 0 → tracking docs not updated

## Requirements Proved By This UAT

- AR-PROTO-01 — Tests 1–6 prove proto validation annotations, deprecation markers, and Wasm documentation
- AR-CERT-01 — Tests 7–12 prove CA validity reduction, expiry monitoring, and rotation documentation

## Not Proven By This UAT

- Runtime enforcement of proto validation annotations (declarative only — requires protovalidate runtime library)
- Actual cert rotation in a live cluster (documented procedure only — requires operator execution)
- Continuous cert expiry monitoring (startup check only — production should add Prometheus blackbox_exporter)

## Notes for Tester

- Test cases 16–17 (Rust build/test) require the full Rust toolchain and may take several minutes. These can be skipped if CI has already passed.
- The vendored `proto/third_party/buf/validate/validate.proto` is intentionally duplicated from the buf BSR — this is required because `tonic_prost_build` invokes `protoc` directly.
- All 28 assessment findings were verified in T03 — the finding-to-slice mapping is in STATE.md for traceability.
