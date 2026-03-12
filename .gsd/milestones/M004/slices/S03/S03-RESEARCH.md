# Phase 27: Auth & Access Control Hardening — Research

**Date:** 2026-03-11

## Summary

Hardcoded URLs and silent fallbacks in auth configuration create a class of deployment bugs where production instances silently use development defaults. The fix is to make all deployment-specific auth values required and fail loudly when missing.

## Decisions

- SAML_SP_BASE_URL and SAML_SP_ENTITY_ID are required env vars when SAML is enabled (fail-closed)
- Hardcoded spEntityId example domain removed from Helm values.yaml
- DATABASE_URL required in production via NODE_ENV guard; default only allowed in development
- loadFileOrNull() now logs errors for cert read failures instead of silently returning null
- Dashboard auth-client.ts and auth.ts hardcoded localhost fallbacks removed
- Service-to-service review ingest requires authenticated credentials and enforces user.isService