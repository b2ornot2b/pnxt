# pnxt Project Status

> Last updated: 2026-04-05 (Phase 5 Sprint 5 complete)

---

## Current State

The pnxt project has completed Phase 5 Sprint 5, delivering **HoTT typed tokenization foundations** (Category, Morphism, Path types with categorical law validation), **Tree-sitter DKB Knowledge Graph** (typed code entity graph with multi-hop traversal and HoTT conversion), **VPIR-to-HoTT bridge** (VPIR reasoning chains as categorical structures with path equivalences), and **end-to-end pipeline integration** (KG → VPIR → HoTT → Z3 with IFC enforcement at every boundary). All seven paradigm pillars now have foundational implementations.

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

### Sprint 3: VPIR Execution + NL Protocols + Visualization (Complete)

- [x] **VPIR Interpreter** — Executes validated VPIR graphs in topological order. Supports all 5 node types (observation, inference, action, assertion, composition). IFC enforcement at every data-flow boundary. Full execution trace with timing. ACI gateway integration for action nodes. Timeout support and sub-graph recursion for composition nodes.
- [x] **Natural Language Protocol Design** — Formalized agent-to-agent communication via state machines over DPN channels. Three protocols: task-delegation (`request → accept/reject → confirm`), capability-negotiation (`query → inform → propose → accept/reject`), conflict-resolution (`inform → propose → accept/reject/escalate`). IFC label enforcement on all messages. Transition validation prevents invalid message sequences.
- [x] **VPIR Visualization (Text-Based)** — Human-readable rendering of VPIR graphs (ASCII DAG with node types, labels, connections) and execution traces (step-by-step table with timing, status, and error highlighting). No external dependencies.

### Sprint 4: Protocol-Channel Integration + VPIR Optimizations (Complete)

- [x] **Protocol-Channel Integration** — Bidirectional protocol channels (`ProtocolChannelPair`) wrapping two `Channel<ProtocolMessage>` instances for real dataflow transport. `ProtocolChannelSession` class validates protocol transitions on every send, enforces IFC labels against channel labels, supports async iteration over inbound messages, and provides `createProtocolSessionPair()` convenience factory for matched initiator/responder sessions.
- [x] **VPIR Parallel Execution** — Wave-based execution planner (`analyzeParallelism()`) groups DAG nodes into parallel waves using modified Kahn's algorithm. `executeGraph()` now accepts optional `VPIRExecutionOptions` with `parallel`, `cache`, and `maxConcurrency` settings. Parallel execution uses a `Semaphore` for concurrency control, preserving IFC enforcement and timeout support.
- [x] **VPIR Result Caching** — `VPIRResultCache` interface with `InMemoryResultCache` implementation. Deterministic nodes (observation, inference) are cached by node ID + input hash. Action nodes are never cached. `createInputHash()` produces stable, order-independent hashes for cache keying.

### Sprint 5: HoTT Foundations + Knowledge Graph + End-to-End Pipeline (Complete)

- [x] **HoTT Type Foundations** — `HoTTObject`, `Morphism`, `HoTTPath`, and `Category` types implementing categorical structure for typed tokenization. Operations: `compose` (morphism composition with associativity), `identity` (identity morphisms), `addPath` (homotopy equivalences), `validateCategory` (identity law, associativity, source/target integrity). Addresses Voevodsky's "critical misalignment" verdict.
- [x] **Tree-sitter DKB Knowledge Graph** — `KGNode` (8 code entity kinds), `KGEdge` (8 typed relations), `KnowledgeGraphDefinition` with graph operations: `addNode`/`addEdge`/`removeNode`, `query` (configurable BFS traversal with depth, direction, kind/relation filters), `findPaths` (multi-hop BFS), `subgraph` (induced subgraph extraction), `toHoTTCategory` (bridge to categorical structure). Addresses Pearl's "memory is flat, not graphical" criticism.
- [x] **VPIR-to-HoTT Bridge** — `vpirGraphToCategory` converts VPIR reasoning DAGs into HoTT categories (nodes → objects, dependency edges → morphisms, security labels propagated). `validateCategoricalStructure` checks VPIR graphs satisfy categorical laws. `findEquivalentPaths` discovers homotopy equivalences between structurally similar VPIR graphs (basis for proving refactoring correctness). Fulfills original prompt Phase 2 requirement for "mathematical translation pipeline."
- [x] **Z3 Categorical Verification** — Two new SMT properties: `morphism_composition_associativity` (verifies (h∘g)∘f = h∘(g∘f) for all composable triples) and `identity_morphism_laws` (verifies id∘f = f = f∘id). Total: 6 formally verified properties.
- [x] **End-to-End Pipeline Scenarios** — Three integration scenarios: (1) KG→VPIR→HoTT roundtrip with categorical validation, (2) labeled pipeline with IFC label propagation through every boundary, (3) diamond-shaped parallel VPIR preserving categorical structure.

### Advisory Review Panel Alignment

| Component | Phase 4 | Phase 5 Sprint 1 | Phase 5 Sprint 2 | Phase 5 Sprint 3 | Phase 5 Sprint 4 | Phase 5 Sprint 5 |
|-----------|---------|-------------------|-------------------|-------------------|-------------------|-------------------|
| Dataflow Process Networks | Absent | Channel\<T\>, Process, DataflowGraph | — | — | Protocol-Channel integration | — |
| Information Flow Control | Absent | SecurityLabel lattice, memory enforcement | ACI + Channel enforcement | Protocol message enforcement | Channel-bound IFC on protocol sessions | KG node labels + HoTT object labels + pipeline propagation |
| VPIR | Absent | VPIRNode types, structural validator | — | Interpreter (execution) + Renderer (visualization) | Parallel wave execution + result caching | Categorical interpretation via HoTT bridge |
| Bridge Grammar | Absent | — | JSON Schema constrained decoding | — | — | — |
| SMT Verification | Absent | — | Z3 invariant verification (4 properties) | — | — | + 2 categorical properties (6 total) |
| NL Protocols | Absent | — | — | 3 protocol state machines (delegation, negotiation, resolution) | Channel transport binding | — |
| Causal Trust | Fixed weights | — | Difficulty-weighted causal scoring | — | — | — |
| HoTT Typed Tokenization | Absent | — | — | — | — | **Category, Morphism, Path types + VPIR bridge + KG conversion** |
| Tree-sitter DKB | Absent | — | — | — | — | **Knowledge graph with typed edges, traversal, HoTT conversion** |

---

## Test Coverage

| Sprint | Test Suites | Tests | LOC (tests) |
|--------|------------|-------|-------------|
| Phase 4 | 12 | 194 | 2,736 |
| Sprint 1 | 14 | 194+ | — |
| Sprint 2 | 17 | 292 | ~3,800 |
| Sprint 3 | 20 | 355 | ~5,200 |
| Sprint 4 | 22 | ~415 | ~6,600 |
| Sprint 5 | 26 | 479 | ~8,200 |

---

## Future Goals

### Medium-Term (Phase 5 Sprint 6+)

- **Tree-sitter parser integration** — Connect knowledge graph to actual Tree-sitter AST parsing for automatic codebase ingestion
- **Enhanced visualization** — Graphical node-graph decompiler for web-based oversight
- **HoTT higher paths** — 2-paths, groupoid structure, and univalence axiom for deeper refactoring proofs

### Long-Term (Phase 6+)

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
│   │   ├── json-schema.ts     # JSON Schema type (extended for constrained decoding)
│   │   ├── vpir-execution.ts     # VPIR execution context, result, and optimizer types (Sprint 3–4)
│   │   ├── protocol.ts          # NL protocol message & conversation types (Phase 5 Sprint 3)
│   │   ├── protocol-channel.ts  # Protocol-channel binding types (Phase 5 Sprint 4)
│   │   ├── hott.ts              # HoTT types (Object, Morphism, Path, Category) (Sprint 5)
│   │   └── knowledge-graph.ts   # Knowledge graph types (KGNode, KGEdge, KGQuery) (Sprint 5)
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
│   ├── hott/              # HoTT Typed Tokenization (Phase 5 Sprint 5)
│   │   ├── category.ts        # Category operations (compose, identity, validate)
│   │   └── vpir-bridge.ts     # VPIR-to-HoTT translation pipeline
│   ├── knowledge-graph/   # Tree-sitter DKB Knowledge Graph (Phase 5 Sprint 5)
│   │   └── knowledge-graph.ts # Typed graph with traversal and HoTT conversion
│   ├── channel/           # Dataflow Process Networks (Phase 5)
│   │   ├── channel.ts         # Channel<T> — typed async FIFO with backpressure & IFC
│   │   ├── process.ts         # Process — actor with typed input/output ports
│   │   └── dataflow-graph.ts  # DataflowGraph — process composition & wiring
│   ├── vpir/              # Verifiable Reasoning (Phase 5)
│   │   ├── vpir-validator.ts    # Structural validation for VPIR nodes & graphs
│   │   ├── vpir-interpreter.ts  # VPIR graph execution engine (parallel + cache support)
│   │   ├── vpir-optimizer.ts    # Wave-based parallelism, input hashing, result cache (Sprint 4)
│   │   └── vpir-renderer.ts     # Text-based VPIR visualization (Phase 5 Sprint 3)
│   ├── protocol/          # Natural Language Protocols (Phase 5 Sprint 3–4)
│   │   ├── nl-protocol.ts       # Protocol state machines for agent communication
│   │   └── protocol-channel.ts  # Protocol sessions over DPN channels (Sprint 4)
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
