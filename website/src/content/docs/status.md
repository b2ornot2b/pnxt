---
title: Project Status
description: Current state, completed milestones, and roadmap for pnxt.
---

:::note[Living Document]
This page reflects the current state of the pnxt project. It is derived from [status.md](https://github.com/b2ornot2b/pnxt/blob/main/status.md) in the repository.
:::

## Current State

The pnxt project has completed **Phase 4 — prototype implementation and empirical evaluation**. All core infrastructure, agent runtime, and validation components are implemented and tested. The project now has working prototypes of the foundational ANP systems designed in Phases 1–3.

## Completed Work

| Phase | Focus | Deliverables |
|-------|-------|-------------|
| Phase 1 | Core Architecture, State Separation & FFI | Foundational architecture design |
| Phase 2 | Bridge Layer & Mathematical Spec | Mathematical formalization, bridge grammar spec |
| Phase 3 | Deep analysis of pillars, patterns, and architecture | Six research documents covering ACI, memory, coordination, trust, comparative analysis, and reference architecture |
| Phase 4 | Prototype implementation & empirical evaluation | Core infrastructure, agent runtime, validation & benchmarks |

### Phase 3 Deliverables

1. **[Agent-Computer Interface Specification](/pnxt/research/phase-3/agent-computer-interface/)** — Protocol layers, message taxonomy, capability discovery, error handling
2. **[Semantic Memory Architecture](/pnxt/research/phase-3/semantic-memory/)** — Three-layer memory model with lifecycle management
3. **[Multi-Agent Coordination Patterns](/pnxt/research/phase-3/multi-agent-coordination/)** — Topology models, task decomposition, conflict resolution
4. **[Trust, Safety & Governance](/pnxt/research/phase-3/trust-safety-governance/)** — Graduated trust model, capability-based permissions, sandboxing
5. **[Comparative Analysis](/pnxt/research/phase-3/comparative-analysis/)** — ANP positioned against OOP, Actor Model, Microservices, EDA, FP
6. **[Reference Architecture](/pnxt/research/phase-3/reference-architecture/)** — Concrete system design with deployment topologies

### Phase 4 Deliverables

#### Priority 1: Core Infrastructure

- [x] **Project scaffolding** — TypeScript project with strict config, Jest testing, CI/CD pipeline, ESLint & Prettier
- [x] **Memory Service prototype** — Three-layer memory model (working, semantic, episodic) with pluggable `StorageBackend` interface, `InMemoryStorageBackend` for testing, and `FileStorageBackend` for persistent JSON-file storage
- [x] **ACI Gateway prototype** — Structured protocol layer with graduated trust checking (5 levels), `TrustResolver` for agent trust lookup, append-only `AuditLogger` recording all invocations/denials

#### Priority 2: Agent Runtime

- [x] **Agent runtime environment** — Agent lifecycle management (registration, execution, teardown)
- [x] **Capability negotiation** — Versioned capability discovery with 3-phase handshake, semantic versioning, trust-based constraint tightening, revocation, and expiry support
- [x] **Trust engine** — Graduated trust model (5 levels) with multi-dimensional trust, observable metric-based scoring (0–100), automatic calibration, per-dimension overrides, and trust reset/manual adjustment

#### Priority 3: Validation and Evaluation

- [x] **Empirical evaluation** — Multi-agent coordination scenarios (delegation pattern, trust escalation, failure recovery) exercising full system integration
- [x] **Benchmark development** — `BenchmarkSuite` framework with standardized benchmarks for agent registration, trust calibration, ACI invocation, capability negotiation, memory store/query, and agent lifecycle throughput
- [x] **Security hardening** — `SecurityTestSuite` with adversarial tests across 5 categories: privilege escalation, trust manipulation, capability abuse, audit integrity, and resource exhaustion

---

## Future Goals

### Medium-Term

- Bridge Grammar implementation (constrained-decoding JSON schema)
- Natural language protocol design
- VPIR compiler/interpreter
- Tree-sitter DKB integration

### Long-Term

- LLMbda Calculus runtime with IFC guarantees
- SMT solver integration (Z3/CVC5)
- Full Dataflow Process Network engine
- Multi-agent orchestration at enterprise scale
- Community ecosystem and open specification

---

## Key Decisions

- **Research-first**: Theoretical soundness before implementation speed
- **Incremental adoption**: Every component designed for phased introduction
- **Structural safety**: Correct behavior made easy by design
- **No legacy syntax**: A new paradigm for LLMs, not a wrapper around existing languages
