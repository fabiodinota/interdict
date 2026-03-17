---
id: "24-01"
parent: "24"
milestone: v1.2
provides:
  - Zero-trust NetworkPolicy for pod-to-pod communication (4 templates)
  - PodDisruptionBudget for availability during rollouts (4 templates)
  - HorizontalPodAutoscaler for kernel and control-plane (2 templates)
  - Hardened container security contexts across all pods
key_files:
  - helm/interdict/templates/**
  - helm/interdict/values.yaml
key_decisions:
  - "All new resources disabled by default; opt-in via values.yaml"
  - "Zero-trust NetworkPolicy: explicit allow rules only"
duration: "1 session"
commit: 30238f2
---

# Phase 24, Task 1 — Summary

Added 10 new Helm templates: NetworkPolicy (4), PodDisruptionBudget (4), and HorizontalPodAutoscaler (2). All new resources are disabled by default and opt-in via values.yaml to avoid breaking existing deployments.

Hardened all container security contexts with readOnlyRootFilesystem: true and capabilities.drop: [ALL]. NetworkPolicy enforces zero-trust pod-to-pod communication — pods cannot communicate unless explicitly allowed. HPA covers kernel and control-plane. PDB covers kernel, control-plane, evidence-collector, and dashboard.
