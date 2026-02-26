# Feature Landscape

**Domain:** AI Governance & Compliance Proxy for Regulated Enterprises
**Researched:** 2026-02-26
**Confidence:** MEDIUM-HIGH (multi-source competitive analysis + regulatory requirements)

---

## Table Stakes

Features users expect. Missing = product feels incomplete. Regulated enterprise buyers (CISOs, compliance officers, legal/risk teams at banks, law firms, hospitals) will not purchase without these.

| # | Feature | Why Expected | Complexity | Notes |
|---|---------|--------------|------------|-------|
| T1 | **Real-Time Prompt/Response Inspection** | Every competitor (Lasso, CalypsoAI/F5, Purview) offers this. Gartner AI TRiSM framework mandates runtime inspection. Without it, you are a logging tool, not a governance tool. | High | Core data plane capability. Must handle streaming (SSE), not just request/response. Interdict's sliding-window token buffer is the right approach. |
| T2 | **PII/Sensitive Data Detection & Redaction** | 90%+ of enterprise AI security incidents involve data leakage. Buyers list DLP-for-AI as requirement #1 in procurement checklists. Every competitor has this. GDPR/HIPAA make it legally mandatory. | High | Must detect PII, PHI, PCI, API keys, secrets, proprietary code, and custom patterns. Must support both blocking and redaction (replace with placeholder, not just reject). Named entity recognition + regex hybrid approach. |
| T3 | **Policy Enforcement (Block/Allow/Redact)** | The fundamental value proposition. Lasso, CalypsoAI, and Purview all enforce policies at runtime. Without enforcement, you are a monitor, not a control. | High | Three actions minimum: block (reject request), allow (pass through), redact (modify and pass). Must support per-department, per-user, per-vendor granularity. |
| T4 | **Audit Trail with Full Attribution** | EU AI Act Article 12 requires logging. Every regulated enterprise needs audit evidence for regulators. All competitors offer this. Banks need 7+ year retention. | Med | Every AI interaction logged with: who (user identity), what (prompt hash, response hash), when, which model/vendor, policy decision, and why (rule that triggered). Prompt/response content storage should be configurable (some customers want full text, others only hashes for privacy). |
| T5 | **SSO/IdP Integration (OIDC + SAML)** | Enterprise procurement blocks any product without SSO. Non-negotiable for banks, hospitals, government. Every enterprise product ships this. | Med | OIDC (Okta, Azure AD, Google Workspace) and SAML 2.0 (legacy enterprise IdPs). Must map every AI action to a verified corporate identity -- this is what makes audit trails meaningful. |
| T6 | **Role-Based Access Control (RBAC)** | Enterprise buyers need separation of duties. Compliance officers, admins, auditors, department managers all need different views and permissions. Standard enterprise requirement. | Med | Minimum roles: Super Admin, Compliance Officer, Policy Admin, Department Manager, Read-Only Auditor. CalypsoAI and Lasso both have RBAC. Auditor role is critical for regulated industries -- external regulators need read-only access to evidence. |
| T7 | **Vendor/Model Allowlisting** | Enterprises need to control which AI vendors employees can use. Shadow AI (90% of enterprise AI usage is unapproved) is the #1 CISO concern. CalypsoAI, Lasso, and Purview all offer this. | Low | Approve/block specific AI vendors and model versions. Per-department granularity (legal team gets GPT-4 but not open-source models; engineering gets Copilot). Must include version pinning -- model updates can change behavior. |
| T8 | **Compliance Dashboard & Reporting** | CISOs and compliance officers need visual evidence of regulatory compliance for board presentations and regulator inquiries. All governance platforms have dashboards. Gartner lists this as core AI TRiSM capability. | Med | Real-time policy violation stats, compliance posture by regulation, trend analysis, exportable reports (PDF/CSV) for regulators. Must show: total interactions governed, violations caught, violations by type/department/vendor. |
| T9 | **Regulatory Framework Mapping** | EU AI Act enforcement begins August 2026. NIST AI RMF is the US standard. Buyers want "turn on EU AI Act compliance" not "figure out which policies to write." Every governance platform (Credo AI, Holistic AI, OneTrust) maps to frameworks. | Med | Pre-built policy packs for: EU AI Act, GDPR, NIST AI RMF, ISO 42001, HIPAA, SOC 2. Selecting a jurisdiction auto-enables relevant policy configurations. Must map individual policies to specific regulatory articles for audit evidence. |
| T10 | **Prompt Injection / Jailbreak Detection** | Core AI security threat. HiddenLayer, CalypsoAI, and Lasso all detect prompt injection attacks. OWASP Top 10 for LLMs lists this as #1 vulnerability. Customers will ask about this in every sales call. | High | Detect direct and indirect prompt injection, jailbreak attempts, prompt leaking attacks. Layer 2 NLP classifier in Interdict's pipeline is the right place for this. Must evolve continuously as attack techniques change. |
| T11 | **VPC/On-Premises Deployment** | Regulated enterprises (banks, hospitals, government) will not send data to a SaaS vendor. This is a hard procurement blocker. CalypsoAI supports on-prem. Microsoft Purview is cloud-only (weakness). | Med | Docker Compose for smaller deployments (law firm pilot), Helm chart for Kubernetes. All data stays in customer perimeter. No phone-home telemetry. Air-gapped mode is future but VPC-native is day-one. |
| T12 | **Integration with Existing Security Stack** | Enterprise buyers demand SIEM/SOAR integration. They will not adopt a governance tool that creates a new silo. Lasso, CalypsoAI, and Purview all integrate with security stacks. | Med | At minimum: webhook/syslog for SIEM integration (Splunk, Sentinel, QRadar), API for programmatic access. SOAR integration (automated incident response) is a fast-follow. |

## Differentiators

Features that set Interdict apart from competitors. Not expected by default, but create competitive advantage and justify premium pricing. These are where Interdict's architecture enables capabilities competitors cannot match.

| # | Feature | Value Proposition | Complexity | Notes |
|---|---------|-------------------|------------|-------|
| D1 | **Inline Prevention (Not Post-Hoc Monitoring)** | Microsoft Purview and Lasso are primarily post-hoc -- they log and alert after the fact. Interdict blocks violations before data reaches the AI vendor. This is the single most important architectural differentiator. Gartner's 2025 AI TRiSM report highlights that 80% of unauthorized AI transactions stem from internal policy violations -- post-hoc detection means the damage is already done. | Already designed | This is Interdict's core architecture. The transparent proxy + Wasm policy engine achieves this. Market it as "firewall for AI" not "monitoring for AI." |
| D2 | **Cryptographically Signed, Tamper-Proof Audit Trails** | No competitor offers Ed25519-signed, Merkle-tree-anchored evidence chains. CalypsoAI and Lasso have "immutable logs" but these are database records -- an admin with DB access can modify them. Interdict's hash-chain + digital signatures provide mathematical proof of non-tampering. Academic research (arxiv.org/abs/2511.17118) validates this approach for regulated AI workflows. | High | SHA-256 hash chain, Ed25519 signatures, Merkle tree batching, S3 Object Lock (WORM) anchoring. This is the kind of evidence that stands up in court and satisfies regulators who understand cryptography. Major differentiator for banks and law firms. |
| D3 | **Streaming-First Response Inspection** | Most competitors inspect complete request/response pairs. Interdict inspects streaming responses in real-time via sliding-window token buffer and can sever connections mid-stream with `[REDACTED BY INTERDICT POLICY]`. No competitor publicly claims mid-stream interception capability. This matters because modern AI APIs stream by default. | Very High | Holding 5-10 tokens back for multi-token pattern detection while maintaining low latency is technically demanding. But it is the only correct approach -- non-streaming inspection misses real-time violations and adds unacceptable latency to user experience. |
| D4 | **Policy-as-Code via Wasm** | OPA/Rego is the industry standard for policy-as-code, but executing policies as compiled Wasm modules inside the data plane is novel for AI governance. Competitors use interpreted rules or cloud-side evaluation (adding latency). Wasm gives: deterministic execution (<2ms), sandboxed safety, hot-reload without restart, and customer-extensible policies. | High | Compile Rego/YAML rules to Wasm, push to kernel fleet via gRPC. Customers can write custom policy modules. This enables "governance-as-infrastructure" positioning that no SaaS dashboard competitor can match. |
| D5 | **Multi-Turn Session Context Tracking** | Most competitors evaluate individual messages in isolation. Interdict tracks session context across multi-turn conversations, detecting policy violations that only emerge across multiple exchanges (e.g., an employee gradually revealing confidential information across 10 messages that individually seem harmless). | High | Requires session state management in the data plane. Critical for catching "slow leak" data exfiltration and context-dependent policy violations. Few competitors mention this capability. |
| D6 | **Sub-10ms Latency Overhead** | CalypsoAI claims "low latency" but does not publish numbers. Lasso and Purview do not publish latency overhead. Interdict's target of <10ms p99 (aspirationally <5ms) with a Rust data plane is a concrete, measurable claim that resonates with DevOps teams who will otherwise block governance tool adoption. | High | Rust kernel, zero-copy I/O, async pipeline, Wasm policy execution. Performance is a feature -- DevOps teams uninstall governance tools that add noticeable latency. Publish benchmarks in marketing. |
| D7 | **3-Layer Policy Pipeline with Escalation** | Competitors use either fast-but-dumb regex/rules OR slow-but-smart LLM classification. Interdict's 3-layer pipeline (Wasm rules <2ms -> NLP classifier <10ms -> async human review) covers 95%+ deterministically while gracefully escalating edge cases. This avoids the false-positive fatigue of rules-only systems and the latency/cost of LLM-in-path systems. | High | Layer 1 handles clear violations instantly. Layer 2 catches nuanced violations. Layer 3 provides human judgment for genuine edge cases. The key insight: never put an LLM in the synchronous enforcement path. |
| D8 | **Evidence Bundle Verification UI** | Auditors and regulators can independently verify the integrity of the entire audit chain through the dashboard -- verify hash chains, check signatures, view Merkle proofs. No competitor offers self-service evidence verification. This matters because regulated enterprises need to prove evidence was not altered after collection. | Med | Verification UI that shows: chain integrity status, individual bundle signatures, Merkle tree structure, anchoring proof. External auditors get read-only access to verify independently. |
| D9 | **Department-Level Policy Segmentation** | Most competitors apply policies organization-wide. Interdict supports per-department, per-team, per-role policy configuration. A law firm's litigation team has different AI governance needs than their corporate team. A bank's trading desk vs. HR department. | Med | Policy inheritance model: organization defaults -> department overrides -> team overrides. Compliance officers configure without IT involvement. Critical for large enterprises with diverse AI usage patterns. |
| D10 | **Agentic AI / MCP Gateway Governance** | Emerging market need (2026). MCP is becoming the standard for AI agent-to-tool communication. Lasso just launched an open-source MCP security gateway. Proofpoint acquired Acuvity for agentic AI security. Singapore published an agentic AI governance framework in January 2026. Interdict's proxy architecture naturally extends to govern MCP traffic -- intercept agent tool calls, enforce authorization policies, log tool usage. | Very High | Not MVP but critical for 2026-2027 relevance. Agentic AI creates far more governance surface area than chat-based AI. Interdict's architecture (transparent proxy + policy engine) is uniquely suited for this -- agents cannot bypass an inline proxy like they can bypass a SaaS monitoring dashboard. |
| D11 | **Fail-Closed / Fail-Open Toggle** | Per-policy configuration for what happens when the governance kernel is unavailable or encounters an error. Banks want fail-closed (block everything if governance is down). Development teams want fail-open (don't block developers if governance is temporarily unavailable). No competitor explicitly offers per-policy fail-mode configuration. | Low | Simple but powerful for regulated enterprise sales. Shows architectural maturity and understanding of different risk appetites. |
| D12 | **Shadow AI Discovery** | 90% of enterprise AI usage is unapproved. Network-level detection of which AI services employees are using (even unapproved ones) is a CISO's top priority. Lasso and Palo Alto are leaders here. Interdict's Phase 1 is opt-in proxy, but Shadow AI discovery should be on the roadmap. | High | Phase 2+ capability. Requires network-level visibility (DNS analysis, SSL inspection integration, CASB integration). Not MVP but essential for full enterprise value. |

## Anti-Features

Features to explicitly NOT build. These are traps that seem valuable but would either dilute the product, compromise architecture, or misalign with the market position.

| # | Anti-Feature | Why Avoid | What to Do Instead |
|---|--------------|-----------|-------------------|
| A1 | **LLM-Powered Inline Policy Enforcement** | LLMs in the enforcement path are too slow (100ms-2s), too expensive ($0.01-0.10/call at scale), and non-deterministic (same input -> different output). This violates the <10ms latency budget and makes policy decisions unpredictable. CalypsoAI uses LLM-based scanners which adds cost and latency. | Use deterministic Wasm/Rego rules (Layer 1) and lightweight NLP classifiers (Layer 2) for inline enforcement. LLMs only for async edge-case review (Layer 3) where latency does not matter. |
| A2 | **AI Model Training/Fine-Tuning** | Interdict is governance infrastructure, not a model platform. Adding model capabilities confuses the market position and competes with every AI vendor you need as a partner. Protect AI and HiddenLayer focus on model security -- different market segment. | Stay model-agnostic. Govern any AI vendor's traffic. Let customers use whatever models they want. |
| A3 | **SaaS-Only Deployment** | Regulated enterprises will not send AI traffic to a third-party SaaS for inspection. This is a hard procurement blocker for banks, hospitals, and government agencies. CalypsoAI's SaaS-first approach limits their market in highly regulated verticals. | VPC-native deployment only (Docker Compose + Helm). Data never leaves customer perimeter. This is a core differentiator vs. SaaS competitors. |
| A4 | **Chat Interface / AI Assistant** | Building a ChatGPT-like frontend positions Interdict as a chatbot platform, not infrastructure. Employees should never interact with Interdict directly -- it should be invisible. | Interdict is invisible infrastructure. The dashboard is for CISOs and compliance officers, not end users. Employees interact with their normal AI tools; Interdict governs transparently. |
| A5 | **Blockchain-Based Audit Trail** | Private Merkle trees with S3 Object Lock (WORM) achieve identical tamper-evidence guarantees at vastly lower complexity, cost, and latency. Blockchain adds consensus overhead, requires node management, and signals "crypto" to enterprise buyers (negative connotation). | Ed25519 signatures + SHA-256 hash chains + Merkle trees + S3 Object Lock. Same mathematical guarantees, zero blockchain overhead. |
| A6 | **General-Purpose API Gateway** | Becoming a generic API gateway (rate limiting, load balancing, routing for non-AI traffic) dilutes the AI governance positioning and competes with Kong, Envoy, and NGINX. | Focus exclusively on AI traffic governance. Integrate with existing API gateways via sidecar/plugin model rather than replacing them. |
| A7 | **Per-Seat SaaS Pricing** | Per-seat pricing penalizes adoption and encourages shadow AI. If governance costs scale linearly with users, CISOs will limit rollout to a subset of employees, defeating the purpose. | Price per kernel instance or per throughput tier. Encourage governing ALL AI traffic, not just select users. Align pricing with infrastructure value, not user count. |
| A8 | **AI Ethics / Bias Detection Platform** | Ethics and bias detection (fairness, explainability, model cards) is a different market segment served by Credo AI, Arthur AI, and IBM watsonx.governance. Mixing governance-of-usage with governance-of-models creates product confusion. | Focus on governing AI usage (who uses what AI, with what data, under what policies). Let Credo AI handle model fairness. Interdict may integrate with ethics platforms but should not become one. |
| A9 | **Mobile App** | Enterprise governance tools are administered from desktops. Mobile adds development cost, security surface, and maintenance burden with minimal value. No AI governance competitor has a mobile app for good reason. | Web-first dashboard (Next.js) with responsive design for tablet use if needed. |
| A10 | **Custom LLM Marketplace** | Hosting or brokering access to AI models makes Interdict a vendor, not infrastructure. Creates conflicts of interest with model providers whose traffic you govern. | Stay model-agnostic and vendor-neutral. Govern traffic to any model provider without preference. |

## Feature Dependencies

```
T5 (SSO/IdP) -> T4 (Audit Trail with Attribution)
  Attribution requires verified identity from SSO

T5 (SSO/IdP) -> T6 (RBAC)
  Role-based access requires identity

T3 (Policy Enforcement) -> T1 (Prompt/Response Inspection)
  Enforcement decisions require inspection results

T3 (Policy Enforcement) -> T2 (PII/Sensitive Data Detection)
  PII redaction is a policy enforcement action

T1 (Prompt/Response Inspection) -> D3 (Streaming Inspection)
  Streaming is the implementation of inspection

D4 (Policy-as-Code Wasm) -> T3 (Policy Enforcement)
  Wasm runtime is how policies execute

T4 (Audit Trail) -> D2 (Cryptographic Signing)
  Crypto signing builds on top of audit trail creation

T4 (Audit Trail) -> T8 (Compliance Dashboard)
  Dashboard visualizes audit trail data

T9 (Regulatory Mapping) -> T3 (Policy Enforcement)
  Regulatory frameworks activate policy sets

D2 (Cryptographic Signing) -> D8 (Evidence Verification UI)
  Verification UI requires signed evidence to exist

T7 (Vendor Allowlist) -> T3 (Policy Enforcement)
  Vendor blocking is a policy enforcement action

D5 (Session Tracking) -> T1 (Prompt/Response Inspection)
  Session context enhances inspection accuracy

T11 (VPC Deployment) -> T12 (Security Stack Integration)
  SIEM integration happens within VPC

D1 (Inline Prevention) -> D6 (Sub-10ms Latency)
  Inline enforcement must be fast to be viable

D9 (Department Segmentation) -> T6 (RBAC)
  Department policies require department-scoped roles

D10 (Agentic AI) -> T1 (Prompt/Response Inspection)
  Agent governance extends the inspection pipeline

D12 (Shadow AI Discovery) -> T7 (Vendor Allowlist)
  Discovery feeds into allowlist enforcement
```

## MVP Recommendation

For the law firm pilot (~80 employees) and small bank, prioritize features that enable the core value proposition: inline governance with auditable evidence.

**Must ship for pilot (Phase 1):**

1. **T1 - Prompt/Response Inspection** -- the core data plane capability
2. **T2 - PII/Sensitive Data Detection** -- #1 buyer concern for law firms and banks
3. **T3 - Policy Enforcement (Block/Allow/Redact)** -- the enforcement actions
4. **T7 - Vendor/Model Allowlisting** -- simple but immediately valuable for controlling which AI tools are used
5. **D1 - Inline Prevention** -- the architectural differentiator, not a feature to add but the way everything works
6. **T4 - Audit Trail with Attribution** -- paired with basic identity (API key / JWT initially, full SSO can follow)
7. **D4 - Policy-as-Code via Wasm** -- the enforcement engine

**Ship in Phase 2 (enterprise readiness):**

8. **T5 - SSO/IdP Integration** -- required for larger enterprise sales but API key auth works for pilot
9. **T6 - RBAC** -- required for larger enterprises, pilot can use admin-only access
10. **T8 - Compliance Dashboard** -- visual evidence for compliance officers
11. **T9 - Regulatory Framework Mapping** -- pre-built policy packs for EU AI Act, GDPR
12. **D2 - Cryptographic Signing** -- the evidence chain differentiator
13. **T10 - Prompt Injection Detection** -- Layer 2 NLP classifier
14. **T12 - SIEM Integration** -- webhook/syslog output

**Defer to Phase 3+:**

- **D3 - Streaming Inspection** -- implement basic request/response first, add streaming mid-stream interception after core is stable. Actually, per PROJECT.md, the architecture decision is streaming-first since non-streaming would be throwaway code. Resolve this tension: if the Rust kernel is streaming-first from day one (correct decision), this is Phase 1 but at very high complexity cost.
- **D5 - Session Tracking** -- valuable but not required for pilot
- **D8 - Evidence Verification UI** -- dashboard feature, not kernel capability
- **D10 - Agentic AI Governance** -- emerging market, not pilot requirement
- **D12 - Shadow AI Discovery** -- requires network-level capabilities beyond proxy

**Explicitly defer (Phase 4+):**

- **D10 - Full MCP Gateway Governance** -- market is still forming
- **D12 - Shadow AI Discovery** -- requires network-level interception architecture

## Competitive Positioning Matrix

| Feature Area | Interdict | Purview | CalypsoAI/F5 | Lasso | Credo AI | HiddenLayer |
|-------------|-----------|---------|--------------|-------|----------|-------------|
| Inline prevention | YES (core) | No (post-hoc) | Partial | Partial | No | No |
| Crypto audit trail | YES (signed) | No | No | "Immutable" logs | No | No |
| VPC-native | YES | Cloud-only | On-prem option | Cloud-first | Cloud | Cloud |
| Model agnostic | YES | Microsoft only | YES | YES | YES | YES |
| Streaming inspection | YES | No | No | No | N/A | N/A |
| Policy-as-Code | Wasm/Rego | JSON rules | Custom scanners | Dynamic rules | Policy workflows | N/A |
| PII/DLP | YES | YES | YES | YES | No | No |
| Prompt injection | YES (L2) | YES | YES | YES | No | YES |
| Agentic governance | Roadmap | Partial | No | MCP gateway | No | No |
| Shadow AI discovery | Roadmap | Partial | No | YES | No | No |

## Sources

- [Gartner AI TRiSM Market Guide 2025](https://www.gartner.com/en/documents/6185655) -- MEDIUM confidence (paywall, summary only)
- [Lasso Security Enterprise AI Governance](https://www.lasso.security/blog/blog-enterprise-ai-governance) -- HIGH confidence (direct competitor docs)
- [CalypsoAI Inference Platform](https://calypsoai.com/inference-platform/) -- HIGH confidence (direct competitor docs)
- [F5 Acquires CalypsoAI ($180M)](https://www.businesswire.com/news/home/20250911293165/en/F5-to-Acquire-CalypsoAI-to-Bring-Advanced-AI-Guardrails-to-Large-Enterprises) -- HIGH confidence (official press release)
- [Microsoft Purview AI Governance](https://learn.microsoft.com/en-us/purview/ai-microsoft-purview) -- HIGH confidence (official docs)
- [HiddenLayer AISec Platform](https://hiddenlayer.com/aisec-platform/) -- HIGH confidence (direct competitor docs)
- [EU AI Act Compliance 2026](https://secureprivacy.ai/blog/eu-ai-act-2026-compliance) -- MEDIUM confidence (third-party summary)
- [EU AI Act Official Summary](https://artificialintelligenceact.eu/high-level-summary/) -- HIGH confidence (official reference)
- [Cryptographic Evidence Structures for Regulated AI](https://arxiv.org/abs/2511.17118) -- HIGH confidence (peer-reviewed research)
- [Credo AI Platform](https://www.credo.ai/product) -- HIGH confidence (direct competitor docs)
- [Shadow AI: 90% Unapproved Usage](https://www.proofpoint.com/us/threat-reference/shadow-ai) -- MEDIUM confidence (vendor statistic)
- [Singapore Agentic AI Governance Framework 2026](https://www.mintmcp.com/blog/agentic-ai-goverance-framework) -- MEDIUM confidence (third-party summary)
- [Lasso MCP Security Gateway](https://www.lasso.security/resources/lasso-releases-first-open-source-security-gateway-for-mcp) -- HIGH confidence (official press release)
- [OPA/Rego Policy-as-Code Industry Standard](https://www.env0.com/blog/how-policy-as-code-enhances-infrastructure-governance-with-open-policy-agent-opa) -- MEDIUM confidence (industry analysis)
- [AI DLP Best Practices](https://aimultiple.com/ai-dlp) -- MEDIUM confidence (industry analysis)
- [Proofpoint Acquires Acuvity for Agentic AI Security](https://www.proofpoint.com/us/newsroom/press-releases/proofpoint-acquires-acuvity-deliver-ai-security-and-governance-across) -- HIGH confidence (official press release)
