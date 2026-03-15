---
id: T01
parent: S05
milestone: M008
provides:
  - cert-init Job hardened with full securityContext matching standalone deployments
key_files:
  - helm/interdict/templates/cert-init-job.yaml
key_decisions:
  - Used apk --root /tmp/apkroot to install openssl to tmpfs, preserving readOnlyRootFilesystem
  - Added pod-level securityContext (fsGroup, seccompProfile) in addition to container-level
patterns_established:
  - tmpfs emptyDir with Memory medium and sizeLimit for init containers that need temp writable paths
observability_surfaces:
  - helm template interdict helm/interdict --dependency-update | grep -A 50 "kind: Job" shows cert-init security posture
duration: 15m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T01: Harden cert-init Job securityContext

**Added full securityContext and readOnlyRootFilesystem to cert-init Job, matching standalone deployment security posture**

## What Happened

The cert-init Job ran as root with no security restrictions — no `runAsNonRoot`, no capability drops, writable rootfs. This was inconsistent with all 4 deployment templates which already had hardened container security contexts.

Added both pod-level and container-level securityContext:
- **Pod-level:** `fsGroup: 1000`, `seccompProfile: RuntimeDefault`
- **Container-level:** `runAsNonRoot: true`, `runAsUser: 1000`, `runAsGroup: 1000`, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `capabilities: { drop: [ALL] }`

The key challenge was `readOnlyRootFilesystem: true` with `apk add openssl`. Solved by installing openssl to a tmpfs-backed alternate root (`apk --root /tmp/apkroot --initdb`) and prepending that to PATH. The `/tmp` tmpfs (16Mi Memory-backed emptyDir) also serves the openssl temp files (CSR, extension configs) that the cert generation script writes.

## Verification

- `helm template ... | grep -c "runAsNonRoot: true"` → 6 (≥5 ✓)
- `helm template ... | grep "readOnlyRootFilesystem" | grep -c "true"` → 5 (≥5 ✓)
- `helm template ... | grep -c "drop:"` → 5 (≥5 ✓)
- `helm lint helm/interdict` → 0 chart(s) failed ✓
- `bash scripts/quality/infra-check.sh helm/interdict/templates/cert-init-job.yaml` → passed ✓
- cert-init rendered YAML shows all securityContext fields matching kernel/control-plane deployments ✓

## Diagnostics

- Inspect rendered cert-init: `helm template interdict helm/interdict --dependency-update 2>/dev/null | grep -A 50 "kind: Job" | head -60`
- Verify capabilities dropped: `helm template interdict helm/interdict --dependency-update | grep -c "drop:"` should be ≥5

## Deviations

- Used `apk --root /tmp/apkroot` technique instead of switching base image. This preserves the existing `alpine:3.21` image choice while enabling readOnlyRootFilesystem.

## Known Issues

- `bash scripts/quality/infra-check.sh` (full mode, no args) fails on pre-existing Dockerfile lint warnings in `docker/control-plane/Dockerfile` (DL3008, DL4006). This is unrelated to Helm changes and pre-dates this task.

## Files Created/Modified

- `helm/interdict/templates/cert-init-job.yaml` — Added pod-level and container-level securityContext, tmpfs volume for /tmp, modified command to install openssl to tmpfs
- `.gsd/milestones/M008/slices/S05/S05-PLAN.md` — Added Observability/Diagnostics section and failure-path verification check (pre-flight fix)
- `.gsd/milestones/M008/slices/S05/tasks/T01-PLAN.md` — Created missing task plan
