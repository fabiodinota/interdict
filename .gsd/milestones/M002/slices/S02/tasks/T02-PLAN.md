# T02: Plan 02

**Slice:** S02 — **Milestone:** M002

## Description

Add environment variable config support to the evidence collector and create docker-compose.yml that orchestrates all services with health-based startup ordering.

Purpose: Complete DEPLOY-02 by wiring all Dockerfiles (from Plan 01) into a single `docker compose up` experience. Fix the evidence collector config gap that would prevent Docker env var configuration.

Output: Modified Rust source files (config.rs, main.rs), new docker-compose.yml at repo root.
