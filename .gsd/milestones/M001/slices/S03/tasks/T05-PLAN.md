# T05: Plan 05

**Slice:** S03 — **Milestone:** M001

## Description

Implement prompt injection and jailbreak detection via Layer 2 NLP heuristic classifier, closing the PLCY-11 orphaned requirement.

Purpose: PLCY-11 is listed as a Phase 3 requirement in ROADMAP.md but was systematically dropped from all plan execution. This gap closure implements the detection using heuristic string patterns (as specified for Phase 3 — full ML classifier is a future phase) and wires it into ContentInspector.

Output: InjectionDetector module with 3 pattern categories (direct injection, jailbreak, indirect injection), wired into ContentInspector so inject/jailbreak prompts return Block action. Integration tests prove PLCY-11 coverage.
