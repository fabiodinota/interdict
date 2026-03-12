# S07: Deployment Wiring Saml Key Rotation

**Goal:** Wire SAML SSO and key rotation into Docker Compose deployment layer, fix MODULES array

Purpose: Close the deployment wiring gaps so operators can activate SAML and key rotation in Docker Compose deployments using documented env vars -- without reading source code.
**Demo:** Wire SAML SSO and key rotation into Docker Compose deployment layer, fix MODULES array

Purpose: Close the deployment wiring gaps so operators can activate SAML and key rotation in Docker Compose deployments using documented env vars -- without reading source code.

## Must-Haves


## Tasks

- [x] **T01: 13-deployment-wiring-saml-key-rotation 01**
  - Wire SAML SSO and key rotation into Docker Compose deployment layer, fix MODULES array

Purpose: Close the deployment wiring gaps so operators can activate SAML and key rotation in Docker Compose deployments using documented env vars -- without reading source code.
Output: Updated docker-compose.yml, env.example, cert generation script, dashboard Dockerfile, and fixed MODULES array.
- [x] **T02: 13-deployment-wiring-saml-key-rotation 02**
  - Wire SAML SSO and key rotation into Helm chart deployment layer

Purpose: Close deployment wiring gaps so operators can activate SAML and key rotation in Kubernetes Helm deployments via chart values -- converting emptyDir signing-keys to shared PVC and adding all SAML configuration to templates.
Output: Updated Helm values.yaml and all affected templates.

## Files Likely Touched

- `env.example`
- `docker-compose.yml`
- `docker/certs/generate-internal-ca.sh`
- `docker/dashboard/Dockerfile`
- `control-plane/src/index.ts`
- `helm/interdict/values.yaml`
- `helm/interdict/templates/control-plane/configmap.yaml`
- `helm/interdict/templates/control-plane/deployment.yaml`
- `helm/interdict/templates/evidence-collector/deployment.yaml`
- `helm/interdict/templates/dashboard/deployment.yaml`
- `helm/interdict/templates/configmap-cert-script.yaml`
- `helm/interdict/templates/cert-init-job.yaml`
