# T01: 13-deployment-wiring-saml-key-rotation 01

**Slice:** S07 — **Milestone:** M002

## Description

Wire SAML SSO and key rotation into Docker Compose deployment layer, fix MODULES array

Purpose: Close the deployment wiring gaps so operators can activate SAML and key rotation in Docker Compose deployments using documented env vars -- without reading source code.
Output: Updated docker-compose.yml, env.example, cert generation script, dashboard Dockerfile, and fixed MODULES array.

## Must-Haves

- [ ] "Operator can enable SAML SSO by setting env vars in .env and providing IdP metadata XML -- without reading source code"
- [ ] "After admin key rotation via API, evidence-collector picks up the new signing key via shared Docker volume without container restart"
- [ ] "MODULES startup log lists all 13 loaded modules including reviews, department-overrides, anomalies"

## Files

- `env.example`
- `docker-compose.yml`
- `docker/certs/generate-internal-ca.sh`
- `docker/dashboard/Dockerfile`
- `control-plane/src/index.ts`
