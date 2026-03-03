---
phase: 12-kubernetes-deployment
verified: 2026-03-03T22:45:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
---

# Phase 12: Kubernetes Deployment Verification Report

**Phase Goal:** Operator can deploy Interdict on Kubernetes via Helm chart or as a sidecar, and onboard client machines to trust the proxy CA
**Verified:** 2026-03-03T22:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                       | Status     | Evidence                                                                                                  |
|----|-------------------------------------------------------------------------------------------------------------|------------|-----------------------------------------------------------------------------------------------------------|
| 1  | Operator can run helm install and deploy the full Interdict stack on Kubernetes                             | VERIFIED   | helm/interdict/Chart.yaml, values.yaml, 20 template files; all four services have Deployment + Service templates |
| 2  | All four Interdict services deploy as Kubernetes Deployments with correct env vars                          | VERIFIED   | control-plane/deployment.yaml, kernel/deployment.yaml, evidence-collector/deployment.yaml, dashboard/deployment.yaml all contain kind: Deployment with envFrom ConfigMap |
| 3  | Certificate bootstrap runs as pre-install Helm hook before services start                                   | VERIFIED   | cert-init-job.yaml has annotations helm.sh/hook: pre-install,pre-upgrade at weight -5; configmap-cert-script.yaml is at weight -10 |
| 4  | Infrastructure dependencies (PostgreSQL, ClickHouse, MinIO) available via conditional Bitnami subcharts    | VERIFIED   | Chart.yaml declares all three bitnami dependencies with condition: postgresql.enabled, clickhouse.enabled, minio.enabled |
| 5  | All containers have resource requests/limits and security contexts                                          | VERIFIED   | Every Deployment template includes resources: (from .Values.{service}.resources) and securityContext with runAsNonRoot: true, allowPrivilegeEscalation: false |
| 6  | Operator can deploy the kernel as a sidecar container in an application pod                                 | VERIFIED   | _sidecar-container.tpl defines interdict.sidecar.container with restartPolicy: Always; example-app.yaml demonstrates injection |
| 7  | Sidecar uses KEP-753 native sidecar pattern (initContainer with restartPolicy: Always)                      | VERIFIED   | _sidecar-container.tpl line 24: restartPolicy: Always  # KEP-753 native sidecar -- runs for pod lifetime |
| 8  | Traffic redirect init container routes AI vendor traffic through kernel proxy                               | VERIFIED   | _sidecar-init.tpl defines interdict.sidecar.iptablesInit with iptables NAT redirect rules for configurable vendor hosts |
| 9  | Operator can choose between iptables redirect and HTTP_PROXY mode                                           | VERIFIED   | example-app.yaml conditionally includes iptablesInit when sidecar.trafficRedirect.enabled; HTTP_PROXY env vars added when disabled |
| 10 | Pilot and enterprise overlay files customize resource sizing and replica counts                             | VERIFIED   | values-pilot.yaml (83 lines) sets 1 replica/small resources, enables all infra subcharts; values-enterprise.yaml (121 lines) sets 3 kernel / 2 CP replicas, disables subcharts for BYO infra |
| 11 | Operator can install Interdict CA certificate on macOS using the shell script                               | VERIFIED   | install-ca-trust.sh handles Darwin via security add-trusted-cert; syntax validated with bash -n |
| 12 | Operator can install Interdict CA certificate on Linux (Debian/Ubuntu and RHEL/CentOS) using the shell script | VERIFIED | install-ca-trust.sh detects update-ca-certificates (Debian) vs update-ca-trust (RHEL) and applies appropriate installation |
| 13 | Operator can install Interdict CA certificate on Windows using the PowerShell script                        | VERIFIED   | install-ca-trust.ps1 uses Import-Certificate to Cert:\LocalMachine\Root with #Requires -RunAsAdministrator |

**Score:** 13/13 truths verified

---

## Required Artifacts

### Plan 12-01 Artifacts (DEPLOY-03)

| Artifact                                                         | Expected                                                | Status     | Details                                                                           |
|------------------------------------------------------------------|---------------------------------------------------------|------------|-----------------------------------------------------------------------------------|
| `helm/interdict/Chart.yaml`                                      | Chart metadata with subchart dependencies               | VERIFIED   | Contains apiVersion: v2, 3 Bitnami dependencies with condition: fields            |
| `helm/interdict/values.yaml`                                     | All configurable values (min 150 lines)                 | VERIFIED   | 318 lines, covers all env.example variables with resource limits and existingSecret pattern |
| `helm/interdict/templates/_helpers.tpl`                          | Common template helpers for labels, names, selectors    | VERIFIED   | Contains interdict.fullname, interdict.labels, interdict.selectorLabels, interdict.image helpers |
| `helm/interdict/templates/control-plane/deployment.yaml`        | Control plane Deployment with env from ConfigMap/Secret | VERIFIED   | kind: Deployment, envFrom ConfigMap, readiness/liveness probes, security context  |
| `helm/interdict/templates/kernel/deployment.yaml`               | Kernel Deployment with cert volume mounts               | VERIFIED   | kind: Deployment, cert PVC volume mount, TCP socket probes, security context      |
| `helm/interdict/templates/evidence-collector/deployment.yaml`   | Evidence collector Deployment                           | VERIFIED   | 137 lines, kind: Deployment, clickhouse init container                            |
| `helm/interdict/templates/dashboard/deployment.yaml`            | Dashboard Deployment with ingress                       | VERIFIED   | 78 lines, kind: Deployment; ingress.yaml is separate 42-line conditional template |
| `helm/interdict/templates/cert-init-job.yaml`                   | Pre-install hook Job for cert generation                | VERIFIED   | Helm hook annotations at weight -5, mounts cert-script ConfigMap, writes to PVC  |
| `helm/interdict/templates/configmap-cert-script.yaml`           | ConfigMap embedding generate-internal-ca.sh             | VERIFIED   | Hook weight -10, embeds complete cert generation script                           |

### Plan 12-02 Artifacts (DEPLOY-04)

| Artifact                                                         | Expected                                                | Status     | Details                                                                           |
|------------------------------------------------------------------|---------------------------------------------------------|------------|-----------------------------------------------------------------------------------|
| `helm/interdict/templates/sidecar/_sidecar-container.tpl`       | Reusable sidecar container snippet (contains restartPolicy: Always) | VERIFIED | restartPolicy: Always on line 24, all KERNEL_* env vars from values, resource limits |
| `helm/interdict/templates/sidecar/_sidecar-init.tpl`            | iptables init container (contains NET_ADMIN)            | VERIFIED   | securityContext.capabilities.add: ["NET_ADMIN"], iptables NAT redirect rules      |
| `helm/interdict/templates/sidecar/example-app.yaml`             | Example Deployment showing sidecar injection (contains interdict-kernel) | VERIFIED | _sidecar-container.tpl is named interdict-kernel (line 21), included via template call |
| `helm/interdict/values-pilot.yaml`                              | Pilot deployment overlay (min 20 lines)                 | VERIFIED   | 83 lines, all 4 services with small resources, all infra subcharts enabled        |
| `helm/interdict/values-enterprise.yaml`                         | Enterprise deployment overlay (min 20 lines)            | VERIFIED   | 121 lines, HA replicas, ingress with TLS, infra subcharts disabled                |

### Plan 12-03 Artifacts (DEPLOY-05)

| Artifact                               | Expected                                                | Status     | Details                                                                           |
|----------------------------------------|---------------------------------------------------------|------------|-----------------------------------------------------------------------------------|
| `scripts/install-ca-trust.sh`          | macOS and Linux CA installer (contains security add-trusted-cert, min 40 lines) | VERIFIED | 222 lines, security add-trusted-cert present, Debian + RHEL support, bash -n passes |
| `scripts/install-ca-trust.ps1`         | Windows CA installer (contains Import-Certificate, min 20 lines) | VERIFIED | 107 lines, Import-Certificate to Cert:\LocalMachine\Root, #Requires -RunAsAdministrator |

---

## Key Link Verification

### Plan 12-01 Key Links

| From                                                     | To                                           | Via                                                     | Status  | Details                                                             |
|----------------------------------------------------------|----------------------------------------------|---------------------------------------------------------|---------|---------------------------------------------------------------------|
| `helm/interdict/templates/cert-init-job.yaml`            | `helm/interdict/templates/configmap-cert-script.yaml` | ConfigMap volume mount for generate-internal-ca.sh | WIRED   | cert-init-job.yaml mounts volume named cert-script from configMap {{ include "interdict.fullname" . }}-cert-script |
| `helm/interdict/templates/control-plane/deployment.yaml` | `helm/interdict/values.yaml`                 | Values references for image, env, resources (.Values.controlPlane) | WIRED | Uses .Values.controlPlane.replicaCount, .Values.controlPlane.image, .Values.controlPlane.resources |
| `helm/interdict/Chart.yaml`                              | `helm/interdict/values.yaml`                 | Subchart conditions                                     | WIRED   | Chart.yaml condition: postgresql.enabled matches values.yaml postgresql.enabled: true |

### Plan 12-02 Key Links

| From                                                          | To                              | Via                                           | Status | Details                                                                      |
|---------------------------------------------------------------|---------------------------------|-----------------------------------------------|--------|------------------------------------------------------------------------------|
| `helm/interdict/templates/sidecar/_sidecar-container.tpl`    | `helm/interdict/values.yaml`    | Values references for kernel image, env, resources (.Values.kernel) | WIRED | Uses .Values.kernel.image, .Values.kernel.listenAddr, .Values.kernel.mtls, .Values.sidecar.resources |
| `helm/interdict/templates/sidecar/_sidecar-init.tpl`         | `helm/interdict/values.yaml`    | Values for sidecar.trafficRedirect settings (.Values.sidecar) | WIRED | Uses .Values.sidecar.trafficRedirect.enabled, .Values.sidecar.trafficRedirect.targetHosts, .Values.sidecar.allowlistVendors |

### Plan 12-03 Key Links

| From                              | To                                       | Via                                              | Status | Details                                                                             |
|-----------------------------------|------------------------------------------|--------------------------------------------------|--------|-------------------------------------------------------------------------------------|
| `scripts/install-ca-trust.sh`     | `docker/certs/generate-internal-ca.sh`   | Installs the CA cert generated by cert-init      | WIRED  | Shell script installs the proxy CA cert (produced by generate-internal-ca.sh); conceptual link — the script header comment explains the relationship explicitly |

---

## Requirements Coverage

| Requirement | Source Plan | Description                                                                      | Status    | Evidence                                                                                    |
|-------------|-------------|----------------------------------------------------------------------------------|-----------|----------------------------------------------------------------------------------------------|
| DEPLOY-03   | 12-01       | Operator can deploy full stack on Kubernetes using a Helm chart with configurable values | SATISFIED | Complete Helm chart at helm/interdict/ with Chart.yaml, values.yaml (318 lines), 20 templates, values-pilot.yaml, values-enterprise.yaml |
| DEPLOY-04   | 12-02       | Operator can deploy the kernel as a sidecar container alongside AI application pods | SATISFIED | _sidecar-container.tpl (KEP-753 pattern), _sidecar-init.tpl (iptables/HTTP_PROXY dual mode), example-app.yaml demonstrating injection |
| DEPLOY-05   | 12-03       | Operator can onboard client machines to trust the Interdict CA certificate       | SATISFIED | install-ca-trust.sh (macOS + Debian + RHEL, 222 lines), install-ca-trust.ps1 (Windows, 107 lines); both validate prerequisites and support --remove/-Remove |

No orphaned requirements: all Phase 12 requirements from REQUIREMENTS.md (DEPLOY-03, DEPLOY-04, DEPLOY-05) are claimed by plans and verified as satisfied.

---

## Anti-Patterns Found

No anti-patterns detected. Scanned all phase 12 files including helm templates, values files, and scripts for:
- TODO/FIXME/PLACEHOLDER comments
- Empty implementations (return null, stub functions)
- Console.log-only handlers
- Hardcoded secrets or real passwords in values.yaml

Result: Clean. Values.yaml correctly uses empty strings with existingSecret pattern for all sensitive fields. No real passwords committed.

---

## Human Verification Required

### 1. Helm Template Rendering

**Test:** Run `helm template interdict ./helm/interdict/` (requires Helm CLI) on a machine with Helm installed
**Expected:** All Kubernetes manifests render without errors for all four services, cert-init Job, minio-init Job, and PVC
**Why human:** Helm CLI not available in this environment; YAML syntax is valid but template rendering requires the Helm binary

### 2. Helm Lint with Overlay Files

**Test:** Run `helm lint helm/interdict/ -f helm/interdict/values-pilot.yaml` and `helm lint helm/interdict/ -f helm/interdict/values-enterprise.yaml`
**Expected:** Both pass with no warnings or errors
**Why human:** Helm CLI not available in this environment

### 3. Sidecar Injection in a Real Pod

**Test:** Apply example-app.yaml to a Kubernetes cluster (with `sidecar.exampleApp.enabled=true`) and verify the interdict-kernel init container starts and remains running via KEP-753 semantics
**Expected:** Pod starts, iptables init container exits after setting NAT rules, interdict-kernel sidecar continues running throughout pod lifetime, main nginx container can make requests
**Why human:** Requires a live Kubernetes cluster with KEP-753 support (Kubernetes 1.29+)

### 4. CA Trust Script — macOS

**Test:** On a macOS machine, run `sudo ./scripts/install-ca-trust.sh /path/to/test-ca.pem` with a valid PEM CA cert
**Expected:** Cert appears in macOS System Keychain, browsers trust the cert, colored SUCCESS message printed, `security find-certificate -c "interdict"` succeeds
**Why human:** Requires macOS with sudo access

### 5. CA Trust Script — Windows

**Test:** On a Windows machine, run `.\scripts\install-ca-trust.ps1 -CertPath .\test-ca.pem` as Administrator
**Expected:** Cert appears in certmgr.msc under Trusted Root Certification Authorities, Import-Certificate success message with thumbprint and subject displayed
**Why human:** Requires Windows with Administrator elevation; PowerShell syntax was not linted in this environment

---

## Commits Verified

All commits documented in summaries exist in git history:

| Commit    | Description                                             |
|-----------|---------------------------------------------------------|
| `12a0899` | feat(12-01): Helm chart foundation with values, helpers, and cert bootstrap |
| `595d7d8` | feat(12-01): Service deployment templates for all four Interdict services |
| `e6ac3aa` | feat(12-02): Sidecar injection templates with traffic redirect |
| `4f29d35` | feat(12-02): Pilot and enterprise values overlay files  |
| `ed57f01` | feat(12-03): macOS/Linux CA trust installer script      |
| `eb1eaa2` | feat(12-03): Windows CA trust installer PowerShell script |

---

## Summary

Phase 12 goal is achieved. All three success criteria from the roadmap are met:

1. **`helm install` with pilot/enterprise profiles** — Full Helm chart exists at `helm/interdict/` with 20+ template files, configurable values for all env vars, conditional Bitnami subcharts for PostgreSQL/ClickHouse/MinIO, and two overlay profiles (`values-pilot.yaml`, `values-enterprise.yaml`) for different deployment footprints.

2. **Kernel sidecar deployment** — `_sidecar-container.tpl` implements the KEP-753 native sidecar pattern (initContainer with `restartPolicy: Always`), `_sidecar-init.tpl` provides iptables NAT traffic redirect with `NET_ADMIN` capability, and `example-app.yaml` demonstrates both traffic routing modes (iptables transparent and HTTP_PROXY cooperative).

3. **CA certificate trust scripts** — `scripts/install-ca-trust.sh` handles macOS (security CLI), Debian/Ubuntu (update-ca-certificates), and RHEL/CentOS (update-ca-trust); `scripts/install-ca-trust.ps1` handles Windows via Import-Certificate. Both validate prerequisites before modifying trust stores and support install/remove modes.

All three requirements (DEPLOY-03, DEPLOY-04, DEPLOY-05) are satisfied. Five human verification items remain that require platform-specific CLI tools (Helm, macOS, Windows, live Kubernetes cluster) not available in this environment.

---

_Verified: 2026-03-03T22:45:00Z_
_Verifier: Claude (gsd-verifier)_
