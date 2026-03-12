# Phase 23: Deployment Truth and Artifact Hardening — Research

**Date:** 2026-03-10

## Summary

Deployment artifacts must match the security posture claimed by the product. Running as root, using unpinned images, and normalizing default credentials in production guidance all undermine trust.

## Decisions

- Non-root users (UID 1000) added to control-plane and dashboard Dockerfiles
- OPA download isolated into separate multi-stage Dockerfile build stage — allows air-gapped deployments to replace only that stage with a cached binary
- Image tags pinned: minio/minio, minio/mc, alpine, oven/bun
- Production guidance separated from convenience-first local defaults — docker-compose.yml is explicitly for local development
- Root README added for project orientation