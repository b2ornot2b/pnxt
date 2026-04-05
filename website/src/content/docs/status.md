---
title: Project Status
description: Current state, completed milestones, and roadmap for pnxt.
---

:::note[Living Document]
This page reflects the current state of the pnxt project. It is derived from [status.md](https://github.com/b2ornot2b/pnxt/blob/main/status.md) in the repository.
:::

## Current State

The pnxt project has completed **Phase 5 Sprint 4**, delivering **protocol-channel integration** (NL protocols over DPN channels) and **VPIR compiler optimizations** (parallel wave-based execution and result caching). Agent conversations now flow over typed async FIFO channels with backpressure and IFC enforcement, and VPIR graphs can execute independent branches concurrently.

## Completed Work

| Phase | Focus | Deliverables |
|-------|-------|-------------|
| Phase 1 | Core Architecture, State Separation & FFI | Foundational architecture design |
| Phase 2 | Bridge Layer & Mathematical Spec | Mathematical formalization, bridge grammar spec |
| Phase 3 | Deep analysis of pillars, patterns, and architecture | Six research documents covering ACI, memory, coordination, trust, comparative analysis, and reference architecture |
| Phase 4 | Prototype implementation & empirical evaluation | Core infrastructure, agent runtime, validation & benchmarks |
| Phase 5 | Paradigm foundation | DPN channels, IFC labels, VPIR types, Bridge Grammar, Z3 verification, NL protocols, VPIR execution & visualization, protocol-channel integration, VPIR parallel execution & caching |

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
- [x] **Trust engine** — Graduated trust model (5 levels) with multi-dimensional trust, observable metric-based scoring (0-100), automatic calibration, per-dimension overrides, and trust reset/manual adjustment

#### Priority 3: Validation and Evaluation

- [x] **Empirical evaluation** — Multi-agent coordination scenarios (delegation pattern, trust escalation, failure recovery) exercising full system integration
- [x] **Benchmark development** — `BenchmarkSuite` framework with standardized benchmarks for agent registration, trust calibration, ACI invocation, capability negotiation, memory store/query, and agent lifecycle throughput
- [x] **Security hardening** — `SecurityTestSuite` with adversarial tests across 5 categories: privilege escalation, trust manipulation, capability abuse, audit integrity, and resource exhaustion

### Phase 5 Deliverables

#### Sprint 1: DPN + IFC + VPIR

- [x] **Channel\<T\> and DPN primitives** — Typed async FIFO channels with backpressure, Process actors, DataflowGraph composition
- [x] **IFC security labels** — SecurityLabel type with lattice-based flow control, memory enforcement
- [x] **VPIR node types and validator** — VPIRNode, VPIRGraph types with structural validation (DAG, references, IFC)

#### Sprint 2: Bridge Grammar + Formal Verification

- [x] **Bridge Grammar JSON Schema** — Constrained-decoding schemas for VPIR nodes via function calling, tool use, or structured output
- [x] **Z3 SMT integration** — Formal verification of 4 properties: capability grants, trust monotonicity, IFC lattice, side-effect trust
- [x] **IFC enforcement completion** — Extended to ACI tool invocations and Channel sends
- [x] **Causal trust scoring** — Difficulty-weighted trust scoring

#### Sprint 3: VPIR Execution + NL Protocols + Visualization

- [x] **VPIR Interpreter** — Executes validated VPIR graphs in topological order with IFC enforcement, ACI integration, timeout support, and sub-graph recursion
- [x] **Natural Language Protocol Design** — Three protocol state machines (task-delegation, capability-negotiation, conflict-resolution) with transition validation and IFC enforcement
- [x] **VPIR Visualization** — Text-based rendering of VPIR graphs (ASCII DAG) and execution traces (step-by-step table with timing and status)

#### Sprint 4: Protocol-Channel Integration + VPIR Optimizations

- [x] **Protocol-Channel Integration** — Bidirectional protocol channels wrapping DPN channels for real dataflow transport, with IFC enforcement, backpressure, and async iteration
- [x] **VPIR Parallel Execution** — Wave-based execution planner grouping independent DAG branches for concurrent execution with configurable concurrency limits
- [x] **VPIR Result Caching** — Cache interface with in-memory implementation for deterministic nodes (observation, inference), with stable input hashing

---

## Test Coverage

| Sprint | Test Suites | Tests |
|--------|------------|-------|
| Phase 4 | 12 | 194 |
| Sprint 1 | 14 | 194+ |
| Sprint 2 | 17 | 292 |
| Sprint 3 | 20 | 355 |
| Sprint 4 | 22 | ~415 |

---

## Future Goals

### Medium-Term (Sprint 5+)

- Tree-sitter DKB integration (knowledge graph-based codebase representation)
- Enhanced visualization (graphical node-graph decompiler)

### Long-Term (Phase 6+)

- HoTT Typed Tokenization — code as categorical objects
- LLMbda Calculus runtime with IFC guarantees
- Full Dataflow Process Network engine
- Multi-agent orchestration at enterprise scale
- Community ecosystem and open specification

---

## Key Decisions

- **Research-first**: Theoretical soundness before implementation speed
- **Incremental adoption**: Every component designed for phased introduction
- **Structural safety**: Correct behavior made easy by design
- **No legacy syntax**: A new paradigm for LLMs, not a wrapper around existing languages
