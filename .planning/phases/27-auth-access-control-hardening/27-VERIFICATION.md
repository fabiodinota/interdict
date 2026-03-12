# Phase 27: Auth & Access Control Hardening — Verification

**Status:** PASS
**Commit:** 794af14
**Date:** 2026-03-11

## Exit Criteria

- [x] Every route has explicit auth or documented exemption
- [x] Zero hardcoded credentials in production code
- [x] Zero hardcoded domain URLs outside NODE_ENV-guarded dev defaults
- [x] SAML_SP_BASE_URL and SAML_SP_ENTITY_ID required when SAML enabled
- [x] DATABASE_URL required in production
- [x] Service-to-service review ingest enforces user.isService
- [x] No silent null returns on cert read failures
