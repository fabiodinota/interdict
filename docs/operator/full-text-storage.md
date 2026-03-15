# Full-Text Storage — Operator Guide

> **Default: disabled.** Enable only when raw LLM prompt/response text is
> required for compliance, forensic investigation, or audit workflows.

## What `full_text_storage` Does

When enabled, Interdict stores the **complete prompt and response text** of
every proxied LLM interaction inside evidence bundles. These bundles are
persisted to ClickHouse (structured event store) and optionally anchored
to S3/MinIO (immutable Merkle tree roots).

When disabled (the default), evidence bundles contain only metadata — host,
actor identity, department, policy verdicts, timing, and token counts. No
request or response body content is persisted.

## Configuration

Two independent environment variables control the feature. Both default to
`false`; each must be set independently for the component where you want
full-text capture.

| Variable | Component | Accepted values |
|----------|-----------|-----------------|
| `INTERDICT_EVIDENCE_FULL_TEXT_STORAGE` | **Kernel** (proxy) | `1`, `true`, `yes` (case-insensitive) |
| `COLLECTOR_FULL_TEXT_STORAGE` | **Evidence Collector** (gRPC service) | `1`, `true`, `yes` (case-insensitive) |

> **Important:** The kernel controls whether prompt/response text is
> *included in the evidence event*. The evidence collector controls whether
> it *accepts and stores* that text. In most deployments you will set both
> to the same value. Enabling only the kernel side without the collector
> causes the collector to receive text it does not persist — a waste of
> bandwidth. Enabling only the collector side has no effect because the
> kernel will not include the text.

### Startup Warning

When either flag is enabled, the respective binary emits a `WARN`-level
structured log at startup:

```
full_text_storage is ENABLED — raw LLM prompts and responses will be stored.
Ensure encryption-at-rest is configured for ClickHouse and S3/MinIO.
Review GDPR, data-residency, and retention requirements before production use.
```

## Security Requirements

Storing raw prompt/response text creates a high-value data store. The
following controls are **required** before enabling in production:

### Encryption at Rest

- **ClickHouse:** Enable disk-level encryption or deploy on encrypted
  volumes (e.g., LUKS, AWS EBS encryption, GCP CMEK). ClickHouse does not
  encrypt data at the application layer.
- **S3/MinIO:** Enable server-side encryption (SSE-S3, SSE-KMS, or
  SSE-C). For MinIO, configure `MINIO_KMS_SECRET_KEY` or vault-backed
  encryption.

### Access Controls

- Restrict ClickHouse user permissions so that only the evidence collector
  service account can write, and only authorised compliance analysts can
  read evidence tables.
- Apply S3 bucket policies that limit `GetObject` to compliance roles.
- Use Kubernetes NetworkPolicies (enabled by default in Interdict Helm
  chart) to prevent unauthorised pod-to-pod access.

### Audit Logging

- Enable ClickHouse query logging (`system.query_log`) to record who
  accessed evidence data and when.
- Enable S3 server access logging or CloudTrail for object-level audit
  trails.

## Compliance Considerations

### GDPR Article 17 — Right to Erasure

If prompts contain personal data of EU data subjects, you must be able to
locate and delete that data on request. Plan for:

- A mechanism to identify evidence events linked to a specific data
  subject (e.g., by actor identity or prompt content search).
- A deletion workflow that removes matching rows from ClickHouse and
  corresponding S3 objects.
- Documentation in your Data Protection Impact Assessment (DPIA).

### Data Residency

LLM prompts may contain data subject to jurisdictional data-residency
laws. Ensure ClickHouse and S3 storage regions comply with your
organisation's data-residency obligations.

### Retention Policies

- Define a retention period aligned with your regulatory requirements.
- Configure the evidence collector's `COLLECTOR_RETENTION_DAYS` (default:
  2555 days ≈ 7 years) to match.
- Set up ClickHouse TTL or S3 lifecycle rules to enforce automated
  deletion after the retention window.

## Recommendation

**Leave `full_text_storage` disabled** unless you have a specific,
documented requirement for raw text retention. Metadata-only evidence
(the default) is sufficient for most policy enforcement, audit, and
anomaly-detection workflows.

Enable it only when:

- Regulatory or legal hold requirements mandate verbatim capture.
- Forensic investigation workflows need full prompt/response replay.
- Compliance auditors explicitly require raw text access.

## Example Configuration

### Docker Compose

```yaml
services:
  kernel:
    image: ghcr.io/interdict/kernel:latest
    environment:
      INTERDICT_EVIDENCE_FULL_TEXT_STORAGE: "true"
      # ... other kernel env vars

  evidence-collector:
    image: ghcr.io/interdict/evidence-collector:latest
    environment:
      COLLECTOR_FULL_TEXT_STORAGE: "true"
      # ... other collector env vars
```

### Helm Values

```yaml
# values.yaml (or values-production.yaml)
kernel:
  env:
    INTERDICT_EVIDENCE_FULL_TEXT_STORAGE: "true"

evidenceCollector:
  env:
    COLLECTOR_FULL_TEXT_STORAGE: "true"
```

### Verifying at Runtime

Check structured logs at startup for the warning message:

```bash
# Kernel
kubectl logs deploy/interdict-kernel | grep "full_text_storage"

# Evidence Collector
kubectl logs deploy/interdict-evidence-collector | grep "full_text_storage"
```

If no warning appears when you expect full-text storage to be active,
the environment variable is not set or not being read — check your
deployment manifest for typos or overridden values.
