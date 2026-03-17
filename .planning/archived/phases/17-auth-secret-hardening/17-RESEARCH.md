# Phase 17: Auth Secret Hardening and JS Gates — Research

**Date:** 2026-03-10

## Summary

The SAML handoff flow stored raw bearer credentials in the `saml_handoff_codes` table. The fix mints sessions on-the-fly during code exchange so no bearer credential ever sits in Postgres.

## Decision

- Session minted on-the-fly during SAML code exchange (no persistent bearer)
- TypeScript strictness enforced via CI (`tsc --noEmit`, `bun test`, `next build`)
- ESLint 9 flat config adopted for dashboard
