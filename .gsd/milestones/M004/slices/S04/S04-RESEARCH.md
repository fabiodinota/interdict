# Phase 28: Observability & Error Honesty — Research

**Date:** 2026-03-11

## Summary

Silent error swallowing is a systematic observability gap. The pattern `.catch(() => {})` hides failures at call sites where the developer decided the error "didn't matter" — but in production, every error matters for diagnostics. The fix is mechanical: every catch must either re-throw, return an error state, or log with enough context to diagnose the failure.

## Decisions

- `.catch(() => [])` in anomaly detection replaced with error logging + warnings array propagation
- `.catch(() => {})` in auth lastUsedAt replaced with contextual warn logging
- CSV/PDF generator catch blocks now log errors with context
- Compiler worker temp directory cleanup gets debug-level logging
- Distribution server and review service JSON parse catches now log with context
- Pattern rule: all catch blocks must re-throw, return error state, or log with context — no exceptions