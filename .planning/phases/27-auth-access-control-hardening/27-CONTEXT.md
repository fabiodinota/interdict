# Phase 27: Auth & Access Control Hardening — Context

**Gathered:** 2026-03-11
**Status:** Complete

## Why This Phase

The scan found hardcoded SAML metadata URLs, localhost fallbacks in production auth paths, and missing env var guards. These patterns allow deployments to silently use insecure defaults and bypass intended auth configuration.

## Scope

- Remove all hardcoded SAML metadata URLs and localhost fallbacks
- Make SAML_SP_BASE_URL and SAML_SP_ENTITY_ID required env vars (when SAML enabled)
- Remove hardcoded spEntityId from Helm values
- Require DATABASE_URL in production (NODE_ENV guard)
- Type auth middleware macro resolve context
- Add error logging for SAML cert read failures
- Remove hardcoded localhost fallbacks from dashboard auth

## Key Files

- `control-plane/src/modules/auth/saml/config.ts`
- `control-plane/src/config.ts`
- `dashboard/src/lib/auth-client.ts`
- `dashboard/src/lib/auth.ts`
