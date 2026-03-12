# T01: 31-distribution-tls-evidence-query-scale-hardening 01

**Slice:** S02 — **Milestone:** M005

## Description

Make the kernel's policy-distribution mTLS peer identity deployment-configurable instead of hard-coded to one hostname.

Purpose: satisfy `HR-DIST-01` while preserving VPC-native, sidecar, and air-gapped deployment compatibility.
Output: kernel config/runtime wiring plus Compose/Helm surfaces for an explicit distribution TLS server name.

## Must-Haves

- [ ] Kernel policy distribution no longer hard-codes `control-plane` as its TLS server identity.
- [ ] Operators can set the expected distribution TLS server name through supported deployment config instead of patching source.
- [ ] Existing Compose and Helm defaults still resolve to the current control-plane service identity unless an operator overrides them.

## Files

- `crates/kernel/src/config.rs`
- `crates/kernel/src/main.rs`
- `crates/kernel/src/policy/distribution/client.rs`
- `docker/kernel/interdict.toml.template`
- `docker-compose.yml`
- `.env`
- `helm/interdict/templates/kernel/configmap.yaml`
- `helm/interdict/values.yaml`
