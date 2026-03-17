# Phase 24: Platform Hardening and Release Gate — Research

**Date:** 2026-03-10

## Summary

The Helm chart needed to express the security and availability model, not just the deployment topology. Without NetworkPolicy, any pod can reach any other pod. Without PDB, rollouts can take all replicas offline. Without HPA, there's no scaling story.

## Decisions

- 10 new Helm templates: NetworkPolicy (4), PodDisruptionBudget (4), HorizontalPodAutoscaler (2)
- All new resources disabled by default, opt-in via values.yaml — avoids breaking existing deployments
- readOnlyRootFilesystem: true added to all containers
- capabilities.drop: [ALL] added to all containers
- NetworkPolicy enforces zero-trust pod-to-pod communication (explicit allow rules only)
- HPA added for kernel and control-plane components
- PDB added for kernel, control-plane, evidence-collector, and dashboard
