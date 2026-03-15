---
id: S08
milestone: M008
status: ready
---

# S08: Proto Safety, Config Hygiene & Documentation — Context

## Goal

Add buf validate annotations to proto fields, reduce kernel entrypoint CA validity, document prompt_text/response_text deprecation, and update all project tracking documents to v1.6 — closing all remaining LOW findings and completing the milestone.

## Why this Slice

This is the capstone slice that closes remaining low findings, updates documentation to reflect all M008 changes, and produces a regenerated assessment showing zero remaining high/medium findings. It depends on all prior slices being complete.

## Scope

### In Scope

- L-08: buf validate annotations on proto string/bytes fields
- L-09: Reduce kernel entrypoint CA validity from 10 years to 1 year
- L-10: Document Wasm module size limits and transfer concerns
- L-11: Document prompt_text/response_text deprecation notice in proto comments
- M-08: Add cert expiry monitoring log and document rotation procedure
- Update PROJECT.md, STATE.md, DECISIONS.md with M008 outcomes
- Update operator guide with cert rotation procedure
- Verify all 28 findings are addressed

### Out of Scope

- Removing prompt_text/response_text fields (breaking change)
- Implementing certificate rotation automation
- Changing Wasm transfer mechanism

## Constraints

- Proto changes must maintain backward compatibility (additive annotations only)
- CA validity change only affects newly generated CAs (existing ones unchanged)
- buf validate requires `buf.build/bufbuild/protovalidate` dependency

## Integration Points

### Consumes

- All prior slice outputs (for documentation accuracy)
- `proto/interdict/evidence/v1/evidence.proto`
- `proto/interdict/policy/v1/policy_distribution.proto`
- `docker/kernel/entrypoint.sh`
- `docker/certs/generate-internal-ca.sh`
- `.gsd/PROJECT.md`, `.gsd/STATE.md`, `.gsd/DECISIONS.md`

### Produces

- Validated proto definitions with field constraints
- 1-year CA validity in entrypoint
- Cert expiry monitoring documentation
- Updated project tracking documents
