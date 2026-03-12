# Phase 12: Kubernetes Deployment - Research

**Researched:** 2026-03-03
**Domain:** Kubernetes / Helm / Sidecar Proxy / CA Certificate Distribution
**Confidence:** HIGH

## Summary

Phase 12 converts the existing Docker Compose deployment (Phase 8) into production-grade Kubernetes artifacts: a Helm chart for the full stack, a sidecar injection pattern for the kernel proxy, and cross-platform CA trust scripts. The project already has four well-structured Dockerfiles (kernel, control-plane, evidence-collector, dashboard), a cert-init bootstrap script, and a complete docker-compose.yml that maps 1:1 to Kubernetes Deployments/StatefulSets.

The Helm chart should use Bitnami subcharts for PostgreSQL and ClickHouse (or conditions to disable them for BYO infrastructure), define the cert-init as a Kubernetes Job, and expose all current environment variables as values.yaml overrides. The sidecar pattern uses native Kubernetes sidecar containers (KEP-753, GA in K8s 1.33) with `restartPolicy: Always` on init containers, plus iptables-based traffic redirection to route outbound AI API traffic through the kernel proxy. CA trust scripts are straightforward shell/PowerShell wrappers around OS-native certificate stores.

**Primary recommendation:** Build a standard Helm chart at `helm/interdict/` with conditional infrastructure subcharts, a sidecar injection helper template, and a `scripts/` directory for CA trust installers.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEPLOY-03 | Operator can deploy the full Interdict stack on Kubernetes using a Helm chart with configurable values | Helm chart structure with subcharts for infra, values.yaml for all env vars, cert-init Job |
| DEPLOY-04 | Operator can deploy the kernel as a sidecar container alongside AI application pods in Kubernetes | Native sidecar container pattern (KEP-753), iptables init container for traffic redirect, helper templates |
| DEPLOY-05 | Operator can onboard client machines to trust the Interdict CA certificate using platform-specific scripts (macOS, Windows, Linux) | OS-native cert store commands: security (macOS), certutil (Windows), update-ca-certificates (Linux) |
</phase_requirements>

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Helm | v3.x | Chart packaging and deployment | De facto K8s package manager; `helm install` is the requirement |
| Kubernetes | 1.28+ | Container orchestration | Native sidecar support from 1.28 (alpha), GA 1.33 |

### Supporting (Helm subcharts, conditional)
| Chart | Repository | Purpose | When to Use |
|-------|-----------|---------|-------------|
| bitnami/postgresql | oci://registry-1.docker.io/bitnamicharts | PostgreSQL dependency | When operator wants bundled infra (enabled by default for pilot) |
| altinity/clickhouse-operator | https://docs.altinity.com/clickhouse-operator-helm-charts | ClickHouse dependency | When operator wants bundled ClickHouse |
| bitnami/minio | oci://registry-1.docker.io/bitnamicharts | S3-compatible object store | When operator wants bundled MinIO for evidence |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Bitnami subcharts | Raw StatefulSet manifests | Subcharts handle upgrades, backups, HA; raw manifests are simpler but miss best practices |
| Native sidecar (KEP-753) | Regular multi-container pod | Native sidecars have proper lifecycle ordering; regular containers lack startup/shutdown guarantees |
| iptables traffic redirect | HTTP_PROXY env var | iptables is transparent (app-unaware); env var requires app cooperation but is simpler |

**No installation step needed** -- Helm charts are YAML templates, not code dependencies.

## Architecture Patterns

### Recommended Project Structure
```
helm/
  interdict/
    Chart.yaml               # Chart metadata + dependencies
    Chart.lock                # Pinned dependency versions
    values.yaml               # Default values (maps to docker-compose env vars)
    values-pilot.yaml         # Pilot overlay (small resources)
    values-enterprise.yaml    # Enterprise overlay (HA, larger resources)
    templates/
      _helpers.tpl            # Common template helpers (labels, names, selectors)
      NOTES.txt               # Post-install instructions
      namespace.yaml          # Optional namespace creation
      cert-init-job.yaml      # Job: runs generate-internal-ca.sh
      configmap-certs.yaml    # ConfigMap for cert generation script
      secret-tls.yaml         # Secret template for pre-provided certs
      control-plane/
        deployment.yaml
        service.yaml
        configmap.yaml        # Entrypoint env vars
      evidence-collector/
        deployment.yaml
        service.yaml
      kernel/
        deployment.yaml
        service.yaml
        configmap.yaml        # TOML template + env
      dashboard/
        deployment.yaml
        service.yaml
        ingress.yaml          # Optional ingress
      sidecar/
        _sidecar-container.tpl   # Reusable sidecar container snippet
        _sidecar-init.tpl        # iptables init container for traffic redirect
    charts/                   # Downloaded subchart tarballs (gitignored)
scripts/
  install-ca-trust.sh         # macOS + Linux CA installer
  install-ca-trust.ps1        # Windows CA installer
```

### Pattern 1: Docker Compose to Helm Mapping
**What:** Each docker-compose service maps to a Deployment + Service pair; volumes map to PVCs; depends_on maps to init containers or readiness probes.
**When to use:** Always -- this is the primary translation path.

| Docker Compose | Kubernetes |
|----------------|------------|
| `services.X` | `Deployment` (stateless) or `StatefulSet` (postgres/clickhouse) |
| `ports` | `Service` (ClusterIP default) + optional `Ingress` |
| `volumes` (named) | `PersistentVolumeClaim` |
| `depends_on: condition` | Init container wait or readiness probe dependency |
| `environment` | `env` from `ConfigMap` / `Secret` |
| `healthcheck` | `livenessProbe` / `readinessProbe` / `startupProbe` |
| `cert-init` (one-shot) | `Job` (pre-install hook) |
| `minio-init` (one-shot) | `Job` (post-install hook) |
| `restart: unless-stopped` | Default Pod restart policy (Always) |

### Pattern 2: Native Sidecar Container (KEP-753)
**What:** Kernel runs as an init container with `restartPolicy: Always`, making it a native sidecar that starts before the main app container and survives for the pod lifetime.
**When to use:** DEPLOY-04 -- sidecar deployment mode.
**Example:**
```yaml
# In the application pod spec
initContainers:
  # Traffic redirect init container (runs once, then exits)
  - name: interdict-iptables
    image: "{{ .Values.kernel.image.repository }}:{{ .Values.kernel.image.tag }}"
    command: ["/bin/sh", "-c"]
    args:
      - |
        iptables -t nat -A OUTPUT -p tcp -d api.openai.com --dport 443 -j REDIRECT --to-port 8443
        iptables -t nat -A OUTPUT -p tcp -d api.anthropic.com --dport 443 -j REDIRECT --to-port 8443
    securityContext:
      capabilities:
        add: ["NET_ADMIN"]
      runAsUser: 0
    restartPolicy: Never  # Not a sidecar, just init
  # Kernel proxy sidecar (runs for pod lifetime)
  - name: interdict-kernel
    image: "{{ .Values.kernel.image.repository }}:{{ .Values.kernel.image.tag }}"
    restartPolicy: Always  # KEP-753 native sidecar
    ports:
      - containerPort: 8443
    env: [...]  # Same env vars as standalone kernel
    volumeMounts:
      - name: certs
        mountPath: /certs
        readOnly: true
      - name: ca-certs
        mountPath: /data/certs
    resources:
      requests:
        memory: "128Mi"
        cpu: "100m"
      limits:
        memory: "512Mi"
        cpu: "500m"
containers:
  - name: ai-app  # The actual application
    image: "user-app:latest"
```

### Pattern 3: Helm Values Hierarchy
**What:** Base values.yaml contains all defaults (matching docker-compose env.example), with overlay files for pilot vs enterprise.
**When to use:** Always -- enables `helm install -f values-pilot.yaml` or `helm install -f values-enterprise.yaml`.

### Pattern 4: Security Context Enforcement
**What:** All Interdict containers run as non-root with read-only root filesystem where possible.
**When to use:** Always -- K8s best practice; noted as deferred from Phase 8 (decision 08-01).
```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  runAsGroup: 1000
  fsGroup: 1000
  readOnlyRootFilesystem: true  # where possible
  allowPrivilegeEscalation: false
```

### Anti-Patterns to Avoid
- **Hardcoded image tags in templates:** Always use `.Values.image.tag` with a default of `.Chart.AppVersion`.
- **Secrets in values.yaml:** Never put real passwords in values.yaml; use `existingSecret` pattern for operator-provided secrets.
- **Missing resource limits:** Every container MUST have resource requests and limits for predictable scheduling.
- **Privileged sidecar:** The kernel sidecar must NOT run as privileged; only the iptables init container needs NET_ADMIN.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PostgreSQL on K8s | StatefulSet + init scripts | Bitnami PostgreSQL subchart | Handles backups, replication, upgrades, password rotation |
| ClickHouse on K8s | StatefulSet + config | Altinity ClickHouse chart | Complex operator logic for sharding, replication |
| Ingress TLS termination | Custom nginx deployment | Standard Ingress resource + cert-manager annotation | Well-established pattern, auto-renewal |
| Certificate bootstrap | Custom operator | Helm pre-install Job (reuse existing script) | The generate-internal-ca.sh already works; just wrap in a Job |
| Sidecar injection at scale | MutatingAdmissionWebhook | Manual pod spec annotation for pilot | Webhook is overkill for 2-pilot scope; manual sidecar config suffices |

**Key insight:** The project explicitly scoped out a Kubernetes Operator (DEPLOY-06, v1.2). Keep the Helm chart simple -- no CRDs, no webhooks, no controller loops.

## Common Pitfalls

### Pitfall 1: Certificate Volume Race Condition
**What goes wrong:** Services start before cert-init Job completes, causing mTLS handshake failures.
**Why it happens:** Helm hooks execute in order but `post-install` hooks run after all resources are created.
**How to avoid:** Use a `pre-install` and `pre-upgrade` hook for the cert-init Job. Services use init containers that wait for the cert Secret to exist. Alternatively, use `helm.sh/hook-weight` to order hooks.
**Warning signs:** Pods in CrashLoopBackOff with TLS errors on first install.

### Pitfall 2: Sidecar Traffic Redirect Scope
**What goes wrong:** iptables rules redirect ALL traffic (including DNS, health checks) through the proxy, breaking pod networking.
**Why it happens:** Overly broad iptables REDIRECT rules.
**How to avoid:** Target only specific destination IPs/ports (AI vendor API endpoints on port 443). Alternatively, use HTTP_PROXY/HTTPS_PROXY env vars in the app container pointing to `localhost:8443` (simpler, requires app cooperation).
**Warning signs:** DNS resolution failures, health check timeouts, control plane connectivity lost.

### Pitfall 3: Helm Subchart Value Conflicts
**What goes wrong:** Parent chart values override subchart defaults unexpectedly, breaking PostgreSQL or ClickHouse.
**Why it happens:** Helm's value merging is namespace-scoped by subchart name, but global values propagate.
**How to avoid:** Nest subchart values under their chart name (e.g., `postgresql.auth.password`). Never use `global` for subchart-specific values.
**Warning signs:** Subchart pods failing with wrong config.

### Pitfall 4: PVC Retention on Uninstall
**What goes wrong:** `helm uninstall` deletes PVCs, losing all data.
**Why it happens:** Default Helm behavior deletes all managed resources.
**How to avoid:** Set `persistence.resourcePolicy: keep` annotation on PVCs, or document that operators should use `--keep-history` or backup before uninstall.
**Warning signs:** Data loss in staging/test environments.

### Pitfall 5: CA Trust Script Permissions
**What goes wrong:** CA trust script fails silently without admin/root privileges.
**Why it happens:** All three platforms require elevated privileges to modify system trust stores.
**How to avoid:** Scripts must check for root/admin at startup, provide clear error messages, and document the privilege requirement.
**Warning signs:** Browser still shows certificate warnings after running the script.

## Code Examples

### Helm Chart.yaml
```yaml
apiVersion: v2
name: interdict
description: Interdict AI Governance Platform
type: application
version: 0.1.0
appVersion: "1.1.0"

dependencies:
  - name: postgresql
    version: "~16.0"
    repository: oci://registry-1.docker.io/bitnamicharts
    condition: postgresql.enabled
  - name: clickhouse
    version: "~6.0"
    repository: oci://registry-1.docker.io/bitnamicharts
    condition: clickhouse.enabled
  - name: minio
    version: "~14.0"
    repository: oci://registry-1.docker.io/bitnamicharts
    condition: minio.enabled
```

### values.yaml Structure (key sections)
```yaml
# -- Global settings
global:
  imageRegistry: ""
  imagePullSecrets: []

# -- Kernel (data plane proxy)
kernel:
  image:
    repository: interdict/kernel
    tag: ""  # defaults to Chart.appVersion
    pullPolicy: IfNotPresent
  replicaCount: 1
  listenAddr: "0.0.0.0:8443"
  orgId: "default"
  logLevel: "info"
  logFormat: "json"
  allowlistVendors: '["api.openai.com","api.anthropic.com"]'
  mtls:
    enabled: true
  resources:
    requests:
      memory: "128Mi"
      cpu: "100m"
    limits:
      memory: "512Mi"
      cpu: "500m"
  service:
    type: ClusterIP
    port: 8443

# -- Control Plane (API + policy distribution)
controlPlane:
  image:
    repository: interdict/control-plane
    tag: ""
    pullPolicy: IfNotPresent
  replicaCount: 1
  port: 3000
  grpcPort: 50052
  resources:
    requests:
      memory: "256Mi"
      cpu: "200m"
    limits:
      memory: "1Gi"
      cpu: "1"

# -- Evidence Collector
evidenceCollector:
  image:
    repository: interdict/evidence-collector
    tag: ""
    pullPolicy: IfNotPresent
  replicaCount: 1
  grpcPort: 50051
  signingMode: "dev"

# -- Dashboard
dashboard:
  image:
    repository: interdict/dashboard
    tag: ""
    pullPolicy: IfNotPresent
  replicaCount: 1
  port: 3001
  ingress:
    enabled: false
    className: ""
    hosts: []
    tls: []

# -- Certificate bootstrap
certInit:
  enabled: true  # Set false if providing own certs
  image:
    repository: alpine
    tag: "latest"

# -- Sidecar mode configuration
sidecar:
  enabled: false  # Enable for sidecar injection helper templates
  trafficRedirect:
    enabled: true  # Use iptables redirect (vs HTTP_PROXY)
    targetPorts: [443]
    targetHosts: []  # Empty = use kernel allowlist vendors

# -- Infrastructure subcharts
postgresql:
  enabled: true
  auth:
    username: interdict
    password: ""  # Set via --set or existingSecret
    database: interdict
    existingSecret: ""

clickhouse:
  enabled: true

minio:
  enabled: true
  auth:
    rootUser: interdict
    rootPassword: ""
    existingSecret: ""
```

### macOS CA Trust Script
```bash
#!/bin/bash
set -euo pipefail

# install-ca-trust.sh -- Install Interdict CA certificate into system trust store
# Usage: sudo ./install-ca-trust.sh /path/to/interdict-ca.pem

CERT_PATH="${1:?Usage: $0 <path-to-ca-cert.pem>}"

if [ ! -f "$CERT_PATH" ]; then
    echo "ERROR: Certificate file not found: $CERT_PATH"
    exit 1
fi

OS="$(uname -s)"
case "$OS" in
    Darwin)
        if [ "$(id -u)" -ne 0 ]; then
            echo "ERROR: This script requires root privileges. Run with sudo."
            exit 1
        fi
        security add-trusted-cert -d -r trustRoot \
            -k "/Library/Keychains/System.keychain" "$CERT_PATH"
        echo "SUCCESS: CA certificate installed in macOS System Keychain."
        ;;
    Linux)
        if [ "$(id -u)" -ne 0 ]; then
            echo "ERROR: This script requires root privileges. Run with sudo."
            exit 1
        fi
        # Debian/Ubuntu
        if command -v update-ca-certificates >/dev/null 2>&1; then
            cp "$CERT_PATH" /usr/local/share/ca-certificates/interdict-ca.crt
            update-ca-certificates
        # RHEL/CentOS/Fedora
        elif command -v update-ca-trust >/dev/null 2>&1; then
            cp "$CERT_PATH" /etc/pki/ca-trust/source/anchors/interdict-ca.pem
            update-ca-trust extract
        else
            echo "ERROR: No supported certificate tool found."
            exit 1
        fi
        echo "SUCCESS: CA certificate installed in Linux trust store."
        ;;
    *)
        echo "ERROR: Unsupported OS: $OS. Use install-ca-trust.ps1 for Windows."
        exit 1
        ;;
esac
```

### Windows CA Trust Script (PowerShell)
```powershell
#Requires -RunAsAdministrator
# install-ca-trust.ps1 -- Install Interdict CA certificate into Windows trust store
# Usage: .\install-ca-trust.ps1 -CertPath .\interdict-ca.pem

param(
    [Parameter(Mandatory=$true)]
    [string]$CertPath
)

if (-not (Test-Path $CertPath)) {
    Write-Error "Certificate file not found: $CertPath"
    exit 1
}

try {
    Import-Certificate -FilePath $CertPath `
        -CertStoreLocation Cert:\LocalMachine\Root
    Write-Host "SUCCESS: CA certificate installed in Windows Trusted Root store." -ForegroundColor Green
} catch {
    Write-Error "Failed to install certificate: $_"
    exit 1
}
```

### Cert-Init Job (Helm pre-install hook)
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ include "interdict.fullname" . }}-cert-init
  annotations:
    "helm.sh/hook": pre-install,pre-upgrade
    "helm.sh/hook-weight": "-5"
    "helm.sh/hook-delete-policy": hook-succeeded,before-hook-creation
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: cert-init
          image: alpine:latest
          command: ["/bin/sh", "-c", "apk add --no-cache openssl && sh /scripts/generate-internal-ca.sh"]
          volumeMounts:
            - name: cert-script
              mountPath: /scripts
            - name: certs
              mountPath: /certs
      volumes:
        - name: cert-script
          configMap:
            name: {{ include "interdict.fullname" . }}-cert-script
        - name: certs
          persistentVolumeClaim:
            claimName: {{ include "interdict.fullname" . }}-certs
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Regular sidecar containers | Native sidecar (KEP-753, initContainer restartPolicy: Always) | K8s 1.28 alpha, 1.33 GA (Apr 2025) | Proper lifecycle ordering, guaranteed start before app |
| Helm v2 (Tiller) | Helm v3 (no Tiller) | 2019 | No cluster-side component needed |
| Manual iptables in Dockerfile | Init container with NET_ADMIN | Standard practice | Clean separation, no privileged main container |
| Custom cert provisioning | cert-manager with Helm hooks | 2022+ | For production; but our existing script is fine for pilot scope |

**Deprecated/outdated:**
- Helm v2: Tiller removed; all charts must be v2 apiVersion
- PodPreset: Removed from K8s; use mutating webhooks or manual pod spec instead
- `docker/compose` v1 syntax: Irrelevant to Helm but worth noting for migration docs

## Open Questions

1. **Image registry for Helm chart**
   - What we know: Dockerfiles exist; Phase 8 DEPLOY-01 says "published to a registry"
   - What's unclear: Which registry (Docker Hub, GHCR, private ECR)?
   - Recommendation: Default to `ghcr.io/interdict/` in values.yaml; operators override with `global.imageRegistry`

2. **ClickHouse subchart selection**
   - What we know: Multiple ClickHouse Helm charts exist (Altinity operator, Bitnami, community)
   - What's unclear: Which is most stable for single-node pilot deployment
   - Recommendation: Use Bitnami if available; otherwise a simple StatefulSet template (ClickHouse is single-node for pilot)

3. **Sidecar traffic redirect mechanism**
   - What we know: iptables is transparent but requires NET_ADMIN; HTTP_PROXY is simpler but requires app awareness
   - What's unclear: Whether pilot AI apps will honor HTTP_PROXY
   - Recommendation: Support BOTH in the chart (values toggle). Default to HTTP_PROXY for simplicity; iptables as opt-in for transparent mode.

## Sources

### Primary (HIGH confidence)
- Project docker-compose.yml -- complete service topology and env var mapping
- Project Dockerfiles (kernel, control-plane, evidence-collector, dashboard) -- image structure and ports
- Project generate-internal-ca.sh -- cert bootstrap logic (reusable in K8s Job)
- Project .claude/skills/k8s-sidecar-provision/SKILL.md -- skill validation steps
- Kubernetes official docs: [Sidecar Containers](https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/) -- KEP-753 GA status
- Helm official docs: [Dependencies](https://helm.sh/docs/chart_best_practices/dependencies/) -- subchart best practices

### Secondary (MEDIUM confidence)
- [Kubernetes v1.28 Native Sidecar Blog](https://kubernetes.io/blog/2023/08/25/native-sidecar-containers/) -- sidecar implementation details
- [Bitnami Production-Ready Charts](https://techdocs.broadcom.com/us/en/vmware-tanzu/bitnami-secure-images/bitnami-secure-images/services/bsi-doc/apps-tutorials-production-ready-charts-index.html) -- Helm best practices
- [BounCA Root Certificate Installation](https://bounca.org/tutorials/install_root_certificate.html) -- cross-platform CA trust commands
- [Keytos: Trust a Root Certificate](https://www.keytos.io/docs/azure-pki/how-to-create-root-ca-in-azure/how-to-trust-a-root-ca-in-windows-and-mac/) -- macOS/Windows cert trust

### Tertiary (LOW confidence)
- ClickHouse Helm chart version numbers -- need verification at implementation time

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Helm is the explicit requirement; K8s sidecar pattern is well-documented
- Architecture: HIGH - Direct 1:1 mapping from existing docker-compose; all services well-understood
- Pitfalls: HIGH - Common K8s deployment issues are well-known; cert bootstrap race is project-specific and understood
- CA trust scripts: HIGH - OS-level certificate commands are stable and well-documented

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (stable domain, 30-day validity)