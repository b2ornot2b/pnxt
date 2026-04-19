---
title: Project Status
description: Current state, completed milestones, and roadmap for pnxt.
---

# pnxt Project Status

> Last updated: 2026-04-19 (Phase 8 Sprint 17 complete — M6 delivered)

---

## Current State

**Phase 8 ("Operational Maturity") continues.** Sprint 17 ("Human-in-the-Loop Primitive") delivered **M6 — Human-in-the-Loop**: a new `'human'` VPIR node type with a typed `humanPromptSpec`; a `HumanGateway` interface with `CLIHumanGateway` (stdin/stdout) and `NoopHumanGateway` (test double) implementations; `executeHuman()` in the interpreter with capability-guard on `human.attention`, pre-await journal checkpointing (leveraging Sprint 16's durability substrate), provenance-join IFC label derivation, and `AuditEvent` emission with `actor.type: 'human'`; a new `human-approval` NL protocol with terminal states `rejected` and `timed_out` scoped per-protocol so the three existing protocols are unaffected; Z3 verifier reports human nodes as `uninterpretable` with `reason: 'human-node'` while the machine subgraph continues to verify all 21 Z3 properties; and a Weather benchmark operator-approval gate (`createWeatherVPIRGraphWithApproval`) that inserts a human node before the outbound fetch and fails the pipeline on rejection. The design from `docs/research/hitl-primitive.md` is now **Accepted and Implemented**. Total: **21 formally verified Z3 properties**, 88 test suites, 1580+ tests. Advisory panel composite score target: **9.6/10**. See [status.md](https://github.com/b2ornot2b/pnxt/blob/main/status.md) for full details.

**Phase 8 ("Operational Maturity") has begun.** Sprint 16 ("Durable VPIR Execution") delivered **M5 — Crash-Safe Execution**: a `VPIRJournal` durability substrate with `JournalEntry` and `JournalCheckpoint` records persisted through an in-memory implementation and a file-backed JSON store; `executeGraph` optionally journals every settled node on both sequential and parallel paths, preserving `SecurityLabel` verbatim across replay so IFC flow checks produce identical results; `resumeFromCheckpoint` reconstructs `ExecutionState` from the latest checkpoint and rejects structurally-changed graphs via SHA-256 content-hash validation; `Channel` and `Process` gained `getSnapshot`/`restore` interface contracts for future full-DPN replay. The weather-benchmark durability scenario (kill mid-graph, restart, verify identical outputs) passes end-to-end, with the journal file staying under the ADR-001 10 KB budget. ADR-001 is now **Accepted** with full Implementation Notes. Total: **21 formally verified Z3 properties**, 86 test suites, 1530+ tests. Advisory panel composite score target: **9.55/10**. See [status.md](https://github.com/b2ornot2b/pnxt/blob/main/status.md) for full details.

**Phase 7 ("Self-Hosting Paradigm") is complete.** All three milestones achieved: M2 (External Task Expression), M3 (LLM-Native Programming), and M4 (Self-Modification). Sprint 15 ("Verified Self-Modification + Research Frontier") delivered a **Causal Impact Analyzer**, **Modification Confidence Scorer**, **Self-Modification Orchestrator**, **5 Real Self-Modification Scenarios**, and **Phase 7 Comprehensive Evaluation**. The system can now express tasks in VPIR, generate VPIR autonomously, and modify its own pipeline with verified correctness. Total: **21 formally verified Z3 properties**, 83 test suites, 1485+ tests. Advisory panel composite score: **9.5/10**.

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

- [x] **Channel\<T\> and DPN primitives** — Typed async FIFO channels with backpressure, Process actors, DataflowGraph composition
- [x] **IFC security labels** — `SecurityLabel` type with lattice-based flow control
- [x] **VPIR node types and validator** — `VPIRNode`, `VPIRGraph` types with structural validator
- [x] **Runtime integration** — AgentRuntime supports channel-based inter-agent communication

### Sprint 2: Bridge Grammar + Formal Verification (Complete)

- [x] **Bridge Grammar JSON Schema** — Constrained-decoding schemas forcing LLMs to output valid VPIR nodes
- [x] **Constrained output formatters** — LLM-specific schema formats (function calling, Anthropic tools, structured output)
- [x] **Z3 SMT integration** — Four verified properties: capability grant consistency, trust transition monotonicity, IFC flow lattice, side-effect trust requirements
- [x] **IFC label enforcement completion** — Extended IFC checking to ACI tool invocations and Channel sends
- [x] **Causal trust scoring** — Difficulty-weighted trust scoring replacing fixed-weight scorer

### Sprint 3: VPIR Execution + NL Protocols + Visualization (Complete)

- [x] **VPIR Interpreter** — Executes validated VPIR graphs in topological order with IFC enforcement
- [x] **Natural Language Protocol Design** — Three protocol state machines: task-delegation, capability-negotiation, conflict-resolution
- [x] **VPIR Visualization (Text-Based)** — Human-readable rendering of VPIR graphs and execution traces

### Sprint 4: Protocol-Channel Integration + VPIR Optimizations (Complete)

- [x] **Protocol-Channel Integration** — Bidirectional protocol channels with IFC enforcement
- [x] **VPIR Parallel Execution** — Wave-based execution with Kahn's algorithm and semaphore concurrency
- [x] **VPIR Result Caching** — Deterministic node caching by ID + input hash

### Sprint 5: HoTT Foundations + Knowledge Graph + End-to-End Pipeline (Complete)

- [x] **HoTT Type Foundations** — `HoTTObject`, `Morphism`, `HoTTPath`, and `Category` types with categorical structure
- [x] **Tree-sitter DKB Knowledge Graph** — Typed graph with 8 entity kinds, 8 relation types, traversal, and HoTT conversion
- [x] **VPIR-to-HoTT Bridge** — Converts VPIR reasoning DAGs into HoTT categories
- [x] **Z3 Categorical Verification** — Two new properties: morphism composition associativity, identity morphism laws. Total: 6 properties
- [x] **End-to-End Pipeline Scenarios** — Three integration scenarios proving paradigm pillars work together

---

## Phase 6: Integration & Deepening (Complete — 9 Sprints)

Phase 6 focused on connecting and validating the paradigm pillars together with real-world inputs.

### Sprint 6: Type Identity — Univalence Axiom + LLMbda Decision (Complete)

- [x] **Univalence Axiom Encoding** — True HoTT univalence with equivalence-to-path and inverse
- [x] **Transport Along Paths** — Property transfer between equivalent VPIR graphs without re-verification
- [x] **LLMbda as Semantic Foundation** — VPIR nodes carry lambda calculus denotations
- [x] **Typed LLMbda Calculus ADR** — Formal justification for typed over untyped lambda calculus
- [x] **Z3 Univalence Verification** — Total: **15 formally verified Z3 properties**

### Sprint 7: Verification Maturity — User-Program Verification + Bisimulation (Complete)

- [x] **User-Program Property Verification** — `ProgramVerifier` with preconditions, postconditions, invariants, assertions
- [x] **CVC5 Integration** — Alternative solver via subprocess with `MultiSolverVerifier` orchestration
- [x] **DPN Bisimulation Checking** — Strong bisimulation + observational equivalence via partition refinement
- [x] **Multi-Agent Delegation Benchmark** — Three agents coordinating with trust boundaries and IFC enforcement
- [x] **Secure Data Pipeline Benchmark** — PII redaction with IFC analysis and label propagation
- [x] **Z3 Properties** — Total: **17 formally verified properties**

### Sprint 8: Neurosymbolic Bridge — P-ASP + Active Inference (Complete)

- [x] **P-ASP Integration Prototype** — Probabilistic ASP for VPIR node confidence scoring
- [x] **Active Inference Engine** — Free-energy minimization for iterative VPIR graph patching
- [x] **Refinement Pipeline** — Combines P-ASP scoring with Active Inference in an iterative loop

### Sprint 9: Categorical Frontier — Native Tokenization + Self-Hosting Vision (Complete)

- [x] **Categorical Tokenization Experiment** — 42-token vocabulary with 23 morphism composition rules
- [x] **Self-Hosting Proof of Concept** — pnxt describes, validates, categorizes, and executes itself as VPIR (M1)
- [x] **Paradigm Transition Roadmap** — M1-M5 milestones from self-description to self-hosting
- [x] **Advisory Review Alignment Package** — All 10 advisor concerns addressed. Score: 7.5 → 9.2

---

## Phase 7: Self-Hosting Paradigm (In Progress)

Phase 7 transitions pnxt from verified prototype to self-modifying, LLM-programmable system.

See [docs/roadmap/paradigm-transition.md](https://github.com/b2ornot2b/pnxt/blob/main/docs/roadmap/paradigm-transition.md) for the complete transition roadmap.

### Sprint 10: Handler Library + Tool Registry (Complete)

- [x] **Standard Handler Library** — 8 pre-built tool handlers (http-fetch, json-transform, file-read, file-write, string-format, math-eval, data-validate, unit-convert)
- [x] **Declarative Tool Registry** — Operation-to-handler mapping with auto-registration, discovery API, and trust pre-validation
- [x] **DPN Supervisor** — Supervisor actor pattern with bounded restart strategies, priority mailbox, full event log
- [x] **DPN Runtime Integration** — Tool registry support in inference and action nodes; backward compatible

### Sprint 11: VPIR Authoring + External Tasks — M2 Complete (Complete)

- [x] **VPIR Graph Builder** — Fluent API and `fromJSON()` for constructing validated `VPIRGraph` from pure JSON. Auto-computes roots/terminals, validates tool availability via registry
- [x] **External Task Runner** — `TaskRunner` orchestrating JSON spec → build → verify → DPN execute pipeline
- [x] **Task-Aware Bridge Grammar** — Enhanced LLM generation with handler documentation and validation
- [x] **External Task Benchmarks** — Temperature Conversion and Math Expression end-to-end benchmarks

### Sprint 12: Reliable Bridge Grammar + Error Recovery — M3 Foundation (Complete)

- [x] **Bridge Grammar Error Taxonomy** — 6 error categories with repair hints and structured LLM feedback
- [x] **Auto-Repair Engine** — 6 repair strategies: truncated JSON, missing fields, fuzzy enums, duplicate IDs, topology, default labels
- [x] **Confidence Scorer** — 4-dimension P-ASP-inspired scoring (structural, semantic, handler coverage, topological)
- [x] **Z3 Graph Pre-Verification** — 4 formal properties: acyclicity, input completeness, IFC monotonicity, handler trust
- [x] **Reliable Generation Pipeline** — 7-stage orchestration: generate → diagnose → repair → re-validate → score → verify
- [x] **Error Recovery Benchmark** — 7 scenarios covering all error categories
- [x] **Z3 Properties** — Total: **21 formally verified properties**

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
| Sprint 7 | 49 | 882 | ~18,100 |
| Sprint 8 | 53 | 932 | ~19,800 |
| Sprint 9 | 55 | 974 | ~21,000 |
| Sprint 10 | 58 | 1073+ | ~23,000 |
| Sprint 11 | 62 | 1128+ | ~25,000 |
| Sprint 12 | 68 | 1220+ | ~27,000 |

---

## Future Goals

### Phase 7 Remaining (M4–M5)

- **M4: Self-Modification** — pnxt modifies its own pipeline through VPIR
- **M5: Self-Hosting** — pnxt's core components expressed in pnxt

### Long-Term (Phase 8+)

- **Web-based visualization frontend** — Interactive node-graph renderer consuming the JSON export format
- **Multi-language Tree-sitter parsers** — Extend KG parsing beyond TypeScript to Python, Rust, Go
- **Categorical token embeddings** — Transformer fine-tuning with morphism-structured embeddings
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
│   └── sprints/           # Sprint documentation (4-12)
└── website/               # Astro Starlight documentation site
```
