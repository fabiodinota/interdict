# M002: Pilot Ready

**Vision:** Interdict.

## Success Criteria


## Slices

- [x] **S01: Identity Foundation** `risk:medium` `depends:[]`
  > After this: Create the database schema, permission model, and seed infrastructure for API key authentication and RBAC.
- [x] **S02: Container Images Docker Compose** `risk:medium` `depends:[S01]`
  > After this: Create multi-stage Dockerfiles for all four Interdict services, entrypoint scripts, TOML config template, env.
- [x] **S03: Dashboard Core Views** `risk:medium` `depends:[S02]`
  > After this: unit tests prove dashboard-core-views works
- [x] **S04: Saml Sso Security Hardening** `risk:medium` `depends:[S03]`
  > After this: Implement SAML 2.
- [x] **S05: Advanced Dashboard Views** `risk:medium` `depends:[S04]`
  > After this: Evidence Verification UI and API -- enables auditors to independently verify evidence bundle integrity through a dedicated dashboard page with three-step cryptographic verification, plus inline quick-verify on audit trail records.
- [x] **S06: Kubernetes Deployment** `risk:medium` `depends:[S05]`
  > After this: Create the complete Helm chart for the Interdict stack with all service templates, certificate bootstrap, and infrastructure subcharts.
- [x] **S07: Deployment Wiring Saml Key Rotation** `risk:medium` `depends:[S06]`
  > After this: Wire SAML SSO and key rotation into Docker Compose deployment layer, fix MODULES array

Purpose: Close the deployment wiring gaps so operators can activate SAML and key rotation in Docker Compose deployments using documented env vars -- without reading source code.
- [x] **S08: Saml Sso Cross Origin Cookie Fix** `risk:medium` `depends:[S07]`
  > After this: Fix the SAML SSO cross-origin cookie loss bug so that SAML login completes end-to-end.
- [x] **S09: Signing Key Management Dashboard Ui** `risk:medium` `depends:[S08]`
  > After this: Add a dashboard settings page for signing key management so admins can view key status and trigger rotation from the UI instead of direct API calls.
