# Phase 17: Auth Secret Hardening and JS Gates — Context

**Gathered:** 2026-03-10
**Status:** Complete

## Why This Phase

Raw SAML handoff token persisted in Postgres. JS/TS code could merge with regressions because CI only covered Rust.

## Scope

- Eliminate raw session-token persistence from SAML handoff
- Fix all TypeScript errors in control-plane
- Add control-plane and dashboard CI jobs
- Create proper ESLint config for dashboard
