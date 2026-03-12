# T01: Plan 01

**Slice:** S02 — **Milestone:** M002

## Description

Create multi-stage Dockerfiles for all four Interdict services, entrypoint scripts, TOML config template, env.example, and .dockerignore.

Purpose: Satisfy DEPLOY-01 by packaging every service as a buildable container image. These Dockerfiles are the foundation that docker-compose.yml (Plan 02) references.

Output: 11 new files in `docker/`, `env.example`, and `.dockerignore`.
