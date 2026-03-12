# T03: Plan 03

**Slice:** S04 — **Milestone:** M001

## Description

Add the kernel-side evidence buffer with bounded async channel, background 500ms gRPC flusher, and evidence bundle construction from policy pipeline results.

Purpose: The kernel must create evidence bundles asynchronously without adding latency to proxied AI responses (KERN-14). This is the kernel-to-collector bridge -- a bounded mpsc channel collects events, a background task compresses with zstd and streams to the evidence collector via gRPC every 500ms. Evidence loss under backpressure is acceptable (fail-open for evidence); adding latency to AI responses is not.

Output: New `evidence` module in the kernel crate with EvidenceBuffer, RawEvidenceEvent, background flusher, and gRPC client.
