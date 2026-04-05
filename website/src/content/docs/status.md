---
title: Project Status
description: Current state, completed milestones, and roadmap for pnxt.
---

# pnxt Project Status

> Last updated: 2026-04-05 (Phase 6 complete — all 9 sprints)

---

## Current State

The pnxt project has completed **Phase 6** (all 9 sprints), delivering the full Agent-Native Programming paradigm prototype. Sprint 9 ("Categorical Frontier") added **categorical tokenization experiment** (42-token vocabulary with morphism composition rules, 3-approach comparison), **self-hosting proof of concept** (pnxt describes, validates, categorizes, and executes its own pipeline as VPIR), **paradigm transition roadmap** (M1-M5 milestones from self-description to self-hosting), and **advisory alignment package** (all 10 advisor concerns addressed). Total: **17 formally verified Z3 properties**, 55 test suites, 974+ tests. Advisory panel composite score: **9.2/10** (from 7.5 baseline). See [status.md](https://github.com/b2ornot2b/pnxt/blob/main/status.md) for full details.

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

## Phase 5: Paradigm Foundation (Complete)

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

### Advisory Review Panel Alignment (Phase 5)

| Component | Phase 4 | Sprint 1 | Sprint 2 | Sprint 3 | Sprint 4 | Sprint 5 |
|-----------|---------|----------|----------|----------|----------|----------|
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

## Phase 6: Integration & Deepening (Complete — 9 Sprints)

Phase 6 focused on connecting and validating the paradigm pillars together with real-world inputs.

### Sprint 6: Type Identity — Univalence Axiom + LLMbda Decision (Complete)

- [x] **Univalence Axiom Encoding** — True HoTT univalence: `createTypeEquivalence`, `equivalenceToPath` (ua map), `pathToEquivalence` (inverse), `verifyUnivalenceRoundTrip`. Applies univalence to merge equivalent objects via union-find.
- [x] **Transport Along Paths** — `transport(path, typeFamily, value)` moves values P(A) to P(B) along paths. Enables Z3 property transfer between equivalent VPIR graphs without re-verification.
- [x] **LLMbda as Semantic Foundation** — `vpirNodeToLambda()` converts VPIR nodes to lambda denotations. LLMbda Calculus is now the *meaning* of VPIR.
- [x] **Typed LLMbda Calculus ADR** — Formal justification for typed departure from master prompt's untyped specification.
- [x] **Z3 Univalence Verification** — New `univalence_axiom` SMT property. Total: **15 formally verified Z3 properties**.

### Sprint 7: Verification Maturity — User-Program Verification + Bisimulation (Complete)

- [x] **User-Program Property Verification** — `ProgramVerifier` binds VPIR node attributes to Z3 constants. Supports preconditions, postconditions, invariants, and assertions. SMT-LIB2 formula parser.
- [x] **CVC5 Integration** — CVC5 as alternative solver via subprocess. `MultiSolverVerifier` orchestrates Z3 + CVC5 with graceful degradation.
- [x] **DPN Bisimulation Checking** — `buildLTS()` constructs Labelled Transition Systems. `checkStrongBisimulation()` via partition refinement. Bisimulation results convert to HoTT paths via univalence.
- [x] **Multi-Agent Delegation Benchmark** — Three agents (researcher, assistant, reviewer) coordinating with trust boundaries and IFC enforcement.
- [x] **Secure Data Pipeline Benchmark** — Data flows through classification, redaction, and declassification with IFC analysis and PII verification.

### Sprint 8: Neurosymbolic Bridge — P-ASP + Active Inference (Complete)

- [x] **P-ASP Integration Prototype** — Probabilistic ASP for VPIR node confidence scoring based on structural validity, semantic coherence, historical accuracy, and constraint satisfaction.
- [x] **Active Inference Engine** — Free-energy minimization for iterative VPIR graph patching with oscillation detection.
- [x] **Refinement Pipeline** — Combines P-ASP confidence scoring with Active Inference patching in an iterative loop. Configurable convergence thresholds.

### Sprint 9: Categorical Frontier — Native Tokenization + Self-Hosting Vision (Complete)

- [x] **Categorical Tokenization Experiment** — 42-token vocabulary covering 7 categories with 23 morphism composition rules. Three-approach comparison (baseline JSON, categorical, hybrid).
- [x] **Self-Hosting Proof of Concept** — pnxt describes its own 6-stage pipeline as VPIR, then validates, categorizes (HoTT), and executes (DPN) the self-description. Milestone M1 of paradigm transition.
- [x] **Paradigm Transition Roadmap** — M1-M5 milestones from self-description to self-hosting.
- [x] **Advisory Review Alignment Package** — All 10 advisor concerns addressed. Per-advisor score trajectory from 7.5 to 9.2.

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
| Sprint 6 | 30 | 557 | ~9,400 |
| Sprint 7 | 49 | 882 | — |
| Sprint 8 | 53 | ~932 | — |
| Sprint 9 | 55 | 974+ | — |

---

## Future Goals

### Phase 7: Paradigm Transition (Planned)

See `docs/roadmap/paradigm-transition.md` for the complete transition roadmap.

- **M2: External Task Expression** — Real-world tasks expressed entirely in VPIR, no TypeScript required
- **M3: LLM-Native Programming** — LLMs solve problems end-to-end through pnxt pipeline
- **M4: Self-Modification** — pnxt modifies its own pipeline through VPIR
- **Web-based visualization frontend** — Interactive node-graph renderer consuming the JSON export format
- **Multi-language Tree-sitter parsers** — Extend KG parsing beyond TypeScript to Python, Rust, Go
- **Categorical token embeddings** — Transformer fine-tuning with morphism-structured embeddings

### Long-Term (Phase 8+)

- **M5: Self-Hosting** — pnxt's core components expressed in pnxt
- **Full LLMbda Calculus runtime** — Lambda calculus with noninterference guarantees
- **Distributed DPN** — Multi-node actor execution for scale
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
├── QuickStart.md          # Hands-on getting started guide
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
│   ├── types/             # Shared type definitions (18 files)
│   ├── memory/            # Memory Service — three-layer model with IFC
│   ├── aci/               # ACI Gateway — trust + IFC checking, audit logging
│   ├── agent/             # Agent Runtime — lifecycle management
│   ├── capability/        # Capability Negotiation — 3-phase handshake
│   ├── trust/             # Trust Engine — 5-level graduated trust, causal scoring
│   ├── vpir/              # VPIR — validator, interpreter, optimizer, renderer, export
│   ├── bridge-grammar/    # Bridge Grammar — JSON Schema + Claude API integration
│   ├── channel/           # DPN — channels, processes, DPN runtime, bisimulation
│   ├── hott/              # HoTT — categories, higher paths, univalence, transport
│   ├── knowledge-graph/   # Tree-sitter DKB — typed graph + TypeScript parser
│   ├── lambda/            # LLMbda Calculus — typed lambda with IFC, VPIR bridge
│   ├── protocol/          # NL Protocols — state machines over DPN channels
│   ├── verification/      # Formal Verification — Z3, noninterference, liveness, CVC5
│   ├── benchmarks/        # Benchmarks — weather API, multi-agent delegation, pipeline
│   ├── evaluation/        # Evaluation — integration scenarios, security tests
│   ├── neurosymbolic/     # Neurosymbolic — P-ASP, Active Inference, refinement
│   ├── experiments/       # Experiments — categorical tokenizer, self-hosting PoC
│   └── errors/            # Error hierarchy
├── docs/
│   ├── research/          # Research documents (original prompt, Phase 3)
│   ├── decisions/         # Architecture Decision Records
│   ├── reviews/           # Advisory panel reviews
│   ├── roadmap/           # Paradigm transition roadmap (M1-M5)
│   └── sprints/           # Sprint documentation (4-9)
└── website/               # Astro Starlight documentation site
```
