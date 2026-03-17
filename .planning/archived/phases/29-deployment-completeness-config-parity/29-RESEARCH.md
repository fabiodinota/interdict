# Phase 29: Deployment Completeness & Config Parity — Research

**Date:** 2026-03-11

## Summary

Config drift between docker-compose.yml, Dockerfiles, env.example, and Helm charts creates deployment failures that only surface at runtime. The fix is mechanical alignment: every service gets healthchecks and resource limits, every env var is documented, and every port/address reference is consistent.

## Decisions

- All services get healthcheck blocks in docker-compose.yml and HEALTHCHECK in Dockerfiles
- Resource limits (deploy.resources.limits) added to all core services
- INTERDICT_EVIDENCE_COLLECTOR_ADDR naming drift fixed to match code expectations
- NEXT_PUBLIC_API_URL port fixed to 3001 in env.example
- CLICKHOUSE_USER and CLICKHOUSE_PASSWORD added to env.example
- CONTROL_PLANE_URL made configurable via env override instead of hardcoded
- ClickHouse default user security hardened
- Evidence-collector Helm deployment aligned with new config flags (require_object_lock, etc.)
- Deployment verification uses rendered Compose config + control-plane/dashboard type/test/build gates
