# T01: Plan 01

**Slice:** S06 — **Milestone:** M002

## Description

Create the complete Helm chart for the Interdict stack with all service templates, certificate bootstrap, and infrastructure subcharts.

Purpose: Enable operators to deploy the full Interdict AI Governance Platform on Kubernetes via `helm install` with configurable values for pilot and enterprise environments (DEPLOY-03).
Output: A working Helm chart at `helm/interdict/` that translates the existing docker-compose.yml 1:1 into Kubernetes resources.
