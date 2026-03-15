---
id: T02
parent: S08
milestone: M008
provides:
  - CA validity reduced from 10 years to 1 year in both entrypoint.sh and generate-internal-ca.sh
  - Cert expiry monitoring in generate-internal-ca.sh (warns at ≤30 days)
  - Certificate rotation procedure documented in operator guide
key_files:
  - docker/kernel/entrypoint.sh
  - docker/certs/generate-internal-ca.sh
  - docs/operator/guide.md
key_decisions:
  - 30-day warning threshold for cert expiry monitoring (balances early warning vs noise)
  - Cert expiry check iterates all non-key .pem files in cert dir for comprehensive coverage
patterns_established:
  - Cert scripts emit structured warnings to stderr with "[certs] WARNING:" prefix for log grep-ability
  - Rotation procedures documented for both Docker Compose and Kubernetes deployment models
observability_surfaces:
  - "[certs] WARNING: Certificate expires in N days" emitted to stderr at cert-init startup
  - Operators grep container logs for "[certs] WARNING" to detect impending expiry
  - Diagnostic command: openssl x509 -enddate -noout -in /certs/internal-ca.pem
duration: 20m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T02: Reduce CA validity and add cert expiry monitoring

**Reduced CA validity from 10 years to 1 year in both cert generation scripts, added 30-day expiry warning to cert-init, and documented certificate rotation procedure in operator guide**

## What Happened

Three changes across three files:

1. **entrypoint.sh (L-09):** Changed `-days 3650` to `-days 365` in the kernel's auto-CA generation. Added a comment pointing to the operator guide for rotation procedure.

2. **generate-internal-ca.sh (M-08):** Changed internal CA validity from `-days 3650` to `-days 365`. Added a new section (§7 Certificate expiry monitoring) that iterates all non-key `.pem` files in the cert directory after generation, reads each certificate's `notAfter` date via `openssl x509 -enddate`, and emits a structured warning to stderr if any cert expires within 30 days or has already expired. The warning format is `[certs] WARNING: Certificate expires in N days (<path>)` for grep-ability.

3. **docs/operator/guide.md:** Added a comprehensive "Certificate Rotation" section under Certificate Management covering: how to check cert expiry (openssl commands), the automated 30-day warning, step-by-step rotation for Docker Compose and Kubernetes, grace period and impact description, and production monitoring recommendations (Prometheus blackbox_exporter, cert-manager, custom CronJob).

## Verification

- `grep "3650" docker/kernel/entrypoint.sh` → 0 matches (PASS)
- `grep "365" docker/kernel/entrypoint.sh` → 1 match (PASS)
- `grep "3650" docker/certs/generate-internal-ca.sh` → 0 matches (PASS)
- `grep "365" docker/certs/generate-internal-ca.sh` → 2 matches (PASS)
- `grep "cert.*rotat\|rotat.*cert" docs/operator/guide.md` → 8 matches (PASS)
- `grep "WARNING.*expires\|expires.*WARNING" docker/certs/generate-internal-ca.sh` → 1 match (PASS)
- `bash -n docker/certs/generate-internal-ca.sh` → exit 0 (PASS)
- `bash -n docker/kernel/entrypoint.sh` → exit 0 (PASS)

### Slice-level verification (T02-applicable checks):
- ✅ `grep "3650" docker/kernel/entrypoint.sh` returns 0 (no 10-year validity)
- ✅ `grep "365" docker/kernel/entrypoint.sh` returns ≥1 (1-year validity)
- ✅ `grep "cert.*rotat\|rotat.*cert" docs/operator/guide.md` returns ≥1
- ✅ `grep "WARNING.*expires\|expires.*WARNING" docker/certs/generate-internal-ca.sh` returns ≥1
- ✅ `bash -n docker/certs/generate-internal-ca.sh` exits 0 (syntax valid)
- ✅ `buf lint` passes (from T01, unchanged)
- ✅ `grep "deprecated\|DEPRECATED" proto/interdict/evidence/v1/evidence.proto` returns ≥1 (from T01)
- ✅ `grep "validate" proto/interdict/evidence/v1/evidence.proto` returns ≥1 (from T01)
- ⏳ `grep "v1.6" .gsd/PROJECT.md` — already 1 match, T03 may update further
- ⏳ All 28 findings verified — T03 scope

## Diagnostics

- **Cert expiry warning:** `generate-internal-ca.sh` emits `[certs] WARNING: Certificate expires in N days` to stderr when certs are ≤30 days from expiry. Grep container logs for `[certs] WARNING`.
- **Manual check:** `openssl x509 -enddate -noout -in /certs/internal-ca.pem` shows cert validity.
- **Expired cert:** `[certs] WARNING: Certificate <path> has EXPIRED` emitted when cert is past expiry.

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `docker/kernel/entrypoint.sh` — Changed `-days 3650` to `-days 365`, added rotation comment
- `docker/certs/generate-internal-ca.sh` — Changed CA validity to 365 days, added §7 cert expiry monitoring
- `docs/operator/guide.md` — Added Certificate Rotation section with Docker Compose/K8s procedures
- `.gsd/milestones/M008/slices/S08/S08-PLAN.md` — Marked T02 done, added diagnostic verification check
