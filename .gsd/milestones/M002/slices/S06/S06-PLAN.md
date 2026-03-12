# S06: Kubernetes Deployment

**Goal:** Create the complete Helm chart for the Interdict stack with all service templates, certificate bootstrap, and infrastructure subcharts.
**Demo:** Create the complete Helm chart for the Interdict stack with all service templates, certificate bootstrap, and infrastructure subcharts.

## Must-Haves


## Tasks

- [x] **T01: Plan 01**
  - Create the complete Helm chart for the Interdict stack with all service templates, certificate bootstrap, and infrastructure subcharts.

Purpose: Enable operators to deploy the full Interdict AI Governance Platform on Kubernetes via `helm install` with configurable values for pilot and enterprise environments (DEPLOY-03).
Output: A working Helm chart at `helm/interdict/` that translates the existing docker-compose.yml 1:1 into Kubernetes resources.
- [x] **T02: Plan 02**
  - Create sidecar injection templates and environment overlay files for the Helm chart.

Purpose: Enable operators to deploy the Interdict kernel as a sidecar container alongside AI application pods (DEPLOY-04), and provide pilot/enterprise deployment profiles for different environments.
Output: Reusable sidecar templates, an example application manifest, and two values overlay files.
- [x] **T03: Plan 03**
  - Create cross-platform CA certificate trust scripts for client machine onboarding.

Purpose: Enable operators to install the Interdict proxy CA certificate into client machine trust stores so browsers and tools trust the MITM proxy without certificate warnings (DEPLOY-05).
Output: Shell script for macOS/Linux and PowerShell script for Windows, both with validation and clear output.

## Files Likely Touched

