# pnxt Project Status

> Last updated: 2026-04-05 (Phase 5 Sprint 2 complete)

---

## Current State

The pnxt project has completed Phase 5 Sprint 2, delivering the **paradigm's minimum viable differentiator**: Bridge Grammar constrained decoding, Z3 SMT formal verification, complete IFC label enforcement, and causal trust scoring. The project alignment with the foundational vision has advanced significantly from the Panel's 3/10 assessment after Phase 4.

### Completed Work

| Phase | Focus | Deliverables |
|-------|-------|-------------|
| Phase 1 | Core Architecture, State Separation & FFI | Foundational architecture design (external) |
| Phase 2 | Bridge Layer & Mathematical Spec | Mathematical formalization, bridge grammar spec (external) |
| Phase 3 | Deep analysis of pillars, patterns, and architecture | Six research documents covering ACI, memory, coordination, trust, comparative analysis, and reference architecture |

### Phase 3 Deliverables (Complete)

1. **Agent-Computer Interface Specification** — Protocol layers, message taxonomy, capability discovery, error handling
2. **Semantic Memory Architecture** — Three-layer memory model (working, semantic, episodic) with lifecycle management
3. **Multi-Agent Coordination Patterns** — Topology models, task decomposition, conflict resolution
4. **Trust, Safety, and Governance Framework** — Graduated trust model, capability-based permissions, sandboxing
5. **Comparative Analysis** — ANP positioned against OOP, Actor Model, Microservices, EDA, FP
6. **Implementation Reference Architecture** — Concrete system design with deployment topologies and migration strategy

---

## Phase 4: Infrastructure Prototype (Complete)

### Priority 1: Core Infrastructure

- [x] **Project scaffolding** — Initialize package.json, TypeScript config, test infrastructure, and CI pipeline
- [x] **Memory Service prototype** — Three-layer memory model with pluggable `StorageBackend` interface, `InMemoryStorageBackend` for testing, and `FileStorageBackend` for persistent JSON-file storage across sessions
- [x] **ACI Gateway prototype** — Structured protocol layer with graduated trust checking (5 levels, side-effect-based requirements), `TrustResolver` for agent trust lookup, append-only `AuditLogger` recording all invocations/denials, and `InMemoryAuditLogger` implementation

### Priority 2: Agent Runtime

- [x] **Agent runtime environment** — Basic agent lifecycle management (registration, execution, teardown)
- [x] **Capability negotiation** — Versioned capability discovery with 3-phase handshake, semantic versioning, trust-based constraint tightening, revocation, and expiry support
- [x] **Trust engine** — Graduated trust model (5 levels) with multi-dimensional trust, observable metric-based scoring (0–100), automatic calibration, per-dimension overrides, and trust reset/manual adjustment

### Priority 3: Validation and Evaluation

- [x] **Empirical evaluation** — Multi-agent coordination scenarios (delegation pattern, trust escalation, failure recovery) exercising full system integration (runtime + trust + ACI + capabilities + memory)
- [x] **Benchmark development** — `BenchmarkSuite` framework with standardized benchmarks for agent registration, trust calibration, ACI invocation, capability negotiation, memory store/query, and agent lifecycle throughput
- [x] **Security hardening** — `SecurityTestSuite` with adversarial tests across 5 categories: privilege escalation, trust manipulation, capability abuse, audit integrity, and resource exhaustion

---

## Phase 5: Paradigm Foundation (In Progress)

Following the Advisory Review Panel's alignment assessment (3/10), Phase 5 implements the core paradigm components that distinguish pnxt from conventional agent frameworks.

### Sprint 1: DPN + IFC + VPIR (Complete)

- [x] **Channel\<T\> and DPN primitives** — Typed async FIFO channels with backpressure, Process actors, DataflowGraph composition. Agents communicate via dataflow instead of RPC.
- [x] **IFC security labels** — `SecurityLabel` type with lattice-based flow control. Memory entries carry trust-level provenance; queries enforce label boundaries.
- [x] **VPIR node types and validator** — `VPIRNode`, `VPIRGraph` types define verifiable reasoning steps. Structural validator checks DAG property, reference resolution, and IFC label consistency.
- [x] **Runtime integration** — AgentRuntime supports channel-based inter-agent communication.

### Sprint 2: Bridge Grammar + Formal Verification (Complete)

- [x] **Bridge Grammar JSON Schema** — Constrained-decoding schemas (`VPIRNodeSchema`, `VPIRGraphSchema`, etc.) that force LLMs to output valid VPIR nodes via function calling, tool use, or structured output. Includes `parseVPIRNode`/`parseVPIRGraph` for runtime validation with JSON pointer error paths.
- [x] **Constrained output formatters** — `toFunctionCallingSchema()`, `toAnthropicToolSchema()`, `toStructuredOutputSchema()` produce LLM-specific schema formats. Schema-only utilities, no API calls.
- [x] **Z3 SMT integration** — Formal verification via z3-solver (z3-wasm). Four verified properties: capability grant consistency, trust transition monotonicity, IFC flow lattice, and side-effect trust requirements. Produces counterexamples on violation.
- [x] **IFC label enforcement completion** — Extended IFC checking to ACI tool invocations (input label flow check) and Channel sends (label exposure for downstream enforcement). Backward compatible — unlabeled invocations/channels work as before.
- [x] **Causal trust scoring** — Difficulty-weighted trust scoring (`computeCausalTrustScore`) where hard task successes contribute more and trivial task failures penalize more. `TaskDifficulty` type added to `TrustEvent`. Drop-in replacement for fixed-weight scorer.

### Advisory Review Panel Alignment

| Component | Phase 4 | Phase 5 Sprint 1 | Phase 5 Sprint 2 |
|-----------|---------|-------------------|-------------------|
| Dataflow Process Networks | Absent | Channel\<T\>, Process, DataflowGraph | — |
| Information Flow Control | Absent | SecurityLabel lattice, memory enforcement | ACI + Channel enforcement |
| VPIR | Absent | VPIRNode types, structural validator | — |
| Bridge Grammar | Absent | — | JSON Schema constrained decoding |
| SMT Verification | Absent | — | Z3 invariant verification (4 properties) |
| Causal Trust | Fixed weights | — | Difficulty-weighted causal scoring |
| HoTT Typed Tokenization | Absent | — | Planned (future) |

---

## Test Coverage

| Sprint | Test Suites | Tests | LOC (tests) |
|--------|------------|-------|-------------|
| Phase 4 | 12 | 194 | 2,736 |
| Sprint 1 | 14 | 194+ | — |
| Sprint 2 | 17 | 292 | ~3,800 |

---

## Future Goals

### Medium-Term (Phase 5 Sprint 3+)

- **VPIR compiler/interpreter** — Execute verified reasoning chains
- **Natural language protocol design** — Formalized agent-to-agent communication patterns
- **Tree-sitter DKB integration** — Knowledge graph-based codebase representation
- **Enhanced visualization** — Node-graph decompiler for human oversight

### Long-Term (Phase 6+)

- **HoTT Typed Tokenization** — Code as categorical objects, morphisms, and paths
- **Full LLMbda Calculus runtime** — Lambda calculus with noninterference guarantees
- **Full Dataflow Process Network engine** — Actor-based execution with FIFO channel communication
- **Multi-agent orchestration at scale** — Enterprise deployment topology with audit and governance
- **Community and ecosystem** — Open specification, reference implementations, and adoption tooling

---

## Key Decisions and Constraints

- **Research-first approach**: Theoretical soundness before implementation speed
- **Incremental adoption**: Every component designed for phased introduction
- **Structural safety**: Correct behavior made easy by design, not by discipline
- **No legacy syntax**: This is a new paradigm for LLMs, not a wrapper around existing languages

---

## Repository Structure

```
pnxt/
├── AGENTS.md              # Agent development guidelines (CLAUDE.md symlinks here)
├── README.md              # Project overview
├── status.md              # This file — project status and roadmap
├── package.json           # Node.js project configuration
├── tsconfig.json          # TypeScript compiler configuration
├── jest.config.js         # Jest test configuration
├── eslint.config.js       # ESLint configuration
├── .prettierrc            # Prettier configuration
├── .github/workflows/
│   ├── ci.yml             # CI pipeline (typecheck, lint, test, build)
│   ├── deploy-website.yml # Website deployment
│   └── validate-website.yml
├── src/
│   ├── index.ts           # Package entry point
│   ├── types/             # Shared type definitions
│   │   ├── memory.ts      # Memory model types (with IFC labels)
│   │   ├── agent.ts       # Agent runtime types
│   │   ├── aci.ts         # ACI Gateway types (with IFC label propagation)
│   │   ├── capability.ts  # Capability negotiation types
│   │   ├── trust.ts       # Trust engine types (with TaskDifficulty)
│   │   ├── ifc.ts         # Information Flow Control types & lattice
│   │   ├── channel.ts     # Dataflow Process Network types (with IFC label)
│   │   ├── vpir.ts        # VPIR reasoning chain types
│   │   ├── bridge-grammar.ts  # Bridge Grammar result & error types
│   │   ├── verification.ts    # Z3 verification result types
│   │   └── json-schema.ts     # JSON Schema type (extended for constrained decoding)
│   ├── memory/            # Memory Service
│   │   ├── memory-service.ts  # Three-layer memory model with IFC enforcement
│   │   └── storage-backend.ts # StorageBackend interface, InMemory & File impls
│   ├── aci/               # ACI Gateway
│   │   └── aci-gateway.ts     # ACI gateway with trust + IFC checking, audit logging
│   ├── agent/             # Agent Runtime
│   │   └── agent-runtime.ts   # Agent lifecycle management with channel support
│   ├── bridge-grammar/    # Bridge Grammar (Phase 5 Sprint 2)
│   │   ├── vpir-schema.ts         # JSON Schema definitions for VPIR constrained decoding
│   │   ├── schema-validator.ts    # Parse/validate LLM JSON into typed VPIR nodes/graphs
│   │   ├── constrained-output.ts  # LLM schema format converters
│   │   └── index.ts               # Re-exports
│   ├── channel/           # Dataflow Process Networks (Phase 5)
│   │   ├── channel.ts         # Channel<T> — typed async FIFO with backpressure & IFC
│   │   ├── process.ts         # Process — actor with typed input/output ports
│   │   └── dataflow-graph.ts  # DataflowGraph — process composition & wiring
│   ├── vpir/              # Verifiable Reasoning (Phase 5)
│   │   └── vpir-validator.ts  # Structural validation for VPIR nodes & graphs
│   ├── verification/      # Formal Verification (Phase 5 Sprint 2)
│   │   ├── z3-invariants.ts   # Z3 SMT invariant verification
│   │   └── index.ts           # Re-exports
│   ├── capability/        # Capability Negotiation
│   │   └── capability-negotiation.ts  # Versioned capability discovery
│   ├── trust/             # Trust Engine
│   │   ├── trust-engine.ts    # Graduated trust model with fixed-weight scoring
│   │   └── causal-trust.ts    # Causal trust scorer with difficulty weighting
│   └── evaluation/        # Validation & Evaluation
│       ├── multi-agent-scenarios.ts   # Coordination scenarios
│       ├── benchmark-suite.ts         # Benchmark framework
│       └── security-suite.ts          # Security test suite
├── docs/
│   └── research/
│       ├── original-prompt.md
│       ├── Designing Agent-Native Programming Paradigm.md
│       └── phase-3/          # Phase 3 research deliverables
└── website/               # Astro Starlight documentation site
```
