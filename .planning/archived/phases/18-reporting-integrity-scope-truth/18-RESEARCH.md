# Phase 18: Reporting Integrity and Scope Truth — Research

**Date:** 2026-03-10

## Decision

- Report sections return null (not fake data) when upstream fails; warnings array surfaces failures
- N+1 fixed via JOINs and GROUP BY aggregations
- Scope assignments stored in dedicated Postgres table
- Distribution server and compiler worker populate scope from assignments (no more empty strings)
- scopeMatchesKernel() implements hierarchical filtering in buildFullSnapshot()
