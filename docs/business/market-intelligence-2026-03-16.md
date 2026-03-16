# Interdict — Market Intelligence & Business Strategy

**Date:** 2026-03-16
**Context:** Pre-beta research for Belgian market rollout. Design partner (10–15 employees) identified. Two paid pilot prospects: boutique law firm (~80 employees, Docker Compose) and small private bank (Kubernetes/Helm).

---

## Table of Contents

1. [OpenMed Comparison](#1-openmed-comparison)
2. [Competitive Landscape](#2-competitive-landscape)
3. [Business Models & Pricing](#3-business-models--pricing)
4. [Design Partner Strategy](#4-design-partner-strategy)
5. [Presentation & Demo Playbook](#5-presentation--demo-playbook)
6. [Legal, Business & Operational Readiness](#6-legal-business--operational-readiness)
7. [Product Roadmap Gaps (1–2 Year Outlook)](#7-product-roadmap-gaps-12-year-outlook)
8. [Expansion Features — Building the Skyscraper](#8-expansion-features--building-the-skyscraper)
9. [The Interdict Exchange — Policy Marketplace](#9-the-interdict-exchange--policy-marketplace-full-brainstorm)
10. [Developer Experience, SDKs & Platform Expansion](#10-developer-experience-sdks--platform-expansion)

---

## 1. OpenMed Comparison

**Question:** Is OpenMed (openmed.life) similar to Interdict?

**Answer:** No. Different problem space, different architecture, different audience.

**Interdict** is infrastructure middleware: a transparent proxy that sits between enterprise users and AI services, enforcing policies inline in real-time, producing cryptographically signed audit trails, and mapping every AI action to regulatory frameworks. It's a governance layer — it doesn't do NLP or build models. It intercepts, inspects, enforces, and logs.

**OpenMed** is a model toolkit: a collection of fine-tuned NER transformers and a Python SDK for extracting biomedical entities and de-identifying clinical text. It's tooling for clinical NLP practitioners — not an enforcement layer.

The only surface-level overlap is that both touch compliance (HIPAA/GDPR) and both care about data staying local. But:

| | Interdict | OpenMed |
|---|---|---|
| **Core function** | Policy enforcement proxy for all AI traffic | Biomedical NER models + PII extraction toolkit |
| **What it governs** | Any AI vendor (ChatGPT, Copilot, etc.) | Its own models only |
| **Architecture** | Rust kernel, streaming proxy, Wasm policies | Python package wrapping HuggingFace transformers |
| **Compliance approach** | Inline enforcement + cryptographic audit trail | Local inference + de-identification |
| **Deployment** | VPC-native sidecar/proxy | pip install / SageMaker endpoint |
| **Audience** | CISOs, compliance officers, IT security | Clinical data scientists, NLP engineers |

They're complementary if anything — an enterprise could run OpenMed models internally while routing that traffic through Interdict to enforce policies and produce audit evidence. But they don't compete.

---

## 2. Competitive Landscape

### Tier 1: Direct Competitors (Inline AI Traffic Enforcement)

These sit in the data path and enforce policies on AI traffic in real-time — same core architecture as Interdict.

**Proofpoint AI Security** (acquired from Normalyze/built internally)
- Enforces policies in real time — blocks, redacts, or restricts actions based on intent and context.
- Produces defensible audit trails for every AI interaction with full transaction reconstruction and user attribution.
- Massive enterprise distribution via existing Proofpoint email security install base. Likely the scariest competitor because they already have CISO relationships.

**Cisco AI Defense** (via Robust Intelligence acquisition)
- Robust Intelligence is widely recognized for pioneering the AI security category. Acquired by Cisco in October 2024 and foundational to the development of Cisco AI Defense.
- Cisco's distribution is enormous. They can bundle this into existing network security contracts.

**Lasso Security**
- GenAI policy enforcement at runtime, sitting in the execution path of GenAI interactions.
- Startup, closer to Interdict's size. Focused on runtime enforcement specifically.

**TrueFoundry AI Gateway**
- Sits directly in the production inference path between applications and model providers. Acts as a centralized control plane that manages routing, governance, observability, security, and cost controls.
- Supports VPC, on-prem, hybrid, or air-gapped environments.
- Recognized in the 2025 Gartner® Market Guide for AI Gateways.

**F5 AI Guardrails**
- Streamlines AI governance with audit-ready observability, scanning, and logging tools with ready-made presets for GDPR, HIPAA, EUAIA, and more.
- F5 already owns the load balancer/WAF layer in many enterprises. Natural extension.

**Akamai Firewall for AI**
- Deploys via the Akamai edge, REST API, or reverse proxy. Inspects inputs and outputs, detecting and blocking malicious prompts.
- Edge-deployed, so different architecture than Interdict's VPC-native model.

### Tier 2: Governance Platforms (Overlap on Compliance, Not Enforcement)

These do AI governance — inventory, risk assessment, compliance reporting — but *don't* sit inline in the data path. They're more like GRC tools than enforcement proxies.

**Credo AI** — Enterprise platform for AI governance, risk, and compliance. Founded in 2020. Forrester Wave Leader. Gartner recognized. World Economic Forum Technology Pioneer. Actively contributes to the EU AI Act, NIST AI RMF, and ISO 42001 frameworks alongside policymakers worldwide.

**Holistic AI** — Leading enterprise AI Governance Platform delivering full lifecycle oversight — from model discovery to risk management and compliance. Has Unilever and large enterprise customers. London-based, strong EU presence.

**Airia** — Launched AI Governance in January 2026 as the third pillar alongside AI Security and Agent Orchestration. Leadership team from OneTrust (the GRC giant).

**Vanta** — 400+ integrations, real-time automation, and a unified compliance dashboard. Already massive in SOC 2 compliance; adding EU AI Act as a framework.

### Tier 3: Platform Vendors Adding AI Governance

**Databricks Mosaic AI Gateway** — Centralizes control of AI systems — standardizing access, safeguarding usage and delivering full observability. Only works within the Databricks ecosystem.

**Gravitee AI Agent Management** — API management vendor extending to AI. Familiar patterns but early.

### Interdict's Differentiators That Still Hold

1. **Cryptographic audit trail** — SHA-256 hash chains + Ed25519 signatures + Merkle tree anchoring to S3 WORM. Nobody else does tamper-evident, cryptographically chained evidence bundles. The big players do "audit logs." Interdict does *evidence*.

2. **VPC-native, data-never-leaves** — Proofpoint/Akamai/Cisco are cloud-routed. The VPC-native sidecar model is a genuine differentiator for regulated EU enterprises that won't let traffic leave their perimeter.

3. **8 regulatory framework packs including EU AI Act** — Most competitors mention EU AI Act compliance but don't ship pre-built mappings. Interdict has 8 frameworks ready.

4. **Deterministic-only enforcement** — The "no LLM in the enforcement path" invariant is architecturally unique. Most competitors use AI/ML to classify threats — which introduces the non-determinism that regulated industries hate.

5. **Wasm policy modules with hot-reload** — Most competitors hardcode their policy logic. The Wasm+Rego pipeline is genuinely more extensible.

### Belgium-Specific Context

- From 2 August 2026, all high-risk AI systems placed on the EU market must fully comply with the requirements. 5 months away — timing is excellent.
- There is no dedicated national legislative act governing AI in Belgium — Belgium is directly subject to the EU AI Act.
- The Belgian Institute for Postal Services and Telecommunications (BIPT/IBPT) has emerged as the Market Surveillance Authority.
- No Belgian-native competitor in this space.
- Despite 90 percent of enterprises using AI in daily operations, only 18 percent have fully implemented governance frameworks. That's the market gap.
- Local AI companies like **Faktion** (Ghent) and **ML6** (Ghent/Amsterdam) are AI engineering consultancies, not governance platforms — they're potential channel partners, not competitors.

### Key Threats

1. **Proofpoint and Cisco** — they'll sell into the same CISOs, bundled with existing security contracts. Price and distribution advantage. Counter: VPC-native data sovereignty + cryptographic evidence (their logs are just logs).

2. **The August 2026 deadline** — Spending on AI governance expected to reach $492 million in 2026. Every vendor above is racing toward this date. First-mover advantage matters.

3. **Gartner category creation** — Market consolidation is expected as buyer requirements become clearer. Getting into the Gartner Market Guide for AI Gateways or AI Governance Platforms would be significant for credibility with Belgian enterprise buyers.

For a Belgium rollout targeting law firms and banks: the VPC-native model, cryptographic evidence, and deterministic enforcement are genuine differentiators. The big vendors are cloud-first, which is a hard sell in Belgian financial regulation. The biggest risk isn't feature parity — it's distribution and brand trust.

---

## 3. Business Models & Pricing

### How Competitors Price

Almost nobody in this space publishes prices. Credo AI, Lasso Security, Noma Security, Lakera, Prompt Security, Holistic AI — all "contact sales." This is standard for enterprise security software.

### The 4 Business Models That Fit Interdict

#### Model 1: Per-Seat / Per-Employee Annual Subscription ⭐ (Recommended for Pilots)

**How it works:** Fixed annual price × number of governed employees.

**Why it fits:** The law firm has ~80 employees. The bank has a known headcount. CISOs and CFOs can forecast the cost exactly — no surprises.

**Market benchmarks for security infrastructure:**
- ChatGPT Enterprise: ~$60/user/month ($720/year)
- Microsoft Copilot security: ~$30/user/month
- Enterprise CASB/DLP tools (Netskope, Zscaler): $8–25/user/month

**Suggested Interdict pricing:**

| Tier | Price | What You Get |
|------|-------|-------------|
| **Starter** (≤100 users) | €8–15/user/month | Core proxy + policy enforcement + audit trail |
| **Professional** (≤500 users) | €12–20/user/month | + Regulatory framework packs + compliance reports + human review queue |
| **Enterprise** (500+) | Custom | + SLA + dedicated support + custom policy development |

For the law firm: 80 users × €12/mo = **~€11,500/year**
For the bank: depends on scope, but 200 users × €15/mo = **~€36,000/year**

#### Model 2: Platform Fee + Per-Seat (Hybrid)

**How it works:** Fixed annual platform license (covers infrastructure, updates, support) + per-seat variable component.

**Why it fits:** Interdict has real infrastructure costs (kernel, ClickHouse, control plane). The platform fee covers that baseline. The per-seat component scales with value delivered.

**Example structure:**
- Platform fee: €15,000–30,000/year (covers deployment, updates, 8 regulatory packs, SLA)
- Per-seat: €5–8/user/month on top

Closer to how on-prem security appliances price (Palo Alto, F5) — a license fee plus per-user.

#### Model 3: Per-Transaction / Usage-Based

**How it works:** Price per AI request inspected, per policy evaluation, or per evidence bundle generated.

**Why to avoid it for now:** CFOs face opaque, hard-to-forecast expenses with usage-based AI billing. Buyers (law firm partners, bank compliance officers) want predictability, not utility-bill surprises. Usage-based works for developer tools, not for compliance infrastructure.

#### Model 4: Perpetual License + Annual Maintenance

**How it works:** One-time license purchase + 18–22% annual maintenance/support fee.

**Why it could work:** The VPC-native, data-never-leaves positioning aligns with customers who think in CapEx, not OpEx. Banks especially may prefer this for accounting treatment.

**Example:** €50,000 one-time license + €10,000/year maintenance.

### Contract Structure

#### What to Offer

| Element | Recommendation |
|---------|---------------|
| **Contract length** | Annual (12 months), with option for multi-year at discount |
| **Billing** | Annual upfront (standard) or quarterly (for smaller customers) |
| **Multi-year discount** | 10% for 2-year, 15% for 3-year commitment |
| **Pilot/POC** | 30–90 day paid pilot at reduced rate (e.g., 50% of annual, month-to-month) |
| **Onboarding fee** | One-time €3,000–8,000 for deployment + policy configuration |
| **Support tiers** | Email (included), Priority (8h SLA, +15%), Premium (4h SLA + named contact, +25%) |

#### What NOT to Do

- **Don't offer a free tier.** This is compliance infrastructure, not a developer tool. Free devalues the product with CISOs.
- **Don't do monthly-only.** Monthly signals "can churn anytime" — wrong signal for regulated buyers.
- **Don't do pure usage-based.** Compliance buyers want fixed costs.

### Revenue Math for the Two Pilots

**Conservative per-seat model at €12/user/month:**

| Customer | Users | Annual Revenue | + Onboarding |
|----------|-------|---------------|-------------|
| Law firm (Docker Compose) | 80 | €11,520 | €5,000 |
| Private bank (K8s/Helm) | 200 | €28,800 | €8,000 |
| **Year 1 total** | | | **€53,320** |

**Platform fee hybrid at €20K base + €6/user/month:**

| Customer | Users | Platform | Seats | Annual Total |
|----------|-------|----------|-------|-------------|
| Law firm | 80 | €15,000 | €5,760 | €20,760 |
| Private bank | 200 | €25,000 | €14,400 | €39,400 |
| **Year 1 total** | | | | **€60,160** |

### Recommendation

Start with per-seat annual contracts for the pilots:

1. **Simple to explain.** €12/user/month, annual commitment.
2. **Predictable for the buyer.** Fixed cost they can budget for.
3. **Can always add complexity later.** Once there are 5–10 customers, data on upsells enables tiers and platform fees.
4. **Paid pilots first.** 60-day paid pilot (month-to-month, at €15/user/month — *higher* than annual) that converts to annual at €12. Filters tire-kickers, creates pricing incentive to commit.

The August 2026 EU AI Act deadline is the best sales lever. The global AI governance market is estimated at USD 620 million in 2024, expected to reach USD 940 million by end of 2025, projected to grow to USD 7,380 million by 2030 (CAGR 51%).

---

## 4. Design Partner Strategy

The 10–15 employee interested party is a **design partner**, not a customer. Treat them differently from the paying pilots.

### The Value Exchange

| You Give Them | They Give You |
|---|---|
| Free access for the beta period (6 months max) | Structured feedback via the issues panel |
| Priority support (you want their bugs fast) | Minimum engagement commitment (e.g., 2 feedback sessions/month) |
| First access to new features | Permission to use anonymized usage data |
| Discounted conversion rate when beta ends | A case study / testimonial at launch |
| | A reference call for future prospects |

### The Contract (Design Partner Agreement)

Keep it simple — 2–3 pages, not a full SaaS agreement:

1. **Term:** 6 months, renewable once. Hard end date. Beta can't drift into "free forever."
2. **Scope:** Up to 15 users, production use allowed.
3. **Their obligations:**
   - Use the platform actively (minimum X AI interactions/week or whatever signals real usage)
   - Report issues through the issues panel within 48 hours of encountering them
   - One 30-minute feedback call per month (or async equivalent)
   - Participate in one case study interview at beta end
   - Allow anonymized, aggregated usage metrics for product development
4. **Your obligations:**
   - Keep the platform running with reasonable uptime (no SLA — it's a beta)
   - Respond to critical bugs within 24 hours
   - No sharing of their data, ever
5. **Conversion clause:** At beta end, they get a "founding partner" rate — 30–40% off standard per-seat price, locked for 2 years, if they convert within 30 days. For 15 users at €12/user/month, that's roughly **€1,300–1,500/year** instead of €2,160. Small revenue but establishes the precedent that the product costs money.
6. **IP and data:** You own all product improvements. Their business data stays theirs. Usage telemetry (anonymized) is yours.

### The Issues Panel

- **Keep it dead simple.** Category (bug / friction / suggestion / compliance gap), severity (blocks me / annoying / nice-to-have), free text, optional screenshot. That's it.
- **Don't over-engineer it.** A lightweight form that writes to a database you can query, or even a dedicated GitHub Projects board they can access. Lower friction to zero so they actually report things.
- **Tag everything with user role.** A compliance officer's friction is worth 10× a junior employee's feature request for the roadmap.
- **Add a "what were you trying to do?" field.** The task context is more valuable than the bug description. People report symptoms, not causes.

### What NOT to Do

- **Don't skip the agreement.** Even informal beta partners need a written understanding. Without it, "free beta" becomes "why are you charging me now, we've been using this for months."
- **Don't make the beta open-ended.** 6 months max. If the product isn't giving them enough value to pay after 6 months of free use, the problem isn't pricing.
- **Don't treat their feedback as representative.** 10–15 employees is one data point. Valuable for finding bugs and UX friction, not for validating market fit or pricing.
- **Don't build features just for them.** Listen to their problems, not their solutions. They'll ask for things that only matter for a 15-person company. The product is for 80–500+ seat orgs.

### The Real Value

The data collected isn't just bug reports. With 10–15 real users hitting the proxy daily:

- **Actual latency distributions** under real traffic patterns (not synthetic benchmarks)
- **Policy false-positive rates** — how often does enforcement block something legitimate?
- **Which regulatory mappings they actually look at** vs. which ones collect dust
- **How often the audit trail gets queried** — does anyone actually use the evidence verification UI?

That operational data is worth far more than €2,000/year in subscription revenue. It's what makes the pitch to the law firm and bank credible — "we've been running in production with real users for 6 months, here's what we learned."

---

## 5. Presentation & Demo Playbook

### Before the Meeting

**Know their stack.** Find out:
- Which AI tools are their employees already using? (ChatGPT, Copilot, Claude, etc.)
- What kind of data do they handle? (Client data, financial, legal, medical?)
- Have they had any AI-related incidents or concerns?
- Who's in the room? (Owner, IT person, compliance-minded person?)

This changes what you demo. If they're a legal or financial firm, PII redaction is the hook. If they're tech-heavy, the architecture and latency story matters.

### The Presentation Flow (45–60 minutes)

#### Part 1: The Problem (10 minutes, no screen)

Don't start with the product. Start with their risk.

**Open with a question, not a pitch:**

> "How many of your employees used ChatGPT or an AI tool this week? ... Do you know what they pasted into it?"

Then make it concrete:

> "Right now, if someone on your team copies a client contract into ChatGPT to summarize it, three things happen that you can't see: that data leaves your network, it potentially trains a third-party model, and you have zero record it happened. If a regulator asks you next August what AI your company used and what data it touched — can you answer that today?"

**August 2026 is the anchor.** Mention the EU AI Act deadline once, early, matter-of-factly. Don't scare them — just make it real.

> "From August 2, every company using AI in the EU needs to demonstrate governance. Not 'we have a policy document' — demonstrable technical controls and audit trails. That's what we built."

#### Part 2: The Live Demo (25–30 minutes)

Do it live, on their network if possible, or on your laptop with Docker Compose running. Pre-recorded demos feel fake. Live demos feel real.

**Demo sequence — each one builds on the last:**

---

**Demo 1: "The Invisible Layer" (5 min)**

Show that Interdict is transparent — it doesn't change how anyone works.

1. Open a browser, configure the proxy (or show it's already configured)
2. Go to ChatGPT. Type a normal prompt: *"Explain the difference between a BV and an NV in Belgian corporate law"*
3. Watch it work perfectly. Normal speed, normal response.

> "Your employees don't see Interdict. They don't install anything. They don't change how they work. But every interaction just got logged, policy-checked, and signed."

Now flip to the **dashboard**. Show the audit trail entry that just appeared — timestamp, user, vendor, the prompt, the response, the policy verdict. Their eyes should widen here.

---

**Demo 2: "The Redaction" (5 min) — THE SHOWSTOPPER**

1. Go back to ChatGPT
2. Type something with PII: *"Draft an email to Jan De Smedt, born 15/03/1985, national number 85.03.15-123.45, about his account balance of €47,000 at KBC"*
3. Show the request going through — but with PII redacted mid-stream before it reaches OpenAI
4. Flip to the dashboard: show the original (what the user typed), what actually left the network (redacted), and the policy that triggered

> "Jan's national number never left your building. The AI got the request, your employee got their answer, but the sensitive data stayed inside your infrastructure. And here's the proof it happened."

This is the moment. This is the one they'll remember. **Practise this demo until it's flawless.**

---

**Demo 3: "The Block" (3 min)**

1. Show the vendor management panel — approved vendors listed
2. Try to hit a non-approved AI service (or one you've blocked)
3. Show the request get blocked with a clear message
4. Show it in the audit trail — blocked, logged, signed

> "Your IT team decides which AI services are approved. Everything else is blocked. Not by a firewall rule that breaks silently — by a policy that logs why, when, and who."

---

**Demo 4: "The Proof" (5 min) — This separates you from everyone else**

1. Open the evidence verification UI
2. Pick any of the events from the demo
3. Show the hash chain — each event linked to the previous one
4. Show the Ed25519 signature verification — green checkmark
5. Show how tampering is impossible — if anyone changed a record, the chain breaks

> "This isn't a log file. It's a cryptographic evidence chain. Every event is signed, chained to the previous one, and anchored. If a regulator asks for proof, you hand them this — not a CSV someone could have edited."

Don't over-explain the crypto. Show the verification passing, explain it's tamper-proof, move on. If someone technical asks, go deeper. Otherwise, "signed and chained" is enough.

---

**Demo 5: "The Policy Builder" (5 min)**

1. Open the policy builder
2. Create a simple policy live: "Block any prompt containing IBAN numbers"
3. Show it compiling and deploying (hot-reload, no restart)
4. Go back to ChatGPT, type a prompt with an IBAN
5. Watch it get caught

> "You just created a compliance rule in 30 seconds. No code. It's already enforcing. Try the IBAN."

---

**Demo 6: "The Compliance Report" (3 min)**

1. Generate a PDF report from the dashboard
2. Show it includes: all policy violations, regulatory framework mappings, evidence references
3. Hand it to them (digitally or printed)

> "This is what you hand to an auditor. One click, everything documented."

---

#### Part 3: The Design Partner Pitch (10 minutes)

Now — and only now — pitch the partnership.

> "We're not asking you to buy anything today. We're building this for companies exactly your size, and we need a partner who'll use it for real and tell us what's broken."

Lay out the deal:
- **Free for 6 months**, 15 users
- You deploy it on their infrastructure (Docker Compose, takes an hour)
- They use it daily — real work, real AI tools
- They report issues through a simple panel you'll set up
- One short feedback call per month
- At the end: option to stay at a founding partner rate, plus they get a case study credit

**What they get:**
- EU AI Act compliance infrastructure before the deadline, at zero cost
- Actual proof of AI governance they can show a regulator if asked
- A say in shaping the product for companies their size

**What you get:**
- Real production data, real user friction reports
- A reference customer for your paid pilots
- Proof that the system works in a live environment

### Practical Tips

**Environment setup:** Have Docker Compose running before the meeting. Don't waste 10 minutes on `docker compose up` while they watch containers pull. Have some pre-existing audit data in there too so the dashboard doesn't look empty, but do the key demos live.

**Fallback plan:** If live demo breaks (it happens), have 3–4 screenshots of each key moment saved. Say "let me show you what this normally looks like" and troubleshoot later. Never debug live in front of a prospect.

**Leave-behind:** After the meeting, send them:
1. A one-page summary of what Interdict does (not technical)
2. The design partner agreement (ready to sign)
3. The compliance report PDF you generated during the demo

**Who should be in the room:** Ideally whoever makes the AI governance decision. In a 10–15 person company, that's probably the owner or managing director. An IT-adjacent person is helpful but not essential — you're deploying this, not them.

**Language to use:** "Governance" not "security." "Evidence" not "logs." "Enforce" not "monitor." "Proof" not "report." Every word should signal that this is active, not passive.

**Language to avoid:** Don't say "proxy" to non-technical people — say "invisible layer." Don't say "kernel" — say "enforcement engine." Don't say "Wasm" or "Rego" — say "policy rules." They don't care about the how. They care about the what.

### The One Thing That Matters Most

The PII redaction demo. Practise it 10 times. Make it perfect. When they see their employee's fake national number get stripped out of a ChatGPT request in real-time, *before it leaves their network*, with cryptographic proof it happened — that's the moment they become a design partner.

Everything else is supporting evidence. That one demo is the sale.

---

## 6. Legal, Business & Operational Readiness

### Legal Landmines

#### Employee Communication Interception

Interdict reads what employees type into AI tools. In Belgium, that's employee monitoring — and Belgian labor law has opinions about it.

**CCT/CAO No. 81** (Collective Labour Agreement on employee privacy) governs electronic monitoring in Belgian workplaces. The employer must inform employees *before* monitoring begins, specify the purpose, and it must be proportionate. You can't just silently proxy their traffic.

**What this means:**
- Customers need to inform their employees that AI traffic is monitored
- Ship a template notification document with every deployment — make it their problem legally, but make it easy
- Consider a first-use banner/notice that employees see once: *"AI usage at [Company] is governed by policy. Interactions are logged per [CCT 81 / internal policy]."*
- Without this, the customer could face labor disputes, and they'll blame the product

#### GDPR — Data Processor Obligations

Interdict processes employee data and potentially client data that flows through prompts. Under GDPR:

- You need a **Data Processing Agreement (DPA)** with every customer. Non-negotiable.
- Document the **legal basis** — likely "legitimate interest" (security/compliance) for the interception
- **Data minimization** matters. How long are audit trails stored? Is full prompt text stored or just metadata? The `full_text_storage` toggle is smart — but the *default* should be off, with the customer explicitly opting in
- **Right to erasure** — if an employee leaves and requests deletion, can records be purged from ClickHouse and the evidence chain without breaking the hash chain? This is a genuine architectural tension between GDPR and tamper-evidence. Think about it now.

Have a template DPA ready before the beta starts. Don't let a design partner deploy without one.

#### Does Interdict Itself Fall Under the EU AI Act?

Probably not as a high-risk system — it's governance infrastructure, not a decision-making AI. But confirm this explicitly because:

- If any Layer 2 NLP classifiers make enforcement decisions (block/allow), a regulator *could* argue that's an AI system making consequential decisions
- The "no LLM in the enforcement path" invariant actually protects here — deterministic rules aren't AI under the Act
- Document this analysis. Have it ready. Someone will ask.

### Business Readiness

#### Insurance

**Cyber liability insurance.** If the proxy has a bug and leaks client PII to OpenAI, the customer's client sues them, and they come after you. At this stage, a basic cyber liability policy runs €2,000–5,000/year. Get it before the beta starts.

**Professional indemnity / E&O insurance.** If you claim "EU AI Act compliance" and a regulator disagrees, you could face liability for the compliance gap. Be precise in language — you *help enable* compliance, you don't *guarantee* it.

#### Company Structure

Register a proper entity. A Belgian **BV (Besloten Vennootschap)** is the standard for a software startup. Needed for:
- Signing the design partner agreement (personal liability otherwise)
- Invoicing the paid pilots
- The DPA (processor must be a legal entity)
- IP ownership (the company owns the code, not you personally)

#### IP Protection

The cryptographic evidence chain architecture is genuinely novel. Consider:
- **Patent** — the combination of Wasm policy hot-reload + hash-chained evidence bundles + Merkle anchoring for AI governance could be patentable. A provisional application costs ~€1,500 and buys 12 months to decide. Talk to a patent attorney before publishing any architecture papers or detailed blog posts.
- **Trademark** — register "Interdict" in the EU (EUIPO). ~€850 for one class. Do this before someone else does.

#### Compliance Language

This is crucial for the website, pitch deck, and every document:

- ❌ "Interdict makes you EU AI Act compliant"
- ✅ "Interdict provides the technical controls and audit infrastructure for EU AI Act compliance"

The first is a legal claim you can't back up — compliance depends on the customer's entire organization, not just one tool. The second is accurate and defensible. Every enterprise buyer's legal team will scrutinize the language.

### Go-to-Market Beyond the Pilots

#### Channel: Consultancies and Auditors

In Belgium, companies don't Google "AI governance platform." They ask their:
- **DPO (Data Protection Officer)** — many Belgian SMEs outsource this
- **IT security consultant**
- **Auditor** (Big Four or Belgian firms like BDO, Mazars, Grant Thornton)
- **Legal counsel** specialized in tech/data

These people are the channel. If a DPO recommends Interdict to their 15 clients, that's 15 warm leads without a sales team. Find 3–5 DPOs and IT security consultants, show them the product, and offer a referral arrangement.

#### The Belgian Enterprise Network

Belgium is small. Everyone in a vertical knows everyone. One happy design partner at a law firm tells three other managing partners at a legal networking event. One compliance officer at the bank mentions it at a Belgian Financial Forum meeting. Word of mouth is disproportionately powerful in a country of 11 million.

This also means one bad deployment travels just as fast. Nail the beta.

#### Events to Be At

- **Cybersec Europe** (Brussels, annual) — the Belgian infosec event
- **Data Protection Institute** events — DPO network
- **Belgian AI week / AI4Belgium** activities — more awareness than sales, but visibility matters
- **Fédération des Entreprises de Belgique (FEB/VBO)** digital transformation events — direct access to enterprise decision makers

No booth needed. Attend, have conversations, do a hallway demo on a laptop. At this stage, one conversation with the right person is worth more than a branded banner.

### Technical Risks

#### Vendor API Changes

Vendors change endpoints, headers, TLS configurations, and streaming formats. The proxy needs to handle this gracefully. One OpenAI API change that breaks interception and the design partner can't use ChatGPT for a day — that's how trust is lost.

**Mitigation:** Build a vendor compatibility test suite that runs daily against the actual endpoints. Know about changes before the customer does.

#### Certificate Trust on Employee Machines

The transparent proxy requires employees' machines to trust the CA certificate. Trust scripts exist for macOS, Windows, Linux — but:
- What about phones/tablets accessing AI tools?
- What about BYOD policies? (Common in 15-person companies)
- What about browser updates that change certificate handling?

For the beta, scope this clearly: "Interdict covers company-managed devices." Don't try to solve BYOD in the beta.

#### The "It's Slow" Perception

p99 is <10ms overhead. Employees won't notice it. But if ChatGPT itself is slow one day, they'll blame the proxy. This is irrational but universal with any transparent middleware.

**Mitigation:** The dashboard should show latency attribution — "proxy overhead: 3ms, upstream response time: 2,400ms." When someone complains, prove it's not you.

### Pre-Beta Checklist

- [ ] BV registered (or whatever entity is being used)
- [ ] Design partner agreement (2–3 pages, lawyer-reviewed)
- [ ] Data Processing Agreement (GDPR template, customized)
- [ ] Employee notification template for customers (CCT 81)
- [ ] Cyber liability insurance
- [ ] "Interdict" trademark filed at EUIPO
- [ ] Privacy policy on the website (the issues panel collects data)
- [ ] The issues panel built and tested
- [ ] A one-page product summary (non-technical, for the person who wasn't in the demo)
- [ ] Docker Compose deployment tested on a clean machine (not just your laptop)
- [ ] A runbook for the design partner's IT person (if they have one)
- [ ] Monitoring/alerting so you know if their instance goes down before they do

### The Hardest Problem

The hardest problem won't be technical. Interdict is solid — v1.6, 8 milestones, 60k+ LOC, cryptographic evidence chains. The engineering is there.

The hardest problem will be **getting the second meeting.** The first meeting is curiosity. The second meeting is commitment. Between those two meetings, the contact has to convince their boss, partners, or board that:
1. AI governance is a real problem (not hypothetical)
2. It's urgent (August 2026 helps here)
3. This small company they've never heard of can be trusted with their AI traffic
4. The deployment won't disrupt their employees

The demo gets meeting one. What gets meeting two is: the leave-behind materials, the DPA being ready (signals professionalism), the employee notification template being ready (signals you've thought about their problems), and a follow-up within 48 hours with a concrete deployment timeline.

---

## 7. Product Roadmap Gaps (1–2 Year Outlook)

### Gap 1: Agentic AI Governance — THE Big Gap ⚠️

This is the single biggest shift happening right now, and Interdict isn't built for it yet.

Interdict today governs **human → AI** traffic. A person opens ChatGPT, types a prompt, gets a response. The proxy intercepts that.

But the world is rapidly shifting to **agent → agent** and **agent → tool** traffic:
- Gartner projects that 40% of enterprise applications will embed autonomous AI agents by the end of 2026.
- The fastest-growing attack surface in enterprise security is non-human identities (NHIs). NHIs outnumber human identities at a 50:1 ratio in enterprises today. AI agents represent a new category of NHI requiring dedicated security governance. 97% of AI-related data breaches stem from poor access management.

**What to build:**
- Governance for AI agents that call other AI services autonomously (not just humans using ChatGPT)
- Policy enforcement on agent-to-agent communication — comprehensive logging of tool invocation, API calls and system access attempts, clear records of what data was accessed and what actions were executed. Audit trails where security teams can reconstruct the decision pathway that led to a particular action.
- Non-human identity management — agents as first-class identities with their own permissions, separate from the user who launched them
- Kill switches — inline controls such as automated policy enforcement, anomaly thresholds or kill-switch mechanisms to halt or quarantine suspicious activity before it propagates across systems.

**Timeline:** On roadmap for late 2026. By early 2027, buyers will expect it.

### Gap 2: MCP / A2A / ACP Protocol Awareness

Three new protocols are becoming standard for how agents communicate. The proxy currently understands HTTP/HTTPS to known AI vendors. It will soon need to understand:

- **MCP (Model Context Protocol)** — created by Anthropic, standardizes the interaction between LLM-based agents and external tools or APIs. Employs a request/response REST interface over HTTP for structured invocation of external capabilities.
- **A2A (Agent-to-Agent)** — Google's protocol providing structured JSON-over-HTTP for agent-to-agent communication. Aims to create a world where agents built on different frameworks and by different vendors can seamlessly collaborate.
- **ACP (Agent Communication Protocol)** — IBM's contribution for semantic inter-agent messaging.

Cisco's State of AI Security 2026 notes the growing risk surface of MCP agentic AI and how adversaries can use agents to execute attack campaigns.

MuleSoft is introducing Governance for Agent Interactions. Anypoint Flex Gateway now supports MCP and A2A protocols.

Solo.io built an **Agent Gateway** — "purpose-built with Rust for real-world agentic systems." Note: that's Interdict's architecture. Well-positioned to add protocol awareness to the kernel, but need to start.

**What to build:**
- MCP-aware request inspection in the kernel (parse MCP JSON-RPC, apply policies to tool invocations)
- A2A task lifecycle interception (inspect agent cards, enforce policies on delegated tasks)
- Policy rules that understand agent identity, not just user identity
- Evidence bundles that capture the full agent decision chain, not just a single request/response

### Gap 3: Shadow AI Discovery

Current architecture is **opt-in proxy** (explicitly in Out of Scope). But the market is moving toward discovery of AI tools that bypass approved channels:

- In 30 days, Obsidian Security observed 69,749 interactions between users and corporate data with SaaS embedded AI features, most of which would have gone unnoticed without in-browser detection.
- Traditional SaaS platforms (Atlassian, Twilio, Zendesk, Airtable) are rapidly and quietly embedding AI features directly into applications teams already use. Unless constantly reviewing product updates, it may take months before realizing sensitive data is being sent to an external AI model.

**What to build:**
- Network-level detection of traffic to known AI service endpoints (already a proxy — traffic is visible)
- Dashboard surface showing discovered AI services vs. approved AI services
- Auto-classification: approved, pending review, blocked
- Natural extension of the existing vendor allowlist — extend from enforcement-only to discovery + enforcement

### Gap 4: AI Inventory / Registry

Gartner's Market Guide highlights centralized AI inventories for managing applications, agents, datasets, and models, and interoperability across data governance, security, AI development, and enterprise systems.

Buyers will want a single pane of glass showing:
- Every AI system in use (internal models, external APIs, embedded AI in SaaS)
- Risk classification per system (under EU AI Act categories)
- Data flows per system (what data goes where)
- Policy coverage (which systems are governed, which aren't)

Pieces exist (vendor management, audit trail) but not a unified inventory view. Gartner projects that by 2030, fragmented AI regulation will quadruple and extend to 75% of the world's economies, driving $1 billion in total compliance spend.

### Gap 5: Cost Visibility and Budget Controls

Gartner defines an AI Gateway as middleware that sits between applications and AI services or models, managing security, observability, and cost optimization. Organizations need the ability to allocate budgets and rate limits at the customer, team, user, and API key level.

Since Interdict is already in the traffic path and can see every API call, adding token counting, spend tracking, and budget caps per department/user is relatively low-hanging fruit. Law firms and banks will both care — AI spend is unpredictable and CFOs hate it.

### Gap 6: ISO 42001 Alignment

This is becoming the "ISO 27001 of AI" — the certifiable management system standard. ISO 42001 treats AI as a governance and risk discipline, applies lifecycle oversight from design to retirement, and establishes clear accountability for AI outcomes. By 2026, organizations without AI governance practices meeting ISO 42001-level rigor will find it increasingly difficult to justify their approach to boards or regulators.

Interdict has 8 regulatory framework packs. Add ISO 42001 mapping. When a prospect asks "does this help with our ISO 42001 certification?" the answer needs to be yes.

### Gap 7: SIEM / SOAR Integration

Audit data currently lives in ClickHouse behind the dashboard. Enterprise security teams will want it flowing into their existing security tooling:

- Splunk / Elastic SIEM integration
- Webhook/syslog forwarding for SOC alerts
- SOAR playbook triggers (auto-respond to policy violations)

Table stakes for any enterprise with a security operations center. Not hard to build — it's an export/forwarding layer — but it needs to exist.

### Roadmap Gap Priority Stack

| Priority | Capability | Why Now |
|---|---|---|
| **H2 2026** | Cost visibility / budget controls | Easy win. Traffic is already visible. CFOs love it. |
| **H2 2026** | SIEM integration (syslog/webhook export) | Unblocks enterprise SOC teams. Small effort, big unlock. |
| **H2 2026** | ISO 42001 framework pack | Just a mapping exercise. Huge credibility signal. |
| **H1 2027** | Agentic AI governance + MCP/A2A awareness | Market is moving here *fast*. First mover in VPC-native agentic governance is wide open. |
| **H1 2027** | Shadow AI discovery | Natural extension of the proxy. Low engineering cost, high sales value. |
| **H1 2027** | AI inventory / registry | Becomes essential as companies scale past 5–10 AI tools. |

The agentic AI story is the one that could either make or break you. 98% of security leaders indicate that security and data concerns have already delayed or reduced agentic AI deployments. That's 98% of CISOs who are worried and looking for solutions. Interdict is already a policy-enforcing proxy built in Rust with Wasm extensibility — the architecture is right for this. The question is when to start building it.

---

## 8. Expansion Features — Building the Skyscraper

### The Core Insight

Interdict sits in the most privileged position in an enterprise's AI stack: **it sees every prompt and every response, in real time, before it leaves the building.** Most of what it does with that position today is policy enforcement and audit. But that data stream is a goldmine for features that nobody else can offer because nobody else has that vantage point.

The features in Section 7 were *gaps* — stuff needed to not lose. The features below are what turn Interdict from a compliance checkbox into something a CISO can't imagine operating without.

---

### Feature 1: AI Risk Intelligence Dashboard — "What's Actually Happening"

Right now the dashboard shows violations and audit trails. That's reactive — it answers "what went wrong." The feature that makes CISOs *dependent* on Interdict is answering **"what's happening right now and what should I worry about."**

**What to build:**
- **Real-time AI usage heatmap** — who's using what, how often, which departments, which vendors, what times of day. Not just counts — patterns. "Your legal team's ChatGPT usage tripled this week" is more useful than "147 requests today."
- **Sensitive data exposure scoring** — every prompt gets a risk score based on what it contains (PII density, confidentiality markers, regulatory sensitivity). Roll that up into a company-wide "AI exposure score" that trends over time. CISOs love a single number they can report to the board.
- **Topic classification** — automatically categorize what employees are using AI for. Code generation? Document drafting? Data analysis? Client work? Internal admin? This tells leadership *where AI is creating value* vs. where it's just risk.
- **Anomaly detection** — "This employee just pasted 47 client records into ChatGPT at 2am on a Saturday" should trigger an alert without a policy being written for it. Behavioral baselines per user, department, and org — deviations surface automatically.

**Why it matters:** Modern SaaS environments now include embedded AI agents and features that require visibility and oversight. Competitors in the DLP space are racing to add AI-specific monitoring, but they're bolting it onto existing architectures. Interdict *is* the AI traffic layer. It sees everything natively.

**Competitive moat:** Nobody else has this data at this fidelity. Proofpoint sees email. Zscaler sees web traffic. Microsoft Purview sees Microsoft ecosystem traffic. Interdict sees *all AI traffic* regardless of vendor, with full prompt content.

---

### Feature 2: Prompt Injection & Jailbreak Detection

This is becoming a compliance requirement, not just a nice-to-have. Modern compliance frameworks now specifically require controls for prompt injection prevention and detection. The NIST AI Risk Management Framework mandates threat modeling for semantic attack vectors, while ISO 42001 requires risk assessments for input manipulation and unauthorized instruction modification.

**What to build:**
- **Inbound prompt scanning** — detect injection patterns in employee prompts before they reach the AI vendor. Not to protect the vendor — to protect the customer's data. An injection that tricks ChatGPT into revealing its system prompt is one thing; an injection embedded in a document that an employee pastes in could exfiltrate data in the response.
- **Response integrity checking** — scan AI responses for content that shouldn't be there. If an employee asks ChatGPT to summarize a contract and the response contains a Social Security number from the training data, that's a response-side data leak.
- **Pattern library + custom rules** — ship with OWASP Top 10 for LLMs patterns out of the box, let customers add custom detection rules via the policy builder.

The architecture is perfectly positioned for this. Effective prompt injection defense combines multiple layers: input validation, robust output filtering, privilege minimization, and strict identity and access controls. The existing 3-layer policy pipeline (Wasm/Rego → NLP → human review) already supports this — prompt injection detection slots into Layer 2 cleanly.

**Why it shines:** This is a feature the law firm and bank prospects will *love* in the demo. "Not only do we stop your data from going out — we stop bad data from coming back in."

---

### Feature 3: Smart Model Routing & Failover

This is where Interdict goes from "governance layer" to "infrastructure layer" — and infrastructure is stickier than governance.

Systems may fail unexpectedly when providers like OpenAI hit rate limits, with no fallback strategy in place. Without proper infrastructure, the multi-provider reality becomes a nightmare.

**What to build:**
- **Automatic failover** — if OpenAI goes down, route to Anthropic or Azure OpenAI transparently. The employee doesn't notice. Already a proxy — routing is a configuration change, not an architectural one.
- **Policy-based routing** — "Legal department prompts go to Azure OpenAI (EU data residency). Engineering prompts go to Anthropic (best for code). HR prompts are blocked from all vendors."
- **Data residency routing** — automatically route requests to EU-hosted endpoints when the prompt contains EU citizen data. This is *massive* for GDPR compliance and enforceable transparently.

**Why it shines:** Once Interdict is the routing layer, it's not just governance — it's infrastructure. Ripping out infrastructure is 10× harder than ripping out a compliance tool. This makes Interdict sticky.

---

### Feature 4: Response-Side DLP (The Unguarded Door)

Everyone focuses on what goes *out* (prompts containing sensitive data). Almost nobody governs what comes *back in*.

The system analyzes both user prompts sent to AI models and responses received from AI providers, identifying sensitive data patterns and taking appropriate protective actions. Cloudflare added this to their AI Gateway, signaling the market sees it as essential.

**What to build:**
- **Response scanning** — AI models can leak training data, generate harmful content, produce hallucinated legal/medical advice, or return copyrighted material. Scan responses for: PII that shouldn't be there, code with known vulnerabilities, legal citations that don't exist, competitor confidential information.
- **Content policy enforcement on responses** — "Block any AI response that contains medical advice" or "Flag any AI response that cites a specific legal statute for human review." The policy builder already exists — extend it to the response side.
- **Watermarking/provenance tagging** — stamp AI-generated content as it passes through. When an employee uses AI-generated text in a client deliverable, the audit trail shows exactly which parts were AI-generated. This will be *required* under EU AI Act transparency obligations.

**Why it shines:** The demo moment: paste something into ChatGPT, get a response that contains something problematic, and show it being caught on the way *back*. "We protect both directions."

---

### Feature 5: User Coaching & Nudges (Not Just Block)

Right now enforcement is binary: allow or block. The DLP world learned this lesson a decade ago — blocking everything creates shadow IT. The smart play is coaching.

**What to build:**
- **Just-in-time user education** — when a policy triggers, instead of a hard block, show: "This prompt contains what looks like a client IBAN. We've redacted it before sending. [Learn why]". Turn enforcement moments into training moments.
- **"Are you sure?" prompts** — for medium-risk content, show a warning that the user can acknowledge: "This prompt appears to contain confidential financial data. Continue? [Yes, I understand the risk] [Cancel]". Log their choice either way.
- **Risk-aware suggestions** — "You're about to send client data to ChatGPT. Consider using [Approved Internal AI Tool] instead, which keeps data on-premises." If the company has internal AI tools, route people toward them.
- **User risk scores** — aggregate per-user behavior over time. Not for punishment — for targeted training. "These 5 employees trigger PII policies most often. They might benefit from an AI usage training session."

**Why it shines:** This changes the conversation from "AI governance is the thing that blocks me" to "AI governance helps me use AI safely." CISOs want this because it reduces friction complaints from employees.

---

### Feature 6: Semantic Caching (Cost Killer)

Semantic caching reduces costs and latency by caching responses based on semantic similarity rather than exact string matching.

Interdict already sees every request and response. If 10 employees ask ChatGPT "What are the GDPR requirements for data retention?" within the same week, that's 10 API calls that return essentially the same answer.

**What to build:**
- Cache responses for semantically similar prompts (cosine similarity on embeddings, configurable threshold)
- Serve cached responses from within the VPC — the response never touches an external API
- Per-department, per-vendor cache policies (some departments want fresh responses every time; others are fine with cached)
- Dashboard showing cache hit rates and estimated cost savings

**Why it shines:** This pays for Interdict's subscription fee in cost savings alone. When you can show a CFO "Interdict saved you €2,400 in API costs this month," the renewal conversation is trivial.

---

### Feature 7: Data Lineage & Provenance Tracking

The top data loss prevention solutions now track data origin and movement. They reduce false positives by over 90% compared to traditional keyword scanning.

**What to build:**
- **Content fingerprinting** — when a document enters the AI workflow (pasted prompt), fingerprint it. If the same content appears in a different context later (another employee's prompt, a response, an exported document), link them.
- **AI output tracking** — tag every AI-generated response with a provenance ID. If that text ends up in a client deliverable, a legal brief, or an email, the audit trail can trace it back to the original AI interaction.
- **Cross-session intelligence** — "This employee pasted the same client contract into ChatGPT, Claude, and Gemini over two days, slightly modifying the prompt each time." That's either comparison shopping (fine) or trying to bypass a policy that blocked them on the first attempt (not fine).

**Why it shines:** When an auditor or regulator asks "show me every time AI touched this client's data," you can answer that question definitively. Nobody else can.

---

### Feature 8: Department-Level AI Budgets & Chargeback

One misconfigured agent loop or improperly scoped API key can consume an entire quarterly budget in hours. Hierarchical budget management at team, project, and customer levels is essential for multi-team organizations. Without it, a single runaway workflow can consume an entire quarter's AI budget overnight.

**What to build:**
- Per-department token budgets with hard and soft caps
- Real-time token counting per vendor (every request is visible — tokens can be counted)
- Automated alerts at 50%, 80%, 100% of budget
- Monthly chargeback reports per department
- Cost optimization recommendations ("Your marketing team spent €800 on GPT-4 this month. 40% of those requests could have been handled by GPT-3.5 based on complexity analysis.")

**Why it shines:** This is the feature that gets a meeting with the CFO, not just the CISO. Finance teams love it. Once AI costs are visible and attributed, Interdict becomes part of the financial control infrastructure.

---

### Feature 9: Compliance Posture Scoring & Gap Analysis

Go beyond "here's your audit trail" to "here's how compliant you actually are."

**What to build:**
- **Continuous compliance scoring** — a real-time score per regulatory framework (EU AI Act: 78%, GDPR: 92%, NIST AI RMF: 65%). Based on which controls are deployed, which policies are active, what gaps exist.
- **Gap analysis** — "To reach 90% EU AI Act compliance, you need to: enable response scanning (Article 14 human oversight), add prompt injection detection (Article 9 risk management), create an AI inventory (Article 16)."
- **Audit readiness indicator** — "You are audit-ready for GDPR. You are NOT audit-ready for EU AI Act — 3 controls missing."
- **Regulation change monitoring** — when a framework updates (new NIST guidance, EU AI Act implementing acts), automatically flag which gaps opened up.

**Why it shines:** This turns Interdict from "a tool we use" to "the system of record for our AI compliance posture." Compliance officers will open this dashboard every morning. That's stickiness.

---

### Feature 10: Multi-Tenant / MSP Mode

This is a business model feature, not a user feature — but it unlocks a massive growth vector.

**What to build:**
- A single Interdict deployment that serves multiple customer tenants
- Per-tenant policies, users, dashboards, evidence chains
- Centralized management for the MSP/consultancy operating it
- Per-tenant billing and usage reporting

**Why this matters for Belgium:** DPOs and IT consultancies are the channel. If a Belgian DPO firm manages data protection for 30 small companies, they don't want to deploy 30 Interdict instances. They want one deployment that governs all their clients. Multi-tenant mode turns every DPO firm into a reseller running Interdict as a managed service.

This is how you get from 2 customers to 200 without a sales team.

---

### Expansion Feature Priority Map

| Timeline | Feature | Revenue Impact | Stickiness |
|---|---|---|---|
| **Now (beta)** | User coaching & nudges | Medium | High — reduces complaints |
| **Q3 2026** | AI risk intelligence dashboard | High — demo wow factor | Very high — daily use |
| **Q3 2026** | Department budgets & chargeback | High — unlocks CFO buy-in | Very high — financial infrastructure |
| **Q3 2026** | Response-side DLP | Medium | High — "both directions" story |
| **Q4 2026** | Prompt injection detection | High — compliance requirement | High — NIST/ISO mandate |
| **Q4 2026** | Compliance posture scoring | High — audit readiness | Very high — system of record |
| **Q1 2027** | Smart model routing & failover | Very high — infrastructure stickiness | Maximum — can't rip out |
| **Q1 2027** | Semantic caching | High — pays for itself | High — direct cost savings |
| **Q1 2027** | Data lineage & provenance | Medium | High — audit differentiator |
| **H2 2027** | Multi-tenant / MSP mode | Transformational — channel unlock | Maximum — platform play |

---

### The Strategy in One Sentence

Interdict has the foundation of a compliance tool. The features above turn it into **the AI operating system for regulated enterprises** — the single layer through which all AI flows, all costs are tracked, all risks are scored, all compliance is proven, and all evidence is sealed.

That's the skyscraper. The foundation — the Rust kernel, the streaming proxy architecture, the Wasm policy pipeline, the cryptographic evidence chain — those are exactly the right bones for everything above. Most competitors would need to rewrite their architecture to do what Interdict can do with feature additions.

---

---

## 9. The Interdict Exchange — Policy Marketplace (Full Brainstorm)

### Why This Changes Everything

Every feature discussed so far makes Interdict a better *product*. The marketplace makes Interdict a **platform**. The distinction matters:

- A product sells to customers. Revenue scales linearly with sales effort.
- A platform enables an ecosystem. Revenue scales with other people's effort.

Interdict already has the architectural foundation: Wasm policy modules, hot-reload, the Rego-to-Wasm compiler, and a policy builder UI. Policies are already portable, versioned artifacts. The leap from "we ship policies" to "anyone can ship policies" is smaller than it looks.

### The Name

The marketplace needs its own identity within Interdict.

Options considered:
- **Interdict Exchange** — signals trading, commerce, value exchange. "Available on the Interdict Exchange." Captures both the commerce angle and the idea that expertise is being exchanged between specialists and practitioners. Subtly positions policies as valuable assets, not just config files.
- **Interdict Vault** — plays on the security/compliance angle. Policies are valuable, protected, trusted.
- **Interdict Registry** — technical, Terraform-inspired. Developers would get it immediately. But too dry for law firms.
- **PolicyHub** — descriptive, clear, forgettable.
- **The Interdict Marketplace** — plain, honest, no confusion about what it is.

**Recommendation: Interdict Exchange.**

### What the Exchange Is

A curated exchange where domain experts — law firms, compliance consultancies, security researchers, regulatory bodies, independent developers — publish enforcement-ready policy packs that any Interdict customer can install with one click.

Think: the Shopify App Store, but for AI governance policies. Or Terraform Registry, but for compliance rules.

### Who Publishes

| Publisher Type | What They Sell | Why They'd Participate |
|---|---|---|
| **Law firms** | Regulatory policy packs (EU AI Act Article-by-Article, GDPR data handling, sector-specific rules) | New revenue stream from expertise they already have. A law firm that writes a comprehensive EU AI Act policy pack can sell it to every Interdict customer instead of advising one client at a time. |
| **Compliance consultancies** | Industry-specific bundles (financial services, healthcare, legal, public sector) | Productizes their advisory work. Passive income on top of billable hours. |
| **Security researchers** | Threat detection rules (prompt injection patterns, jailbreak signatures, data exfiltration patterns) | Monetize research. Similar to how Snyk or CrowdStrike researchers publish detection rules. |
| **Big Four / audit firms** | "Audit-ready" compliance packs aligned to their audit frameworks | Deepens client relationships. They audit AI governance — selling the policies that pass their own audits is a natural extension. |
| **Regulatory bodies / industry associations** | Official reference implementations of their regulations | Accelerates adoption of their frameworks. They want compliance to be easy, not a barrier. |
| **Independent developers** | Niche/specialty policies (specific AI vendor quirks, language-specific PII patterns, custom workflow rules) | Side income. Same motivation as WordPress plugin developers or VS Code extension authors. |
| **Interdict (first-party)** | Core policy library, starter packs, reference implementations | Seeds the marketplace, sets quality standards, provides baseline value. |

### What Gets Sold

#### Policy Packs (The Core Product)

A policy pack is a versioned, tested bundle containing:
- One or more Wasm-compiled policy modules
- Rego source code (for transparency and customization)
- Documentation: what it detects, why, which regulations it maps to
- Test cases: example inputs that should trigger/not trigger
- Configuration schema: what the customer can customize (thresholds, entity types, severity levels)
- Regulatory mapping metadata: which articles/requirements of which frameworks this policy satisfies

**Examples of policy packs:**

| Pack Name | Publisher | Price | Description |
|---|---|---|---|
| EU AI Act — Full Compliance Suite | Van den Berg & Partners (law firm) | EUR 2,500/year | 47 policies covering every enforceable article. Updated within 30 days of implementing act changes. |
| Belgian Financial Sector AI Rules | Deloitte Belgium | EUR 1,800/year | FSMA guidelines + NBB circulars mapped to enforcement policies. Includes DORA AI provisions. |
| HIPAA PHI Detection — Extended | HealthSec Consulting | EUR 1,200/year | 23 PHI patterns beyond the base Interdict set, including clinical note formats, HL7 fragments, and DICOM metadata. |
| OWASP LLM Top 10 — Active Defense | SecurityLab (independent) | EUR 800/year | Prompt injection, jailbreak, and data poisoning detection patterns. Updated monthly. |
| French CNIL AI Guidelines | Cabinet Dupont (Paris law firm) | EUR 1,500/year | CNIL-specific requirements for AI systems operating in France, including DPIA triggers. |
| Legal Privilege Detection | Clifford Chance (law firm) | EUR 2,000/year | Detects attorney-client privileged material in prompts before it reaches external AI. Prevents privilege waiver. |
| PCI-DSS AI Compliance | Stripe Security Team | EUR 900/year | Policies for AI interactions involving payment card data. PCI-DSS 4.0 mapped. |
| Dutch AP (Autoriteit Persoonsgegevens) Pack | Privacy Company BV | EUR 1,000/year | Dutch-specific GDPR enforcement patterns including BSN detection, Dutch medical record formats. |

#### Regulatory Framework Mappings

Not just policies — the *mappings* that connect policies to regulations. A law firm might not write Rego, but they can create expert regulatory mappings that tell the system: "Policy X satisfies Article Y of Regulation Z." This is pure legal expertise, packaged as data.

#### Response Templates

What users see when a policy triggers. A law firm can craft legally precise notification language: "This interaction was blocked under [Company]'s AI Usage Policy, Section 4.2, implementing EU AI Act Article 14(1) human oversight requirements. Contact compliance@company.com for review."

#### Assessment & Audit Templates

Pre-built compliance assessment questionnaires, audit checklists, and report templates that integrate with the compliance posture scoring feature (Section 8, Feature 9). An audit firm sells the assessment framework; Interdict auto-populates it with real data.

### Revenue Model

#### For Interdict (Platform Take Rate)

| Model | How It Works | Typical Rate |
|---|---|---|
| **Revenue share** | Interdict takes a percentage of every marketplace sale | 20-30% (Apple takes 30%, Shopify takes 0-20%, AWS Marketplace takes 15-20%) |
| **Listing fee** | Publishers pay a flat annual fee to list | EUR 500-2,000/year — lower barrier, predictable for publishers |
| **Tiered share** | Lower take rate as publisher revenue grows | 30% on first EUR 10K, 20% on EUR 10K-50K, 15% above EUR 50K — incentivizes top publishers |

**Recommendation:** Start with 25% revenue share, no listing fee. Low barrier to attract early publishers. Once the marketplace has traction, introduce a verified/premium tier with lower take rates for high-quality publishers.

#### For Publishers

| Pricing Model | Best For |
|---|---|
| **Annual subscription** | Regulatory packs that need ongoing updates (EU AI Act changes, new case law) |
| **One-time purchase** | Static utility policies (specific PII pattern, single detection rule) |
| **Freemium** | Basic pack free, advanced/customizable version paid — drives adoption |
| **Per-seat** | Enterprise packs where value scales with company size |

#### Revenue Projection

Conservative estimate — Year 1 of marketplace (assume 50 Interdict customers, 20 published packs):

| Metric | Value |
|---|---|
| Average pack price | EUR 1,200/year |
| Average packs per customer | 2.5 |
| Gross marketplace revenue | EUR 150,000/year |
| Interdict take (25%) | EUR 37,500/year |
| Publisher earnings | EUR 112,500/year |

At scale (Year 3, 500 customers, 100 packs):

| Metric | Value |
|---|---|
| Gross marketplace revenue | EUR 1,500,000/year |
| Interdict take (25%) | EUR 375,000/year |
| Publisher earnings | EUR 1,125,000/year |

The marketplace revenue becomes a significant portion of total revenue — and it's almost pure margin since publishers create the content.

### The Flywheel

The marketplace creates a **network effect flywheel**:

1. **More customers** — more demand for specialized policies — attracts more publishers
2. **More publishers** — better policy coverage — attracts more customers who see comprehensive compliance available out-of-the-box
3. **More policies** — deeper regulatory coverage — makes Interdict the obvious choice vs. competitors who only ship their own policies
4. **Publisher reputation** — law firms and consultancies compete on policy quality — quality goes up without Interdict engineering effort
5. **Data feedback** — anonymized, aggregated data on which policies trigger most, which false-positive, which regulations are most enforced — publishers improve their packs — quality increases organically

Competitors can copy features. They can't copy a thriving marketplace ecosystem. Once 50 law firms are publishing policies on Interdict, the switching cost for customers is the entire policy library they've built their compliance posture on.

### Full User Journeys

#### The Publisher Journey — Law Firm Example

Walk-through for **Van den Berg & Partners**, a 12-person Brussels data protection law firm.

**Discovery:** A partner at the firm has been using Interdict for 4 months as a design partner. She notices that every time a new GDPR enforcement decision drops from the Belgian DPA, she has to manually update her clients' AI policies. She thinks: "I do this for 15 clients. What if I did it once and it applied everywhere?"

**Onboarding:**
1. She signs up for a Publisher account on the Interdict Exchange
2. Provides firm registration (BCE/KBO number), bar membership for the lead author, and a brief description of the firm's expertise
3. Gets "Verified Publisher" status within 48 hours (identity check against Belgian bar registry)
4. Receives access to the **Policy Development Kit (PDK)** — a local development environment with:
   - Rego editor with syntax highlighting and autocomplete
   - Test harness: define sample prompts/responses and expected verdicts
   - Regulatory mapping editor: link policy rules to specific regulation articles
   - Local Interdict kernel for testing (lightweight Docker container)
   - Documentation templates

**Development:**
1. She writes a policy pack: "Belgian DPA AI Enforcement — Complete Suite"
2. The pack contains 12 policies covering:
   - Belgian-specific GDPR interpretations from DPA decisions
   - Belgian national number (Rijksregisternummer) detection with checksum validation
   - Belgian ID card (eID) data pattern recognition
   - IBAN detection with Belgian bank code validation (BIC patterns for BNP Paribas Fortis, KBC, ING Belgium, Belfius)
   - Cross-border data transfer flags (Belgian DPA is stricter than some EU peers on Schrems II)
   - Belgian labor law CCT 81 compliance markers
   - Flemish/Walloon/Brussels regional data handling differences
   - Belgian medical data (INAMI/RIZIV numbers, mutualite/ziekenfonds references)
3. Each policy includes:
   - 20+ test cases (positive and negative)
   - Regulatory mapping to specific DPA decisions (with case numbers)
   - Configuration options (strictness level, entity types to detect, language — NL/FR/DE)
   - User-facing notification text in Dutch, French, and German (Belgium's three official languages)

**Publishing:**
1. She runs `interdict-pdk publish` which:
   - Compiles all Rego to Wasm
   - Runs all test cases (must pass 100%)
   - Validates regulatory mapping metadata
   - Generates a policy pack manifest with checksums
   - Signs the pack with her publisher key
   - Uploads to the Exchange for review
2. Interdict's automated review:
   - Wasm sandboxing test (memory limits, execution time, no side effects)
   - Duplicate detection (is this substantially similar to an existing pack?)
   - Metadata completeness check
3. Interdict's manual review (for packs claiming regulatory compliance):
   - A contracted legal reviewer checks: do these policies actually map to the claimed DPA decisions?
   - Turnaround: 5 business days for Verified Publishers, 10 for Community
4. Pack goes live on the Exchange

**Ongoing:**
1. Monthly: she checks her publisher dashboard — installs, revenue, false positive reports, customer feedback
2. Quarterly: Belgian DPA issues new guidance. She updates the pack, bumps the version, publishes an update. Existing subscribers get notified: "Update available — includes new DPA decision 2026/0847 on AI-generated profiling."
3. Yearly: she reviews her pricing based on market feedback and competitor packs

**Revenue:** 40 Interdict customers install her pack at EUR 1,200/year. That's EUR 48,000 gross, EUR 36,000 net (after 25% Interdict take). That's a junior associate's salary — earned passively while the firm continues its advisory practice.

#### The Buyer Journey — Small Bank Example

**Context:** A Belgian private bank, 200 employees, has Interdict deployed on Kubernetes. Their compliance officer needs to satisfy the FSMA (Belgian Financial Services and Markets Authority) during an upcoming inspection.

**Discovery:**
1. She opens the Interdict dashboard, clicks "Exchange" in the navigation
2. Browses by category: **Financial Services** then **Belgium** then **FSMA**
3. Sees 4 relevant packs:
   - "Belgian Financial Sector AI Compliance" by Deloitte Belgium (EUR 1,800/year, Expert Publisher, 87 installs, 4.7 stars)
   - "FSMA AI Guidelines — Full Suite" by ComplianceBE BVBA (EUR 1,200/year, Verified Publisher, 34 installs, 4.4 stars)
   - "DORA + AI Risk Controls" by KPMG Belgium (EUR 2,200/year, Expert Publisher, 156 installs, 4.8 stars)
   - "Belgian Banking PII — Extended Patterns" by PrivacyFirst (EUR 600/year, Community Publisher, 12 installs, 4.1 stars)

**Evaluation:**
1. She clicks into the Deloitte pack. Sees:
   - Full policy list with descriptions
   - Regulatory mapping: which FSMA circulars and NBB guidelines each policy covers
   - Test results: 247/247 tests passing on current version
   - False positive rate: 0.3% (based on anonymized aggregate data from all installations)
   - Changelog: last updated 2 weeks ago
   - Sample notification text (what employees see when a policy triggers)
   - Compatibility: requires Interdict v1.5+, compatible with their kernel version
   - Publisher profile: Deloitte Belgium, verified credentials, 7 other packs published
2. She clicks "Preview" — sees exactly what policies will be added, what they detect, and what the employee experience looks like
3. She clicks **"Try in Audit Mode"** — the pack installs but only *logs*, doesn't enforce. She can see what *would have been* blocked/redacted over the past 2 weeks without actually disrupting anyone.

**This is the killer feature for the buyer: try-before-you-enforce.** Audit mode lets the compliance officer see exactly how a policy pack would affect daily operations before committing. She can show her board: "Here's what this pack would have caught last month. Here's the false positive rate. I'm confident we should enforce."

**Purchase & Install:**
1. She clicks "Install", enters billing details (or uses the company's existing Interdict billing)
2. The pack downloads, signatures verify, Wasm modules load via hot-reload
3. She chooses deployment mode:
   - **Audit mode** (log only, no enforcement) — for evaluation
   - **Warning mode** (notify users, don't block) — for rollout
   - **Enforce mode** (full enforcement) — for production
4. She configures pack-specific settings:
   - Strictness: Medium (catches clear violations, allows borderline cases with a warning)
   - Languages: NL + FR (the bank operates in both)
   - Notification style: Inline browser warning (not email)
   - Exempt users: CTO and CISO (they test AI tools as part of their job)
5. Policies are live within 60 seconds. No restart, no downtime.

**Ongoing:**
1. Dashboard shows a new section: "Exchange Policies" with per-pack statistics
2. When the publisher releases an update, she gets a notification with a changelog
3. She can auto-update (for minor versions) or require manual approval (for major versions)
4. Before the FSMA inspection: she generates a compliance report that includes which Exchange policies are installed, their regulatory mappings, enforcement statistics, and the publisher's credentials

#### The Independent Developer Journey

**Context:** A security researcher in Estonia who publishes prompt injection detection tools.

**Discovery:** She finds the Interdict Exchange while researching AI security tools. She's published detection patterns as YARA rules and Sigma rules before — this is a natural extension.

**Development:**
1. She downloads the PDK
2. Writes a policy pack: "Advanced Prompt Injection Detection v2"
3. Contains 45 detection patterns covering direct injection, indirect injection, multi-turn escalation, encoding attacks, and multilingual injection
4. She writes 200+ test cases against real-world prompt injection datasets
5. She publishes as a Community Publisher at EUR 800/year

**Growth:**
1. First month: 3 installs. She writes a blog post about her research.
2. Third month: 18 installs. A security conference talk references her work.
3. Sixth month: 45 installs. She applies for Verified Publisher status.
4. She now earns EUR 33,750/year net. She quits her job and does this full-time, expanding to 3 packs.

### Creative Policy Pack Ideas

#### Industry-Specific Packs

| Pack | What It Detects/Enforces |
|---|---|
| **Legal Privilege Shield** | Detects attorney-client privileged content in prompts. Prevents privilege waiver by blocking privileged material from reaching external AI. |
| **M&A Blackout Enforcer** | During an active M&A deal, blocks any prompt containing deal-related terms, company names, or financial figures. Configurable blackout periods with deal code words. |
| **Clinical Trial Integrity** | Detects unblinded clinical trial data in prompts. Prevents researchers from accidentally sending patient identifiers or treatment arm assignments to external AI. |
| **Source Code IP Protection** | Detects proprietary source code using code fingerprinting. Distinguishes between open-source code (safe) and proprietary code (block). Configurable per-repository. |
| **Education — Student Data (FERPA)** | US education-specific: detects student records, grades, disciplinary information in AI prompts. |
| **Insurance Claims Fraud Detection** | Scans AI-assisted insurance claim processing for patterns indicating fraud. |
| **Real Estate — Transaction Confidentiality** | Prevents leaking deal terms, property valuations, buyer/seller identities during AI-assisted real estate transactions. |
| **Journalism — Source Protection** | Detects confidential source identifiers, unpublished investigation details, whistleblower information in AI prompts. |

#### Threat-Specific Packs

| Pack | What It Detects/Enforces |
|---|---|
| **Data Exfiltration via AI** | Detects patterns where employees use AI as a data exfiltration channel — large volumes of structured data, database exports, customer lists. |
| **Competitive Intelligence Leak** | Detects when employees share competitive strategy, pricing models, customer acquisition costs, or roadmap information with AI tools. |
| **Insider Threat Indicators** | Behavioral patterns: unusual hours, volume spikes, accessing AI tools for topics outside the employee's role, sequential prompting that looks like systematic data extraction. |
| **Social Engineering Craft** | Detects when AI is being used to draft phishing emails, social engineering scripts, or pretexting scenarios. |
| **Deepfake Text Detection** | Scans AI responses for text that mimics specific individuals or corporate communications styles. |

#### Operational Packs

| Pack | What It Detects/Enforces |
|---|---|
| **AI Quality Assurance** | Scans AI responses for hallucination indicators: fabricated citations, non-existent legal cases, impossible dates, self-contradictions. |
| **Brand Voice Compliance** | Ensures AI-generated content matches corporate brand guidelines. Detects off-brand language, prohibited terms, competitor mentions. |
| **Accessibility Compliance** | When AI generates HTML or document content, checks for WCAG compliance. |
| **Contract Clause Detection** | Scans AI-generated contract language for dangerous clauses: unlimited liability, auto-renewal, non-compete overreach, IP assignment. |
| **Translation Quality Gate** | When AI is used for translation, runs quality checks: untranslated segments, format errors, culturally inappropriate content. |

#### Regional / Language Packs

| Pack | What It Detects/Enforces |
|---|---|
| **Arabic PII + Gulf GCC** | Arabic-language PII detection (Emirates ID, Saudi national ID, Qatari QID) + GCC data protection regulation mapping. |
| **Japanese APPI Compliance** | Japanese-language PII (My Number, health insurance number) + APPI regulatory mapping. |
| **Brazilian LGPD — Full Suite** | Portuguese-language PII (CPF, CNPJ, SUS card) + LGPD enforcement policies. |
| **Indian DPDP Act** | Hindi + English PII (Aadhaar, PAN, Voter ID) + DPDP Act 2023 regulatory mapping. Multi-script support. |
| **Korean PIPA Compliance** | Korean-language PII + PIPA regulatory mapping. |

This is where the marketplace becomes genuinely global. Interdict can't write PII detection for every language and every regulation. But a Korean compliance consultancy can — and they'd be motivated to, because Korean enterprises deploying Interdict would pay for it.

### Policy Composition & Stacking

Customers won't install just one pack. They'll stack multiple packs, and they need to work together without conflicts.

**Policy conflict resolution:**
- What happens when Pack A says "allow" and Pack B says "block" for the same prompt?
- **Default: most restrictive wins.** If any policy says block, the prompt is blocked.
- **Customer-configurable priority:** drag-and-drop policy pack ordering. Higher priority packs override lower ones.
- **Conflict dashboard:** shows which packs have overlapping rules and how conflicts are being resolved.

**Policy composition:**
- Some packs should work together as a suite. A "Belgian Financial Compliance" bundle might include the FSMA pack + Belgian PII pack + DORA pack + GDPR pack, tested together.
- Publishers can create **bundles** — curated combinations of packs at a discount.
- Interdict can suggest **recommended combinations** based on what similar companies have installed.

### The Policy Development Kit (PDK) — Deep Dive

The PDK is the developer experience for publishers. It needs to be excellent, because the quality of the marketplace depends on the quality of the tools publishers use to create policies.

**Components:**

1. **CLI tool (`interdict-pdk`)**
   - `interdict-pdk init` — scaffold a new policy pack project
   - `interdict-pdk test` — run all test cases locally
   - `interdict-pdk compile` — Rego to Wasm compilation
   - `interdict-pdk lint` — check for common mistakes, anti-patterns, performance issues
   - `interdict-pdk benchmark` — measure policy execution time (must be <2ms to be eligible for Exchange)
   - `interdict-pdk simulate` — run against a corpus of sample prompts and show what would trigger
   - `interdict-pdk publish` — sign, upload, and submit for review
   - `interdict-pdk update` — publish a new version of an existing pack

2. **Local test environment**
   - Lightweight Docker container with the Interdict kernel
   - Route local browser traffic through it
   - Test policies against real AI services (your own accounts)
   - See exactly what employees would see when a policy triggers

3. **Documentation generator**
   - Auto-generates user-facing documentation from policy metadata
   - Regulatory mapping visualization (which articles does this pack cover?)
   - Test coverage report

4. **VS Code extension** (stretch goal)
   - Rego syntax highlighting and autocomplete
   - Inline test running
   - Policy pack manifest editor
   - One-click local kernel deployment

### Architecture Requirements

#### Already Built
- Wasm policy module format (portable, versioned)
- Rego-to-Wasm compiler (control plane)
- Hot-reload of policy modules (kernel)
- Policy builder UI (dashboard)
- 8 regulatory framework mappings
- Policy CRUD API (control plane)

#### Needs to Be Built

| Component | Complexity | Description |
|---|---|---|
| **Marketplace registry** | Medium | Catalog of available policy packs with metadata, search, filtering by regulation/industry/vendor |
| **Publisher portal** | Medium | Upload, version, test, publish workflow for policy authors. CI/CD for policies. |
| **Policy signing & verification** | Low | Sign published policies with publisher's key + Interdict co-signature. Evidence chain architecture already handles this pattern. |
| **One-click install** | Low | Customer clicks "Install", policy is downloaded, verified, and hot-loaded. Already have hot-reload — this is a UI wrapper. |
| **Billing integration** | Medium | Stripe Connect or similar for marketplace payments. Publisher payouts, Interdict take rate, customer invoicing. |
| **Review & curation** | Medium | Quality review process before policies go live. Automated + manual for regulatory claims. |
| **Versioning & updates** | Low | Semantic versioning. Customers can pin versions or auto-update. Breaking changes require explicit approval. |
| **Usage analytics for publishers** | Low | Dashboard showing installs, deployments, trigger frequency, false positive reports, revenue. |
| **Ratings & reviews** | Low | Customer ratings, written reviews, "verified purchase" badges. |
| **Dependency management** | Medium | Some policies depend on others. Resolve and install dependencies automatically. |
| **License management** | Medium | Enforce per-seat or per-instance licensing. |

#### Security Considerations

Policy modules run as Wasm inside the kernel. A malicious policy could theoretically exfiltrate data via verdicts, cause DoS, or produce false negatives.

**Mitigations (most already exist):**
- Wasm sandboxing (Wasmtime already enforces memory/CPU limits)
- Policy output validation (verdicts must conform to a strict schema)
- Automated testing in the publisher pipeline
- Interdict co-signing (only reviewed and co-signed policies can be installed)
- Reputation system (publishers build trust over time)
- Canary deployment (new policies run in audit-only mode for a configurable period before enforcement)

### Marketplace Governance

#### Publisher Tiers

| Tier | Requirements | Benefits |
|---|---|---|
| **Community** | Account created, policies pass automated checks | Listed in marketplace, standard 25% take rate |
| **Verified** | Identity verified, professional credentials confirmed (bar membership, certification, firm registration) | "Verified Publisher" badge, priority in search, 20% take rate |
| **Expert** | 6+ months on platform, >10 deployments, <2% false positive rate, professional credentials | "Expert Publisher" badge, featured placement, dedicated support, 15% take rate |
| **Official Partner** | Contractual relationship with Interdict, joint go-to-market | Co-branded, early access to new features, custom take rate |

#### Quality Controls

- **Automated testing gate** — every policy must include test cases. Failures block publication.
- **Regulatory claim verification** — Interdict's team verifies regulatory mappings. Unverified claims are labeled "Publisher-asserted, not independently verified."
- **False positive tracking** — aggregated and surfaced to the publisher. Persistent high rates trigger review.
- **Versioning requirements** — breaking changes require a new major version. Migration guides required.
- **Deprecation policy** — publishers must maintain policies for 12 months minimum. 6 months notice for sunsetting.

### Community & Ecosystem

**Discussion forums per policy pack:** Customers ask questions, report edge cases, share configuration tips. Publishers respond, gather feedback, announce changes.

**Policy Request Board:** Customers post what they need. Publishers see demand before investing. Interdict surfaces trending requests: "12 customers have requested Thai PDPA compliance policies — 0 packs available."

**Publisher certification program:** "Certified Interdict Policy Developer" — online course + exam. EUR 500 per certification. Revenue stream + professional community.

**Annual Policy Summit:** Virtual or in-person. Publishers present packs, share learnings. Interdict presents marketplace data. Builds ecosystem identity.

### Analytics & Intelligence Layer

The marketplace generates a unique dataset: **aggregated, anonymized AI governance intelligence across hundreds of organizations.**

**For publishers:** trigger frequency, false positive rates, industry breakdown, time from install to enforcement.

**For customers:** peer benchmarking, recommended packs based on similar companies, policy coverage gaps.

**For Interdict:** demand signals by regulation and region, customer lifetime value by pack count, publisher tier quality analysis, seasonal patterns.

**This data is the real gold.** An annual "State of AI Governance" report based on anonymized marketplace data — thought leadership that no competitor can replicate. Positions Interdict as the definitive source of truth on how enterprises are actually governing AI.

### Monetization Beyond Revenue Share

| Revenue Stream | Description |
|---|---|
| **Featured placement** | Publishers pay EUR 500-2,000/month for top-of-category placement. |
| **Promoted packs** | Sponsored listings in search results and recommendations. |
| **Enterprise publisher accounts** | Big Four and large consultancies pay EUR 10,000/year for white-label publisher dashboards, bulk publishing tools, and priority review. |
| **Certification revenue** | EUR 500 per developer certification. At 200 certifications/year = EUR 100,000. |
| **Data products** | Anonymized marketplace intelligence sold as quarterly reports. EUR 5,000-25,000 per report license. |
| **Custom policy development** | EUR 5,000-20,000 per engagement. Resulting policy optionally published to the Exchange. |
| **Policy auditing service** | Third-party review of customer's installed policy stack. EUR 2,000-5,000 per audit. |

### The Law Firm Angle — Why This Is Brilliant for Belgium

**The pitch to law firms is not "buy Interdict." The pitch is: "Publish on Interdict."**

A Belgian law firm specializing in data protection can:

1. **Productize their expertise.** Write a comprehensive EU AI Act policy pack once. Sell it to every Interdict customer.
2. **Maintain ongoing value.** When a new implementing act drops, update the pack. Subscribers get the update. Same model as Wolters Kluwer but for *enforcement*, not just information.
3. **Build reputation.** "Our EU AI Act policy pack is installed by 200+ companies" is a better marketing credential than any brochure.
4. **Deepen client relationships.** "We don't just advise you on compliance — we *write the rules your AI enforcement engine runs.*"

**For the law firm pilot partner (~80 employees):** This is potentially the first *publisher*. Propose it explicitly: "Use Interdict for 6 months. Then package your compliance expertise as policy packs and sell them to every other Interdict customer. We take 25%, you keep 75%."

Now the law firm isn't just a customer paying EUR 11,500/year. They're a partner earning potentially much more — and deeply, structurally invested in Interdict's success.

### Trust & Liability

**Clear in the marketplace terms of service:**

1. **Publishers are responsible for the accuracy of their policies.** Their professional credentials back their claims.
2. **Interdict is responsible for the platform's integrity.** Wasm sandbox, hot-reload, signatures, billing.
3. **Customers are responsible for their own compliance.** Installing a policy pack doesn't make you compliant — it's a tool, not a guarantee.
4. **Interdict does NOT warrant regulatory compliance** of any marketplace policy. "Verified" means identity confirmed and regulatory mapping reviewed — not legally sufficient.

**Professional liability for publishers:**
- Verified and Expert Publishers should carry professional indemnity insurance (standard for law firms and consultancies)
- Community Publishers publish with a clear disclaimer: "Community-published policy. Not independently verified for regulatory compliance."

### Competitive Analysis — Who Else Has a Marketplace?

| Platform | Marketplace | What They Sell |
|---|---|---|
| **Splunk** | Splunkbase | Detection rules, dashboards, integrations |
| **CrowdStrike** | Falcon Marketplace | Threat intelligence, response playbooks |
| **Palo Alto** | Cortex Marketplace | Security apps, integrations |
| **HashiCorp** | Terraform Registry | Infrastructure modules, policies (Sentinel) |
| **Open Policy Agent** | Community policies | Policy libraries (free, not monetized) |
| **AWS Marketplace** | Model packages, SageMaker | ML models, data products |

None of these are selling *compliance enforcement policies for AI governance*. This is genuinely greenfield. The Interdict Exchange would be the first *commercial* marketplace for AI governance policies.

### Dangerous Ideas (High-Risk, High-Reward)

#### Policy-as-Code Marketplace for Non-AI Governance
Once the Exchange infrastructure exists, the same Wasm+Rego engine could enforce data governance, API governance, and cloud infrastructure policies. Much larger market, much larger bet. Park it, but know it's there.

#### Regulatory Body as Publisher
What if the Belgian DPA or the EU AI Office published policies on the Exchange? The pitch: "Your guidelines are currently PDFs that companies interpret differently. What if you published them as executable policies?" Massive credibility signal. Long-shot, but worth one well-crafted email.

#### Open-Source Policy Base + Commercial Add-Ons
Core policies open source (basic PII detection, simple prompt injection patterns, generic AI usage logging). The Exchange sells advanced versions. Creates a funnel. Same model as Elastic, GitLab, and every successful open-core company.

#### Policy Insurance
Partner with an insurer to offer compliance coverage tied to Exchange policy packs. If a regulatory fine occurs for an issue the policy pack should have caught, insurance covers it. The insurer gets risk data from anonymized marketplace analytics. Complex to execute, but the market would eat it alive.

### What Could Kill the Marketplace

1. **Chicken-and-egg problem.** Solution: seed with first-party policies, recruit 3-5 curated publishers before launch, offer early publishers guaranteed minimum revenue or reduced take rate.
2. **Quality floor.** Solution: aggressive curation, mandatory test suites, regulatory claim review, canary deployment.
3. **Publisher concentration.** Solution: actively recruit competing publishers, ensure no single publisher exceeds 20% of revenue.
4. **Free alternative.** Solution: the Exchange's value is curation, trust, ongoing updates, and professional liability — not just the policies themselves.
5. **Legal risk.** Solution: clear terms that policies are technical tools, not legal advice. Publishers with credentials are already authorized to give legal advice.
6. **Platform lock-in resentment.** Solution: the Exchange provides distribution, trust signals, billing, and analytics that publishers can't replicate alone.

### Timeline

| Phase | When | What |
|---|---|---|
| **Phase 0: Internal policy library** | Now (already exists) | The 8 regulatory framework packs are the seed content. |
| **Phase 1: Curated partners** | H2 2026 | Invite 3-5 publishers. Build publisher portal and policy signing. Manual review. |
| **Phase 2: Private beta marketplace** | Q1 2027 | Open to 10-15 publishers by invitation. Build install flow, billing, and ratings. |
| **Phase 3: Public marketplace** | H2 2027 | Open to all publishers with automated review + manual curation. Marketing push. |
| **Phase 4: Ecosystem flywheel** | 2028+ | Publisher-driven content dominates. Community events, publisher conferences, certification programs. |

### The Endgame

**Without the marketplace:** Interdict is a compliance tool. It competes on features and price. Switching cost is moderate.

**With the marketplace:** Interdict is a compliance ecosystem. A customer has installed 8 policy packs from 5 different publishers, built their entire compliance posture on those policies, trained their staff on the enforcement behavior, and reports to auditors using those policy mappings. Switching means rebuilding all of that from scratch on a competitor's platform — assuming the competitor even has equivalent policies (they won't, because the publishers are on Interdict).

This is the Salesforce AppExchange play. Salesforce isn't the best CRM. It's the CRM with the largest ecosystem. Interdict doesn't need to be the best AI governance tool. It needs to be the AI governance tool with the most comprehensive policy marketplace.

**In one sentence:** The marketplace turns every law firm, consultancy, and security researcher into a stakeholder in Interdict's success — and every policy they publish deepens the moat.

---



---

## 10. Developer Experience, SDKs & Platform Expansion

### The Core Insight

Right now Interdict is a **proxy** — it sits between users and AI services at the network level. But AI is increasingly embedded inside applications, called from CI/CD pipelines, used on mobile devices, and orchestrated through developer frameworks. The proxy catches browser-based AI usage. Everything below catches the rest.

### Feature 1: The Interdict SDK — Embed Governance Everywhere

A developer building a Next.js app with the OpenAI SDK calls `openai.chat.completions.create()` directly. That call doesn't go through the proxy — it goes straight from their server to OpenAI. The proxy only catches browser-based AI usage routed through the system proxy.

**The SDK flips the model.** Instead of intercepting traffic at the network layer, you provide libraries that developers wrap around their AI calls:

```python
# Without Interdict — no governance
from openai import OpenAI
client = OpenAI()
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": prompt}]
)

# With Interdict SDK — governed
from interdict import Interdict
interdict = Interdict(api_key="...", org="acme-corp")

response = interdict.chat(
    provider="openai",
    model="gpt-4",
    messages=[{"role": "user", "content": prompt}]
)
```

**What the SDK does:**
- Applies the same policies as the proxy (downloaded from control plane, cached locally)
- Generates evidence bundles (same hash chain, same signatures)
- Enforces vendor allowlists, PII redaction, content policies
- Reports telemetry back to the dashboard
- Works offline / air-gapped (policies are cached, evidence queued for later flush)

**Language SDKs needed:**
- **Python** (most AI development happens here — LangChain, OpenAI SDK, Anthropic SDK)
- **TypeScript/Node.js** (Vercel AI SDK, server-side apps)
- **Rust** (internal use, high-performance pipelines)
- **Go** (enterprise backend services)
- **Java/Kotlin** (enterprise, Android)

**Why this matters:** The proxy catches 60% of AI usage — the browser-based stuff. The SDK catches the other 40% — the programmatic stuff. Together, they cover everything. No competitor offers both a transparent proxy AND an embeddable SDK. That's full-spectrum governance.

**Framework-specific wrappers:**
- `interdict-langchain` — LangChain middleware that wraps every chain/agent call
- `interdict-vercel-ai` — Vercel AI SDK middleware for Next.js apps
- `interdict-llamaindex` — LlamaIndex callback that governs every query
- `interdict-semantic-kernel` — Microsoft Semantic Kernel filter

Each one is a thin wrapper that makes governance a one-line import, not an architecture change.

### Feature 2: The CLI — `interdict` Command Line Tool

Developers live in terminals. Give them governance there.

```bash
# Check a prompt against policies before sending it
$ interdict check "Draft an email to Jan De Smedt, IBAN BE68 5390 0754 7034"
  POLICY TRIGGERED: pii-iban-detection (severity: high)
  Detected: IBAN BE68 5390 0754 7034
  Action: Would redact before sending

# Scan a file for policy violations before using it with AI
$ interdict scan ./contract-draft.pdf
  3 findings:
  - Line 12: Client name (PII) — would redact
  - Line 47: IBAN — would redact
  - Line 89: National number — would BLOCK (high severity)

# Test a policy pack locally
$ interdict test ./my-policy-pack/
  Running 47 test cases...
  47/47 passed (0.3ms avg execution time)

# Deploy a policy to a running instance
$ interdict policy push ./new-policy.wasm --target production
  Compiled: 12KB Wasm module
  Signed: ed25519 signature
  Deployed: hot-loaded to 3 kernel instances

# Check compliance posture
$ interdict status
  EU AI Act:  78% (3 controls missing)
  GDPR:       92% (1 control missing)
  FSMA:       85% (2 controls missing)

# Generate an audit report from the command line
$ interdict report --format pdf --framework eu-ai-act --period 2026-Q1
  Generated: audit-report-2026-Q1.pdf (47 pages)
```

**Why this matters:** DevOps teams and platform engineers don't use dashboards — they use terminals. The CLI makes Interdict part of their workflow. It also enables automation: `interdict check` in a CI/CD pipeline blocks merges that would send unredacted PII to AI services.

### Feature 3: CI/CD Integration — Governance in the Pipeline

**Pre-commit hooks:**
```yaml
# .pre-commit-config.yaml
- repo: https://github.com/interdict/pre-commit-hooks
  hooks:
    - id: interdict-scan
      name: Scan for AI policy violations
      args: ['--severity', 'high']
```

**GitHub Actions:**
```yaml
- name: Interdict Policy Check
  uses: interdict/policy-check-action@v1
  with:
    scan-paths: './src/ai/**'
    policy-pack: 'eu-ai-act-full'
    fail-on: 'high'
```

**Terraform / IaC provider:**
```hcl
resource "interdict_policy" "pii_redaction" {
  name        = "belgian-pii-redaction"
  pack        = "interdict-exchange/belgian-dpa-suite"
  version     = "~> 2.0"
  mode        = "enforce"
  departments = ["legal", "finance"]
}

resource "interdict_vendor" "openai" {
  name    = "OpenAI"
  status  = "approved"
  models  = ["gpt-4", "gpt-4o"]
  regions = ["eu-west-1"]
}
```

**Why this matters:** Infrastructure-as-Code teams manage everything in Terraform/Pulumi. If they can manage Interdict policies the same way they manage their AWS resources, governance becomes part of the infrastructure, not a bolted-on afterthought.

### Feature 4: Browser Extension — The Client-Side Layer

The proxy intercepts traffic at the network level. A browser extension intercepts it at the *application* level — inside the browser itself.

**What it does:**
- Detects when an employee is on an AI service (ChatGPT, Claude, Gemini, etc.)
- Shows a subtle governance banner: "This session is governed by [Company] AI policy"
- Inline PII highlighting — before the employee hits send, PII in their prompt is highlighted: "This looks like it contains an IBAN. It will be redacted before sending."
- Provides the coaching/nudge experience — "Are you sure?" prompts, risk-aware suggestions, just-in-time education
- Works even when the proxy isn't configured (BYOD scenarios, remote workers on personal devices)
- Captures client-side telemetry that the proxy can't see (which AI features are embedded in which SaaS tools, how long employees spend on AI interactions, copy/paste behavior)

**Why this matters:** The proxy is invisible. That's a feature for enforcement, but a bug for user experience. The browser extension is the *visible* layer — it's how employees interact with governance. Also solves the BYOD problem. An employee installs the extension on their personal browser, and they're governed without needing proxy configuration or CA certificate trust.

**Technical note:** Chrome Manifest V3, Firefox WebExtensions, Safari Web Extensions. One codebase (TypeScript), three builds. The extension communicates with the control plane API for policy downloads and telemetry upload.

### Feature 5: Integrations Hub — Connect Governance to Everything

Right now Interdict is a closed system. Enterprises have Slack, Teams, Jira, ServiceNow, PagerDuty, Splunk, and 47 other tools.

**Notification integrations:**
- **Slack/Teams** — real-time alerts for policy violations
- **PagerDuty/Opsgenie** — critical violation alerting with on-call escalation
- **Email digests** — weekly summary for compliance officers who don't live in the dashboard

**Ticketing integrations:**
- **Jira/ServiceNow** — auto-create tickets for human review items
- **Zendesk** — for managed service providers running Interdict for multiple clients

**Identity integrations:**
- **Okta/Azure AD/Google Workspace** — auto-provision users, sync department/role for policy scoping, auto-deprovision when someone leaves
- **SCIM** — for companies >100 employees, manual user management doesn't work

**Data integrations:**
- **Splunk/Elastic/Datadog** — structured events with policy metadata
- **Snowflake/BigQuery** — for companies that want their own analytics on AI governance data
- **Power BI/Tableau** — embeddable dashboards for executive reporting

**Workflow integrations:**
- **Zapier/Make/n8n** — let non-technical compliance officers build their own automations
- **Webhooks** — the foundation for all custom integrations. Every event in Interdict should fire a subscribable webhook.

**Why this matters:** Every integration makes Interdict harder to replace. If the customer's compliance workflow is "Interdict violation then Jira ticket then Slack notification then weekly Power BI report," ripping out Interdict means rebuilding all of those automations. Integrations are moat.

### Feature 6: API-First — The Headless Governance Platform

Everything the dashboard does should be available via API. Not just a checkbox — a genuinely well-designed, developer-first API.

**What this enables:**
- **Custom dashboards** — a customer who hates your dashboard builds their own. They still use Interdict for enforcement and evidence.
- **Embedded governance** — a SaaS platform embeds Interdict governance into their product. "Powered by Interdict."
- **Automation** — everything a compliance officer does manually can be automated via API.
- **Multi-tool orchestration** — SOAR platforms call Interdict alongside CrowdStrike, Splunk, etc.

**DX specifics:**
- OpenAPI 3.1 spec published and versioned
- Interactive API explorer (Swagger UI / Redocly)
- Client libraries auto-generated from the spec (Python, TypeScript, Go, Java)
- Rate limiting with clear headers
- Webhook delivery with retry, signature verification, and event replay
- Sandbox environment for testing without affecting production
- API changelog and migration guides for breaking changes

**Why this matters:** The best infrastructure companies are API-first: Stripe, Twilio, Cloudflare. Their dashboard is just a frontend to the API. This means any customer, partner, or developer can build on top of Interdict without needing your permission or your engineering time.

### Feature 7: White-Label / OEM / Embedded Licensing

**White-label:** A managed security service provider (MSSP) or large consultancy licenses the entire Interdict platform, rebrands it, and sells it to their clients as their own product.

**OEM / Embedded:** A SaaS platform that serves regulated industries embeds Interdict's governance engine inside their product. Their customers get AI governance as a feature of the platform they're already using.

**Examples:**
- A legal practice management platform (Clio, PracticePanther) embeds Interdict to govern AI-assisted document drafting
- A healthcare EHR platform embeds Interdict to govern AI-assisted clinical note generation
- A banking platform embeds Interdict to govern AI-assisted fraud detection and customer service

**Revenue model:** Per-seat royalty (EUR 2-5/user/month) or percentage of the partner's AI governance revenue. Lower margin per user, but massive volume.

**Why this matters:** This is how you get to 100,000 governed users without selling to 100,000 users. You sell to 10 platforms, each of which has 10,000 users.

### Feature 8: Developer Documentation Portal

**What "great DX" looks like for Interdict:**
- **docs.interdict.io** — a dedicated docs site (not a PDF, not a GitHub wiki)
- **Quick starts** — "Deploy Interdict in 5 minutes" with copy-paste commands that actually work
- **Tutorials** — "Build your first policy pack," "Integrate Interdict with your Python app," "Set up CI/CD governance checks"
- **API reference** — auto-generated from OpenAPI spec, with runnable examples
- **Architecture guides** — how the kernel works, how policies are evaluated, how evidence chains are constructed
- **Changelog** — every release, every breaking change, every new feature. Public, searchable.
- **Status page** — status.interdict.io for cloud components
- **Community Discord/Slack** — where developers and policy authors hang out
- **Blog** — technical deep-dives, architecture decisions, "how we built X" posts

**Why this matters:** When a developer evaluates Interdict vs. a competitor, the first thing they do is look at the docs. Stripe didn't win because they had the best payment API — they won because they had the best developer documentation.

### Feature 9: Playground / Sandbox — Try Before You Deploy

A hosted environment where prospects can test Interdict without deploying anything.

**What it looks like:**
- **playground.interdict.io** — a web-based sandbox
- Pre-configured with sample policies (PII redaction, vendor blocking, IBAN detection)
- User types prompts into a simulated ChatGPT interface
- See in real-time: what gets redacted, what gets blocked, what the audit trail looks like
- Toggle policies on/off, adjust thresholds, see the effect instantly
- Share a playground session via URL — a prospect can send the link to their CISO

**Why this matters:** The demo is live and impressive. But what about prospects you never meet? The playground is a self-serve demo that works 24/7. Every competitor says "contact sales for a demo." You say "try it right now, no signup required."

### Feature 10: Governance Templates & Playbooks

Not everyone knows what policies they need. Give them a starting point.

**Industry starter kits:**
- "Belgian Law Firm Starter" — Belgian PII detection, legal privilege protection, client confidentiality, EU AI Act basics. Deploy in one click, customize later.
- "Belgian Financial Services Starter" — FSMA basics, IBAN/account number detection, GDPR financial data, DORA basics.
- "Healthcare Starter" — HIPAA/GDPR patient data, clinical note PII, medical record number detection.
- "Generic SME Starter" — basic PII, vendor allowlist with top 5 AI services pre-approved, simple content policies.

**Compliance playbooks:**
- "Preparing for an EU AI Act Audit" — interactive checklist in the dashboard that tracks progress and generates the audit-ready report
- "Responding to a Data Breach Involving AI" — incident response playbook integrated with the audit trail
- "Onboarding a New Department" — communications template, policy configuration checklist, training materials, 30-day evaluation rubric

**Why this matters:** The gap between "I deployed Interdict" and "I'm actually governing AI" is huge for a non-technical compliance officer. Templates close that gap. They also reduce onboarding time — which directly impacts pilot conversion rate.

### Feature 11: Training & Certification Platform

**For employees:**
- Short (5-minute) interactive modules: "How to use AI safely at [Company]"
- Triggered contextually: first time an employee hits a policy trigger, they get offered a relevant training module
- Tracks completion per department
- Generates training compliance reports — "All employees completed AI governance training before the August 2026 deadline"

**For administrators:**
- "Interdict Administrator Certification" — covers deployment, policy configuration, audit trail management, evidence verification, incident response
- "Interdict Compliance Officer Certification" — covers regulatory framework mapping, report generation, compliance posture management, audit preparation
- Both certifications generate verifiable credentials (LinkedIn badges, PDF certificates)

**Revenue:** EUR 200-500 per certification. More importantly, it creates a community of trained professionals who advocate for Interdict within their organizations.

**Why this matters:** When the compliance officer at the bank pilot leaves the company, her replacement needs to know how to use Interdict. If there's a certification program, the bank hires someone who's already certified — or sends their new hire through certification. Either way, Interdict stays. Training is retention infrastructure.

### Feature 12: Observability & Debugging Tools for Developers

When a developer integrates the Interdict SDK and something doesn't work right, they need debugging tools.

**Policy debugger:**
- **Policy trace** — for any request, show exactly which policies were evaluated, in what order, what each one decided, and why
- **Policy simulator** — paste a prompt, select a policy set, see what would happen without actually sending the request
- **Diff between policy versions** — "Version 2.1 would have blocked this request. Version 2.0 allowed it. Here's what changed."
- **False positive reporter** — one-click from the audit trail, aggregated and sent to the policy publisher

**SDK debugger:**
- **Request inspector** — in development mode, the SDK logs every decision locally with full trace
- **Mock mode** — SDK evaluates policies but doesn't actually send requests to AI vendors. For testing in CI without burning API credits.
- **Latency profiler** — breakdown of time spent in policy evaluation vs. network vs. AI vendor response

**Why this matters:** Developers won't adopt the SDK if they can't debug it. Observable infrastructure gets adopted. Black-box infrastructure gets ripped out.

### Feature 13: Data Export & Portability

**What to offer:**
- Full audit trail export (JSON, CSV, Parquet)
- Evidence bundle export with verification tools (customers can verify hash chains independently)
- Policy export in standard formats (Rego source, Wasm binary, OPA-compatible bundle)
- Configuration export (vendor settings, department mappings, user roles)
- API-based export for automated backup and compliance archival

**Why this matters:** When an enterprise procurement team asks "what happens if you go out of business?" — and they will ask — you need a convincing answer. "All your data and policies are exportable in standard formats. Your evidence chains are independently verifiable. You own everything." That answer closes deals.

### Feature 14: Mobile Governance

Employees use AI on their phones. ChatGPT, Claude, and Microsoft Copilot all have mobile apps.

**Options:**
- **MDM integration** — for companies using Mobile Device Management (Intune, Jamf, VMware Workspace ONE), configure the Interdict proxy at the device level
- **Mobile SDK** — for companies building mobile apps with embedded AI, the same SDK approach but for iOS (Swift) and Android (Kotlin)
- **VPN-based approach** — route mobile AI traffic through a lightweight VPN that terminates at the Interdict proxy

**Why this matters:** Not urgent for the 15-person beta partner. But for a 200-person bank, half the staff is accessing AI on their phones. If you govern desktop but not mobile, you have a governance gap that an auditor will find.

### What This All Adds Up To

| Layer | Today | Tomorrow |
|---|---|---|
| **Enforcement** | Network proxy | + SDK + Browser extension + Mobile + CI/CD hooks |
| **Management** | Dashboard | + CLI + API-first + Terraform provider |
| **Intelligence** | Audit trail | + Risk dashboard + Anomaly detection + Cost visibility |
| **Ecosystem** | 8 first-party policy packs | + Interdict Exchange marketplace |
| **Integration** | Standalone | + Slack/Teams + SIEM + Jira + Webhooks + Zapier |
| **DX** | Operator docs | + Dev portal + Playground + SDK docs + Tutorials |
| **Education** | None | + Employee training + Admin certification + Policy dev certification |
| **Distribution** | Direct sales | + White-label + OEM/embedded + MSP multi-tenant |

The left column is a compliance tool. The right column is a **platform** — the governance layer that every AI interaction in an enterprise passes through, regardless of device, deployment model, or development framework.

### Priority — What to Build When

| Priority | What | Why |
|---|---|---|
| **Beta (now)** | CLI (`interdict check`, `interdict scan`) | Costs almost nothing to build, makes you look serious to technical evaluators |
| **Beta (now)** | Webhook events for all actions | Foundation for every integration. Build once, everything else plugs in. |
| **Q3 2026** | Python SDK | Captures programmatic AI usage that the proxy misses. Biggest coverage gap. |
| **Q3 2026** | Governance templates / starter kits | Reduces time-to-value for new customers from weeks to hours. |
| **Q4 2026** | TypeScript SDK + LangChain/Vercel AI wrappers | Second most popular AI development ecosystem. |
| **Q4 2026** | Slack/Teams notifications | Every enterprise customer will ask for this in week 1. |
| **Q4 2026** | Developer documentation portal | DX investment that compounds over time. |
| **Q1 2027** | Browser extension | Solves BYOD, adds the coaching/nudge UX layer, captures embedded AI. |
| **Q1 2027** | API-first rebuild (OpenAPI spec, client libs) | Foundation for white-label, OEM, and every custom integration. |
| **Q1 2027** | Playground / sandbox | Self-serve demo that works 24/7. Removes the sales bottleneck. |
| **H1 2027** | CI/CD integrations (GitHub Actions, pre-commit) | Captures the DevOps buyer. |
| **H1 2027** | Training platform | Retention infrastructure. Reduces churn. |
| **H2 2027** | White-label / OEM licensing | Distribution through other people's sales teams. |
| **H2 2027** | Terraform provider | Captures the IaC buyer. |
| **2028** | Mobile governance | Closes the mobile gap for larger enterprises. |

---

*Document generated 2026-03-16. Review and update quarterly or after significant market events.*
