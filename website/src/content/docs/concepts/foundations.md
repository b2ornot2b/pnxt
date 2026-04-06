---
title: Theoretical Foundations
description: The mathematical and theoretical underpinnings of the Agent-Native Programming paradigm.
---

pnxt's design rests on rigorous theoretical foundations spanning category theory, formal verification, process algebra, and information-flow control. These aren't academic exercises — each directly addresses a concrete problem in LLM-driven programming.

---

## Typed Tokenization (HoTT)

**Problem**: LLMs process flat token sequences, losing structural information about code.

**Solution**: Represent code as categorical objects using Homotopy Type Theory (HoTT). Programs become:

- **Objects** — Types, functions, modules
- **Morphisms** — Transformations between types
- **Paths** — Proofs of equivalence between implementations

This enables LLMs to manipulate code at a semantic level rather than a syntactic one. Two programs that compute the same result are provably equivalent paths in the type space.

---

## VPIR (Verifiable Programmatic Intermediate Representation)

**Problem**: LLM reasoning is opaque — there's no way to verify that each step logically follows from the last.

**Solution**: VPIR forces reasoning chains where every step is mechanically verifiable:

- Every operation is a **typed, idempotent operator**
- Logical constraints are separated from execution
- Each step carries a proof certificate that can be checked independently
- The full chain forms a verifiable trace from inputs to outputs

VPIR enables **trust without blind faith** — you can verify the reasoning, not just the result.

---

## Dataflow Process Networks (DPN)

**Problem**: Imperative loops require tracking mutable state across iterations — something LLMs handle poorly.

**Solution**: Model execution as a Dataflow Process Network where:

- The LLM defines **actors** (processing nodes)
- Actors communicate solely via **non-blocking unidirectional FIFO channels**
- No shared mutable state — each actor owns its local state
- Execution is inherently parallel and deterministic

This eliminates the loop-state tracking problem entirely. Instead of `for i in range(n): accumulate(state)`, you define data transformations that flow through a directed graph.

---

## LLMbda Calculus (IFC)

**Problem**: LLMs are vulnerable to prompt injection — malicious inputs that hijack the model's behavior.

**Solution**: A typed lambda calculus enriched with Information Flow Control (IFC):

- Every value carries a **security label** (e.g., `trusted`, `user-input`, `untrusted`)
- Information can flow from low to high security but **never from high to low**
- Mathematical **noninterference guarantee**: untrusted inputs cannot influence trusted outputs
- Typing enables compile-time IFC checking, decidable Z3 queries, and LLM boundary validation
- Provides formal protection against prompt injection at the calculus level

:::note
The original research prompt specified untyped lambda calculus. The project adopted a typed variant per an [Architecture Decision Record](https://github.com/b2ornot2b/pnxt/blob/main/docs/decisions/typed-llmbda-calculus.md) — typed calculus enables IFC enforcement, Z3 integration, and safer LLM interaction while subsuming practical untyped usage.
:::

---

## SMT Solvers

**Problem**: LLMs generate plausible but potentially incorrect code — there's no automatic way to check constraints.

**Solution**: Integrate SMT solvers (Z3, CVC5) into the execution pipeline:

- Atomic claims are **autoformalized** into first-order logic
- The solver evaluates whether constraints are satisfiable
- Type invariants, preconditions, and postconditions are checked mechanically
- Neurosymbolic refinement bridges stochastic tokens to deterministic proofs

---

## Bridge Grammar

**Problem**: Standard autoregressive transformers output text tokens, but this system requires typed graphs.

**Solution**: A constrained-decoding grammar — a strict JSON schema that forces LLMs to output valid VPIR nodes:

- Every LLM output must conform to the Bridge Grammar schema
- Invalid outputs are structurally impossible (not just unlikely)
- The grammar defines the complete set of valid VPIR node types
- Translation pipeline converts Bridge Grammar JSON → HoTT morphisms → SMT constraints

---

## Tree-sitter DKB Knowledge Graph

**Problem**: Codebases stored as flat files lose structural relationships between components.

**Solution**: Store the codebase as a non-Euclidean knowledge graph using Tree-sitter for parsing:

- Code is parsed into AST nodes and stored as graph vertices
- Dependencies, call chains, and type relationships are graph edges
- Geometric Deep Learning (GNNs) reads and reasons about the graph structure
- Queries are semantic ("functions that handle authentication") not syntactic (`grep -r "auth"`)

---

## Adjacent Sciences

Several additional fields inform the design:

| Field | Application |
|-------|-------------|
| **Geometric Deep Learning (GNNs)** | Reading and reasoning about the code knowledge graph |
| **Probabilistic ASP (P-ASP)** | Bridging stochastic LLM tokens to deterministic solver inputs |
| **Active Inference** | Driving automated graph patching and self-repair |

---

## Further Reading

- [Original Research Prompt](https://github.com/b2ornot2b/pnxt/blob/main/docs/research/original-prompt.md) — The master prompt defining the full theoretical vision
- [Core ANP Design Document](https://github.com/b2ornot2b/pnxt/blob/main/docs/research/Designing%20Agent-Native%20Programming%20Paradigm.md) — Comprehensive introduction to ANP
