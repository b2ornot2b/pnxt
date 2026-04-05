# pnxt Project Status

> Last updated: 2026-04-05 (Phase 5 Sprint 1 in progress)

---

## Current State

The pnxt project has completed Phase 4 (infrastructure prototype) and is now in **Phase 5** — implementing the paradigm-defining components identified by the Advisory Review Panel. Phase 5 Sprint 1 focuses on Dataflow Process Networks, Information Flow Control, and VPIR reasoning chains.

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

## Next Steps (Phase 4)

Phase 4 transitions from research to **prototype implementation and empirical evaluation**.

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

### Sprint 1: DPN + IFC + VPIR (In Progress)

- [x] **Channel\<T\> and DPN primitives** — Typed async FIFO channels with backpressure, Process actors, DataflowGraph composition. Agents can now communicate via dataflow instead of RPC.
- [x] **IFC security labels** — `SecurityLabel` type with lattice-based flow control. Memory entries carry trust-level provenance; queries enforce label boundaries (low-trust agents cannot read high-trust data). ACI gateway propagates labels on tool results.
- [x] **VPIR node types and validator** — `VPIRNode`, `VPIRGraph` types define verifiable reasoning steps. Structural validator checks DAG property, reference resolution, and IFC label consistency across node boundaries.
- [x] **Runtime integration** — AgentRuntime supports channel-based inter-agent communication alongside existing lifecycle management.

### Advisory Review Panel Alignment

| Component | Phase 4 | Phase 5 Sprint 1 |
|-----------|---------|-------------------|
| Dataflow Process Networks | Absent | Channel\<T\>, Process, DataflowGraph |
| Information Flow Control | Absent | SecurityLabel lattice, memory/ACI enforcement |
| VPIR | Absent | VPIRNode types, structural validator |
| Bridge Grammar | Absent | Planned (Sprint 2) |
| SMT Verification | Absent | Planned (Sprint 2) |
| HoTT Typed Tokenization | Absent | Planned (future) |

---

## Future Goals

### Medium-Term

- **Bridge Grammar implementation** — Constrained-decoding JSON schema for valid VPIR node generation
- **Natural language protocol design** — Formalized communication patterns for agent-to-agent collaboration
- **VPIR compiler/interpreter** — Execute Verifiable Programmatic Intermediate Representation
- **Tree-sitter DKB integration** — Knowledge graph-based codebase representation

### Long-Term

- **LLMbda Calculus runtime** — Lambda calculus with Information Flow Control for noninterference guarantees
- **SMT solver integration** — Z3/CVC5 for constraint satisfaction and formal verification
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
│   │   ├── trust.ts       # Trust engine types
│   │   ├── ifc.ts         # Information Flow Control types & lattice
│   │   ├── channel.ts     # Dataflow Process Network types
│   │   ├── vpir.ts        # VPIR reasoning chain types
│   │   └── json-schema.ts # JSON Schema utility type
│   ├── memory/            # Memory Service
│   │   ├── memory-service.ts  # Three-layer memory model with IFC enforcement
│   │   └── storage-backend.ts # StorageBackend interface, InMemory & File impls
│   ├── aci/               # ACI Gateway
│   │   └── aci-gateway.ts     # ACI gateway with trust checking, audit, & IFC labels
│   ├── agent/             # Agent Runtime
│   │   └── agent-runtime.ts   # Agent lifecycle management with channel support
│   ├── channel/           # Dataflow Process Networks (Phase 5)
│   │   ├── channel.ts         # Channel<T> — typed async FIFO with backpressure
│   │   ├── process.ts         # Process — actor with typed input/output ports
│   │   └── dataflow-graph.ts  # DataflowGraph — process composition & wiring
│   ├── vpir/              # Verifiable Reasoning (Phase 5)
│   │   └── vpir-validator.ts  # Structural validation for VPIR nodes & graphs
│   ├── capability/        # Capability Negotiation
│   │   └── capability-negotiation.ts  # Versioned capability discovery & contract negotiation
│   ├── trust/             # Trust Engine
│   │   └── trust-engine.ts    # Graduated trust model with scoring & calibration
│   └── evaluation/        # Validation & Evaluation
│       ├── multi-agent-scenarios.ts   # Coordination scenarios & scenario runner
│       ├── benchmark-suite.ts         # Benchmark framework & standard benchmarks
│       └── security-suite.ts          # Security test suite & adversarial tests
├── docs/
│   └── research/
│       ├── original-prompt.md
│       ├── Designing Agent-Native Programming Paradigm.md
│       └── phase-3/          # Phase 3 research deliverables
└── website/               # Astro Starlight documentation site
```
