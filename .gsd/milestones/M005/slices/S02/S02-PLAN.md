# S02: Distribution Tls Evidence Query

**Goal:** Make the kernel's policy-distribution mTLS peer identity deployment-configurable instead of hard-coded to one hostname.
**Demo:** Make the kernel's policy-distribution mTLS peer identity deployment-configurable instead of hard-coded to one hostname.

## Must-Haves


## Tasks

- [x] **T01: 31-distribution-tls-evidence-query-scale-hardening 01**
  - Make the kernel's policy-distribution mTLS peer identity deployment-configurable instead of hard-coded to one hostname.

Purpose: satisfy `HR-DIST-01` while preserving VPC-native, sidecar, and air-gapped deployment compatibility.
Output: kernel config/runtime wiring plus Compose/Helm surfaces for an explicit distribution TLS server name.
- [x] **T02: 31-distribution-tls-evidence-query-scale-hardening 02**
  - Make the remaining operator-facing and verification-sensitive `evidence_bundles` reads partition-safe in ClickHouse without breaking review or evidence verification behavior.

Purpose: satisfy `HR-EVID-01` and keep Phase 31 focused on the identified high-value evidence/review flows only.
Output: bounded review/evidence queries plus focused regression tests for query shape and day-boundary correctness.

## Files Likely Touched

- `crates/kernel/src/config.rs`
- `crates/kernel/src/main.rs`
- `crates/kernel/src/policy/distribution/client.rs`
- `docker/kernel/interdict.toml.template`
- `docker-compose.yml`
- `.env`
- `helm/interdict/templates/kernel/configmap.yaml`
- `helm/interdict/values.yaml`
- `control-plane/src/modules/reviews/service.ts`
- `control-plane/src/modules/reviews/service.test.ts`
- `control-plane/src/modules/evidence/service.ts`
- `control-plane/src/modules/evidence/service.test.ts`
