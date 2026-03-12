# Phase 28: Observability & Error Honesty — Context

**Gathered:** 2026-03-11
**Status:** Complete

## Why This Phase

The scan found bare `.catch(() => {})` and `.catch(() => [])` patterns throughout the TypeScript control plane. These silently swallow errors, making production failures invisible to operators and future agents. Error honesty is a prerequisite for debuggable systems.

## Scope

- Replace all silent catch blocks with contextual error logging
- Ensure every catch block either re-throws, returns error state, or logs with context
- Cover anomaly detection, auth, CSV/PDF generation, distribution, and review services
- Add debug logging for compiler worker temp directory cleanup
- Zero bare catch {} remaining in production TypeScript

## Key Files

- `control-plane/src/modules/anomalies/service.ts`
- `control-plane/src/modules/auth/service.ts`
- `control-plane/src/modules/reviews/service.ts`
- `control-plane/src/modules/distribution/server.ts`
