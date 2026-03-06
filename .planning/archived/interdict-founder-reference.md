# AI Governance Kernel — Master Technical & Strategic Reference Document

> **Last Updated:** February 2026
> **Status:** Early-Stage, Pre-Seed
> **Classification:** Internal Founder Reference
> **Compiled from:** Product Concept Research & Development PDF + Gemini Architecture Sessions

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What Interdict.io Is — And Is Not](#2-what-Interdict.io-is--and-is-not)
3. [The Problem Interdict.io Solves](#3-the-problem-Interdict.io-solves)
4. [Regulatory Landscape](#4-regulatory-landscape)
5. [Product Architecture — Full Technical Deep Dive](#5-product-architecture--full-technical-deep-dive)
   - 5.1 [Control Plane vs. Data Plane](#51-control-plane-vs-data-plane)
   - 5.2 [The Data Plane (The Kernel)](#52-the-data-plane-the-kernel)
   - 5.3 [The Control Plane (The Brain)](#53-the-control-plane-the-brain)
   - 5.4 [The Audit Pipeline (The Black Box)](#54-the-audit-pipeline-the-black-box)
6. [Deployment Patterns](#6-deployment-patterns)
   - 6.1 [VPC-Native Deployment](#61-vpc-native-deployment)
   - 6.2 [Kubernetes Sidecar Pattern](#62-kubernetes-sidecar-pattern)
   - 6.3 [Envoy Proxy Filter Integration](#63-envoy-proxy-filter-integration)
   - 6.4 [eBPF-Based Interception](#64-ebpf-based-interception)
   - 6.5 [Advanced Trust & Enforcement Ideas — Feasibility Review](#65-advanced-trust--enforcement-ideas--feasibility-review)
7. [Wasm-Based Policy Plugins](#7-wasm-based-policy-plugins)
8. [Cryptographic Evidence Bundles](#8-cryptographic-evidence-bundles)
   - 8.1 [The Concept in Plain English](#81-the-concept-in-plain-english)
   - 8.2 [Technical Implementation](#82-technical-implementation)
   - 8.3 [Merkle Tree Structure](#83-merkle-tree-structure)
   - 8.4 [Anchoring & External Immutability](#84-anchoring--external-immutability)
9. [Streaming AI Inspection — The Hardest Challenge](#9-streaming-ai-inspection--the-hardest-challenge)
10. [Policy Enforcement Engine](#10-policy-enforcement-engine)
11. [Identity & Access Integration](#11-identity--access-integration)
12. [Current Prototype State & Technical Debt](#12-current-prototype-state--technical-debt)
13. [Technology Stack Recommendations](#13-technology-stack-recommendations)
14. [Production-Readiness Checklist](#14-production-readiness-checklist)
15. [Implementation Roadmap (Phases)](#15-implementation-roadmap-phases)
16. [Critical To-Dos and Not-To-Dos](#16-critical-to-dos-and-not-to-dos)
17. [Core Features — Full Product Spec](#17-core-features--full-product-spec)
18. [Target Markets & Use Cases](#18-target-markets--use-cases)
19. [Competitor Landscape & Positioning](#19-competitor-landscape--positioning)
20. [Competitive Moat Analysis](#20-competitive-moat-analysis)
21. [Business Model & Pricing Philosophy](#21-business-model--pricing-philosophy)
22. [Go-To-Market Strategy](#22-go-to-market-strategy)
23. [Current Traction & Pilot Partners](#23-current-traction--pilot-partners)
24. [Future Product Vision — Ecosystem Expansion](#24-future-product-vision--ecosystem-expansion)
25. [Co-Founder & Team Structure](#25-co-founder--team-structure)
26. [Equity & Compensation Structures](#26-equity--compensation-structures)
27. [Founder Backgrounds](#27-founder-backgrounds)
28. [IP & Legal Status](#28-ip--legal-status)
29. [Investor & Accelerator Strategy](#29-investor--accelerator-strategy)
30. [System Design Architecture Diagram](#30-system-design-architecture-diagram)
31. [Technical Co-Founder Vetting Guide](#31-technical-co-founder-vetting-guide)
32. [Key Terminology Glossary](#32-key-terminology-glossary)

---

## 1. Executive Summary

**Interdict.io** is an AI compliance and auditing platform — specifically a **kernel-level governance and control layer** — for enterprises operating in regulated industries. It sits as an intercepting infrastructure layer *between* a company's internal users and every AI tool they use (ChatGPT, Microsoft Copilot, internal AI agents, etc.).

Unlike the vast majority of AI startups, which are **SaaS wrappers** (pretty interfaces on top of someone else's model), Interdict.io is infrastructure. It is analogous to:

- **Check Point / Palo Alto Networks** — but for the AI era instead of network packets
- **IAM (Identity & Access Management)** — but for AI *actions* and *intent*, not just resource access
- **A kernel in an operating system** — the invisible layer that enforces policy before anything happens

The product makes AI executions **traceable, auditable, and regulatorily compliant**, protecting both the enterprise and its employees from legal, reputational, and operational AI risk.

**One-line pitch:** *Every AI action your employees take, routed through a policy-enforcing kernel — logged, signed, and regulatorily mapped — before it reaches any model.*

---

## 2. What Interdict.io Is — And Is Not

### What It IS

- An **AI Gateway / Transparent Proxy** that intercepts all AI traffic inline
- A **Policy Enforcement Engine** that evaluates requests against configurable rules in real time
- An **Audit Trail System** with cryptographically signed, tamper-proof evidence bundles
- A **Regulatory Mapping Tool** that translates legal frameworks (EU AI Act, GDPR, NIST, etc.) into technical configuration
- A **Vendor Management System** that tracks which AI tools are approved within an enterprise
- A **Compliance Reporting Platform** for regulators, legal teams, risk departments, and CISOs
- A **kernel-level infrastructure product** designed for VPC-native, on-premises, or sidecar deployment

### What It IS NOT

- **Not an AI model** — Interdict.io does not build or fine-tune any LLM
- **Not a SaaS wrapper** — it does not provide a UI on top of OpenAI's API for end users
- **Not a chatbot platform** — there is no customer-facing AI assistant
- **Not a monitoring tool** (post-hoc) — it is an **inline prevention** system, not just a dashboard showing what went wrong after the fact
- **Not centralized SaaS** — each enterprise customer runs their own isolated Interdict.io instance inside their own infrastructure

---

## 3. The Problem Interdict.io Solves

### The Core Enterprise Pain Point

Large enterprises (banks, law firms, hospitals, government agencies) desperately want to adopt AI tools for productivity gains. However, they are paralyzed by three interlocking fears:

**Legal Liability** — If an employee shares client data with ChatGPT and it ends up in a training dataset, the company is liable under GDPR, banking secrecy laws, and client contracts.

**Regulatory Non-Compliance** — The EU AI Act, NIST AI RMF, Singapore PDPA, and dozens of other frameworks impose strict obligations on how AI can be used. Compliance teams have no technical mechanism to enforce these rules.

**Auditability Gaps** — When something goes wrong (and it will), regulators demand proof: *what AI tool was used, by whom, for what purpose, what data was shared, and what guardrails were in place?* Standard enterprise logging cannot answer these questions.

### The "Shadow AI" Problem

Even when enterprises *ban* certain AI tools, employees use them anyway via personal devices, browser extensions, and personal accounts. Interdict.io's kernel-level, network-layer interception is designed to close this gap — governance that works even when developers don't "opt in" to it.

### Why Existing Solutions Are Inadequate

| Solution | Limitation |
|---|---|
| Blocking AI outright | Kills productivity; employees route around it |
| Post-hoc monitoring dashboards | Tells you what went wrong *after* the breach |
| Manual compliance reviews | Doesn't scale; human error; too slow |
| LLM-based safety filters | Slow, expensive, can hallucinate their own rules |
| Microsoft Purview | Vendor-locked; only covers Microsoft's ecosystem; post-hoc |

Interdict.io's answer: **Inline Prevention + Cryptographic Proof + Regulatory Mapping**, all running inside the customer's own infrastructure.

---

## 4. Regulatory Landscape

Interdict.io's regulatory mapping engine currently supports the following jurisdictions and frameworks:

### Supported Jurisdictions

- **European Union** — EU AI Act, GDPR
- **United States** — NIST AI Risk Management Framework (AI RMF), Executive Order on AI
- **Singapore** — PDPA, MAS AI Guidelines
- **India** — IT Act, DPDP Act
- **China** — Algorithmic Recommendation Regulations, Generative AI Regulations
- **Canada** — AIDA (Artificial Intelligence and Data Act), PIPEDA
- **GCC Countries** — Saudi Arabia PDPL, UAE AI Strategy frameworks

### Key Regulatory Requirements Interdict.io Addresses

**EU AI Act (Most Stringent)**

- High-risk AI system classification and documentation requirements
- Human oversight obligations (Article 14)
- Transparency and logging requirements (Article 12)
- Data governance and training data documentation (Article 10)
- Conformity assessments before deployment
- Prohibition on certain AI applications (Article 5)

**GDPR**

- Data minimization obligations — AI prompts must not contain unnecessary personal data
- Right to explanation — automated decisions must be explainable
- Data transfer restrictions — prompts sent to US-based LLM providers may constitute a cross-border transfer

**NIST AI RMF**

- Map, Measure, Manage, Govern framework
- Risk categorization by impact and probability
- Continuous monitoring requirements

### The "Regulatory Mapping" Feature

Interdict.io's regulatory mapping is described as a **"Translator"**: it converts thousands of pages of dense legal text into actionable technical configurations. For each jurisdiction/framework, the system answers: *"To comply with Law X, you must enable Setting Y on your Interdict.io kernel."*

This removes the need for compliance teams to manually translate legal obligations into engineering requirements — a process that currently takes months and is highly error-prone.

---

## 5. Product Architecture — Full Technical Deep Dive

### 5.1 Control Plane vs. Data Plane

The most fundamental architectural principle of Interdict.io is the **strict separation** of two worlds:

```
┌─────────────────────────────────────────────────────────────┐
│  CONTROL PLANE (The Brain)                                   │
│  - Slow, smart, stateful                                     │
│  - Where humans define rules                                 │
│  - Technology: FastAPI + PostgreSQL                          │
│  - Who uses it: CISOs, Compliance Officers, Admins           │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Pushes compiled policy (Wasm/JSON)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  DATA PLANE (The Muscle)                                     │
│  - Fast, lean, stateless (mostly)                            │
│  - Where AI traffic actually flows                           │
│  - Technology: Rust or Go binary                             │
│  - Sits inline, in the hot path of every request             │
└─────────────────────────────────────────────────────────────┘
```

**This separation is non-negotiable.** Mixing the two — routing live AI traffic through a Python-based admin application — is the #1 architectural mistake that would kill Interdict.io's performance at scale.

---

### 5.2 The Data Plane (The Kernel)

This is the most critical component. It sits in the **"hot path"** — every single AI request passes through it.

#### Role
- Intercepts all outbound AI traffic (to OpenAI, Azure OpenAI, Anthropic, Cohere, etc.)
- Enforces policy rules in real time, inline, before the request reaches the LLM
- Inspects both the **request** (user prompt) and the **response** (LLM output)
- Creates and streams audit log entries asynchronously

#### Deployment
Runs as a **Kubernetes Sidecar container** — a second container attached to the same pod as the company's AI application.

#### Language
**Rust** (strongly preferred) or **Go**. Python is explicitly ruled out for the data plane.

**Why Rust/Go and not Python:**
- Python has a **GIL (Global Interpreter Lock)** — it cannot truly run concurrent threads, which is catastrophic for a proxy handling thousands of simultaneous streaming connections
- **Pydantic validation overhead** in FastAPI adds ~5–20ms per request at scale
- Rust and Go achieve **sub-millisecond** proxy latency; Python cannot
- Rust provides **memory safety** without garbage collection pauses (critical for real-time stream inspection)
- Go provides excellent **goroutine-based concurrency** and is used by Envoy's control plane

#### Key Kernel Responsibilities

**Protocol Decoding**
The kernel must understand all AI communication protocols:
- **HTTP/1.1 and HTTP/2** — standard REST API calls
- **Server-Sent Events (SSE)** — how streaming responses work (ChatGPT's default)
- **gRPC** — used by some enterprise AI services and internal microservices
- **WebSockets** — used by some real-time AI applications

**Wasm Host**
The kernel embeds a WebAssembly runtime (e.g., Wasmtime) and loads policy modules as `.wasm` binaries. This allows policy updates to be pushed from the Control Plane and hot-reloaded *without restarting the kernel binary*.

**Token Buffering for Stream Inspection**
To redact PII or secrets in a streaming response, the kernel cannot inspect one token at a time. It must maintain a **sliding window buffer** (e.g., hold 5–10 tokens back) to ensure multi-token patterns (like a credit card number or AWS access key split across tokens) are detected before they reach the user.

**Contextual State Management**
The kernel must track **session context** — not just individual messages. A user who asks 10 individually "safe" questions may collectively be reconstructing a sensitive document. A stateless kernel that only evaluates single requests in isolation has a major security gap.

**Connection Management**
The kernel must be able to **sever a streaming connection mid-response** — for example, when it detects that the LLM has started outputting a sensitive pattern 40 tokens into a response. The user receives `[REDACTED BY Interdict.io]` and the connection to the LLM is cleanly terminated.

---

### 5.3 The Control Plane (The Brain)

This is Interdict.io's management interface and distribution system. The current FastAPI/Postgres prototype lives here.

#### Role
- Policy authoring and management
- Regulatory framework mapping
- Kernel fleet management and policy distribution
- Analytics, reporting, and audit trail access
- Key management for cryptographic signing

#### Technology
- **FastAPI + PostgreSQL** (current prototype) — appropriate for this component
- **ClickHouse or Elasticsearch** for large-scale log analytics (Postgres cannot handle 10k+ log entries per second at query performance)

#### Key Responsibilities

**Policy Builder UI**
A CISO or compliance officer opens the dashboard, navigates to "Policies," and clicks "Block: Medical Advice Dispensing." The Control Plane compiles this into a Wasm binary or a Rego policy file.

**Policy Compiler**
Translates human-readable rules (written in UI, YAML, or Rego) into compiled Wasm modules that run at near-native speed inside the kernel.

**Policy Distribution**
Pushes compiled policies to all running kernel instances (potentially thousands of sidecars across a large enterprise) in real time. This must use a push-based protocol (gRPC streaming or a pub/sub system) — kernels should not poll for policy updates.

**Master Key Management**
The Control Plane holds the master key hierarchy for rotating the cryptographic signing keys used by kernels to sign evidence bundles.

**Regulatory Mapping Engine**
Accepts a jurisdiction selection (e.g., "EU AI Act") and automatically enables or suggests the corresponding technical policy configurations.

**Vendor Registry**
Maintains the approved list of AI vendors and model versions for each enterprise. The kernel checks this registry before allowing any outbound connection.

---

### 5.4 The Audit Pipeline (The Black Box)

This is Interdict.io's key differentiator from every SaaS competitor. It produces **legally defensible, cryptographically signed, tamper-proof evidence**.

#### The Latency Problem (And Its Solution)

Naïve approach: Write each audit log entry to Postgres synchronously, then release the AI response to the user.

**Problem:** Database writes introduce 5–50ms+ of latency per request. At scale (thousands of concurrent users), this creates a compounding performance disaster.

**Interdict.io's Solution: Asynchronous Queuing**

```
┌─────────────────────────────────────────────────────────────┐
│  KERNEL                                                      │
│  1. Intercept request → Apply policy → Release to LLM        │
│  2. Compress binary log → Push to LOCAL MEMORY BUFFER        │
│  3. Return AI response to user (immediately)                 │
│  4. Background thread flushes buffer every 500ms             │
└─────────────────────────────────────────────────────────────┘
                           │ (gRPC stream)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  EVIDENCE COLLECTOR SERVICE                                  │
│  - Receives compressed log events                            │
│  - Calculates SHA-256 hashes                                 │
│  - Builds Merkle Tree                                        │
│  - Writes Root Hash to immutable storage                     │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  IMMUTABLE LEDGER                                            │
│  - S3 with Object Lock (WORM - Write Once Read Many)         │
│  - Or: dedicated audit service (e.g., AWS QLDB)             │
│  - Hourly root hash anchoring                                │
└─────────────────────────────────────────────────────────────┘
```

**The Result:** AI response latency is unaffected. The audit trail is built asynchronously but is cryptographically guaranteed to be accurate and tamper-proof.

---

## 6. Deployment Patterns

### 6.1 VPC-Native Deployment

#### What It Is
Instead of customers sending AI prompts to `api.Interdict.io.io` (Interdict.io's cloud), Interdict.io packages its software as a deployable artifact that runs **inside the customer's own cloud environment** — their AWS VPC, Azure VNet, or Google Cloud VPC.

#### Why It Matters
- **Data never leaves the customer's perimeter** — eliminates the #1 sales blocker in regulated industries
- Removes the legal complexity of cross-border data transfer for AI prompts
- Makes Interdict.io compatible with air-gapped environments (banks, defense, government)
- Compliance teams can verify the deployment is truly isolated

#### How It Works
Interdict.io is packaged as:
- A **Helm Chart** (for Kubernetes deployments)
- A **Terraform module** (for infrastructure-as-code deployments)
- A **Docker Compose stack** (for simpler/smaller deployments)

The customer runs `helm install Interdict.io ./Interdict.io-chart` inside their own cluster, and Interdict.io is live within minutes — no data ever leaving their network.

#### The "Air-Gapped" Requirement
Many banks and government agencies operate in environments with **no internet access**. Interdict.io must be able to:
- Run entirely offline after initial deployment
- Accept policy updates via internal package repositories (e.g., an internal Artifactory)
- NOT "phone home" to Interdict.io's servers for license validation or policy sync

---

### 6.2 Kubernetes Sidecar Pattern

#### The Concept
In Kubernetes, a **Pod** is the smallest deployable unit — it typically contains one application container. A **Sidecar** is a second container that runs inside the same Pod, sharing the same network namespace.

```
┌─────────────────────────────────────────────────────────────┐
│  Kubernetes Pod                                              │
│                                                              │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  Company's AI App    │  │  Interdict.io Kernel (Sidecar)    │ │
│  │  (e.g., Copilot      │  │  - Rust binary               │ │
│  │   integration)       │  │  - Intercepts outbound calls │ │
│  │                      │  │  - Enforces policy           │ │
│  │  Port 8080           │  │  - Port 9090 (proxy)         │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
│                    \              /                           │
│                     └────────────┘                           │
│                      Shared loopback                         │
│                      network namespace                       │
└─────────────────────────────────────────────────────────────┘
```

#### How Traffic Is Intercepted
The company's AI app is configured (via environment variables or service mesh injection) to route its outbound LLM API calls through `localhost:9090` instead of directly to `api.openai.com`. The Interdict.io sidecar listens on that port, inspects and enforces policy, then forwards the (potentially modified) request to the real LLM provider.

#### The "Transparent" Advantage
Developers don't need to modify their application code. The interception is handled at the **infrastructure level** — by the Kubernetes deployment manifest or a service mesh like **Istio** or **Linkerd**, which can inject the Interdict.io sidecar automatically into any pod with the appropriate annotation.

```yaml
# Add this annotation to any Kubernetes deployment:
annotations:
  Interdict.io.io/inject: "true"
  Interdict.io.io/policy-profile: "financial-services-eu"
```

#### Resource Limits
The Interdict.io sidecar must impose strict self-imposed resource limits. A governance tool that consumes 2GB RAM or 50% CPU will be immediately uninstalled by a frustrated DevOps team. Target limits:
- CPU: `<100m` (0.1 core) at idle, `<500m` burst
- RAM: `<128MB` steady state
- Latency overhead: `<10ms` p99 (ideally `<5ms`)

---

### 6.3 Envoy Proxy Filter Integration

#### What Envoy Is
**Envoy** is an open-source high-performance proxy used as the data plane in most major service meshes (Istio, AWS App Mesh, etc.) and as a standalone proxy in major API gateway products. It is written in C++ and is the "gold standard" for infrastructure-level proxying.

#### Interdict.io as an Envoy Filter
Rather than writing a completely independent proxy from scratch, Interdict.io can implement its governance logic as an **Envoy HTTP Filter** — a plugin that runs inside the Envoy process.

**Why this is powerful:**
- Most large enterprises **already run Envoy** as part of their service mesh
- Interdict.io governance is automatically applied to *all* traffic flowing through Envoy — zero configuration change for developers
- Envoy's built-in features (circuit breaking, retries, TLS, rate limiting) are available for free
- Extremely well-understood operational model for enterprise DevOps teams

**Envoy's Filter Architecture:**
```
Request → [Auth Filter] → [Rate Limit Filter] → [Interdict.io Filter] → [Router Filter] → Upstream LLM
```

The Interdict.io filter can be injected into this chain at the appropriate position.

---

### 6.4 eBPF-Based Interception

#### What eBPF Is
**eBPF (Extended Berkeley Packet Filter)** is a Linux kernel technology that allows custom programs to run in kernel space, directly inside the OS kernel, without modifying kernel source code. It is extremely fast (no user-space/kernel-space context switches) and completely transparent.

#### How Interdict.io Could Use It
eBPF-based interception would allow Interdict.io to **intercept AI traffic at the OS kernel level**, before it even reaches any application. This solves the "Shadow AI" problem definitively — even if a developer bypasses the sidecar by making a direct syscall, the eBPF program running in the kernel catches it.

**Complexity:** High. eBPF is advanced systems programming — it requires deep Linux kernel expertise and careful handling to avoid system instability. It is a **Phase 3+** capability, not a priority for the initial product.

**Comparison Table:**

| Approach | Complexity | Coverage | Latency Overhead | When to Implement |
|---|---|---|---|---|
| Sidecar Proxy | Medium | Per-Pod | ~5ms | Phase 1 |
| Envoy Filter | Medium | Service Mesh | ~2ms | Phase 1–2 |
| eBPF Kernel Hook | Very High | System-wide | <1ms | Phase 3+ |
| VPC Traffic Mirror | High | Network-wide | Variable | Phase 2–3 |

---

### 6.5 Advanced Trust & Enforcement Ideas — Feasibility Review

> **Context:** These four architectural ideas were explored as alternative or complementary approaches to the core governance kernel. Each is evaluated below for technical feasibility, expected value (EV), implementation cost, and whether it should be prioritized, deferred, or discarded.

---

#### IDEA 1: eBPF-Based Syscall Interception (for Agent Container Sandboxing)

**The Concept:**
Instead of only building an application-layer policy engine that parses AI agent intents (HTTP request inspection), push governance down to the **Linux kernel level using eBPF**. Monitor and intercept what agent containers are doing at the **syscall level**: if an agent tries to open a network socket to an unapproved IP, or reads a file outside its isolated tenant directory, the kernel instantly drops the action. This provides hardware-level certainty that a hallucinating or compromised LLM cannot breach the sandbox.

> **Note:** This is different from the eBPF concept in Section 6.4. Section 6.4 discusses eBPF for *traffic interception* (catching Shadow AI at the network level). This idea is about eBPF for *runtime sandboxing* — monitoring what an AI agent's container process is actually doing at the OS level (file access, network calls, memory access).

**Feasibility Verdict: ✅ HIGH VALUE — but Phase 3+ implementation**

**Why it's valuable (+EV):**
- This is genuinely a tier above what any competitor offers. No AI governance product today provides kernel-level syscall enforcement on agent containers. Most only inspect HTTP traffic.
- For the agent-hosting use case specifically (where you're running AI agents on behalf of clients), this is massive — it proves to the client that even if the LLM hallucinates a `curl` command to exfiltrate data, the kernel blocks it before the syscall executes.
- It converts a "trust us" promise into a "verify it yourself" guarantee. That's the holy grail for enterprise security sales.
- Real-world precedent: Falco (Sysdig's open-source tool) already does eBPF-based syscall monitoring for containers in production at large enterprises. The technology is proven.

**Why it should be deferred (not Phase 1):**
- **Engineering cost is high.** Writing correct eBPF programs requires deep Linux kernel expertise. A buggy eBPF program can cause kernel panics, container crashes, or (worse) silently fail to enforce policy.
- **Maintenance burden.** eBPF programs are tied to kernel versions. Different customer Linux kernels (Ubuntu 22 vs. Amazon Linux 2023 vs. RHEL 9) require testing matrices.
- **It doesn't replace the application layer.** eBPF can block a syscall, but it cannot inspect the *semantic content* of an AI prompt. You still need the Wasm-based policy engine for "is this prompt asking about confidential client data?" eBPF is a *complement*, not a replacement.
- **Phase 1 priorities are higher.** The Rust data plane, the crypto evidence chain, and basic K8s sidecar deployment all must work before eBPF adds value.

**Implementation Path (when ready):**
1. Use **Cilium's eBPF libraries** or **libbpf-rs** (Rust bindings) — don't write raw BPF bytecode
2. Start with **network policy enforcement** (block outbound connections to non-allowlisted IPs) — this is the simplest and highest-value eBPF use case
3. Add **file system access control** (agent container can only read/write its tenant directory)
4. Add **syscall filtering** (block `execve` of unapproved binaries inside agent containers)
5. Integrate eBPF events into the existing audit pipeline (each blocked syscall generates an evidence bundle)

**Risks:**
- Kernel compatibility testing across customer environments
- Performance overhead of eBPF programs (usually negligible, but must be benchmarked per-policy)
- Some cloud providers (particularly managed K8s services) restrict eBPF capabilities

**Timeline estimate:** 2–4 months of dedicated systems engineering work, assuming the engineer has prior eBPF experience. If not, add 2–3 months of ramp-up.

**Verdict: Add to Phase 3 roadmap. High confidence it ships. Strong differentiator.**

---

#### IDEA 2: Zero-Knowledge Proofs (ZKPs) for Compliance Verification

**The Concept:**
Implement a system where AI agents execute tasks and generate a **zk-SNARK (Zero-Knowledge Succinct Non-Interactive Argument of Knowledge)** proof of the execution timeline. The enterprise client can mathematically verify that the task was executed strictly according to their compliance policies, **without exposing the actual sensitive data or intermediary logs to a third-party auditor**. The proof alone guarantees the policy was followed.

**Feasibility Verdict: ⚠️ THEORETICALLY POWERFUL — but practically not worth it yet**

**Why it sounds amazing:**
- The privacy guarantee is real. A bank could prove to a regulator "we followed the EU AI Act for every AI action" without revealing the actual prompts (which may contain client financial data). The regulator gets mathematical certainty without seeing sensitive content.
- It eliminates the "who watches the watchmen" problem — even the governance platform operator cannot fake compliance.
- It's an incredible pitch-deck slide. "Zero-knowledge compliance verification" sounds like the future.

**Why it's a bad idea for now (negative EV in the short/medium term):**

1. **Proof generation is catastrophically slow.** Generating a zk-SNARK for a single execution trace takes seconds to minutes depending on circuit complexity. You're processing thousands of AI requests per second. Even with optimized circuits (Groth16, PLONK), the overhead is 100–10,000x what your Merkle-tree evidence chain costs. You'd need dedicated GPU clusters just for proof generation.

2. **Circuit design is a PhD-level problem.** Converting your policy evaluation logic into an arithmetic circuit (what zk-SNARKs operate over) is extremely non-trivial. Every policy rule, every regex, every NLP classification step needs to be expressed as polynomial constraints. This is a multi-year research project, not a product feature.

3. **Trusted setup problem.** zk-SNARKs (Groth16) require a "trusted setup ceremony" — a one-time cryptographic initialization that, if compromised, allows forging proofs. Newer systems (PLONK, STARKs) avoid this but are even slower.

4. **Regulators don't need zero-knowledge.** In practice, EU AI Act auditors and bank regulators have legal authority to see the underlying data. They don't want a mathematical proof they can't interpret — they want to open a dashboard, see the logs, and check boxes. ZKPs solve a problem that regulators haven't asked for yet.

5. **Your Merkle tree already solves 95% of the trust problem.** The cryptographic evidence chain with external anchoring already proves tamper-resistance. ZKPs would add marginal trust improvement at 100x the engineering cost.

**When it WOULD make sense:**
- If a future customer explicitly requires **cross-border compliance verification without data exposure** (e.g., a Singapore bank proving compliance to an EU regulator without transferring EU citizen data to Singapore)
- If the ZK tooling ecosystem matures significantly (faster provers, easier circuit compilers like Noir or Leo)
- If a competitor claims ZKP capability and you need to match it

**Implementation Path (if ever pursued):**
1. Use a high-level ZK circuit compiler (e.g., **Circom**, **Noir by Aztec**, or **SP1 by Succinct Labs**) — do NOT write raw constraint systems
2. Start with the simplest possible circuit: prove that a given evidence bundle hash is included in a Merkle tree with a known root
3. Gradually expand the circuit to prove policy evaluation correctness
4. Use **recursive SNARKs** to batch-prove multiple executions into a single proof

**Risks:**
- 6–12+ months of specialized cryptographic engineering with uncertain ROI
- Proof generation hardware costs (GPUs for fast proving)
- Customer education burden (explaining ZKPs to a CISO is hard)

**Timeline estimate:** 6–12 months for a minimal ZK proof-of-concept. 18+ months for production-grade integration. Requires hiring a dedicated ZK engineer.

**Verdict: Do NOT build this now. File it as a "Phase 5+ / if market demands it" exploration. The Merkle tree + Ed25519 evidence chain is the right answer for the next 2–3 years.**

---

#### IDEA 3: Multi-Agent Consensus Gateways ("Jury System")

**The Concept:**
Before any high-stakes action is committed by a worker agent (modifying a database, sending an external email, etc.), the action payload is routed to a separate, isolated cluster of smaller local LLMs acting as "compliance officers." Each evaluator LLM independently assesses the proposed action against the client's rulebook. The action only proceeds if all compliance agents cryptographically sign the approval payload.

**Feasibility Verdict: ⚠️ INTERESTING but deeply flawed as described — salvageable with modifications**

**Why it sounds appealing:**
- It's a "defense in depth" approach — no single point of failure for compliance decisions
- The "jury" metaphor is compelling for enterprise sales
- Using multiple independent evaluators reduces the risk of a single model's hallucination causing a policy bypass

**Why the naive version is problematic:**

1. **LLMs are the wrong tool for deterministic compliance.** This was already flagged as a critical anti-pattern in Section 10 (Policy Enforcement Engine). Using an LLM to evaluate whether another LLM violated policy is non-deterministic. Two runs of the same compliance LLM on the same input can produce different verdicts. A "jury" of 3 unreliable judges is still unreliable — it just adds latency and cost.

2. **Latency explosion.** Each compliance LLM evaluation takes 500ms–3s. If you require 3 evaluators to all agree before an action proceeds, you're adding **1.5–9 seconds** of latency to every high-stakes action. For real-time AI interactions (streaming chat), this is unacceptable. For batch agent workflows, it might be tolerable but still expensive.

3. **Cost multiplication.** Running 3 local LLMs (even small ones like Phi-3 or Llama-3-8B) requires significant GPU/CPU resources. You're tripling your inference costs for the compliance layer alone. In a per-tenant deployment, this means each customer needs 3x the compliance compute.

4. **Consensus doesn't mean correctness.** If all 3 compliance LLMs share the same training data, they'll share the same blind spots. A cleverly worded policy bypass that fools one will likely fool all three. You get false confidence, not real security.

5. **Cryptographic signing by LLMs is meaningless.** An LLM "signing" an approval doesn't add any cryptographic value — the LLM doesn't have a private key; the hosting system does. You're just signing "LLM-3 said yes" — which proves the LLM said yes, not that the decision was correct.

**The salvageable version (what you SHOULD build instead):**

Replace the LLM jury with a **hybrid evaluation pipeline**:

```
Action payload arrives
    │
    ├─► Layer 1: Deterministic rule engine (Wasm/Rego) — <2ms
    │   (handles 95% of decisions with certainty)
    │
    ├─► Layer 2: Lightweight NLP classifier — <10ms
    │   (handles intent classification for ambiguous cases)
    │
    └─► Layer 3: Async human review queue
        (for genuinely ambiguous high-stakes decisions)
        Human compliance officer reviews within SLA
```

For the top 5% of genuinely ambiguous cases that deterministic rules can't handle, route to a **human compliance officer** with a defined SLA (e.g., 15-minute response for high-stakes, 24-hour for low-stakes). This is slower but *correct* — and enterprises trust humans more than LLMs for the hardest judgment calls.

If you absolutely want an LLM in the loop, use it as **one signal** (not a decision-maker): the LLM's opinion is logged alongside the deterministic evaluation and flagged for human review if the LLM and the rule engine disagree. This catches edge cases without introducing LLM unreliability into the critical path.

**Timeline estimate:** The hybrid pipeline is already part of the Phase 1–2 architecture. No additional work needed beyond what's planned.

**Verdict: Don't build the "LLM jury" as described. The hybrid pipeline (deterministic rules + NLP + human escalation) is strictly superior. The multi-agent consensus idea adds latency, cost, and false confidence without improving correctness.**

---

#### IDEA 4: Hardware-Backed Secure Enclaves (TEEs)

**The Concept:**
Run AI agent containers inside **Trusted Execution Environments (TEEs)** like AWS Nitro Enclaves or Intel SGX. This provides hardware-level cryptographic attestation: the enterprise client gets mathematical proof that not even the platform operator (you) has the technical ability to view or tamper with the AI's execution state or memory. Completely removes the "trust us" factor.

**Feasibility Verdict: ✅ HIGH VALUE — strong differentiator, Phase 2–3 implementation**

**Why this is genuinely powerful (+EV):**

1. **Eliminates the #1 enterprise objection.** The single biggest objection in every enterprise AI sales cycle is: "How do we know *you* won't access our data?" Every other governance product asks the customer to trust the vendor's integrity. TEEs make that question irrelevant — it's mathematically impossible for anyone (including the platform operator) to access the enclave's memory.

2. **Cryptographic attestation is a concrete deliverable.** TEEs produce an **attestation document** — a hardware-signed certificate proving: (a) what code is running in the enclave, (b) that the enclave's memory is encrypted, and (c) that no external process (including root/admin) can read the enclave's memory. This is something a CISO can verify independently. It transforms a vendor promise into a hardware guarantee.

3. **AWS Nitro Enclaves are production-ready and accessible.** Unlike Intel SGX (which has known side-channel vulnerabilities and requires specific hardware), AWS Nitro Enclaves are:
   - Available on standard EC2 instances (no special hardware procurement)
   - Well-documented with production SDKs
   - Already trusted by financial services (AWS designed them for exactly this use case)
   - Relatively simple to integrate compared to raw SGX

4. **It's a genuine moat.** Very few startups have TEE integration. If Interdict.io can tell enterprise clients "your AI agents run in hardware-encrypted enclaves where even we cannot see your data, and here's the attestation proof," that's a sales conversation that no SaaS competitor can match.

5. **Synergy with the existing architecture.** TEEs don't replace the policy engine — they complement it perfectly:
   - The **kernel + policy engine** ensures AI actions follow rules
   - The **TEE** ensures the platform operator cannot tamper with or observe the process
   - The **cryptographic evidence chain** proves what happened
   - Together: rules were followed (kernel), no one tampered (TEE), and here's the proof (evidence chain)

**Practical implementation concerns (solvable):**

1. **Performance overhead.** TEE encryption adds ~5–15% CPU overhead. For a latency-sensitive AI proxy, this matters. However, for the *agent execution* use case (where agents run longer tasks, not real-time streaming), the overhead is negligible.

2. **Limited enclave memory.** Nitro Enclaves have memory limits (determined by the EC2 instance size minus what the host OS needs). Running large LLMs inside an enclave is not practical yet. But running the *governance kernel* and *agent orchestration logic* inside an enclave is perfectly feasible — the LLM inference can happen outside, and only the policy-sensitive operations happen inside the enclave.

3. **Cloud-provider dependency.** Nitro Enclaves are AWS-only. Intel SGX is hardware-specific. AMD SEV-SNP is available on Azure. You'd need to support multiple TEE backends for multi-cloud customers. This is manageable but adds engineering surface area.

4. **Key management inside enclaves.** The cryptographic signing keys for evidence bundles should live inside the enclave — never accessible to the host system. This means integrating KMS attestation flows (Nitro Enclaves have a built-in mechanism for this via `kms:decrypt` with attestation conditions).

**Implementation Path:**
1. Start with **AWS Nitro Enclaves** (best SDK, most enterprise adoption)
2. Run the **evidence signing service** inside the enclave first — this is the highest-value, lowest-complexity integration point. Keys never leave the enclave; attestation proves they can't.
3. Extend to running the **policy evaluation engine** inside the enclave (proves policy enforcement wasn't tampered with)
4. For the full agent-hosting use case: run the **agent orchestration container** inside the enclave (proves the platform operator cannot observe the agent's memory or intermediate outputs)
5. Build an **attestation verification endpoint** that clients can query to independently confirm their workload is running in a genuine enclave

**Comparison of TEE Options:**

| TEE Technology | Cloud Provider | Maturity | Side-Channel Risk | Ease of Use |
|---|---|---|---|---|
| AWS Nitro Enclaves | AWS | Production-ready | Very low (custom hardware) | High (good SDK) |
| Intel SGX | AWS, Azure, bare metal | Mature but declining | Known vulnerabilities | Medium (complex SDK) |
| AMD SEV-SNP | Azure, GCP | Production-ready | Low | Medium |
| ARM CCA | Future | Early | TBD | TBD |

**Timeline estimate:** 3–5 months for Nitro Enclave integration of the evidence signing service. 6–8 months for full policy engine inside enclave. Requires an engineer comfortable with enclave attestation flows and KMS integration.

**Verdict: Build this in Phase 2–3. Start with evidence signing inside Nitro Enclaves. This is a genuine competitive differentiator that directly addresses the #1 enterprise objection, with proven technology and manageable complexity.**

---

#### Summary: All Four Ideas Ranked

| # | Idea | Verdict | Phase | Expected Value | Engineering Cost | Priority |
|---|---|---|---|---|---|---|
| 4 | **Hardware-Backed Secure Enclaves (TEEs)** | ✅ Build | Phase 2–3 | Very High — kills the "trust us" objection | Medium (3–5 months) | **1st** |
| 1 | **eBPF Syscall Interception** | ✅ Build | Phase 3 | High — kernel-level sandbox proof | High (2–4 months + kernel expertise) | **2nd** |
| 3 | **Multi-Agent Consensus (LLM Jury)** | ⚠️ Modified | N/A | Low as designed; hybrid pipeline is better | Wasted effort if built as-is | **Skip (hybrid pipeline is already planned)** |
| 2 | **Zero-Knowledge Proofs (ZKPs)** | ❌ Defer | Phase 5+ (if ever) | Theoretically high, practically near-zero today | Very High (6–18 months + ZK specialist) | **Do not build** |

---

## 7. Wasm-Based Policy Plugins

### What WebAssembly Is in This Context

**WebAssembly (Wasm)** is a binary instruction format that runs at near-native speed in a secure, sandboxed environment. Originally designed for browsers, it has emerged as the dominant standard for **safe, fast, portable plugin systems** in server infrastructure.

### Why Wasm for Interdict.io's Policy Engine

**The Problem with Alternatives:**

- **Regex/Keyword lists** — fast but brittle, easily bypassed, cannot understand context
- **Python scripts** — too slow, no memory isolation (a crashed script crashes the kernel)
- **Native code plugins** — fast, but a bug in a plugin can corrupt the host process's memory (no isolation)
- **LLM-based evaluation** — catastrophically slow (adds hundreds of milliseconds), expensive, non-deterministic

**Wasm solves all of these simultaneously:**
- **Speed:** Near-native performance (compiled bytecode, no interpretation overhead)
- **Safety:** Each plugin runs in its own isolated sandbox — a crash kills only that plugin, not the kernel
- **Flexibility:** Customers can write plugins in **Rust, C++, Go, or any language** that compiles to Wasm — they don't need to learn a Interdict.io-specific language
- **Hot Reloading:** New `.wasm` modules can be pushed and loaded at runtime without restarting the kernel binary
- **Portability:** The same `.wasm` file runs identically on any architecture (x86, ARM, etc.)

### How It Works in Practice

```
[CISO writes policy in Rego/YAML in Control Plane UI]
          │
          ▼ (compile)
[Control Plane compiles to .wasm binary]
          │
          ▼ (distribute via gRPC push)
[Kernel receives .wasm module → loads into Wasmtime runtime]
          │
          ▼ (at request time)
[AI request arrives → Kernel calls wasm_evaluate(request)]
          │
          ▼ (result: Allow / Block / Redact / Log)
[Kernel enforces the decision in <1ms]
```

### Example Policy Use Cases via Wasm

- **Client Data Masking:** A law firm writes a custom Wasm plugin that detects and masks client names, matter numbers, and confidential deal terms in any AI prompt
- **Regulatory Jurisdiction Routing:** A bank writes a plugin that routes requests through different LLM providers based on the data classification of the prompt (GDPR data stays in EU)
- **Medical Information Blocking:** A hospital writes a plugin that blocks any AI response containing specific ICD codes or drug dosage information for non-clinical staff
- **Custom Classification Model:** A company compiles a lightweight ML model to Wasm that classifies prompt intent with higher accuracy than keyword matching

---

## 8. Cryptographic Evidence Bundles

### 8.1 The Concept in Plain English

Standard database logs are legally worthless in a serious regulatory investigation — a database administrator with `sudo` access can change `"Action: Blocked"` to `"Action: Allowed"` without leaving a trace. A law firm defending a GDPR breach cannot use editable logs as evidence.

Interdict.io's approach: **every AI interaction produces a cryptographically signed evidence bundle** that is mathematically impossible to alter after the fact without detection.

**The Notebook Analogy:**
Imagine a notebook where every page, when completed, gets photographed alongside the previous page and a certified timestamp. All three are sealed in a wax-stamped envelope, and the envelope's serial number is written at the top of the next page. If anyone tears out a page or changes a word — the serial number doesn't match, the seal is broken, and every subsequent page is invalidated. This is exactly how Interdict.io's evidence chain works.

---

### 8.2 Technical Implementation

**Core Cryptographic Primitives:**

| Component | Technology | Purpose |
|---|---|---|
| Hash function | SHA-256 | Fingerprints each evidence bundle uniquely |
| Previous hash chaining | Linked Hash Chain | Makes tampering of any past entry detectable |
| Digital signature | Ed25519 or RSA-PSS | Proves the kernel (not anyone else) created the bundle |
| Private key storage | HSM or Secure Enclave | Ensures private key cannot be extracted by an attacker |

**The Evidence Bundle Structure (JSON):**

```json
{
  "bundle_id": "uuid-v4",
  "timestamp": "2026-02-26T14:32:01.847Z",
  "enterprise_id": "enterprise-abc-123",
  "kernel_id": "kernel-node-7",
  "actor": {
    "employee_id": "emp-00456",
    "sso_subject": "user@company.com",
    "ip_address": "10.0.4.22",
    "department": "M&A Advisory"
  },
  "ai_vendor": {
    "name": "OpenAI",
    "model": "gpt-4o",
    "vendor_approved": true
  },
  "request": {
    "prompt_hash": "sha256:8d9f2c...",  // Hash of prompt, not plaintext (privacy)
    "prompt_classification": ["CONTAINS_PII", "M&A_CONTEXT"],
    "purpose_declared": "Contract drafting assistance"
  },
  "policy_evaluation": {
    "policies_applied": ["EU_AI_ACT_ART_12", "COMPANY_POLICY_NO_CLIENT_DATA"],
    "decision": "ALLOWED_WITH_REDACTION",
    "redacted_fields": ["client_name", "deal_value"],
    "enforcement_latency_ms": 4.2
  },
  "response": {
    "response_hash": "sha256:3a8e1f...",
    "token_count": 342,
    "pii_detected_in_response": false
  },
  "chain": {
    "previous_bundle_hash": "sha256:7c4d9b...",
    "current_bundle_hash": "sha256:2f8a1e..."
  },
  "signature": {
    "algorithm": "Ed25519",
    "kernel_public_key_id": "key-rotation-2026-q1",
    "signature_bytes": "base64:..."
  }
}
```

**The Hashing Formula:**
```
H_current = SHA256(bundle_data + H_previous)
Signature  = Ed25519_Sign(H_current, kernel_private_key)
```

---

### 8.3 Merkle Tree Structure

Rather than a simple linear chain, Interdict.io structures evidence bundles into a **Merkle Tree** — the same data structure used by Git, Bitcoin, and Certificate Transparency logs.

```
         Root Hash
        /         \
    Hash AB       Hash CD
    /    \        /    \
Hash A  Hash B  Hash C  Hash D
  |       |       |       |
Bundle1 Bundle2 Bundle3 Bundle4
```

**Advantages over a linear chain:**
- **Efficient verification:** To prove that Bundle3 was not tampered with, you only need `Hash CD`, `Hash AB`, and the `Root Hash` — not every bundle in the chain (O(log n) instead of O(n))
- **Parallel processing:** Left and right subtrees can be computed simultaneously
- **Selective disclosure:** You can prove Bundle3's integrity to a regulator without exposing Bundle1, Bundle2, or Bundle4 (valuable for attorney-client privilege scenarios)

---

### 8.4 Anchoring & External Immutability

Every hour (configurable), Interdict.io computes the **Root Hash** of all evidence bundles produced in that period and **anchors it** to an external, immutable storage system:

- **AWS S3 with Object Lock (WORM)** — Write Once, Read Many; AWS guarantees it cannot be deleted for a defined retention period
- **AWS QLDB (Quantum Ledger Database)** — purpose-built immutable ledger
- **Azure Immutable Blob Storage** — same concept on Azure

**The Regulator Verification Tool:**
Interdict.io will publish an open-source script that any regulator, auditor, or court-appointed examiner can run independently:

```bash
Interdict.io-verify \
  --evidence-directory ./logs/2026-02-26/ \
  --root-hash-anchor s3://company-Interdict.io-audit/2026-02-26-1400.root \
  --public-key ./Interdict.io-kernel-pubkey.pem
```

Output:
```
✓ Chain integrity verified: 14,847 bundles
✓ Root hash matches anchor: 2026-02-26T14:00:00Z
✓ No gaps or modifications detected
✓ All signatures valid (kernel node: kernel-node-7)
```

**Recommended Cryptographic Libraries:**
- **libsodium / NaCl** — for Ed25519 signing in Rust/Go
- **Google Tink** — high-level cryptographic library with key rotation support
- **OpenSSL** — for RSA-PSS if required by enterprise policy

**Implementation Note:** Do NOT use a blockchain (Ethereum, Hyperledger, etc.) for this. Blockchain adds distributed consensus latency, smart contract risk, and public visibility — none of which are needed here. A private Merkle Tree with external anchoring achieves identical security guarantees at 1000x better performance.

---

## 9. Streaming AI Inspection — The Hardest Challenge

### The Problem

Modern AI responses (GPT-4, Claude, Gemini, etc.) use **streaming** — the model outputs tokens one by one as they are generated, rather than waiting for the complete response. This is what makes the chat feel "live."

This creates a fundamental challenge for inline inspection: **you cannot wait for the full response to evaluate it**, because the user is already receiving it token by token. But you also cannot evaluate each single token in isolation, because sensitive patterns (AWS keys, credit card numbers, client names) span multiple tokens.

### The Scenario

```
Employee asks ChatGPT to "help me write a summary of the Smith & Partners deal."

ChatGPT begins streaming:
"Sure! The Smith & Partners acquisition involves a purchase price of $420M..."

Token 47: "$ "
Token 48: "4 "
Token 49: "2 "
Token 50: "0 "
Token 51: "M "
```

If the deal value is classified, Interdict.io must:
1. Detect the pattern before the full number is output
2. Sever the streaming connection mid-stream
3. Send `[REDACTED BY Interdict.io POLICY: DEAL_FINANCIALS]` in place of the redacted content
4. Log the incident as an evidence bundle

This is **extremely difficult** in Python (due to GIL and async streaming complexity). This is trivially achievable in **Rust** using async/await and zero-copy buffer manipulation.

### The Sliding Window Buffer

```
Window size: 10 tokens
Buffer state:    [T38][T39][T40][T41][T42][T43][T44][T45][T46][T47]
Stream position: currently outputting T47 to user

↓ New token T48 arrives ("4")
Buffer becomes: [T39][T40][T41][T42][T43][T44][T45][T46][T47][T48]
                                                             ↑
                                               Pattern detector sees "$ 4"
                                               → trigger credit card / financial detector
```

The window ensures that by the time token T47 (`$`) reaches the user, Interdict.io has already "seen" several tokens ahead (in its buffer) and can preemptively sever the connection.

### Fail-Closed vs. Fail-Open Streaming

If Interdict.io detects a potential policy violation mid-stream but has not yet confirmed it (e.g., token 47 is `"$"` — might be a financial figure, might be just a pricing quote):

- **Fail-Closed (banking/legal):** Stop the stream immediately, send redaction notice. Better to over-redact than to leak.
- **Fail-Open (internal tools, lower risk):** Continue streaming but flag for async review. Prioritizes user experience.

This must be a **per-enterprise, per-policy configuration flag** — not a global setting.

---

## 10. Policy Enforcement Engine

### Architecture Overview

Interdict.io's policy enforcement uses a **layered evaluation model**, not a single mechanism:

```
Layer 1: Fast-Path Rules (Regex / Pattern Matching) — <0.5ms
         ↓ (if no match)
Layer 2: Structural Analysis (NLP classification, intent detection) — <5ms
         ↓ (if uncertain)
Layer 3: Wasm Plugin Evaluation (customer-specific logic) — <2ms per plugin
         ↓ (if flagged for review)
Layer 4: Async Human Review Queue (post-hoc, for edge cases)
```

**Critical Rule: Do NOT use an LLM to enforce LLM policy.**
Using GPT-4 to evaluate whether another GPT-4 response violates policy is:
- **Slow** — adds 1–5 seconds of latency
- **Expensive** — doubles your API costs
- **Non-deterministic** — the LLM might "decide" the policy doesn't apply today
- **Recursive** — the evaluator itself can hallucinate governance rules

99% of policy enforcement must happen through **fast, deterministic methods** (regex, NLP classifiers, Wasm). LLMs are only appropriate as a fallback for the most ambiguous edge cases in an async review queue.

### Policy Types Supported

**Prompt Policies (Request-Side)**
- PII detection and masking before prompt is sent to LLM
- Confidential keyword blocking (client names, deal codes, ISIN numbers)
- Jurisdictional restrictions (e.g., no prompts containing personal data of EU citizens may go to US-based LLMs)
- Approved/blocked vendor enforcement (cannot use Gemini if only OpenAI is approved)
- Rate limiting per user/department

**Response Policies (Output-Side)**
- Sensitive data leakage detection (AWS keys, PII, financial figures, source code)
- Medical/legal advice detection (appropriate for certain enterprise contexts)
- Hallucination risk flagging (response contains claims that trigger regulatory concern)
- Toxicity and inappropriate content filtering

**Contextual/Session Policies**
- Multi-turn context tracking (10 individually safe messages that collectively reconstruct sensitive content)
- Time-based anomaly detection (employee accessing AI at 3am from unusual location)
- Volume anomaly detection (employee suddenly sends 10x their normal prompt volume — possible data exfiltration attempt)

---

## 11. Identity & Access Integration

### Why IAM Integration Is Critical

Interdict.io evidence bundles are only legally valuable if they can definitively answer: **"Who did this?"** An employee ID from the company's HR system is not sufficient. Interdict.io must integrate with the enterprise's **identity provider (IdP)** to tie every AI action to a verified corporate identity.

### Required Protocols

**OIDC (OpenID Connect)**
The modern standard. The company's IdP (Okta, Azure AD, Google Workspace, Ping Identity) issues **JWT tokens** containing the user's verified identity. Interdict.io reads the `sub`, `email`, `department`, and custom claims from the JWT to attribute every AI action.

**SAML 2.0**
The legacy enterprise standard. Many banks and law firms still use SAML for SSO. Interdict.io must support SAML assertions as an identity source — this is non-negotiable for enterprise sales.

### Zero-Trust Architecture Alignment

Interdict.io's identity integration should follow **Zero Trust** principles:
- Never trust the network — verify every request regardless of source IP
- Use **mTLS (mutual TLS)** between the kernel and control plane — both sides present certificates
- Short-lived tokens — never cache identity for more than the session duration
- Every kernel instance authenticates to the Control Plane using **client certificates**, not just API keys

### RBAC in the Control Plane

The Control Plane itself needs fine-grained RBAC:

| Role | Permissions |
|---|---|
| Super Admin | Full system access, key management |
| Compliance Officer | View all audit trails, configure regulatory frameworks |
| Policy Admin | Create/edit/delete policies |
| Department Manager | View audit trails for their team only |
| Read-Only Auditor | View-only access (for external auditors) |

---

## 12. Current Prototype State & Technical Debt

### What Exists Today

| Component | Status | Technology |
|---|---|---|
| API Layer | ✅ Working prototype | FastAPI + OpenAPI |
| Data Storage | ✅ Working | PostgreSQL |
| Execution Tracking | ✅ Working | JSON logs in DB |
| Vendor Management | ✅ Working | DB-backed registry |
| Regulatory Mapping | ✅ Working (EU, SG, IN, CN, US, CA, GCC) | Hardcoded mappings |
| Policy Modules | ✅ Working (PDF, TXT, JSON, CSV import) | File parser + DB |
| Audit Trails | ✅ Working | DB queries |
| Employee Auth | ✅ Working (demo: username/password) | FastAPI auth |

### Known Technical Debt & Limitations

**Performance Ceiling**
The current FastAPI prototype will begin degrading above **~100 requests/second**, and will be catastrophically slow when handling **streamed AI responses** (SSE/WebSocket). This is not a bug — it's a fundamental limitation of Python's concurrency model.

**No Cryptographic Evidence**
Current logs are stored as mutable JSON in PostgreSQL. Any DB admin can modify them. This is acceptable for a prototype but is a **critical gap** for any enterprise pilot with legal/compliance requirements.

**No Session Context**
Each request is evaluated in isolation. Multi-turn conversation context is not maintained. This is a significant security gap.

**No K8s Deployment**
Currently a locally-run FastAPI app. No Docker packaging, no Helm chart, no sidecar deployment pattern.

**No IAM Integration**
Authentication is username/password for demo. No OIDC/SAML integration with enterprise identity providers.

**Centralized Architecture**
The current prototype is a single server. Real enterprise deployment requires a **decentralized, per-customer deployment** where each enterprise runs their own kernel instance.

---

## 13. Technology Stack Recommendations

### Full Production Stack

| Layer | Component | Technology | Rationale |
|---|---|---|---|
| **Data Plane** | Kernel Proxy | Rust | Memory safety, zero-copy I/O, no GIL, sub-ms latency |
| **Data Plane** | Protocol support | Tokio (async runtime) | Industry standard Rust async |
| **Data Plane** | Policy execution | Wasmtime | CNCF-backed Wasm runtime, Rust-native |
| **Control Plane** | API | FastAPI (keep) | Appropriate for admin traffic volumes |
| **Control Plane** | Database | PostgreSQL | Config, metadata, user management |
| **Control Plane** | Log Analytics | ClickHouse | Column-store, handles 10k+ events/sec |
| **Audit Pipeline** | Event streaming | Apache Kafka or gRPC stream | High-throughput event transport |
| **Audit Pipeline** | Hash chaining | Custom Rust service | Speed-critical component |
| **Audit Pipeline** | Immutable store | AWS S3 (Object Lock) | WORM compliance |
| **Cryptography** | Signing library | libsodium (Ed25519) | Battle-tested, audited |
| **Orchestration** | Container mgmt | Kubernetes (K8s) | Industry standard |
| **Orchestration** | Packaging | Helm Charts | Enterprise K8s standard |
| **Networking** | Internal comms | gRPC + HTTP/2 | Low latency, multiplexing, schema enforcement |
| **Networking** | External proxy | Envoy | Gold standard infrastructure proxy |
| **Policy Language** | Policy rules | OPA + Rego | Industry standard policy-as-code |
| **Identity** | Auth protocols | OIDC + SAML 2.0 | Enterprise IAM coverage |
| **Security** | mTLS | cert-manager (K8s) | Automated certificate lifecycle |

### What to Avoid

- **Python in the Data Plane** — GIL prevents true concurrency; Pydantic adds overhead
- **Blockchain** — Public, slow, expensive; private Merkle tree achieves identical guarantees
- **MongoDB** — Schema flexibility is a liability for audit systems; Postgres is the right call
- **LLMs for policy enforcement** — Slow, expensive, non-deterministic
- **Custom binary protocols** — gRPC is already the industry standard; don't reinvent it

---

## 14. Production-Readiness Checklist

This checklist defines the bar for a **production enterprise deployment**. A technical co-founder must demonstrate understanding of every item.

### Performance

- [ ] Data Plane latency overhead: **<10ms p99** (target: <5ms p99)
- [ ] Throughput: **>10,000 requests/second** per kernel instance
- [ ] Streaming response support: **SSE, WebSocket, gRPC streaming** all handled correctly
- [ ] Token buffer window for stream inspection: implemented
- [ ] Zero-copy networking in hot path: implemented

### Reliability

- [ ] **Fail-Closed / Fail-Open toggle** per policy profile (configured by enterprise)
- [ ] **Kernel high availability**: state-synchronized across multiple instances; no single point of failure
- [ ] Kernel crash does not affect Control Plane (and vice versa)
- [ ] **Circuit breaker** pattern: if LLM provider is unreachable, kernel handles gracefully

### Security

- [ ] **mTLS** between all internal components (kernel ↔ control plane, kernel ↔ audit collector)
- [ ] **VPC-native deployment**: no data leaves customer perimeter
- [ ] **Air-gapped mode**: fully functional without internet access after initial setup
- [ ] **Kernel resource limits**: CPU and RAM caps enforced via cgroups / K8s limits
- [ ] **Private key in HSM/Secure Enclave**: signing keys never exposed to application code

### Auditability

- [ ] **Cryptographic hash chain**: SHA-256 linked chain, tamper-evident
- [ ] **Digital signatures** on all evidence bundles (Ed25519 or equivalent)
- [ ] **Merkle Tree** structure for efficient verification and selective disclosure
- [ ] **External anchor** (S3 Object Lock or equivalent) for root hash immutability
- [ ] **Open-source verifier script** for use by regulators/auditors
- [ ] Asynchronous audit pipeline (does not add latency to AI responses)

### Deployment

- [ ] **Kubernetes Helm Chart** for one-command enterprise deployment
- [ ] **Docker image** published to customer-accessible registry
- [ ] **Terraform module** for infrastructure provisioning (AWS, Azure, GCP)
- [ ] **Envoy filter** implementation for service-mesh environments
- [ ] Policy hot-reload without kernel restart

### Compliance & Identity

- [ ] **OIDC integration** (Okta, Azure AD, Google Workspace)
- [ ] **SAML 2.0 integration** (legacy enterprise IdPs)
- [ ] **RBAC** in Control Plane with auditor, admin, compliance officer roles
- [ ] **Data residency controls**: EU data stays in EU at kernel level
- [ ] **Retention policy enforcement**: configurable log retention periods

### Enterprise Features

- [ ] **Session context tracking**: multi-turn conversation awareness
- [ ] **Shadow AI detection**: network-level interception, not just opt-in proxy
- [ ] **Vendor registry**: approved/blocked AI vendors enforced at kernel level
- [ ] **Department-level policies**: different rules for M&A team vs. marketing team
- [ ] **Real-time alerting**: webhook/email/Slack when critical policy violations occur

### Hardware Trust (Phase 2–3+)

- [ ] **TEE integration**: Evidence signing service running inside AWS Nitro Enclaves
- [ ] **Enclave attestation endpoint**: Clients can independently verify workload integrity
- [ ] **Enclave-resident keys**: Signing private keys never leave TEE memory
- [ ] **eBPF syscall interception**: Agent containers monitored at kernel level (network, filesystem, process exec)
- [ ] **eBPF → audit pipeline**: Blocked syscalls generate cryptographic evidence bundles
- [ ] **Multi-TEE support roadmap**: Nitro (AWS) → SEV-SNP (Azure) → future portability

---

## 15. Implementation Roadmap (Phases)

### Phase 0 — Foundation (Completed / In Progress)

- [ ] FastAPI prototype with core features
- [ ] PostgreSQL data model for executions, vendors, policies
- [ ] Regulatory framework mappings (7 jurisdictions)
- [ ] Basic authentication (employee ID / password for demo)
- [ ] Complete technical write-up and system design documentation
- [ ] Design work for dashboard UI
- [ ] Recruit technical co-founder

### Phase 1 — Data Plane MVP ("Real Kernel")

**Goal:** Replace Python with a real kernel binary. Target: Q3 2026.

- Rebuild the traffic interceptor in **Rust** using `tokio` for async I/O
- Implement **HTTP/2 + SSE proxy** functionality (forward AI traffic through kernel)
- Implement basic **regex/NLP policy enforcement** in the Rust binary
- Package as a **Docker container** for initial deployment
- Implement **Kubernetes sidecar** YAML manifest
- Implement **gRPC channel** from kernel to audit pipeline

### Phase 2 — Cryptographic Audit Pipeline

**Goal:** Make evidence bundles legally defensible. Target: Q4 2026.

- Implement **SHA-256 linked hash chain** in the Evidence Collector service
- Integrate **Ed25519 signing** with key stored in AWS KMS or Azure Key Vault
- Build **Merkle Tree** construction for hourly root hash batches
- Configure **S3 Object Lock** anchoring
- Build and open-source the **regulator verification script**
- Add **ClickHouse** for log analytics and search

### Phase 3 — Wasm Policy Engine

**Goal:** Enable customer-authored custom policies. Target: Q1 2027.

- Integrate **Wasmtime** runtime into the kernel binary
- Design the **Policy Plugin API** (the interface Wasm modules must implement)
- Build the **Control Plane policy compiler** (Rego → Wasm)
- Implement **hot-reload** of Wasm modules without kernel restart
- Build and document the **Plugin SDK** (example plugins in Rust, Go, AssemblyScript)

### Phase 4 — Enterprise Hardening

**Goal:** Pass enterprise security reviews. Target: Q2 2027.

- Implement **OIDC + SAML** identity federation
- Implement **mTLS** everywhere
- Implement **air-gapped deployment** mode
- Build **Envoy Filter** integration
- Publish **Helm Chart** to public Helm registry
- Implement **multi-instance state synchronization** (for kernel HA)
- Implement **Fail-Closed/Fail-Open** configuration
- Integrate **AWS Nitro Enclaves** for evidence signing service (keys never leave enclave)
- Begin **TEE attestation endpoint** so clients can verify enclave integrity independently
- Implement **eBPF-based syscall interception** for agent container sandboxing (network + filesystem)
- Integrate eBPF events into audit pipeline (each blocked syscall = evidence bundle)

### Phase 5 — Pilot → Production

**Goal:** Live with 2 enterprise customers. Target: Q3 2027.

- Deploy with boutique law firm pilot (~80 employees)
- Deploy with private bank pilot
- Gather feedback, iterate on Control Plane UX
- Build compliance reporting templates (for regulators)
- Prepare for Series A with production evidence

---

## 16. Critical To-Dos and Not-To-Dos

### ✅ Critical To-Dos

**Architecture**
- Separate Data Plane (Rust/Go) from Control Plane (FastAPI) — do not mix them
- Target <10ms latency overhead in the kernel at p99
- Implement Fail-Closed/Fail-Open as a configurable per-policy flag
- Use OIDC/SAML for identity — tie every AI action to a verified corporate identity
- State-synchronize kernels across multiple instances (eliminate single point of failure)
- Implement session context tracking — single-message evaluation is not sufficient

**Security**
- Use mTLS for all internal communications — API keys alone are insufficient
- Store signing private keys in HSM/KMS — never in environment variables or config files
- Design for air-gapped deployment from day one — don't architect in dependencies on Interdict.io cloud

**Business**
- Recruit a **Systems/Distributed Systems Engineer** as co-founder — NOT an "AI engineer"
- Get at least one pilot partner to production *before* Series A fundraising
- Start IP applications for the kernel architecture and evidence bundle format
- Apply to YC and Belgian incubators (already in progress)

### ❌ Critical Not-To-Dos

**Technical**
- **Do NOT build your own LLM** — Interdict.io is governance infrastructure, not a model provider; stay model-agnostic
- **Do NOT use an LLM for inline policy enforcement** — too slow, too expensive, too non-deterministic; use it only for async review of edge cases
- **Do NOT keep Python in the Data Plane** for production — the GIL and async overhead are incompatible with streaming proxy requirements
- **Do NOT build a blockchain** for auditability — a private Merkle tree with S3 Object Lock achieves identical guarantees at vastly lower complexity and cost
- **Do NOT ignore Shadow AI** — if Interdict.io only works when developers opt in, developers will opt out; network-level interception is required

**Business**
- **Do NOT position as a SaaS monitoring dashboard** — competitors (Microsoft Purview) will crush you; the differentiation is inline prevention, not post-hoc reporting
- **Do NOT sell to startups first** — regulated enterprises (law firms, banks, hospitals) are the correct initial target; they have the most pain and the budget to pay
- **Do NOT give away governance neutrality** — Interdict.io must remain model-agnostic; partnering exclusively with one LLM provider destroys the value proposition

---

## 17. Core Features — Full Product Spec

### Authentication System

**Design Philosophy:** Interdict.io must be **completely invisible to end users**. Employees should not need to "log into Interdict.io" — they log into their normal work systems, and Interdict.io operates silently in the background.

**For the Demo/Prototype:** Employee ID + password authentication is acceptable to demonstrate the concept.

**For Production:** Interdict.io reads identity from the enterprise's existing SSO session (OIDC JWT or SAML assertion). No separate login required.

### Execution Tracking

Every AI interaction is logged with:
- Employee identity (from SSO)
- AI vendor and model used
- Timestamp (microsecond precision)
- Declared purpose (optional, user-provided context)
- Policy decision (Allowed / Blocked / Redacted)
- Policies applied
- Evidence bundle hash

### Vendor Management

- Registry of approved AI vendors and their approval status
- Per-vendor model version allowlist (e.g., GPT-4o is approved, GPT-4o-mini is not)
- Automatic blocking of non-approved vendors at the kernel level
- Vendor risk ratings and compliance certifications on file

### Policy Modules

- **Input formats:** PDF, TXT, JSON, CSV (for company-specific policy documents)
- **Regulatory frameworks:** Pre-built mappings for 7 jurisdictions
- **Custom policies:** Written in Rego or via UI, compiled to Wasm
- **Policy simulation:** Test a policy against historical traffic before deploying it live

### Regulatory Frameworks

Pre-built mappings covering:
- EU AI Act (all articles relevant to providers and deployers)
- GDPR (data minimization, transfer restrictions, right to explanation)
- NIST AI RMF (all four functions: Govern, Map, Measure, Manage)
- Singapore PDPA + MAS AI Guidelines
- India DPDP Act
- China Algorithmic Recommendation Regulations + Generative AI Regulations
- US Executive Order on AI + sector-specific guidance (FINRA, OCC for banking)
- Canada AIDA + PIPEDA
- GCC: Saudi PDPL, UAE AI Strategy

### Audit Trails

**For regulators:** Cryptographically signed, Merkle-tree-structured evidence bundles with external anchor
**For legal teams:** Searchable execution history with policy decisions and rationale
**For compliance:** Automated regulatory gap analysis ("you are using X AI tool in ways that may violate EU AI Act Article Y")
**For risk teams:** Anomaly detection reports, volume statistics, vendor risk exposure

---

## 18. Target Markets & Use Cases

### Primary Target Markets

**Tier 1: Financial Services**
- Banks (commercial, private, investment)
- Private equity and venture capital firms
- Hedge funds and asset managers
- Insurance companies
- Reason: Highest AI adoption pressure + highest regulatory exposure + largest compliance budgets

**Tier 2: Legal Services**
- Law firms (all sizes, especially those handling M&A, litigation, intellectual property)
- In-house legal departments of large corporations
- Reason: Attorney-client privilege is existentially threatened by AI usage; firms desperately need an audit trail

**Tier 3: Healthcare**
- Hospital systems
- Pharmaceutical companies
- Medical device manufacturers
- Reason: HIPAA exposure + FDA AI guidance + highest reputational risk from AI errors

**Tier 4: Public Sector**
- Government agencies (EU, national, local)
- Defense contractors
- Reason: Strictest data residency requirements + highest regulatory scrutiny

### Initial Beachhead (First 2 Pilots)

1. **Boutique law firm** (~80 employees) — already in discussions, pilot to begin March 2026
2. **Small private bank** — already in discussions, pilot to begin March 2026

These are ideal first customers: regulated, motivated by compliance fear, small enough for Interdict.io to deploy and iterate rapidly, large enough to be credible references.

---

## 19. Competitor Landscape & Positioning

### Direct Competitors

| Company | Approach | Weakness vs. Interdict.io |
|---|---|---|
| **Microsoft Purview** | Post-hoc monitoring, Microsoft-ecosystem only | Vendor-locked; doesn't cover non-Microsoft AI; post-hoc not inline |
| **Lasso Security** | AI security posture management | Primarily post-hoc; no inline enforcement; startup |
| **Cranium** | AI red-teaming and risk assessment | Assessment/consulting tool, not a runtime control plane |
| **Protect AI** | ML security scanning | Focused on model security, not operational AI governance |
| **HiddenLayer** | ML model protection | Adversarial attack detection, not usage governance |
| **CalypsoAI** | AI governance platform | SaaS dashboard; not infrastructure-level; US-market focused |

### Interdict.io's Differentiation

**Post-Hoc vs. Inline:**
Every competitor tells you what went wrong *after* it happened. Interdict.io prevents it from happening in the first place. This is the "firewall vs. SIEM" distinction — and in security, the firewall is always worth more.

**Vendor Lock-In vs. Model Agnostic:**
Microsoft Purview only covers Microsoft's AI tools. Interdict.io is completely model-agnostic — it governs OpenAI, Anthropic, Google, Azure OpenAI, self-hosted models, and any future LLM provider through the same kernel.

**SaaS Cloud vs. VPC-Native:**
Competitors require sending data to their cloud for analysis. Interdict.io runs entirely inside the customer's VPC. This removes the #1 sales blocker in regulated industries.

**Dashboard vs. Kernel:**
Competitors are dashboards. Interdict.io is infrastructure. The distinction matters because dashboards can be ignored or bypassed. A kernel cannot be bypassed without disabling the entire system.

---

## 20. Competitive Moat Analysis

### The Moat Interdict.io Is Building

**Network Effects (Data Moat)**
Every enterprise deployment trains Interdict.io's policy templates to be more accurate. As more law firms use Interdict.io, the "law firm policy template" becomes the best in the world — creating a data moat that startups cannot replicate.

**Switching Costs (Integration Moat)**
Once Interdict.io is deployed as a kernel sidecar with its cryptographic evidence chain integrated into a company's legal and compliance workflows, it becomes deeply embedded in their infrastructure. Switching to a competitor means re-auditing years of evidence bundles.

**Regulatory Expertise Moat**
Building accurate, maintained regulatory mappings for 7+ jurisdictions with ongoing updates as laws change is extremely expensive and time-consuming. This is defensible because it requires genuine legal + technical expertise.

**"Kernel" Positioning**
If Interdict.io achieves the position of being "the AI governance infrastructure layer," it becomes the "tax" that every large enterprise must pay to turn their AI on — similar to how enterprises must pay for network firewalls, SIEM, or CASB tools. Once the category is established, Interdict.io should own it.

### Risk Factors

**Microsoft Enters the Space (Highest Risk)**
Microsoft could extend Purview to cover third-party AI tools and add VPC-native deployment. Timeline: 18-36 months. Interdict.io's response: move faster, embed deeper in regulated industries, build the regulatory mapping moat.

**Single Point of Failure Risk**
The kernel IS the AI. If it fails, the enterprise's AI goes down. This requires extremely high reliability engineering (HA, failover, Fail-Open mode). A single major outage at a bank could permanently damage Interdict.io's reputation.

**Compliance with Interdict.io Itself**
Interdict.io processes sensitive enterprise data. Interdict.io itself must be EU AI Act compliant, SOC 2 Type II certified, and ISO 27001 compliant. This is significant operational overhead.

---

## 21. Business Model & Pricing Philosophy

### Likely Pricing Architecture

**Tier 1: Platform License**
- Annual enterprise license for the Control Plane
- Priced per seat or per department
- Includes support, updates, and new regulatory framework mappings

**Tier 2: Usage-Based Component**
- Per AI request processed through the kernel (micro-pricing)
- This aligns Interdict.io's revenue with the customer's AI adoption — as they use AI more, Interdict.io earns more

**Tier 3: Professional Services**
- Regulatory framework customization
- Custom Wasm policy development
- Deployment and onboarding (especially for air-gapped environments)

**Tier 4: Compliance Reporting Add-On**
- Pre-formatted regulatory reports for specific frameworks
- Automated evidence export for audits
- External auditor access portal

### Pricing Philosophy

Interdict.io should be positioned as **"regulated compliance infrastructure"** — in the same budget category as cybersecurity tools (firewalls, SIEM, DLP), not SaaS subscriptions. Enterprise security/compliance budgets are large and non-discretionary. This is not a nice-to-have; it is a regulatory requirement.

---

## 22. Go-To-Market Strategy

### Phase 1: Beachhead (2026)

**Target:** Boutique law firms and small private banks in Belgium and EU
**Channel:** Direct outreach, regulatory pressure events (EU AI Act enforcement begins)
**Pitch:** "The EU AI Act is enforceable now. You need to demonstrate compliance by [date]. Interdict.io is your fastest path to compliance."

### Phase 2: Vertical Expansion (2027)

**Target:** Mid-market law firms, regional banks, insurance companies
**Channel:** Compliance consulting firms as resellers, legal technology conferences
**Pitch:** Expand to healthcare (HIPAA AI guidance becoming clearer)

### Phase 3: Enterprise (2027–2028)

**Target:** Global banks (Tier 1), Magic Circle law firms, Big Pharma
**Channel:** Enterprise sales team, Big 4 accounting firm partnerships (compliance advisory)

### Key GTM Levers

**Regulatory Deadlines as Sales Triggers**
EU AI Act enforcement dates create hard deadlines. Interdict.io's sales cycle should be organized around these dates — companies that haven't complied by the enforcement date face massive fines.

**Pilot-to-Production Conversion**
Start with a no-risk pilot at a department or team level. Once compliance teams see the audit trail working in production, expanding to the full enterprise is easy.

**Legal Opinion as Sales Tool**
Commission an external legal opinion stating that a company using Interdict.io and following its regulatory mappings has satisfied their EU AI Act obligations. This is an enormous commercial asset.

---

## 23. Current Traction & Pilot Partners

### Pipeline

| Partner | Type | Size | Status | Timeline |
|---|---|---|---|---|
| Boutique Law Firm | Law | ~80 employees | Interested, discussions scheduled | March 2026 |
| Small Private Bank | Financial Services | TBD | Interested, discussions scheduled | March 2026 |

### Incubator Applications

- Applying to Belgian incubators/accelerators (in progress)
- Applying to Y Combinator (YC) (in progress)

### IP Status

- First-mover advantage in EU AI Act compliance kernel space

---

## 24. Future Product Vision — Ecosystem Expansion

### Interdict.io Platform — First-Party Products

Beyond the core governance kernel, the vision is to build a suite of **Interdict.io-native workflow tools** that operate entirely within the Interdict.io compliance environment:

**1. Interdict.io Transcription**
- Status: Brainstorm
- Architecture: **100% off-cloud** — runs locally for maximum security
- Current users: Law students (through sister's network)
- Origin: Built to solve meeting transcription problems at Deloitte where Copilot and Zoom were blocked by compliance policy
- Vision: Offer as an integrated Interdict.io product — meeting transcriptions that are automatically governed, audited, and compliance-mapped

**2. Note-Taking & Document Processing**
- AI-assisted meeting notes that never leave the enterprise perimeter
- PDF document intelligence integrated with Interdict.io audit trail
- All AI actions traceable and policy-governed

**3. Long-Term Vision: The Interdict.io Ecosystem**
Every AI tool inside a regulated enterprise runs through the Interdict.io kernel. Interdict.io becomes the **"compliance operating system"** for enterprise AI — the layer that every AI tool must integrate with to be sold into regulated industries.

This creates a **platform play**: third-party AI tools certify "Interdict.io-compatible," and regulated enterprises only purchase Interdict.io-certified tools.

---

## 25. Co-Founder & Team Structure

**Required expertise:**
- **Low-latency networking:** gRPC, WebSockets, HTTP/2, zero-copy I/O
- **High-throughput logging:** Designing systems that handle 10,000+ events/second without database locks or data loss
- **Identity Federation:** Deep understanding of OIDC, SAML, JWT, mTLS
- **Systems programming:** Rust or Go proficiency for building the kernel binary
- **Infrastructure/DevOps:** Kubernetes, Helm, Terraform, cloud (AWS/Azure/GCP) deployment
- **Cryptography:** Practical understanding of SHA-256, Ed25519, Merkle Trees, HSM

### Role Division

| Role | Potential Cofounder | Fabio (CEO, CTO)|
|---|---|---|
| Business Development | ✅ Primary | — |
| Marketing & Brand | ✅ Primary | — |
| Client Acquisition | ✅ Primary | — |
| Investor Relations | ✅ Primary | — |
| Pitching & Demo | ✅ Primary | Support |
| Design (UI/UX) | ✅ (currently solo) | Open to collaboration |
| System Architecture | Advisory | ✅ Primary |
| Data Plane Development | — | ✅ Primary |
| Control Plane Development | Advisory | ✅ Primary |
| DevOps / Deployment | — | ✅ Primary |
| Cryptography Implementation | — | ✅ Primary |
| Technical Documentation | — | ✅ Primary |

---

## 26. Equity & Compensation Structures
For now 100% of the company is owned by Fabio. 

## 27. Founder Backgrounds

### Fabio — Founding CEO

- **Age:** 19 (born 2006)
- **Location:** Belgium
- **Education:** 2nd year Computer Science student
- **Professional Background:** Works with multiple freelance clients; exploring startup ideas; has one ongoing regular project
- **Languages:** English, Dutch, Polish, Italian, French
- **Technical Strengths:** Backend systems, infrastructure thinking, scalability evaluation
- **Exam Timeline:** Exams in 4 weeks, again in 10-12 weeks (relevant for availability)

---

## 28. IP & Legal Status

### Current Status

- Technology IP applications to be applied.
- Prototype codebase to be built (FastAPI/PostgreSQL)
- No formal legal entity structure documented yet (to confirm)

### IP Strategy Recommendations

**Patent Applications**
- The **evidence bundle format** and **Merkle-tree-based audit chain for AI governance** may be patentable
- The **regulatory mapping engine** methodology
- Consider **provisional patent** applications in the EU and US to establish priority date

**Trade Secret**
- The regulatory mapping algorithms and templates should be maintained as trade secrets until patent applications are filed
- Source code is trade secret by default

**Open Source Strategy Consideration**
- Consider open-sourcing the **verifier script** (the tool regulators use to verify audit trails) — this builds credibility and creates network effects
- Keep the kernel, policy engine, and regulatory mappings proprietary

---

## 29. Investor & Accelerator Strategy

### Current Applications

- **Belgian incubators/accelerators** — multiple, in progress
- **Y Combinator (YC)** — maybe

### YC Pitch Angle

Interdict.io is perfectly positioned for YC's current thesis on:
- **Enterprise infrastructure** (deep technical moat, not a SaaS wrapper)
- **Regulatory technology** (EU AI Act enforcement = massive near-term forcing function)
- **AI infrastructure** (the governance layer for the AI stack)

Key YC pitch elements:
- Clear problem (EU AI Act enforcement = regulated enterprises are legally exposed)
- Clear solution (kernel-level inline governance, not post-hoc dashboards)
- Technical depth (systems-level architecture, not another OpenAI wrapper)
- Pilot traction (law firm + bank in discussions)
- Large market (every regulated enterprise globally)

### Series A Preparation

Before Series A, Interdict.io needs:
- At least 1 pilot customer in production (paying or proof-of-concept with committed conversion)
- Data Plane MVP (Rust kernel running, proving the technical thesis)
- Cryptographic audit pipeline in place
- Technical co-founder on board

---

## 30. System Design Architecture Diagram

### Full System Architecture (Text Representation)

```
                    ┌──────────────────────────────────────────────┐
                    │         Interdict.io CONTROL PLANE                │
                    │                                              │
                    │  [Admin Dashboard]                           │
                    │       │                                      │
                    │  [Policy Builder UI]                         │
                    │       │ compile                              │
                    │  [Wasm/Rego Compiler]                        │
                    │       │                                      │
                    │  [Policy Distribution] ──gRPC push──────►   │
                    │       │                                      │
                    │  [FastAPI + PostgreSQL]                      │
                    │  [Key Management (KMS)]                      │
                    └──────────────────────────────────────────────┘
                                         │
                                         │ push policies
                                         ▼
                    ┌──────────────────────────────────────────────┐
                    │    CUSTOMER VPC / KUBERNETES CLUSTER         │
                    │                                              │
                    │   Pod: Company AI Application                │
                    │  ┌─────────────────┐ ┌───────────────────┐  │
                    │  │  App Container  │ │  Interdict.io KERNEL   │  │
                    │  │  (Copilot etc.) │ │  (Rust Sidecar)   │  │
                    │  │                 │ │                   │  │
                    │  │ → localhost:9090├─►  - Protocol Decode│  │
                    │  │                 │ │  - Policy Eval    │  │
                    │  │                 │ │  - Stream Inspect │  │
                    │  │                 │ │  - Token Buffer   │  │
                    │  └─────────────────┘ └───────────────────┘  │
                    │                               │              │
                    │                     async gRPC│              │
                    │                               ▼              │
                    │              ┌─────────────────────────────┐ │
                    │              │   EVIDENCE COLLECTOR        │ │
                    │              │   - Hash chaining           │ │
                    │              │   - Merkle Tree build       │ │
                    │              │   - Ed25519 signing         │ │
                    │              └─────────────────────────────┘ │
                    │                               │              │
                    └───────────────────────────────┼──────────────┘
                                                    │
                                    ┌───────────────┼────────────┐
                                    │               ▼            │
                              ┌─────────────┐  ┌───────────┐    │
                              │  PostgreSQL │  │ClickHouse │    │
                              │  (metadata) │  │  (logs)   │    │
                              └─────────────┘  └───────────┘    │
                                                    │            │
                                                    ▼            │
                                    ┌───────────────────────┐    │
                                    │  S3 OBJECT LOCK       │    │
                                    │  (Root Hash Anchors)  │    │
                                    │  - Write Once         │    │
                                    │  - Regulator Access   │    │
                                    └───────────────────────┘    │
                                                                 │
                    ┌────────────────────────────────────────────┘
                    │
                    ▼
           [LLM PROVIDER]
           (OpenAI, Azure OpenAI,
            Anthropic, Cohere, etc.)
```

---


## 31. Key Terminology Glossary

| Term | Definition |
|---|---|
| **AI Governance Kernel** | Infrastructure-level software that sits between an enterprise and its AI tools, enforcing policy, logging actions, and ensuring compliance |
| **Control Plane** | The management component of Interdict.io — where humans configure policies and view analytics; runs on FastAPI/Postgres |
| **Data Plane** | The real-time traffic processing component — where AI requests are intercepted, evaluated, and forwarded; must be Rust or Go |
| **SaaS Wrapper** | An application that provides a UI on top of a third-party AI API without adding infrastructure value |
| **VPC-Native** | Software that runs inside the customer's own cloud environment (AWS VPC, Azure VNet) rather than on the vendor's cloud |
| **Kubernetes Sidecar** | A second container running inside the same K8s Pod as the main application, sharing its network namespace |
| **Wasm / WebAssembly** | A portable binary format that runs at near-native speed in a sandboxed runtime; used for Interdict.io's plugin system |
| **Evidence Bundle** | A cryptographically signed JSON record of a single AI interaction, including the policy decision and audit metadata |
| **Merkle Tree** | A tree data structure where each node is the hash of its children; enables O(log n) proof of data integrity |
| **SHA-256** | A cryptographic hash function that produces a 256-bit fingerprint; any change to input data produces a completely different hash |
| **Ed25519** | A modern elliptic-curve digital signature algorithm; fast, small signatures, widely audited |
| **HSM** | Hardware Security Module — a physical device that securely stores cryptographic keys and prevents extraction |
| **mTLS** | Mutual TLS — both client and server present certificates to authenticate each other |
| **OIDC** | OpenID Connect — modern identity protocol built on OAuth 2.0; used for SSO in modern enterprises |
| **SAML 2.0** | Security Assertion Markup Language — legacy SSO protocol; still dominant in traditional enterprises and banks |
| **SSE** | Server-Sent Events — how streaming AI responses (ChatGPT-style) are delivered token by token |
| **gRPC** | Google's RPC framework using HTTP/2 and Protocol Buffers; used for internal Interdict.io component communication |
| **eBPF** | Extended Berkeley Packet Filter — Linux kernel technology allowing custom programs to run in kernel space for maximum performance and transparency |
| **OPA / Rego** | Open Policy Agent — industry standard policy engine; Rego is its declarative policy language |
| **Fail-Closed** | When a system component fails, all traffic is blocked (most secure; used in banking) |
| **Fail-Open** | When a system component fails, traffic is allowed through (preserves availability; used in lower-risk contexts) |
| **Shadow AI** | AI tool usage by employees that bypasses official governance channels (e.g., using personal ChatGPT account on a work device) |
| **Inline Prevention** | Blocking a policy violation before it occurs (vs. post-hoc detection of violations that already happened) |
| **Sliding Window Buffer** | A fixed-size buffer that holds recent tokens from a streaming response to enable pattern detection across multi-token sequences |
| **Zero-Copy Networking** | A technique where data is passed between kernel space and user space without copying — reduces CPU overhead in high-throughput proxies |
| **GIL** | Python's Global Interpreter Lock — prevents true multi-threading; makes Python unsuitable for high-concurrency proxy work |
| **Wasmtime** | A CNCF-hosted, production-grade WebAssembly runtime for server-side Wasm execution |
| **Helm Chart** | A package manager format for Kubernetes that enables one-command deployment of complex applications |
| **Air-Gapped** | An environment with no internet connectivity; Interdict.io must function fully in these environments for government/defense customers |
| **mTLS** | Mutual TLS — both client and server authenticate each other with certificates (stronger than API keys) |
| **EU AI Act** | European Union regulation governing AI systems; most comprehensive AI regulation in the world; creates hard compliance deadlines |
| **NIST AI RMF** | National Institute of Standards and Technology AI Risk Management Framework; US standard for AI risk governance |
| **TEE** | Trusted Execution Environment — hardware-isolated processing environment where code and data are encrypted in memory; even the host OS/admin cannot access it |
| **AWS Nitro Enclaves** | AWS's TEE implementation; runs isolated compute inside EC2 instances with cryptographic attestation; production-ready for financial services |
| **Intel SGX** | Intel's TEE technology (Software Guard Extensions); mature but has known side-channel vulnerabilities |
| **AMD SEV-SNP** | AMD's TEE technology (Secure Encrypted Virtualization - Secure Nested Paging); available on Azure and GCP |
| **Attestation** | A hardware-signed cryptographic certificate proving what code is running inside a TEE and that the enclave's memory is encrypted and isolated |
| **zk-SNARK** | Zero-Knowledge Succinct Non-Interactive Argument of Knowledge — a cryptographic proof that a computation was performed correctly without revealing the underlying data |
| **Multi-Agent Consensus** | An architectural pattern where multiple independent AI evaluators must agree before a high-stakes action is allowed to proceed |
| **Syscall Interception** | Using eBPF or similar kernel mechanisms to monitor and block system calls (file open, network connect, process exec) made by a container process |
| **Falco** | Open-source runtime security tool (by Sysdig) that uses eBPF for container syscall monitoring; validates the eBPF sandboxing approach |
| **Cilium** | Open-source eBPF-based networking and security platform for Kubernetes; provides libraries for building eBPF programs |
| **Circuit Compiler (ZK)** | A tool that converts high-level logic into arithmetic circuits for zero-knowledge proof generation (e.g., Circom, Noir, SP1) |

---

*Document compiled February 2026. Reflects the state of Interdict.io as of the initial technical architecture sessions and co-founder introductory call. All timelines, equity structures, and technical specifications are subject to revision as the company evolves.*
