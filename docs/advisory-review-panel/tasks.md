# Advisory Review Panel -- Task Tracker

> Last updated: 2026-04-05

This file tracks the prioritized list of topics for the Advisory Review Panel to review. Tasks are updated as reviews are completed.

---

## Priority 1: Foundational

| # | Topic | Status | Date Reviewed |
|---|-------|--------|---------------|
| 1 | [Bridge Grammar & VPIR Specification](#1-bridge-grammar--vpir-specification) | Pending | -- |
| 2 | [Memory Architecture: From Keyword to Semantic](#2-memory-architecture-from-keyword-to-semantic) | Pending | -- |
| 3 | [Trust Model Refinement](#3-trust-model-refinement) | Pending | -- |

## Priority 2: Architectural

| # | Topic | Status | Date Reviewed |
|---|-------|--------|---------------|
| 4 | [Dataflow Process Network Adoption Strategy](#4-dataflow-process-network-adoption-strategy) | Pending | -- |
| 5 | [Tree-sitter DKB Knowledge Graph Strategy](#5-tree-sitter-dkb-knowledge-graph-strategy) | Pending | -- |
| 6 | [Natural Language Protocol Design](#6-natural-language-protocol-design) | Pending | -- |

## Priority 3: Advanced

| # | Topic | Status | Date Reviewed |
|---|-------|--------|---------------|
| 7 | [LLMbda Calculus & IFC Implementation Scope](#7-llmbda-calculus--ifc-implementation-scope) | Pending | -- |
| 8 | [SMT Solver Integration Strategy](#8-smt-solver-integration-strategy) | Pending | -- |
| 9 | [Implementation-Theory Divergence Audit](#9-implementation-theory-divergence-audit) | Pending | -- |
| 10 | [Multi-Agent Orchestration at Scale](#10-multi-agent-orchestration-at-scale) | Pending | -- |

---

## Task Details

### 1. Bridge Grammar & VPIR Specification

**Priority**: Foundational | **Status**: Pending

The linchpin connecting LLMs to the paradigm. The entire system depends on LLMs outputting valid typed graph nodes via constrained decoding.

**Key questions for the panel**:
- How constrained should the VPIR grammar be? (strict JSON schema vs. custom DSL vs. multiple formats)
- What are the tradeoffs between constraint strictness and expressiveness?
- What does an MVP Bridge Grammar look like?
- How should mechanical verification be scoped?

**Primary advisors**: Sutskever (LLM feasibility), de Moura (verification), Milner (process semantics)

---

### 2. Memory Architecture: From Keyword to Semantic

**Priority**: Foundational | **Status**: Pending

Current memory service uses placeholder keyword matching. The theory calls for vector embeddings and semantic similarity.

**Key questions for the panel**:
- Vector embedding strategy and vendor selection
- Consolidation algorithm (topic modeling, LLM-driven summarization, Active Inference?)
- Decay/forgetting semantics -- when should agents forget?
- Cross-agent memory sharing permissions and privacy guarantees

**Primary advisors**: Pearl (causal reasoning in memory), Liskov (abstraction boundaries), Sutskever (embedding models)

---

### 3. Trust Model Refinement

**Priority**: Foundational | **Status**: Pending

The 5-level graduated model is implemented but heuristic-based. The theory promises formal guarantees via SMT solvers.

**Key questions for the panel**:
- Are 5 discrete levels sufficient, or is continuous scoring needed?
- How should metric weightings be calibrated across agent types?
- How do multi-dimensional trust and capability constraints interact?
- What are the right escalation triggers and thresholds?

**Primary advisors**: Myers (security boundaries), de Moura (formal guarantees), Agha (agent trust)

---

### 4. Dataflow Process Network Adoption Strategy

**Priority**: Architectural | **Status**: Pending

Current runtime is imperative request-response; the vision is actor-based FIFO channels. Fundamental execution model shift.

**Key questions for the panel**:
- Incremental migration path from imperative to actor model
- Channel semantics and backpressure handling
- Deadlock detection and prevention strategies
- Debugging and observability for concurrent systems

**Primary advisors**: Milner (process calculi), Agha (actor model), Kay (paradigm design)

---

### 5. Tree-sitter DKB Knowledge Graph Strategy

**Priority**: Architectural | **Status**: Pending

Moving from flat files to non-Euclidean graph storage. Major architectural commitment.

**Key questions for the panel**:
- Graph data model choice (property graph, hyperbolic, simplicial complex?)
- Query language selection (Cypher, Gremlin, custom?)
- Incremental adoption via hybrid flat + graph storage
- Integration with memory service and update semantics for live codebases

**Primary advisors**: Pearl (graphical models), Voevodsky (categorical structure), Liskov (practical adoption)

---

### 6. Natural Language Protocol Design

**Priority**: Architectural | **Status**: Pending

Agent-to-agent communication format is completely unspecified. Critical for multi-agent coordination.

**Key questions for the panel**:
- Structured vs. free-form language tradeoffs
- Error recovery and clarification mechanisms
- Negotiation and disagreement resolution patterns
- Precedents from MCP/LSP and other protocol standards

**Primary advisors**: Church (formal semantics), Milner (communication calculi), Liskov (interface design)

---

### 7. LLMbda Calculus & IFC Implementation Scope

**Priority**: Advanced | **Status**: Pending

The theoretical crown jewel of the paradigm. Lambda calculus with Information Flow Control for noninterference guarantees.

**Key questions for the panel**:
- Full noninterference or pragmatic subset?
- Static analysis vs. runtime verification
- Performance implications of formal verification
- Integration path with SMT solvers

**Primary advisors**: Church (lambda calculus), Myers (IFC), de Moura (verification)

---

### 8. SMT Solver Integration Strategy

**Priority**: Advanced | **Status**: Pending

When and how to invoke Z3/CVC5 for constraint satisfaction and formal verification.

**Key questions for the panel**:
- Per-action vs. batch vs. offline verification
- Constraint language choice (SMT-LIB 2.0, domain-specific?)
- Latency vs. correctness tradeoffs
- Interaction with agent reasoning (steering vs. validation)

**Primary advisors**: de Moura (Z3 creator), Myers (security constraints), Pearl (constraint modeling)

---

### 9. Implementation-Theory Divergence Audit

**Priority**: Advanced | **Status**: Pending

Meta-review of the 6 working prototypes against Phase 3 research specifications.

**Key questions for the panel**:
- Are current abstractions (trust dimensions, capability constraints, ACI layers) faithful to theory?
- Have pragmatic shortcuts introduced architectural drift?
- Which divergences are acceptable and which must be corrected?
- What is the cost of realigning vs. accepting deviations?

**Primary advisors**: Kay (paradigm vision), Voevodsky (theoretical purity), Liskov (practical tradeoffs)

---

### 10. Multi-Agent Orchestration at Scale

**Priority**: Advanced | **Status**: Pending

Enterprise deployment topologies, governance, and federation.

**Key questions for the panel**:
- Cross-organization agent trust and federation
- Audit and governance at enterprise scale
- Standards and interoperability
- Deployment topology recommendations

**Primary advisors**: Agha (distributed agents), Myers (security at scale), Kay (systems thinking)

---

## Completed Reviews

_No reviews completed yet._
