# T06: Plan 06

**Slice:** S05 — **Milestone:** M001

## Description

Close the CTRL-06 gap by creating seed directories and Rego policies for the 6 missing regulatory frameworks: NIST AI RMF, Singapore PDPA, India DPDP, China AI Regs, Canada AIDA/PIPEDA, and GCC frameworks.

Purpose: REQUIREMENTS.md specifies pre-built policy packs for 8 regulatory frameworks under CTRL-06. Only EU AI Act and GDPR are implemented. This gap closure adds the remaining 6 using the established seed infrastructure (framework.json + policies/*.rego + run-seed.ts registration).

Output: 6 new seed directories with 24 Rego policies total (4 per framework), and an updated run-seed.ts that includes all 8 framework slugs.
