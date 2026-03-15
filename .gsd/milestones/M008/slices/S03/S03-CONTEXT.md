---
id: S03
milestone: M008
status: ready
---

# S03: Input Validation & Output Sanitization — Context

## Goal

Sanitize CSV formula injection, add maxLength constraints to TypeBox string fields, and configure Elysia body size limits — closing M-02, M-05, and L-04.

## Why this Slice

CSV formula injection (M-02) is a real attack vector when compliance officers open exported reports in Excel. Missing body size limits (M-05) allows multi-megabyte payloads through validation. Both are quick, high-value fixes that improve the security posture with minimal effort.

## Scope

### In Scope

- CSV formula-injection prefix sanitization in `escapeCSV()` function
- maxLength constraints on all TypeBox string fields across all model files
- Elysia body size limit configuration (default 1MB)
- Tests for all changes

### Out of Scope

- Changing CSV report structure or content
- Adding new TypeBox validators beyond maxLength
- Request rate limiting (handled in S02)

## Constraints

- CSV formula sanitization must not break legitimate CSV content
- maxLength values must be generous enough to not reject valid data (e.g., Rego source can be 100KB+)
- Body size limit must be configurable via environment variable

## Integration Points

### Consumes

- `control-plane/src/modules/reports/csv-generator.ts` — CSV escaping function
- `control-plane/src/modules/*/model.ts` — TypeBox schema definitions (9 files)
- `control-plane/src/index.ts` — Elysia app configuration

### Produces

- Updated `escapeCSV()` with formula sanitization
- Updated model files with maxLength constraints
- Elysia body limit configuration
- Tests proving sanitization and validation
