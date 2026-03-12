# T02: 13-deployment-wiring-saml-key-rotation 02

**Slice:** S07 — **Milestone:** M002

## Description

Wire SAML SSO and key rotation into Helm chart deployment layer

Purpose: Close deployment wiring gaps so operators can activate SAML and key rotation in Kubernetes Helm deployments via chart values -- converting emptyDir signing-keys to shared PVC and adding all SAML configuration to templates.
Output: Updated Helm values.yaml and all affected templates.

## Must-Haves

- [ ] "Operator can enable SAML SSO in Helm deployment by setting controlPlane.saml.enabled=true and providing IdP metadata"
- [ ] "After admin key rotation, evidence-collector picks up the new key via shared PVC without pod restart"
- [ ] "Signing keys use a shared PVC (not emptyDir) so both control-plane and evidence-collector access the same filesystem"

## Files

- `helm/interdict/values.yaml`
- `helm/interdict/templates/control-plane/configmap.yaml`
- `helm/interdict/templates/control-plane/deployment.yaml`
- `helm/interdict/templates/evidence-collector/deployment.yaml`
- `helm/interdict/templates/dashboard/deployment.yaml`
- `helm/interdict/templates/configmap-cert-script.yaml`
- `helm/interdict/templates/cert-init-job.yaml`
