---
title: Project Status
description: Current state, completed milestones, and roadmap for pnxt.
---

:::note[Living Document]
This page reflects the current state of the pnxt project. It is derived from [status.md](https://github.com/b2ornot2b/pnxt/blob/main/status.md) in the repository.
:::

## Current State

The pnxt project is in the **research phase**, with comprehensive theoretical foundations and architectural specifications complete. No prototype implementation exists yet — the repository is documentation-focused.

## Completed Work

| Phase | Focus | Deliverables |
|-------|-------|-------------|
| Phase 1 | Core Architecture, State Separation & FFI | Foundational architecture design |
| Phase 2 | Bridge Layer & Mathematical Spec | Mathematical formalization, bridge grammar spec |
| Phase 3 | Deep analysis of pillars, patterns, and architecture | Six research documents covering ACI, memory, coordination, trust, comparative analysis, and reference architecture |

### Phase 3 Deliverables

1. **[Agent-Computer Interface Specification](/pnxt/research/phase-3/agent-computer-interface/)** — Protocol layers, message taxonomy, capability discovery, error handling
2. **[Semantic Memory Architecture](/pnxt/research/phase-3/semantic-memory/)** — Three-layer memory model with lifecycle management
3. **[Multi-Agent Coordination Patterns](/pnxt/research/phase-3/multi-agent-coordination/)** — Topology models, task decomposition, conflict resolution
4. **[Trust, Safety & Governance](/pnxt/research/phase-3/trust-safety-governance/)** — Graduated trust model, capability-based permissions, sandboxing
5. **[Comparative Analysis](/pnxt/research/phase-3/comparative-analysis/)** — ANP positioned against OOP, Actor Model, Microservices, EDA, FP
6. **[Reference Architecture](/pnxt/research/phase-3/reference-architecture/)** — Concrete system design with deployment topologies

---

## Phase 4 Plan

Phase 4 transitions from research to **prototype implementation and empirical evaluation**.

### Priority 1: Core Infrastructure

- [ ] **Memory Service prototype** — Implement the three-layer memory model (working, semantic, episodic)
- [ ] **ACI Gateway prototype** — Build the structured protocol layer for agent-to-system communication
- [ ] **Project scaffolding** — Initialize package.json, TypeScript config, test infrastructure, and CI pipeline

### Priority 2: Agent Runtime

- [ ] **Agent runtime environment** — Basic agent lifecycle management
- [ ] **Capability negotiation** — Implement versioned capability discovery
- [ ] **Trust engine** — Graduated trust model with measurable trust scores

### Priority 3: Validation

- [ ] **Empirical evaluation** — Test multi-agent coordination on real tasks
- [ ] **Benchmark development** — Standardized benchmarks for ANP implementations
- [ ] **Security hardening** — Adversarial testing of trust and sandboxing

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
