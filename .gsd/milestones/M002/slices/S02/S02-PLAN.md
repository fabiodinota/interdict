# S02: Container Images Docker Compose

**Goal:** Create multi-stage Dockerfiles for all four Interdict services, entrypoint scripts, TOML config template, env.
**Demo:** Create multi-stage Dockerfiles for all four Interdict services, entrypoint scripts, TOML config template, env.

## Must-Haves


## Tasks

- [x] **T01: Plan 01**
  - Create multi-stage Dockerfiles for all four Interdict services, entrypoint scripts, TOML config template, env.example, and .dockerignore.

Purpose: Satisfy DEPLOY-01 by packaging every service as a buildable container image. These Dockerfiles are the foundation that docker-compose.yml (Plan 02) references.

Output: 11 new files in `docker/`, `env.example`, and `.dockerignore`.
- [x] **T02: Plan 02**
  - Add environment variable config support to the evidence collector and create docker-compose.yml that orchestrates all services with health-based startup ordering.

Purpose: Complete DEPLOY-02 by wiring all Dockerfiles (from Plan 01) into a single `docker compose up` experience. Fix the evidence collector config gap that would prevent Docker env var configuration.

Output: Modified Rust source files (config.rs, main.rs), new docker-compose.yml at repo root.

## Files Likely Touched

