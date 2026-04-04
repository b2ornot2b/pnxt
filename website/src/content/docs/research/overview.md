---
title: Research Overview
description: Overview of pnxt research phases and deliverables.
---

:::note[Source Documents]
All research documents are maintained in the [docs/research/](https://github.com/b2ornot2b/pnxt/tree/main/docs/research) directory of the pnxt repository. This site presents curated summaries — see the source documents for full detail.
:::

## Research Philosophy

pnxt follows a **research-first approach**: theoretical soundness before implementation speed. Each phase builds on the previous, creating a solid foundation before moving to prototyping.

The foundational vision is defined in the [master research prompt](https://github.com/b2ornot2b/pnxt/blob/main/docs/research/original-prompt.md), which specifies the role of a Principal AI Systems Architect designing a ground-up programming paradigm for LLMs.

---

## Phase 1: Core Architecture, State Separation & FFI

**Status**: Complete

Defined the high-level system architecture, solving the "State vs. Logic" problem:

- How the immutable codebase (stored as a non-Euclidean Tree-sitter DKB Knowledge Graph) is separated from ephemeral runtime state (memory, queues, actor states)
- The Legacy Interoperability Layer (FFI) for safe interaction with Web2 APIs without breaking noninterference guarantees

---

## Phase 2: Bridge Layer & Mathematical Spec

**Status**: Complete

Defined the Bridge Layer — the constrained-decoding grammar that forces LLMs to output valid VPIR nodes:

- Exact Bridge JSON Schema specification
- Mathematical translation pipeline: Bridge Grammar JSON → HoTT morphisms → SMT constraints
- Formalized in LaTeX with copy-pasteable JSON schemas

---

## Phase 3: Deep Analysis

**Status**: Complete

Phase 3 expanded the foundational research with six detailed analysis documents. While Phases 1-2 established **what** ANP is and **why** it matters, Phase 3 addresses **how** it works in detail and **where** it fits in the broader landscape.

### Deliverables

| # | Document | Focus |
|---|----------|-------|
| 1 | [Agent-Computer Interface](/pnxt/research/phase-3/agent-computer-interface/) | Protocol architecture, message taxonomy, capability discovery |
| 2 | [Semantic Memory](/pnxt/research/phase-3/semantic-memory/) | Three-layer memory model, lifecycle management, cross-agent sharing |
| 3 | [Multi-Agent Coordination](/pnxt/research/phase-3/multi-agent-coordination/) | Topology models, task decomposition, conflict resolution |
| 4 | [Trust, Safety & Governance](/pnxt/research/phase-3/trust-safety-governance/) | Graduated trust, capability permissions, sandboxing |
| 5 | [Comparative Analysis](/pnxt/research/phase-3/comparative-analysis/) | ANP vs. OOP, Actor Model, Microservices, EDA, FP |
| 6 | [Reference Architecture](/pnxt/research/phase-3/reference-architecture/) | Concrete system design, deployment topologies, migration strategy |

### Recurring Themes

1. **Incrementalism** — Every component designed for phased adoption
2. **Structural safety over behavioral discipline** — Make correct behavior easy, incorrect behavior difficult
3. **Explicit over implicit** — Side effects declared, capabilities negotiated, trust measured
4. **Memory as foundation** — Persistent memory transforms stateless interactions into coherent experiences
5. **Human partnership, not replacement** — Agents as colleagues with graduated trust

---

## Phase 4: Prototype Implementation

**Status**: Planned

Phase 4 transitions from research to prototype implementation. See the [Phase 4 Plan](/pnxt/roadmap/phase-4/) for details.

Key priorities:
1. Memory Service and ACI Gateway prototypes
2. Agent runtime environment
3. Empirical evaluation and benchmarks
