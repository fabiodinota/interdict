# Phase 18: Reporting Integrity and Scope Truth — Context

**Gathered:** 2026-03-10
**Status:** Complete

## Why This Phase

Reports silently returned fake success on storage failures. Policy scope (org/dept/team) was placeholder-only — distribution sent all policies to all kernels regardless of scope assignment.

## Scope

- Replace silent report fallbacks with explicit failure surfacing
- Fix N+1 and partition-pruning issues in reporting queries
- Add policy_scope_assignments table and enforce hierarchical filtering
- Populate gRPC PolicyScope fields from real scope assignments
