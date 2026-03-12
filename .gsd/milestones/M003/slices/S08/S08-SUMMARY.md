---
id: S08
parent: M003
milestone: M003
provides:
  - Non-root containers for control-plane and dashboard
  - Air-gapped OPA build path via isolated multi-stage Dockerfile
  - Pinned image tags for reproducible builds
  - Clear separation of production vs local development guidance
requires: []
affects: []
key_files: []
key_decisions: []
patterns_established: []
observability_surfaces: []
drill_down_paths: []
duration: 1 session
verification_result: passed
completed_at: 
blocker_discovered: false
---
# S08: Deployment Truth Artifact Hardening

**# Phase 23, Task 1 — Summary**

## What Happened

# Phase 23, Task 1 — Summary

Hardened deployment artifacts to match production security expectations. Added non-root users (UID 1000) to control-plane and dashboard Dockerfiles. Isolated OPA download into a separate multi-stage build stage so air-gapped deployments can replace only that stage with a cached binary.

Pinned image tags for minio/minio, minio/mc, alpine, and oven/bun. Separated secure production guidance from convenience-first local defaults — docker-compose.yml is now explicitly local development only. Added root README.
