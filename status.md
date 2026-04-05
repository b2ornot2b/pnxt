# pnxt Project Status

> Last updated: 2026-04-05 (Phase 6 Sprint 9 complete — Phase 6 finished)

---

## Current State

The pnxt project has completed **Phase 6** (all 9 sprints), delivering the full Agent-Native Programming paradigm prototype. Sprint 9 ("Categorical Frontier") added **categorical tokenization experiment** (42-token vocabulary with morphism composition rules, 3-approach comparison), **self-hosting proof of concept** (pnxt describes, validates, categorizes, and executes its own pipeline as VPIR), **paradigm transition roadmap** (M1-M5 milestones from self-description to self-hosting), and **advisory alignment package** (all 10 advisor concerns addressed). Previously completed: **neurosymbolic bridge** (Sprint 8), **verification maturity** (Sprint 7), **univalence axiom** (Sprint 6), **formal guarantees** (Sprint 5), and **Weather API benchmark MVP** (Sprint 4). Total: **17 formally verified Z3 properties**, 55 test suites, 974+ tests. Advisory panel composite score: **9.2/10** (from 7.5 baseline). Phase 6 focused on integration and deepening — connecting and validating the paradigm pillars together with real-world inputs.

Previously in Sprint 6, delivering **univalence axiom encoding** (proper HoTT univalence: equivalence-to-path mutual inverses with Z3 verification), **transport along paths** (property transfer between equivalent VPIR graphs without re-verification), **LLMbda as semantic foundation** (VPIR nodes carry lambda calculus denotations), and **typed LLMbda ADR** (formal justification for typed over untyped lambda calculus). Previously completed: **formal noninterference proofs** (Z3-backed IFC noninterference verification replacing tree-walk checking), **DPN liveness properties** (progress, deadlock freedom, and fairness verified via bounded model checking in Z3), **covert channel analysis** (structured 3-vector analysis of timing, memory access, and bridge grammar side channels), and **Weather API benchmark MVP** (Sprint 4 — end-to-end paradigm proof: NL→VPIR→HoTT→Z3→DPN��Result). Total: **15 formally verified Z3 properties**, 44 test suites, 817 tests. Phase 6 focuses on integration and deepening — connecting and validating the paradigm pillars together with real-world inputs.

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

| Component | Phase 4 | Phase 5 Sprint 1 | Phase 5 Sprint 2 | Phase 5 Sprint 3 | Phase 5 Sprint 4 | Phase 5 Sprint 5 |
|-----------|---------|-------------------|-------------------|-------------------|-------------------|-------------------|
| Dataflow Process Networks | Absent | Channel\<T\>, Process, DataflowGraph | — | — | Protocol-Channel integration | — |
| Information Flow Control | Absent | SecurityLabel lattice, memory enforcement | ACI + Channel enforcement | Protocol message enforcement | Channel-bound IFC on protocol sessions | KG node labels + HoTT object labels + pipeline propagation |
| VPIR | Absent | VPIRNode types, structural validator | — | Interpreter (execution) + Renderer (visualization) | Parallel wave execution + result caching | Categorical interpretation via HoTT bridge |
| Bridge Grammar | Absent | — | JSON Schema constrained decoding | — | — | — |
| SMT Verification | Absent | — | Z3 invariant verification (4 properties) | — | — | + 2 categorical properties (6 total) |
| NL Protocols | Absent | — | — | 3 protocol state machines (delegation, negotiation, resolution) | Channel transport binding | — |
| Causal Trust | Fixed weights | — | Difficulty-weighted causal scoring | — | — | — |
| HoTT Typed Tokenization | Absent | — | — | — | — | Category, Morphism, Path types + VPIR bridge + KG conversion |
| Tree-sitter DKB | Absent | — | — | — | — | Knowledge graph with typed edges, traversal, HoTT conversion |

| Component | Phase 6 Sprint 1 | Phase 6 Sprint 2 | Phase 6 Sprint 3 |
|-----------|-------------------|-------------------|-------------------|
| Tree-sitter Integration | TypeScript parser → KG | — | — |
| LLM-Driven VPIR | Claude API + Bridge Grammar | — | **Pipeline LLM integration (live Claude API in Code→KG→VPIR→HoTT→Z3)** |
| Integration Pipeline | Code→KG→VPIR→HoTT→Z3 | JSON export option | **LLM-driven VPIR generation with fallback** |
| HoTT Typed Tokenization | — | **2-paths, groupoid structure, univalence, refactoring equivalences** | **N-paths (arbitrary level), truncation levels, n-groupoid structure** |
| SMT Verification | 6 properties | **8 properties (+groupoid inverse, +higher path consistency)** | **10 properties (+n-path coherence, +lambda type safety)** |
| Visualization | — | **Structured JSON export (graph, category, pipeline, trace)** | — |
| Code Quality | — | **Dead abstraction removal, shared error hierarchy** | — |
| LLMbda Calculus | — | — | **Core lambda calculus: terms, types, beta reduction, IFC noninterference, VPIR bridge** |

| Component | Phase 6 Sprint 4 | Phase 6 Sprint 5 | Phase 6 Sprint 6 |
|-----------|-------------------|-------------------|-------------------|
| DPN Runtime | **DPNRuntime: VPIR→DPN compilation + actor execution** | — | — |
| Benchmark | **Weather API Shim MVP (NL→VPIR→HoTT→Z3���DPN→Result)** | — | — |
| Benchmark Harness | **BenchmarkRunner with per-stage timing and reports** | — | — |
| SMT Verification | 10 properties | **14 properties (+noninterference, +progress, +deadlock freedom, +fairness)** | **15 properties (+univalence_axiom)** |
| IFC Formal Proofs | — | **Z3-backed noninterference (replaces tree-walk)** | — |
| Covert Channel Analysis | — | **3-vector analysis (timing, memory, bridge grammar)** | — |
| DPN Liveness | — | **Progress, deadlock freedom, fairness via bounded model checking** | — |
| HoTT Univalence | — | — | **Proper univalence encoding: equivalence↔path, transport, type families** |
| LLMbda Semantic Foundation | — | — | **VPIR nodes carry lambdaSemantics; vpirNodeToLambda + annotateGraphWithSemantics** |
| Architecture Decisions | — | — | **ADR: Typed LLMbda Calculus (IFC, Z3, LLM safety justification)** |

| Component | Phase 6 Sprint 7 |
|-----------|-------------------|
| User-Program Verification | **ProgramVerifier: preconditions, postconditions, invariants, assertions on VPIR programs via Z3** |
| CVC5 Integration | **CVC5Solver (subprocess), MultiSolverVerifier (auto-fallback Z3→CVC5)** |
| DPN Bisimulation | **Strong bisimulation + observational equivalence via partition refinement; HoTT path construction** |
| Benchmarks | **+Multi-agent delegation (3 agents, trust boundaries, IFC), +Secure data pipeline (PII redaction, label propagation)** |
| SMT Verification | **17 properties (+user_precondition, +bisimulation_equivalence)** |
| Transport | **Transported results now use solver: 'transport' instead of 'z3'** |

| Component | Phase 6 Sprint 8 |
|-----------|-------------------|
| Neurosymbolic Bridge | **P-ASP confidence scoring, Active Inference graph patching, refinement pipeline** |
| Bridge Grammar | **Probabilistic refinement loop replacing binary accept/reject** |

| Component | Phase 6 Sprint 9 |
|-----------|-------------------|
| Categorical Tokenization | **42-token vocabulary, morphism composition rules, 3-approach experiment** |
| Self-Hosting | **Pipeline self-description as VPIR, validated + categorized + executed** |
| Paradigm Roadmap | **M1-M5 transition milestones, categorical syntax transition plan** |

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
| Phase 6 Sprint 1 | 29 | ~530 | ~9,600 |
| Phase 6 Sprint 2 | 31 | 570 | ~10,800 |
| Phase 6 Sprint 3 | 34 | 642 | ~12,600 |
| Phase 6 Sprint 4 | 37 | 712 | ~14,200 |
| Phase 6 Sprint 5 | 40 | 767 | ~15,400 |
| Phase 6 Sprint 6 | 44 | 817 | ~16,400 |
| Phase 6 Sprint 7 | 49 | 882 | ~18,100 |
| Phase 6 Sprint 8 | 53 | 932 | ~19,800 |
| Phase 6 Sprint 9 | 55 | 974 | ~21,000 |

---

## Phase 6: Integration & Deepening (Complete)

Phase 6 shifts from "build each pillar" to "connect and validate the pillars together with real-world inputs."

### Sprint 1: Tree-sitter + LLM Integration + End-to-End Pipeline (Complete)

- [x] **Tree-sitter AST Parser Integration** — Parses TypeScript source code into AST via `web-tree-sitter`, extracts functions, classes, interfaces, type aliases, variables, imports and their relationships (calls, contains, imports, extends, implements) into typed KG nodes and edges. `parseFile()` for single files, `parseDirectory()` for multi-file ingestion with cross-file import resolution. Addresses medium-term goal #1.
- [x] **LLM-Driven VPIR Generation** — Claude API integration via `@anthropic-ai/sdk` using Bridge Grammar schemas as tool definitions. `generateVPIRGraph()` sends task descriptions, validates responses through `parseVPIRGraph()`, with retry logic for invalid outputs. Mock client for testing, live API tests gated behind `ANTHROPIC_API_KEY`. Addresses Sutskever's advisory concern about Bridge Grammar practicality.
- [x] **Integrated Code-to-Verified-Reasoning Pipeline** — End-to-end `runIntegrationPipeline()`: Code → Tree-sitter → KG → VPIR → HoTT → Z3. Five-stage pipeline with structured reporting, IFC label propagation, categorical validation at each stage, and timing metrics. Proves paradigm pillars work together on real TypeScript source code.

### Sprint 2: HoTT Higher Paths + Visualization + Cleanup + Z3 Groupoid (Complete)

- [x] **HoTT Higher Paths & Groupoid Structure** — `HigherPath` (2-paths) witnessing equivalences between 1-paths, `inversePath`/`inverseMorphism` for groupoid inverses, `buildGroupoidStructure` and `validateGroupoid` for groupoid law verification, `checkUnivalence` for the univalence axiom (equivalent categories are equal), `Functor` and `CategoryEquivalence` types, `findRefactoringEquivalences` for 3-way refactoring proofs via 2-paths. Category type extended with optional `higherPaths` field (backward compatible). Addresses Voevodsky's "need 2-paths, groupoid structure, univalence" feedback.
- [x] **Structured JSON Visualization** — `exportGraphToJSON` (VPIR graph with topological layer positioning), `exportCategoryToJSON` (HoTT category with objects, morphisms, 1-paths, 2-paths), `exportPipelineToJSON` (pipeline stage flow with connections), `exportTraceToJSON` (execution trace with timeline entries). Web-renderable structured data replacing ASCII-only output. Addresses Kay/Liskov "move beyond ASCII" feedback.
- [x] **Z3 Groupoid Law Verification** — Two new SMT-verified properties: `groupoid_inverse_law` (verifies f∘f⁻¹ = id and f⁻¹∘f = id for all morphisms) and `higher_path_consistency` (verifies 2-paths connect valid 1-paths with matching endpoints). Total: 8 formally verified properties.
- [x] **Code Quality Cleanup** — Removed dead `BehaviorStyle` and `Verbosity` types (set but never branched on). Extracted VPIR error classes (`ACIError`, `AssertionError`, `SubGraphError`, `HandlerError`) from local definitions in `vpir-interpreter.ts` to shared `src/errors/vpir-errors.ts` module.

### Sprint 3: N-Paths + LLM Pipeline + LLMbda Calculus + Z3 Expansion (Complete)

- [x] **HoTT N-Paths Generalization** — `NPath` type supporting arbitrary path levels (1, 2, 3, ..., n), `createNPath`/`addNPath` for validated n-path creation, `composeNPaths` for vertical composition, `horizontalCompose` for whiskering, `truncationLevel`/`isTruncated` for computing n-truncation, `buildNGroupoidStructure`/`validateNGroupoid` for n-groupoid inverse laws at every level. Category type extended with optional `nPaths` field (backward compatible). `validateCategory` extended to check n-path references. Addresses Voevodsky's "need n-paths generalization" gap.
- [x] **Pipeline LLM Integration** — Wired `generateVPIRGraph()` (Claude API via Bridge Grammar) into the integration pipeline as an optional VPIR source. `PipelineOptions.llmGeneration` enables live LLM inference with configurable client, model, and retry count. `serializeKGForLLM()` converts Knowledge Graphs into natural-language prompts for Claude. Graceful fallback to deterministic generation on LLM failure. `PipelineSummary.vpirSource` tracks whether VPIR came from 'llm', 'deterministic', or 'custom'. Addresses Sutskever's "Bridge Grammar empirical validation" concern.
- [x] **LLMbda Calculus Core** — New `src/lambda/` module implementing typed lambda calculus with IFC labels. `createVar`/`createAbs`/`createApp` term constructors, `betaReduce` single-step reduction, `normalize` multi-step normalization, `typeCheck` bidirectional type checking with IFC label propagation, `checkNoninterference` for detecting high→low security flows. `termToVPIR` converts lambda terms to valid VPIR graphs, enabling Lambda→VPIR→HoTT→Z3 roundtrip verification. Type definitions in `src/types/lambda.ts`. Addresses Church's "need pure lambda substrate" advisory gap.
- [x] **Z3 Verification Expansion** — Two new SMT-verified properties: `n_path_coherence` (verifies inverse laws at every n-path level) and `lambda_type_safety` (verifies beta reduction preserves typing). Total: **10 formally verified properties**.

### Sprint 4: Weather API Benchmark MVP — "Paradigm Proof" (Complete)

- [x] **Weather API Shim MVP** �� Full end-to-end paradigm demonstration: natural language query ("What's the weather in Tokyo?") flows through Bridge Grammar → VPIR Graph → HoTT Category → Z3 Verification → DPN Execution → Verified Result. Mock weather tool registered as ACI tool with trust requirements, IFC labels, and capability negotiation. Deterministic VPIR graph factory with 7 nodes (observation, inference, action, assertion). Addresses Kay's "paradigm actualization" and Liskov's "Hello World" gaps.
- [x] **DPN-as-Runtime Elevation** ��� `DPNRuntime` class maps VPIR nodes to DPN Process actors and VPIR edges to typed Channels, executing graphs through actor message-passing instead of direct function calls. Compile step validates VPIR graph, builds process definitions with fan-out support, creates output collector channels for terminal nodes. Full execution trace with per-process state and per-channel statistics. Addresses Milner's "DPN should be the execution paradigm" concern.
- [x] **Benchmark Harness** — `BenchmarkRunner` class with standardized benchmark definitions. Per-stage timing, structured JSON reports, configurable pass/fail criteria, and timeout support. Weather API is first benchmark; harness designed for expansion (Sprint 7 adds more).
- [x] **End-to-End Integration Tests** ��� ~70 new tests covering full pipeline path: tool registration, tool handler, VPIR graph generation, DPN compilation, DPN execution, HoTT categorization, pipeline integration, and benchmark runner integration.

### Sprint 5: Formal Guarantees — Noninterference + Liveness (Complete)

- [x] **Formal Noninterference via Z3** — New `src/verification/z3-noninterference.ts` encoding the noninterference property as an SMT formula: for any two executions differing only in high-security inputs, low-security outputs must be identical. Models lambda terms as state transitions with IFC labels, encodes two parallel executions with identical low inputs but different high inputs, asserts output difference → checks UNSAT. Produces counterexamples on violation. Augments the tree-walk approach in `llmbda.ts:363` with a mathematically rigorous Z3-backed proof. New Z3 property: `ifc_noninterference_proof`. Addresses Myers's "formal noninterference, not just label walks" concern.
- [x] **Covert Channel Analysis** — New `src/verification/covert-channel-analysis.ts` with structured analysis of three covert channel vectors: (1) timing channels in DPN (backpressure timing, process execution timing, channel close timing), (2) memory access patterns in Knowledge Graph (query pattern leakage, cache timing, node enumeration), (3) Bridge Grammar side channels (schema selection leakage, LLM response timing, validation error leakage). Produces `CovertChannelReport` with 9 identified risks, severity ratings, mitigations, and affected components. Configurable analysis with mitigation toggles. Addresses Myers's "covert channels unanalyzed" gap.
- [x] **DPN Liveness/Progress/Fairness via Z3** — New `src/verification/z3-liveness.ts` with three Z3-verified properties using bounded model checking: `dpn_progress` (pending transfers complete within bounded steps), `dpn_deadlock_freedom` (no circular wait via topological ordering — detects cycles with DFS), `dpn_fairness` (every ready process executes within P steps under round-robin scheduling). Includes `buildDependencyGraph()` utility for channel dependency analysis. Addresses Agha's "no liveness/fairness verification" and de Moura's "verification depth" concerns.
- [x] **Z3Context Extension** — Four new methods on `Z3Context` interface: `verifyNoninterference`, `verifyDPNProgress`, `verifyDPNDeadlockFreedom`, `verifyDPNFairness`. Total: **14 formally verified Z3 properties** (from 10).

### Sprint 6: Type Identity — Univalence Axiom + LLMbda Decision (Complete)

- [x] **Univalence Axiom Encoding** — New `src/hott/univalence.ts` implementing true HoTT univalence: `createTypeEquivalence` (validated A ≃ B from category morphisms), `equivalenceToPath` (the ua map: A ≃ B → A = B), `pathToEquivalence` (the inverse: A = B → A ≃ B), `verifyUnivalenceRoundTrip` (pathToEquiv(equivToPath(e)) ≡ e). `applyUnivalence` merges equivalent objects in a category (deduplication via union-find). `findTypeEquivalences` discovers round-trip morphism pairs. Addresses Voevodsky's "univalence axiom not encoded" gap — the "Homotopy" in HoTT is now meaningful.
- [x] **Transport Along Paths** — New `src/hott/transport.ts` implementing the computational content of univalence. `transport(path, typeFamily, value)` moves values P(A) to P(B) along paths A = B. `transportVerificationResult` enables Z3 property transfer between equivalent VPIR graphs without re-verification. `createVerificationTypeFamily` builds type families from verification results. `transportAllVerificationResults` bulk-transports verified properties. This is refactoring correctness: restructuring a VPIR graph preserves all verified properties.
- [x] **LLMbda as Semantic Foundation** — `vpirNodeToLambda()` converts each VPIR node type to its lambda denotation (observation → variable, inference → application, action → abstraction, assertion → predicate application, composition → nested application). `annotateGraphWithSemantics()` populates the new `lambdaSemantics` field on all VPIR nodes. Addresses Church's "calculus is a verification layer, not execution substrate" concern — LLMbda Calculus is now the *meaning* of VPIR.
- [x] **Typed LLMbda Calculus ADR** — New `docs/decisions/typed-llmbda-calculus.md` formally justifying the typed departure from the master prompt's untyped specification. Four pillars: IFC requirement (Myers — compile-time security), Z3 integration (de Moura — decidable queries), LLM safety (Sutskever — boundary validation), subsumption (practical LLM outputs are always typeable). Addresses Church's concern about the typed/untyped decision.
- [x] **Z3 Univalence Verification** — New `src/verification/z3-univalence.ts` encoding univalence as an SMT formula. `verifyUnivalenceAxiom()` on Z3Context checks that path↔equivalence round-trips hold for all equivalence pairs. New property: `univalence_axiom`. Total: **15 formally verified Z3 properties** (from 14).
- [x] **Type Extensions** — `TypeEquivalence`, `PathTerm`, `TypeFamily`, `TypeFamilyValue`, `TransportResult` types in `src/types/hott.ts`. `lambdaSemantics?: LambdaTerm` optional field on `VPIRNode` in `src/types/vpir.ts`. `univalence_axiom` added to `VerificationProperty`.

### Sprint 7: Verification Maturity — User-Program Verification + Bisimulation (Complete)

- [x] **User-Program Property Verification** — New `src/verification/z3-program-verifier.ts` enabling users to specify and verify custom properties on VPIR programs. `ProgramVerifier` class binds VPIR node attributes (trust, classification, confidence, type) to Z3 constants via naming convention `node_<id>_<attr>`. Supports four property kinds: preconditions (root node constraints), postconditions (terminal node guarantees), invariants (hold at every target node), and assertions (specific node checks). SMT-LIB2 formula parser with S-expression support. `toSmtLib2()` generates solver-portable queries. Transitions Z3 from meta-verification to program verification — the key step de Moura flagged.
- [x] **CVC5 Integration** — New `src/verification/cvc5-integration.ts` adding CVC5 as an alternative solver via subprocess (`child_process.spawn`) with SMT-LIB2 on stdin/stdout. `CVC5Solver` class with `check()` and `isAvailable()`. `MultiSolverVerifier` orchestrates both solvers: Z3 mode (native WASM API), CVC5 mode (subprocess), or auto mode (Z3 first with timeout, CVC5 fallback). Same `VerificationResult` type for both — solvers are interchangeable. Graceful degradation when CVC5 binary is absent. Addresses de Moura's multi-solver concern.
- [x] **DPN Bisimulation Checking** — New `src/channel/bisimulation.ts` implementing formal equivalence checking for DPN configurations. `buildLTS()` constructs Labelled Transition Systems from `DataflowGraphDefinition` (BFS state exploration, bounded). `checkStrongBisimulation()` uses Kanellakis-Smolka partition refinement. `checkObservationalEquivalence()` excludes tau actions for weak bisimulation. `toHoTTPath()` converts bisimulation results to HoTT paths via `createTypeEquivalence()` + `equivalenceToPath()`, connecting bisimulation to univalence. Combined with transport (S6), Z3 properties transfer to bisimilar configs without re-verification. Addresses Milner's "no formal equivalence checking" gap.
- [x] **Multi-Agent Delegation Benchmark** — New `src/benchmarks/multi-agent-delegation.ts`. Three agents (researcher trust:3/confidential, assistant trust:2/internal, reviewer trust:4/restricted) coordinate on a research task. 6-node VPIR graph with proper IFC flow: assistant receives only public-level input, confidential data stays with researcher. Exercises trust boundaries, IFC enforcement, and capability negotiation. 5-stage `BenchmarkDefinition` with IFC flow check and trust boundary verification.
- [x] **Secure Data Pipeline Benchmark** — New `src/benchmarks/secure-data-pipeline.ts`. Data flows through ingestion (public) → classification (confidential) → redaction → analysis → declassification gate → output. `analyzePipelineIFC()` traces label progression and detects violations. `verifyRedactionCompleteness()` confirms no PII remains after redaction. 5-stage benchmark with IFC analysis and redaction verification.
- [x] **Type Extensions** — `ProgramProperty`, `ProgramPropertyKind`, `ProgramVerificationResult`, `VerificationConfig` in `src/types/verification.ts`. `VerificationProperty` extended with `user_precondition`, `user_postcondition`, `user_invariant`, `user_assertion`, `bisimulation_equivalence`. `VerificationResult.solver` widened to `'z3' | 'cvc5' | 'transport'`. New `src/types/bisimulation.ts` with `DPNState`, `DPNAction`, `DPNTransition`, `LabelledTransitionSystem`, `BisimulationRelation`, `BisimulationResult`. Transport results now use `solver: 'transport'` instead of `'z3'`.
- [x] **Test Suite** — 5 new test files with 65 new tests: program verifier (18), CVC5 integration (7), bisimulation (18), delegation benchmark (11), pipeline benchmark (11). Total: **49 test suites, 882 tests**.

### Sprint 8: Neurosymbolic Bridge — P-ASP + Active Inference (Complete)

- [x] **P-ASP Integration Prototype** — New `src/neurosymbolic/p-asp.ts` implementing Probabilistic Answer Set Programming for VPIR node confidence scoring. `PASPEngine` scores nodes based on structural validity, semantic coherence, historical accuracy, and constraint satisfaction. Generates weighted valid interpretations for ambiguous nodes. Addresses Pearl's "no neurosymbolic bridge" gap (largest advisory panel deficit at 5.0).
- [x] **Active Inference Engine** — New `src/neurosymbolic/active-inference.ts` implementing free-energy minimization for iterative VPIR graph patching. Identifies high-surprise nodes, generates patch candidates, and applies corrections to minimize prediction error. Oscillation detection prevents infinite refinement loops.
- [x] **Refinement Pipeline** — New `src/neurosymbolic/refinement-pipeline.ts` combining P-ASP confidence scoring with Active Inference patching in an iterative loop. Replaces the binary accept/reject model in bridge grammar with a probabilistic refinement process. Configurable convergence thresholds and maximum iterations.
- [x] **Test Suite** — 4 new test files with ~50 new tests: P-ASP (confidence scoring, interpretation generation), Active Inference (patching, oscillation detection), refinement pipeline (convergence, timeout), weather convergence scenario. Total: **53 test suites, ~932 tests**.

### Sprint 9: Categorical Frontier — Native Tokenization + Self-Hosting Vision (Complete)

- [x] **Categorical Tokenization Experiment** — New `src/experiments/categorical-tokenizer.ts` implementing an alternative tokenization where tokens have categorical structure. 42-token vocabulary covering 7 categories (observation, inference, action, assertion, dataflow, security, composition) with 23 morphism composition rules. `tokenize()` converts VPIR graphs to categorical token sequences, `detokenize()` reconstructs graphs, `isWellFormed()` validates morphism chain integrity, `compareApproaches()` measures three tokenization approaches (baseline JSON, categorical, hybrid) on structural validity, semantic correctness, and composition coherence. Addresses Sutskever's "JSON not categorical" and Voevodsky's "typed tokenization" concerns.
- [x] **Self-Hosting Proof of Concept** — New `src/experiments/self-hosting-poc.ts` demonstrating recursive self-description: pnxt describes its own 6-stage integration pipeline (NL → Bridge Grammar → VPIR → HoTT → Z3 → DPN) as a VPIR graph, then validates, categorizes (HoTT), and executes (DPN) the self-description. `describePipelineAsVPIR()` creates the self-describing graph with proper IFC labels (monotonically increasing trust). `categorizePipelineDescription()` produces a valid HoTT category. `executePipelineDescription()` runs through DPN actor message-passing. Milestone M1 of the paradigm transition roadmap. Addresses Kay's "not actually a new paradigm" concern.
- [x] **Paradigm Transition Roadmap** — New `docs/roadmap/paradigm-transition.md` with five concrete milestones: M1 Self-Description (complete), M2 External Task Expression, M3 LLM-Native Programming, M4 Self-Modification, M5 Self-Hosting. Includes categorical syntax transition plan and open research questions.
- [x] **Advisory Review Alignment Package** — New `docs/reviews/sprint-9-alignment-package.md` mapping all 10 advisors to their concerns, sprint responses, deliverables, and remaining gaps. Per-advisor score trajectory from S3 (7.5) to S9 (9.2). Gap analysis for Phase 7 planning.
- [x] **Type Extensions** — `CategoricalToken`, `CategoricalTokenVocabulary`, `MorphismRule`, `TokenizationResult`, `TokenizationStats`, `ExperimentResult`, `SelfHostingResult` types in `src/types/experiments.ts`.
- [x] **Test Suite** — 2 new test files with 43 new tests: categorical tokenizer (25 — vocabulary, tokenize, detokenize, well-formedness, stats, approach comparison), self-hosting PoC (18 — self-description, validation, categorization, DPN execution, full run). Total: **55 test suites, 974+ tests**.

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
│   │   ├── knowledge-graph.ts   # Knowledge graph types (KGNode, KGEdge, KGQuery) (Sprint 5)
│   │   └── lambda.ts           # LLMbda Calculus types (Variable, Abstraction, Application) (Phase 6 Sprint 3)
│   ├── memory/            # Memory Service
│   │   ├── memory-service.ts  # Three-layer memory model with IFC enforcement
│   │   └── storage-backend.ts # StorageBackend interface, InMemory & File impls
│   ├── aci/               # ACI Gateway
│   │   └── aci-gateway.ts     # ACI gateway with trust + IFC checking, audit logging
│   ├── agent/             # Agent Runtime
│   │   └── agent-runtime.ts   # Agent lifecycle management with channel support
│   ├── bridge-grammar/    # Bridge Grammar (Phase 5 Sprint 2 + Phase 6 Sprint 1)
│   │   ├── vpir-schema.ts         # JSON Schema definitions for VPIR constrained decoding
│   │   ├── schema-validator.ts    # Parse/validate LLM JSON into typed VPIR nodes/graphs
│   │   ├── constrained-output.ts  # LLM schema format converters
│   │   ├── llm-vpir-generator.ts  # Claude API VPIR generation (Phase 6 Sprint 1)
│   │   └── index.ts               # Re-exports
│   ├── hott/              # HoTT Typed Tokenization (Phase 5 Sprint 5 + Phase 6 Sprint 2–3, 6)
│   │   ├── category.ts        # Category operations (compose, identity, validate, addHigherPath, nPath validation)
│   │   ├── vpir-bridge.ts     # VPIR-to-HoTT translation pipeline (+ refactoring equivalences)
│   │   ├── higher-paths.ts    # 2-paths, groupoid structure, univalence (Phase 6 Sprint 2)
│   │   ├── n-paths.ts         # N-paths (arbitrary level), truncation, n-groupoid (Phase 6 Sprint 3)
│   │   ├── univalence.ts      # Univalence axiom encoding, transport paths (Phase 6 Sprint 6)
│   │   └── transport.ts       # Transport along paths, verification result transfer (Phase 6 Sprint 6)
│   ├── knowledge-graph/   # Tree-sitter DKB Knowledge Graph (Phase 5 Sprint 5 + Phase 6 Sprint 1)
│   │   ├── knowledge-graph.ts # Typed graph with traversal and HoTT conversion
│   │   └── ts-parser.ts       # Tree-sitter TypeScript parser → KG (Phase 6 Sprint 1)
│   ├── channel/           # Dataflow Process Networks (Phase 5 + Phase 6 Sprint 4)
│   │   ├── channel.ts         # Channel<T> — typed async FIFO with backpressure & IFC
│   │   ├── process.ts         # Process — actor with typed input/output ports
│   │   ├── dataflow-graph.ts  # DataflowGraph — process composition & wiring
│   │   ├── dpn-runtime.ts     # DPNRuntime — VPIR→DPN compilation + actor execution (Phase 6 Sprint 4)
│   │   └── tracing-channel.ts # TracingChannel — channel decorator for execution observability
│   ├── vpir/              # Verifiable Reasoning (Phase 5 + Phase 6 Sprint 2)
│   │   ├── vpir-validator.ts    # Structural validation for VPIR nodes & graphs
│   │   ├── vpir-interpreter.ts  # VPIR graph execution engine (parallel + cache support)
│   │   ├── vpir-optimizer.ts    # Wave-based parallelism, input hashing, result cache (Sprint 4)
│   │   ├── vpir-renderer.ts     # Text-based VPIR visualization (Phase 5 Sprint 3)
│   │   └── vpir-graph-export.ts # Structured JSON export for web visualization (Phase 6 Sprint 2)
│   ├── protocol/          # Natural Language Protocols (Phase 5 Sprint 3–4)
│   │   ├── nl-protocol.ts       # Protocol state machines for agent communication
│   │   └── protocol-channel.ts  # Protocol sessions over DPN channels (Sprint 4)
│   ├── verification/      # Formal Verification (Phase 5 Sprint 2 + Phase 6 Sprint 5–6)
│   │   ├── z3-invariants.ts          # Z3 SMT invariant verification (15 properties)
│   │   ├── z3-noninterference.ts     # Z3 noninterference proof encoding (Phase 6 Sprint 5)
│   │   ├── z3-liveness.ts            # Z3 DPN progress, deadlock, fairness (Phase 6 Sprint 5)
│   │   ├── z3-univalence.ts          # Z3 univalence axiom verification (Phase 6 Sprint 6)
│   │   ├── covert-channel-analysis.ts # 3-vector covert channel analysis (Phase 6 Sprint 5)
│   │   └── index.ts                  # Re-exports
│   ├── capability/        # Capability Negotiation
│   │   └── capability-negotiation.ts  # Versioned capability discovery
│   ├── trust/             # Trust Engine
│   │   ├── trust-engine.ts    # Graduated trust model with fixed-weight scoring
│   │   └── causal-trust.ts    # Causal trust scorer with difficulty weighting
│   ├── lambda/            # LLMbda Calculus (Phase 6 Sprint 3)
│   │   └── llmbda.ts          # Typed lambda calculus with IFC, beta reduction, VPIR bridge
│   ├── errors/            # Shared error classes (Phase 6 Sprint 2)
│   │   └── vpir-errors.ts     # VPIR execution error hierarchy
│   ├── benchmarks/        # Paradigm Benchmarks (Phase 6 Sprint 4)
│   │   ├── weather-api-shim.ts    # Weather API end-to-end benchmark MVP
│   │   └── benchmark-runner.ts    # Standardized benchmark harness
│   └── evaluation/        # Validation & Evaluation
│       ├── multi-agent-scenarios.ts   # Coordination scenarios
│       ├── benchmark-suite.ts         # Benchmark framework
│       ├── security-suite.ts          # Security test suite
│       └── integration-pipeline.ts    # Code→KG→VPIR→HoTT→Z3 pipeline (Phase 6 Sprint 1)
├── docs/
│   ├── decisions/
│   │   └── typed-llmbda-calculus.md   # ADR: typed vs. untyped LLMbda Calculus (Phase 6 Sprint 6)
│   └── research/
│       ├── original-prompt.md
│       ├── Designing Agent-Native Programming Paradigm.md
│       └── phase-3/          # Phase 3 research deliverables
└── website/               # Astro Starlight documentation site
```
