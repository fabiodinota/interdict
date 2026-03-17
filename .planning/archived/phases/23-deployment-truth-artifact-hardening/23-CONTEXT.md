# Phase 23: Deployment Truth and Artifact Hardening — Context

**Gathered:** 2026-03-10
**Status:** Complete

## Why This Phase

Containers ran as root. Image tags were unpinned. The OPA binary download happened inline during build with no path for air-gapped environments. Production guidance and convenience-first local defaults were conflated. The deployment story didn't match production security expectations.

## Scope

- Add non-root users to control-plane and dashboard Dockerfiles
- Isolate OPA download into separate build stage for air-gapped cache replacement
- Pin all image tags (minio/minio, minio/mc, alpine, oven/bun)
- Separate production guidance from local defaults
- Add root README

## Key Files

- `docker/control-plane/Dockerfile`
- `docker/dashboard/Dockerfile`
- `docker-compose.yml`
