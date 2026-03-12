---
name: regulatory-map-generator
description: Map legal controls to enforceable Interdict policy capabilities.
---

# /regulatory-map-generator

Translate regulatory requirements into technical enforcement mappings.

## Inputs

- Jurisdiction/framework list (for example: EU AI Act, GDPR, NIST AI RMF)
- Current policy capability inventory
- Gap/assurance targets

## Steps

1. Break regulation into control obligations.
2. Map each obligation to existing enforcement controls.
3. Flag missing controls and classify by severity (blocker/high/medium/low).
4. Propose implementation tasks with requirement IDs.

## Output

- Control-to-policy mapping table
- Gap list with priority and suggested phase placement
- Traceability updates for `REQUIREMENTS.md` and roadmap planning
