# Agent Workflow Rules

Use specialized agents to keep context focused and outputs auditable.

## Default Subagent Chain

1. `rust-engineer`: implement feature/fix + unit/integration tests.
2. `security-auditor`: review attack surface, data leakage, and invariant compliance.
3. `k8s-specialist`: validate sidecar/Kubernetes deployment effects where infra is touched.
4. `multi-agent-coordinator`: produce final synthesis, risk call, and rollout guidance.

## Task Routing Guidance

- Rust core logic and perf-sensitive paths -> `rust-engineer`
- Auth, cryptography, logging, policy bypass concerns -> `security-auditor`
- Helm/manifests/networking/deploy pipelines -> `k8s-specialist`
- Multi-part milestones and tradeoff decisions -> `multi-agent-coordinator`

## Execution Standards

- Keep prompts scoped to one objective and explicit verification commands.
- Require deterministic verification output (tests/benchmarks/lints).
- Capture key decisions in planning docs (`STATE.md`, summaries) when applicable.
