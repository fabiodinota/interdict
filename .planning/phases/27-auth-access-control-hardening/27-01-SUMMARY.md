---
id: "27-01"
parent: "27"
milestone: v1.3
provides:
  - Fail-closed SAML configuration requiring explicit env vars
  - No hardcoded localhost fallbacks in production auth paths
  - Required DATABASE_URL in production
  - Typed auth middleware context
key_files:
  - control-plane/src/modules/auth/saml/config.ts
  - control-plane/src/config.ts
  - dashboard/src/lib/auth-client.ts
  - dashboard/src/lib/auth.ts
key_decisions:
  - "SAML_SP_BASE_URL and SAML_SP_ENTITY_ID required when SAML enabled"
  - "Service-to-service review ingest requires authenticated credentials and enforces user.isService"
  - "DATABASE_URL required in production via NODE_ENV guard"
duration: "1 session"
commit: 794af14
---

# Phase 27, Task 1 — Summary

Hardened auth configuration by removing all hardcoded URLs and enforcing explicit env vars for production deployments. The core pattern was replacing silent fallbacks with loud failures — production should never silently use development defaults.

## What Changed

- Removed hardcoded SAML metadata URL and localhost fallbacks from `auth/saml/config.ts`
- `SAML_SP_BASE_URL` and `SAML_SP_ENTITY_ID` now required env vars when SAML is enabled
- Removed hardcoded `spEntityId` example domain from Helm `values.yaml`
- `DATABASE_URL` required in production; default value only allowed when `NODE_ENV !== 'production'`
- Auth middleware macro resolve context now typed
- `loadFileOrNull()` logs errors on SAML cert read failures instead of silent null return
- Dashboard `auth-client.ts` and `auth.ts` hardcoded localhost fallbacks removed
