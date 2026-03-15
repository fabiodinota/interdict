# Interdict — Troubleshooting Guide

> **Quick rule:** Check logs first, then connectivity, then configuration.
> Most issues are caused by missing certificates, placeholder credentials,
> or network isolation (NetworkPolicy without a supporting CNI).

---

## Certificate / mTLS Issues

### Symptom: gRPC connection refused between services

**Cause:** mTLS certificates are missing or expired. The `cert-init`
container generates certificates on first boot only — if the `certs`
volume is recreated without re-running cert-init, services cannot
establish mTLS channels.

**Fix:**

```bash
# Check if cert-init completed successfully
docker compose ps cert-init

# Regenerate certificates (destroys and recreates the certs volume)
docker compose down
docker volume rm interdict_certs
docker compose up -d
```

### Symptom: `tls handshake failure` in kernel logs

**Cause:** The kernel's mTLS client certificate does not match the CA
that the control plane or evidence collector trusts.

**Check:**

```bash
# Verify CA cert is the same across services
docker compose exec kernel cat /certs/internal-ca.pem | openssl x509 -noout -subject
docker compose exec control-plane cat /certs/internal-ca.pem | openssl x509 -noout -subject

# Verify kernel client cert was signed by the internal CA
docker compose exec kernel openssl verify -CAfile /certs/internal-ca.pem /certs/kernel-client.pem
```

### Symptom: Browsers reject kernel proxy certificate

**Cause:** The kernel's proxy CA is not trusted by the client machine.

**Fix:**

```bash
# Extract and install the proxy CA
docker compose cp kernel:/data/certs/ca.crt ./interdict-ca.pem
sudo bash scripts/install-ca-trust.sh ./interdict-ca.pem
```

See the [Certificate Management](guide.md#certificate-management) section
of the operator guide.

---

## Database Connectivity

### Symptom: `connection refused` to Postgres

**Checklist:**

1. Is the `postgres` container running?
   ```bash
   docker compose ps postgres
   ```
2. Does `DATABASE_URL` contain the correct password (matching
   `POSTGRES_PASSWORD`)?
   ```bash
   bash scripts/validate-env.sh
   ```
3. Is the database ready?
   ```bash
   docker compose exec postgres pg_isready -U interdict
   ```

### Symptom: ClickHouse connection timeout

**Checklist:**

1. Verify ClickHouse is healthy:
   ```bash
   docker compose exec clickhouse wget -qO- http://localhost:8123/ping
   ```
2. Check `CLICKHOUSE_URL` points to the correct host and port.
3. Verify `CLICKHOUSE_PASSWORD` is not a `CHANGE_ME` placeholder.

### Symptom: Database migration failures

Control plane logs show migration errors on startup. Common causes:

- Postgres not ready when control plane starts (check `depends_on` with
  `condition: service_healthy` in docker-compose.yml).
- Schema conflicts from a previous incomplete migration. Check the
  migration state:
  ```bash
  docker compose exec postgres psql -U interdict -c "SELECT * FROM _migrations ORDER BY id DESC LIMIT 5;"
  ```

---

## Evidence Pipeline Failures

### Symptom: gRPC errors between kernel and evidence-collector

**Check:**

```bash
# Kernel logs — look for evidence collector connection errors
docker compose logs kernel 2>&1 | grep -i "evidence\|grpc\|connect"

# Evidence collector health
docker compose exec evidence-collector nc -z 127.0.0.1 50051 && echo "gRPC port open"
```

**Common causes:**

- `KERNEL_EVIDENCE_COLLECTOR_ADDR` points to wrong host/port
- mTLS certificates expired or mismatched (see [Certificate Issues](#certificate--mtls-issues))
- Evidence collector not yet ready (check `start_period` in healthcheck)

### Symptom: ClickHouse write failures in evidence-collector logs

```bash
docker compose logs evidence-collector 2>&1 | grep -i "clickhouse\|write\|insert"
```

**Common causes:**

- `CLICKHOUSE_PASSWORD` mismatch between evidence-collector and ClickHouse
- ClickHouse disk full (check `docker compose exec clickhouse df -h`)
- ClickHouse tables not created (check migration completed)

### Symptom: S3/MinIO connectivity failures

```bash
# Check MinIO is running
docker compose ps minio

# Verify bucket exists
docker compose exec minio mc ls local/interdict-evidence

# Check minio-init completed
docker compose ps minio-init
```

**Common causes:**

- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` do not match
  `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` — run `scripts/validate-env.sh`
  to detect this.
- `minio-init` container failed before creating the bucket.

---

## Policy Distribution Errors

### Symptom: Kernel not receiving policy updates

The kernel connects to the control plane's gRPC distribution endpoint to
subscribe to policy changes. If policies are not being applied:

```bash
# Check kernel subscription status
docker compose logs kernel 2>&1 | grep -i "subscribe\|distribution\|policy"

# Verify control plane gRPC port is accessible
docker compose exec kernel nc -z control-plane 50052 && echo "gRPC reachable"
```

**Common causes:**

- `KERNEL_DISTRIBUTION_ADDR` misconfigured
- mTLS handshake failure (see [Certificate Issues](#certificate--mtls-issues))
- Control plane not yet healthy when kernel attempted connection

### Symptom: ACK/NACK failures in policy distribution logs

Policy distribution uses a gRPC Subscribe stream with explicit
acknowledgement. NACK responses indicate the kernel rejected a policy
update (e.g., invalid Wasm module).

```bash
# Control plane side
docker compose logs control-plane 2>&1 | grep -i "nack\|ack\|distribute"

# Kernel side
docker compose logs kernel 2>&1 | grep -i "nack\|policy\|wasm"
```

---

## Signing Key Issues

### Symptom: `dev signing mode` warning in production

The evidence-collector emits a `WARN`-level log when
`COLLECTOR_SIGNING_MODE=dev`:

```
Using ephemeral dev signing key — not suitable for production
```

**Fix:** Trigger key rotation via the control plane API:

```bash
curl -X POST http://localhost:3001/api/v1/admin/signing-keys/rotate \
  -H "Authorization: Bearer <token>"
```

This generates a persistent Ed25519 key and transitions the evidence-collector
from `dev` to `file` mode automatically.

### Symptom: Key rotation not taking effect

The evidence-collector polls `SIGNING_KEY_WATCH_PATH` every 30 seconds.
If the key file was rotated but the collector is still using the old key:

1. Verify the key file was written:
   ```bash
   docker compose exec evidence-collector ls -la /data/keys/signing.key
   ```
2. Wait up to 30 seconds for the next poll cycle.
3. Check logs for hot-reload confirmation:
   ```bash
   docker compose logs evidence-collector 2>&1 | grep -i "reload\|signing"
   ```

---

## CSP Violations

### Symptom: Browser console shows `Refused to execute inline script`

The dashboard enforces Content Security Policy via a nonce-based middleware.
The CSP nonce is generated per-request in `proxy.ts` (the Next.js
middleware entry point — not `middleware.ts`) and propagated through the
rendering pipeline.

**Debugging steps:**

1. Open browser DevTools → Console tab. Look for CSP violation messages.
2. Check the response headers:
   ```bash
   curl -sI http://localhost:8080 | grep -i content-security-policy
   ```
3. Verify the nonce appears in script tags:
   ```bash
   curl -s http://localhost:8080 | grep -o 'nonce="[^"]*"' | head -5
   ```

**Common causes:**

- A third-party script or inline script was added without using the nonce.
  All `<script>` tags must include the `nonce` attribute.
- `strict-dynamic` is set — child scripts loaded by nonced scripts inherit
  trust, but scripts loaded from the DOM do not.

### Symptom: `Refused to apply inline style`

Inline `style` attributes violate CSP unless `'unsafe-inline'` is in
`style-src`. The dashboard has refactored known inline styles (Sonner
toasts, VendorUsageChart) to Tailwind classes. If a new inline style is
added:

**Fix:** Replace the inline `style` attribute with Tailwind utility
classes or CSS modules.

### Development Mode

In development (`NODE_ENV=development`), the CSP includes `'unsafe-eval'`
to allow Hot Module Replacement (HMR). This is automatically removed in
production builds.

---

## Docker Compose Issues

### Symptom: Port conflicts

If services fail to start with "port already in use":

```bash
# Find what's using the port
lsof -i :8443  # kernel
lsof -i :3001  # control plane
lsof -i :8080  # dashboard
```

**Fix:** Stop the conflicting process, or change the port mapping in
`docker-compose.yml` (e.g., `"9443:8443"` for the kernel).

### Symptom: Volume permission errors

Read-only containers (`read_only: true`) write to `tmpfs` mounts. If a
service fails with permission errors:

```bash
docker compose logs <service> 2>&1 | grep -i "permission\|readonly\|read-only"
```

**Fix:** Ensure the required volume is mounted and the `tmpfs` size is
sufficient. Check the `volumes:` section of the service in
`docker-compose.yml`.

### Symptom: Monitoring profile not starting

```bash
# Monitoring requires explicit profile activation
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml \
  --profile monitoring up -d

# Verify monitoring services are running
docker compose --profile monitoring ps
```

Prometheus and Grafana are behind the `monitoring` profile and are
**never started by default** — this is intentional to avoid ~500 MB of
image pulls on every `docker compose up`.

---

## Helm / Kubernetes Issues

### Symptom: NetworkPolicy blocking all traffic

**Cause:** NetworkPolicy resources are deployed but the cluster has no
CNI that implements them (e.g., using `flannel` instead of `Calico` or
`Cilium`). Without a supporting CNI, NetworkPolicy resources are silently
ignored on some clusters, or actively block traffic on others.

**Fix:**

```bash
# Disable NetworkPolicy for all services
helm upgrade interdict helm/interdict \
  --set kernel.networkPolicy.enabled=false \
  --set controlPlane.networkPolicy.enabled=false \
  --set evidenceCollector.networkPolicy.enabled=false \
  --set dashboard.networkPolicy.enabled=false
```

### Symptom: startupProbe failures (CrashLoopBackOff)

Services have startup probes with generous timeouts (up to 150 seconds).
If pods still fail:

```bash
# Check pod events
kubectl describe pod <pod-name> -n interdict

# Check container logs
kubectl logs <pod-name> -n interdict
```

**Common causes:**

- Database not ready — check PostgreSQL and ClickHouse pods are Running.
- Secret not mounted — verify `kubectl get secret -n interdict`.
- Insufficient resources — check resource requests vs node capacity.

### Symptom: kube-score warnings in CI

The CI pipeline runs kube-score with 13 known-issue ignore flags. These
are intentional and documented:

- **Third-party subchart issues** (Bitnami postgresql, clickhouse, minio):
  `container-security-context-user-group-id`,
  `container-security-context-readonlyrootfilesystem`,
  `container-ephemeral-storage-limit`, `pod-probes`,
  `container-resources`, `deployment-pod-antiaffinity`.
- **Helm dev-default issues**: `deployment-has-poddisruptionbudget`,
  `deployment-has-host-podantiaffinity`, `pod-topology-spread-constraints`,
  `horizontalpodautoscaler-has-target`.

These do not indicate production issues — they reflect safe defaults for
development/single-replica deployments. Adjust values.yaml for production
(enable PDB, anti-affinity, HPA).

---

## Diagnostic Commands

| Task | Command |
|------|---------|
| Service status (Docker) | `docker compose ps` |
| Service logs (Docker) | `docker compose logs <service> --tail 100 -f` |
| Service status (Kubernetes) | `kubectl get pods -n interdict` |
| Service logs (Kubernetes) | `kubectl logs deploy/interdict-<service> -n interdict` |
| Control plane health | `curl -s http://localhost:3001/health \| jq .` |
| Dashboard reachable | `curl -sI http://localhost:8080` |
| Kernel proxy reachable | `curl -sk https://localhost:8443` |
| Validate environment | `bash scripts/validate-env.sh` |
| Dry-run backup | `bash scripts/backup.sh --dry-run` |
| Full smoke test | `bash scripts/smoke-test.sh` |
| Postgres connectivity | `docker compose exec postgres pg_isready -U interdict` |
| ClickHouse connectivity | `docker compose exec clickhouse wget -qO- http://localhost:8123/ping` |
| MinIO connectivity | `docker compose exec minio mc ready local` |
| Check mTLS certs | `docker compose exec kernel openssl verify -CAfile /certs/internal-ca.pem /certs/kernel-client.pem` |
| View CSP headers | `curl -sI http://localhost:8080 \| grep -i content-security-policy` |

---

## Cross-References

- [Operator Guide](guide.md) — deployment, configuration, and operations
- [Full-Text Storage Guide](full-text-storage.md) — raw text retention
  configuration and compliance
- [REST API Reference](../api/rest.md) — control plane HTTP API
- [gRPC API Reference](../api/grpc.md) — policy distribution and evidence
  protocols
