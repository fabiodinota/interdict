# T04: Plan 04

**Slice:** S02 — **Milestone:** M001

## Description

Wire the full 3-layer policy pipeline (L1 Regorus → L2 NLP → L3 human queue) into the proxy CONNECT handler. The pipeline orchestrator evaluates all matching policies, merges verdicts with most-restrictive-wins, handles escalation between layers, dispatches background L2 work, and integrates with the proxy to enforce block/allow/redact on intercepted traffic. Integration tests prove all Phase 2 success criteria.

Purpose: This is the culmination of Phase 2 — connecting all the building blocks (verdicts, Regorus, classifier, queue, redaction) into a working pipeline that the proxy enforces on every intercepted AI request. Without this plan, the components are isolated modules that don't affect actual traffic.

Output: PolicyPipeline in policy/mod.rs, proxy integration in connect.rs, integration tests proving all 5 success criteria.
