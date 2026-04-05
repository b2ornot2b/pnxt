# Paradigm Transition Roadmap

> **Created**: 2026-04-05 (Phase 6 Sprint 9)
> **Author**: Advisory Panel alignment — Alan Kay, Ilya Sutskever, Vladimir Voevodsky
> **Status**: Living document — updated each phase

---

## 1. Current State Assessment

### What pnxt Is Today

pnxt is a **TypeScript research prototype** implementing the core concepts of the Agent-Native Programming paradigm:

- **VPIR**: Verifiable reasoning graphs with IFC security labels
- **HoTT**: Categorical type theory with univalence, transport, and n-paths
- **DPN**: Actor-based execution through typed channels
- **Z3/CVC5**: 17 formally verified SMT properties
- **Bridge Grammar**: JSON schema constrained decoding for LLM output
- **LLMbda Calculus**: Typed lambda calculus as semantic foundation
- **Neurosymbolic Bridge**: P-ASP confidence scoring and Active Inference patching

The system has been validated through three end-to-end benchmarks (Weather API, multi-agent delegation, secure data pipeline), with 55 test suites and 974+ tests.

### What pnxt Is Not Yet

- **Not a programming environment**: Developers write TypeScript, not VPIR
- **Not self-hosting**: The system cannot modify or extend itself using its own tools
- **Not natively categorical**: Tokenization uses standard string tokens with categorical metadata, not native categorical token representations
- **Not production-ready**: Research prototype quality — correctness over performance

---

## 2. Minimum Viable Self-Hosting

**Definition**: pnxt can define, verify, and execute a non-trivial computation using only pnxt primitives (VPIR + DPN + HoTT + Z3), without requiring the developer to write TypeScript.

**Scope**: A single end-to-end task (e.g., "process a data file") expressed entirely in VPIR, executed through DPN, verified by Z3, with results transported via HoTT univalence.

**Validation criteria**:
1. Task is expressed as a VPIR graph (no TypeScript)
2. Graph passes Z3 verification (preconditions, postconditions, invariants)
3. Graph executes through DPN runtime (actor message-passing)
4. Results are categorically validated (HoTT categorical laws hold)
5. An LLM can generate the VPIR graph from a natural language description

---

## 3. Transition Milestones

### M1: Self-Description (Sprint 9 — Complete)

**Goal**: pnxt describes its own integration pipeline as a VPIR graph.

**Deliverable**: `describePipelineAsVPIR()` creates a 6-node VPIR graph representing the NL → Bridge Grammar → VPIR → HoTT → Z3 → DPN pipeline. The self-description is validated, categorized, and executed using the same tools it describes.

**Significance**: Proves recursive self-reference — the system can reason about itself using its own tools. This is the foundation for all subsequent milestones.

### M2: External Task Expression

**Goal**: A real-world task expressed entirely in VPIR, with no TypeScript required.

**Scope**: Define a task (e.g., "fetch weather data, convert units, validate result") as a VPIR graph. The graph is authored by specifying nodes, edges, and properties — not by writing code.

**Requirements**:
- VPIR graph editor or authoring tool (could be LLM-driven)
- ACI tool registry for external integrations
- Complete handler library for common operations

**Phase**: 7 (early)

### M3: LLM-Native Programming

**Goal**: An LLM uses pnxt to solve a problem end-to-end, from natural language to verified result.

**Scope**: Given a task description, an LLM generates a VPIR graph (via Bridge Grammar), the graph is verified (Z3), categorized (HoTT), and executed (DPN), all without human intervention.

**Requirements**:
- Reliable Bridge Grammar constrained decoding
- Neurosymbolic refinement loop (P-ASP + Active Inference)
- Error recovery and retry logic
- Confidence thresholds for autonomous operation

**Phase**: 7 (mid)

### M4: Self-Modification

**Goal**: pnxt modifies its own pipeline through VPIR.

**Scope**: The system generates a VPIR graph that describes a modification to one of its own components (e.g., "add a caching layer to the VPIR interpreter"), verifies the modification preserves correctness, and applies it.

**Requirements**:
- Self-description (M1) as a mutable VPIR graph
- Diff/patch semantics for VPIR graphs
- Verification that modifications preserve existing properties (transport via univalence)
- Rollback capability on verification failure

**Phase**: 7 (late)

### M5: Self-Hosting

**Goal**: pnxt's core components are expressed in pnxt.

**Scope**: The VPIR validator, DPN runtime, or Bridge Grammar parser is itself described and executed as a VPIR graph. The system bootstraps — it uses its own tools to run its own tools.

**Requirements**:
- All M1-M4 milestones complete
- Performance adequate for recursive self-execution
- Formal proof that self-hosting preserves system properties
- Escape hatch to TypeScript for bootstrapping edge cases

**Phase**: 8+

---

## 4. Categorical Syntax Transition

### When to Abandon Human-Readable Syntax

The transition from "TypeScript library with categorical metadata" to "native categorical representation" should happen when:

1. **Categorical tokenization is empirically validated** — Sprint 9's experiment measures whether transformers can operate on categorical token sequences. If results are positive, proceed.
2. **LLMs can generate categorical tokens** — The Bridge Grammar must produce categorical tokens, not just JSON.
3. **Tooling exists** — Visualization, debugging, and editing tools for categorical representations.
4. **Performance is acceptable** — Categorical tokenization must not be prohibitively slower than JSON.

### The Role of Bridge Grammar During Transition

```
Phase 6-7: LLM → JSON Schema → VPIR (current)
Phase 7-8: LLM → JSON Schema + Categorical Metadata → VPIR (hybrid)
Phase 8+:  LLM → Categorical Tokens → VPIR (native)
```

The Bridge Grammar evolves from a JSON template filler to a categorical constraint engine. During transition, both modes coexist — the hybrid approach (M2 sprint 9 experiment) provides categorical structure metadata alongside JSON for graceful degradation.

### How the Sprint 9 Experiment Informs the Timeline

The categorical tokenization experiment (Sprint 9) compares three approaches:

| Approach | Structural Validity | Semantic Correctness | Composition Coherence |
|----------|-------------------|--------------------|-----------------------|
| Baseline (JSON) | Perfect | Perfect | N/A (no constraints) |
| Categorical | Measured | Measured | Measured |
| Hybrid | Perfect | Perfect | Measured |

If the **hybrid approach** shows high composition coherence with no loss of structural validity, the transition path is clear: add categorical metadata incrementally, then eventually drop JSON in favor of native categorical tokens.

If the **categorical approach** shows significant structural or semantic loss, the transition requires more research into transformer architectures that can learn categorical token embeddings (Phase 8+ research).

---

## 5. Open Research Questions

### Can transformers learn categorical token embeddings?

Current transformers learn token embeddings in a continuous vector space. Categorical tokens have discrete algebraic structure (composition rules, identity laws). Can these be encoded as embedding constraints? Possible approaches:
- Structured regularization during fine-tuning
- Compositional embedding architectures (e.g., tensor product representations)
- Hybrid discrete-continuous representations

### What is the minimum viable category for useful computation?

Full HoTT with univalence and n-paths may be more structure than needed for practical programming. What is the minimal categorical structure required for:
- Correct composition (morphism laws)?
- Refactoring equivalence (paths)?
- Security verification (IFC labels as functors)?

### How does self-hosting affect verification?

If the Z3 verifier is itself described as a VPIR graph, can it verify itself? This raises Godelian concerns — a system cannot fully verify its own consistency. Practical approaches:
- Verify specific properties, not full consistency
- Use an external verifier for the self-describing verifier
- Accept bounded verification (verify within n steps)

### Can DPN replace imperative execution entirely?

The DPN runtime currently handles VPIR graph execution well. But can it also handle:
- Recursive computations (self-referential VPIR graphs)?
- Real-time constraints (bounded latency guarantees)?
- Distributed execution (multi-node actor systems)?

### What is the role of Active Inference in self-modification?

Active Inference (Sprint 8) provides iterative graph patching. In a self-hosting context, Active Inference could:
- Automatically refine self-descriptions that fail verification
- Discover optimizations in the pipeline structure
- Adapt the system to new domains without manual reconfiguration
