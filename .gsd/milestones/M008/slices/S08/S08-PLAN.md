# S08: Proto Safety, Config Hygiene & Documentation

**Goal:** Add proto validation annotations, reduce CA validity, document cert rotation, update all tracking docs, and verify all 28 findings are addressed.
**Demo:** `buf lint` passes with validation annotations. Kernel entrypoint generates 1-year CA. Operator guide covers cert rotation. PROJECT.md reflects v1.6. All 28 assessment findings are addressed.

## Must-Haves

- buf validate annotations on string/bytes fields in both proto files
- Kernel entrypoint CA validity reduced from 3650 days (10 years) to 365 days (1 year)
- Cert expiry monitoring: startup warning when certs expire within 30 days
- prompt_text/response_text fields have deprecation notice in proto comments
- Wasm module inline transfer documented with size limit guidance
- Cert rotation procedure documented in operator guide
- PROJECT.md, STATE.md, DECISIONS.md updated to v1.6
- All 28 assessment findings verified as addressed

## Verification

- `buf lint` passes with validation annotations
- `grep "3650" docker/kernel/entrypoint.sh` returns 0 (no 10-year validity)
- `grep "365" docker/kernel/entrypoint.sh` returns ≥1 (1-year validity)
- `grep "deprecated\|DEPRECATED" proto/interdict/evidence/v1/evidence.proto` returns ≥1
- `grep "validate" proto/interdict/evidence/v1/evidence.proto` returns ≥1
- `grep "cert.*rotat\|rotat.*cert" docs/operator/guide.md` returns ≥1
- `grep "v1.6" .gsd/PROJECT.md` returns ≥1
- All 28 findings from final_assessment.md have corresponding fixes verified
- `grep "WARNING.*expires\|expires.*WARNING" docker/certs/generate-internal-ca.sh` returns ≥1 (cert expiry monitoring present)
- `bash -n docker/certs/generate-internal-ca.sh` exits 0 (shell syntax valid — failure-path check)

## Tasks

- [x] **T01: Add proto validation annotations and field documentation** `est:30m`
  - Why: L-08, L-10, L-11 — Proto fields lack validation; prompt_text/response_text need deprecation notice; Wasm inline transfer needs documentation.
  - Files: `proto/interdict/evidence/v1/evidence.proto`, `proto/interdict/policy/v1/policy_distribution.proto`, `buf.yaml`
  - Do: Add `import "buf/validate/validate.proto"` to both proto files. Add buf.build/bufbuild/protovalidate as a dependency in `buf.yaml`. Add validation annotations: `string kernel_id = 2 [(buf.validate.field).string.min_len = 1, (buf.validate.field).string.max_len = 255]` pattern for ID fields. Add `max_len` to all string fields (generous limits: IDs → 255, descriptions → 10000, vendor names → 500). Add `max_bytes` to `bytes wasm_bytes` field (16MB matching gRPC max message size). Add deprecation comments to `prompt_text` and `response_text`: `// DEPRECATED: Use content_hash for privacy. Only populated when full_text_storage is enabled. Will be removed in v2.0.` Add Wasm transfer documentation comment on `wasm_bytes`: `// Transferred inline in gRPC stream. Maximum size bounded by gRPC max message size (default 16MB). For modules >1MB, consider pre-deploying to shared storage.`
  - Verify: `buf lint` passes. `buf build` succeeds. `cargo build -p kernel -p evidence-collector` succeeds (proto regeneration).
  - Done when: Proto fields have validation annotations and deprecation notices.

- [x] **T02: Reduce CA validity and add cert expiry monitoring** `est:30m`
  - Why: L-09, M-08 — 10-year CA validity is excessive. No cert expiry monitoring exists.
  - Files: `docker/kernel/entrypoint.sh`, `docker/certs/generate-internal-ca.sh`, `docs/operator/guide.md`
  - Do: **entrypoint.sh (L-09):** Change `-days 3650` to `-days 365` in the auto-CA generation command. Add a comment: `# 1-year validity — rotate before expiry. See docs/operator/guide.md for rotation procedure.` **generate-internal-ca.sh (M-08):** After cert generation, add an `openssl x509 -enddate -noout` check that logs a warning if cert expires within 30 days. Format: `echo "[certs] WARNING: Certificate expires in N days. See docs/operator/guide.md for rotation."` **Operator guide:** Add a "Certificate Rotation" section covering: (1) How to check cert expiry: `openssl x509 -enddate -noout -in /certs/ca.pem`. (2) How to regenerate: delete cert files + restart cert-init (compose) or delete PVC + run cert-init job (k8s). (3) Grace period: services continue working until cert expires, but mTLS handshakes will fail after expiry. (4) Monitoring: recommend external cert monitoring (e.g., Prometheus blackbox_exporter) for production.
  - Verify: `grep "3650" docker/kernel/entrypoint.sh` returns 0. `grep "365" docker/kernel/entrypoint.sh` returns ≥1. `grep "rotation" docs/operator/guide.md` returns ≥1.
  - Done when: CA validity is 1 year and rotation procedure is documented.

- [x] **T03: Update project tracking and verify all findings addressed** `est:30m`
  - Why: Final milestone documentation and verification that all 28 assessment findings are closed.
  - Files: `.gsd/PROJECT.md`, `.gsd/STATE.md`, `.gsd/DECISIONS.md`, `README.md`
  - Do: **DECISIONS.md:** Append new decisions made during M008 (rate limiter design, network segmentation, proto validation, CA validity, etc.). **PROJECT.md:** Add M008 completion entry to Context section. Add v1.6 Assessment Remediation section to Requirements listing all AR-* requirements as validated. **STATE.md:** Mark M008 complete. Update requirement counts. **README.md:** Update version to v1.6. **Finding verification:** Walk through all 28 findings from final_assessment.md and verify each has a corresponding fix in a completed slice. Document any finding that was intentionally deferred with rationale.
  - Verify: `grep "v1.6" .gsd/PROJECT.md` returns ≥1. `grep "M008" .gsd/STATE.md` shows complete.
  - Done when: All tracking docs reflect v1.6 and all 28 findings are verified as addressed.

## Observability / Diagnostics

- **Cert expiry monitoring:** `generate-internal-ca.sh` emits `[certs] WARNING: Certificate expires in N days` to stderr when certs are ≤30 days from expiry. Operators can grep container logs for `[certs] WARNING` to detect impending expiry.
- **Proto validation errors:** protovalidate annotations produce structured `FieldViolation` errors at deserialization boundaries. Callers see field-level constraint violations in gRPC status details.
- **Deprecation signals:** `prompt_text` / `response_text` carry proto-level deprecation markers, surfaced by `buf lint` deprecation rules and IDE warnings.
- **Failure visibility:** If `buf lint` or `buf build` fails after proto changes, CI output shows the exact field/rule that violated the annotation contract.
- **Diagnostic command:** `openssl x509 -enddate -noout -in /certs/ca.pem` — verifiable by operators to confirm cert validity period.

## Files Likely Touched

- `proto/interdict/evidence/v1/evidence.proto`
- `proto/interdict/policy/v1/policy_distribution.proto`
- `buf.yaml`
- `docker/kernel/entrypoint.sh`
- `docker/certs/generate-internal-ca.sh`
- `docs/operator/guide.md`
- `.gsd/PROJECT.md`
- `.gsd/STATE.md`
- `.gsd/DECISIONS.md`
- `README.md`
