---
id: "23-01"
parent: "23"
milestone: v1.2
provides:
  - Non-root containers for control-plane and dashboard
  - Air-gapped OPA build path via isolated multi-stage Dockerfile
  - Pinned image tags for reproducible builds
  - Clear separation of production vs local development guidance
key_files:
  - docker/control-plane/Dockerfile
  - docker/dashboard/Dockerfile
  - docker-compose.yml
key_decisions:
  - "OPA download isolated into separate build stage for air-gapped cache replacement"
  - "docker-compose.yml is explicitly local development only"
duration: "1 session"
commit: 03785bd
---

# Phase 23, Task 1 — Summary

Hardened deployment artifacts to match production security expectations. Added non-root users (UID 1000) to control-plane and dashboard Dockerfiles. Isolated OPA download into a separate multi-stage build stage so air-gapped deployments can replace only that stage with a cached binary.

Pinned image tags for minio/minio, minio/mc, alpine, and oven/bun. Separated secure production guidance from convenience-first local defaults — docker-compose.yml is now explicitly local development only. Added root README.
