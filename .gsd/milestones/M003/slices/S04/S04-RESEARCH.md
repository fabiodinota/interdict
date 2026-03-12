# Phase 19: Identity Attribution and Durable Evidence Delivery — Research

**Date:** 2026-03-10

## Summary

Two independent trustworthiness gaps converged: anonymous evidence attribution and silent evidence loss. Both needed to be fixed together because identity-attributed evidence is only valuable if it actually reaches the collector.

## Decisions

- Actor identity extracted from headers: `X-Interdict-Actor-Id`, `X-Interdict-Department`, `X-Interdict-Model`
- ActorIdentity struct threaded through ProxyService -> handle_connect() -> build_evidence_event()
- All 9 hardcoded "anonymous"/"unknown" sites replaced with real identity propagation
- Fire-and-forget flush_batch replaced with bounded retry queue: up to 7 retries, max 64 queued batches
- DeliveryHealth metrics added: batches_sent, batches_failed, events_dropped, retries, consecutive_failures
- High-assurance mode cannot proceed while evidence is actively being dropped