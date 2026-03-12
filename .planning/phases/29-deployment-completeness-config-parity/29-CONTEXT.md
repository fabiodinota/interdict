# Phase 29: Deployment Completeness & Config Parity — Context

**Gathered:** 2026-03-11
**Status:** Complete

## Why This Phase

The scan found missing healthchecks, resource limits, env var drift, and port mismatches across docker-compose, Dockerfiles, and env.example. These gaps mean deployments silently run without health monitoring, can OOM without limits, and use incorrect connection strings.

## Scope

- Add healthcheck blocks to all services in docker-compose.yml
- Add HEALTHCHECK instructions to all Dockerfiles
- Add resource limits to all core services in docker-compose.yml
- Fix env var naming drift and port mismatches
- Add missing env vars to env.example
- Make CONTROL_PLANE_URL configurable via env override
- Fix ClickHouse default user security
- Align evidence-collector Helm deployment with new config flags

## Key Files

- `docker-compose.yml`
- `env.example`
- `docker/kernel/Dockerfile`
- `docker/control-plane/Dockerfile`
- `docker/evidence-collector/Dockerfile`
