# T06: Plan 06

**Slice:** S03 — **Milestone:** M001

## Description

Wire ContentInspector.inspect_request() into the CONNECT tunnel handler so outbound prompts are actually inspected before reaching the AI vendor — closing the partial gap where the inspector existed but was never called in the proxy hot path.

Purpose: ROADMAP SC1/SC2 state that prompts "are intercepted" — this requires the proxy tunnel to call the inspector. The 03-03 plan explicitly deferred this; this gap closure implements it. Uses tokio::io::split to create read/write halves of TLS streams so outbound data (client→upstream) passes through ContentInspector before forwarding.

Output: connect.rs spawned task calls inspect_request on accumulated outbound data; relay.rs gets an inspecting_relay_outbound helper; #[allow(dead_code)] removed from content_inspector field.
