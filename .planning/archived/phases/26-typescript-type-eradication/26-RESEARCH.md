# Phase 26: TypeScript Type Eradication — Research

**Date:** 2026-03-11

## Summary

The Elysia framework's context typing requires explicit casting at route handler boundaries. The existing casts used `ctx as TypedContext` which is unsafe because it skips the intermediate `unknown` step. Service constructors used `any` for database parameters, hiding type mismatches downstream.

## Decisions

- Route handler casts use `ctx as unknown as TypedRouteContext` (two-step cast is TypeScript-safe)
- Service constructors typed with `AppDb` from shared types
- Reports service data processing uses explicit row interfaces instead of inline `any`
- gRPC distribution layer typed with proto-derived types
- `@ts-ignore` for samlify replaced with proper `.d.ts` declaration for `samlify-xsd-schema-validator`
- All 11 dashboard route segments get loading.tsx and error.tsx boundaries
- Reusable `RouteLoading` and `RouteError` components created to avoid duplication
- Documented Elysia workarounds are the only remaining acceptable `any` usage
