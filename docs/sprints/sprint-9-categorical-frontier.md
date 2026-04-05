# Sprint 9: "Categorical Frontier" — Native Tokenization + Self-Hosting Vision

> **Phase**: 6, Sprint 9
> **Priority**: P3
> **Primary Advisors**: Ilya Sutskever, Vladimir Voevodsky, Alan Kay
> **Prerequisite**: Sprint 8 complete
> **Score Target**: 9.0 → 9.2

---

## 1. Sprint Goal

Address the deepest, most ambitious gaps in the advisory panel's assessment. These are research experiments, not production features — they plant the seeds for Phase 7 and beyond. The central question: can we move from "a TypeScript library that implements paradigm concepts" toward "an environment where LLMs actually program differently"?

---

## 2. Alignment Gaps Addressed

### Ilya Sutskever — Native Categorical Tokenization
> *"Does this align with how attention and representation actually work in transformers?"*

The bridge grammar forces LLMs to output valid VPIR via constrained JSON decoding. This is pragmatic but treats transformers as structured-output generators. The original vision imagines LLMs operating in a representation space that's natively categorical — tokens as categorical objects, attention as morphism composition. The gap between "LLM fills JSON templates" and "LLM operates in categorical token space" is the central unfulfilled promise. This sprint runs the experiment.

### Vladimir Voevodsky — Typed Tokenization Reality
> *"Is this construction invariant under equivalence?"*

With univalence encoded (S6) and transport working, the HoTT layer is mathematically rigorous. But "Typed Tokenization" — the first pillar of the master prompt — envisions tokens themselves as categorical objects. The current tokenizer uses standard string tokens. Can we make the "typed" in typed tokenization literal?

### Alan Kay — Self-Hosting & Paradigm Actualization
> *"Are we actually inventing a new paradigm, or just rearranging the furniture of the old one?"*

The system is a TypeScript library organized as conventional files, executed by Node.js, tested by Jest. This is expected for a prototype. But the question remains: where is the self-hosting story? When does pnxt eat its own dog food? This sprint demonstrates recursive self-description as a proof of concept.

---

## 3. Deliverables

### 3.1 Native Categorical Tokenization Experiment
**File**: `src/experiments/categorical-tokenizer.ts`

A research prototype exploring an alternative tokenization where tokens have categorical structure:

```typescript
interface CategoricalToken {
  /** The token's identity in the categorical universe. */
  id: string;
  /** The category this token belongs to. */
  category: CategoryId;
  /** Morphisms this token can compose with. */
  composableMorphisms: MorphismId[];
  /** HoTT path-equivalence class. */
  equivalenceClass: string;
}

interface CategoricalTokenizer {
  /**
   * Tokenize a VPIR graph into categorical tokens.
   * Each token is not a string but a categorical object
   * with morphism structure.
   */
  tokenize(graph: VPIRGraph): CategoricalToken[];

  /**
   * Detokenize: reconstruct VPIR from categorical tokens.
   * Valid iff token sequence respects morphism composition rules.
   */
  detokenize(tokens: CategoricalToken[]): VPIRGraph;

  /**
   * Check if a token sequence is categorically well-formed:
   * each adjacent pair connected by a valid morphism.
   */
  isWellFormed(tokens: CategoricalToken[]): boolean;
}
```

**Experiment design**:
1. Define a small vocabulary (~50 categorical tokens) covering the Weather API benchmark
2. Tokenize the Weather API VPIR graph using categorical tokens
3. Compare three approaches on the benchmark:
   - **Baseline**: Standard JSON schema forcing (current bridge grammar)
   - **Categorical**: Tokens as categorical objects with morphism constraints
   - **Hybrid**: JSON schema forcing with categorical structure metadata
4. Measure: structural validity rate, semantic correctness, composition coherence
5. Document results regardless of outcome — negative results are valuable

**Important**: This is explicitly an experiment. It may demonstrate that native categorical tokenization is infeasible with current transformer architectures, or it may reveal a viable path. Either result advances the project.

### 3.2 Self-Hosting Proof of Concept
**File**: `src/experiments/self-hosting-poc.ts`

Demonstrate pnxt describing its own pipeline in pnxt:

```typescript
interface SelfHostingPoC {
  /**
   * Describe the pnxt integration pipeline itself as a VPIR graph.
   * Each pipeline stage becomes a VPIR node:
   *   NL Input → Bridge Grammar → VPIR Generation →
   *   HoTT Categorization → Z3 Verification → DPN Execution
   */
  describePipelineAsVPIR(): VPIRGraph;

  /**
   * Verify the pipeline description using the pipeline itself.
   * The Z3 verifier verifies the graph that describes the verifier.
   */
  verifyPipelineDescription(graph: VPIRGraph): Promise<VerificationResult>;

  /**
   * Categorize the pipeline description using HoTT.
   * The categorical structure captures the pipeline's own structure.
   */
  categorizePipelineDescription(graph: VPIRGraph): Category;

  /**
   * Execute the pipeline description through DPN.
   * The DPN runtime executes the graph that describes DPN execution.
   */
  executePipelineDescription(graph: VPIRGraph): Promise<ExecutionResult>;
}
```

This is not full self-hosting — pnxt is still written in TypeScript. But it demonstrates **recursive self-description**: the system can reason about itself using its own tools. This is the first step toward the self-hosting vision:

1. ~~pnxt can describe its own pipeline~~ ← **This sprint**
2. pnxt can modify its own pipeline description ← **Phase 7**
3. pnxt can execute modifications to itself ← **Phase 7+**
4. pnxt is written in pnxt ← **Long-term vision**

### 3.3 Paradigm Transition Roadmap
**File**: `docs/roadmap/paradigm-transition.md`

The document Alan Kay has been asking for — a concrete plan for how the system transitions from prototype to paradigm:

**Section 1: Current State Assessment**
- What pnxt is today: a TypeScript research prototype implementing paradigm concepts
- What pnxt is not yet: a programming environment where LLMs program differently

**Section 2: Minimum Viable Self-Hosting**
- Definition: pnxt can define, verify, and execute a non-trivial computation using only pnxt primitives (VPIR + DPN + HoTT + Z3), without requiring the developer to write TypeScript
- Scope: a single end-to-end task (e.g., "process a data file") expressed entirely in VPIR, executed through DPN, verified by Z3

**Section 3: Transition Milestones**
- M1: Self-description (this sprint) — pnxt describes its own pipeline
- M2: External task expression — a real task expressed entirely in VPIR (no TypeScript)
- M3: LLM-native programming — an LLM uses pnxt to solve a problem end-to-end
- M4: Self-modification — pnxt modifies its own pipeline through VPIR
- M5: Self-hosting — pnxt's core components are expressed in pnxt

**Section 4: Categorical Syntax Transition**
- When to abandon human-readable syntax in favor of categorical representation
- The role of the bridge grammar during transition (bridge → native)
- How the tokenization experiment (3.1) informs this timeline

**Section 5: Open Research Questions**
- Can transformers learn categorical token embeddings?
- What is the minimum viable category for useful computation?
- How does self-hosting affect verification (can the verifier verify itself)?

### 3.4 Final Advisory Review Package
**File**: `docs/reviews/sprint-9-alignment-package.md`

Comprehensive review preparation:

| Advisor | Original Concern | Sprint Addressed | Deliverable | Remaining Gap |
|---------|-----------------|-----------------|-------------|---------------|
| Voevodsky | No univalence | S6 | `univalence.ts` | Full ∞-groupoid |
| Church | Typed vs untyped | S6 | ADR | — |
| Milner | DPN not central | S4, S7 | `dpn-runtime.ts`, `bisimulation.ts` | Full DPN OS |
| Agha | No liveness | S5 | `z3-liveness.ts` | Unbounded verification |
| Myers | No formal proofs | S5 | `z3-noninterference.ts` | — |
| de Moura | Infrastructure only | S7 | `z3-program-verifier.ts` | — |
| Sutskever | JSON not categorical | S9 | `categorical-tokenizer.ts` | Native integration |
| Liskov | No Hello World | S4, S7 | 3 benchmarks | — |
| Pearl | No neurosymbolic | S8 | `p-asp.ts`, `active-inference.ts` | Production maturity |
| Kay | Not a paradigm yet | S4, S9 | `self-hosting-poc.ts`, roadmap | Full self-hosting |

Gap analysis for Phase 7 planning.

---

## 4. Acceptance Criteria

| # | Criterion | Advisor | Verification |
|---|-----------|---------|-------------|
| 1 | Categorical tokenization experiment produces measurable results | Sutskever | Comparison data for 3 approaches |
| 2 | Token-as-category-object prototype demonstrates feasibility | Voevodsky | `isWellFormed` validates morphism chains |
| 3 | pnxt describes its own pipeline as a VPIR graph | Kay | `describePipelineAsVPIR()` returns valid graph |
| 4 | Pipeline self-description verified by Z3 | Kay | Z3 verification passes on self-description |
| 5 | Paradigm transition roadmap with concrete milestones | Kay | Document with M1-M5 milestones |
| 6 | All 10 advisor concerns have documented responses | All | Alignment package complete |

---

## 5. Technical Dependencies

- `src/benchmarks/weather-api-shim.ts` (from S4) — experiment baseline
- `src/hott/univalence.ts` (from S6) — categorical structure for tokens
- `src/channel/dpn-runtime.ts` (from S4) — self-hosting DPN execution
- `src/verification/z3-program-verifier.ts` (from S7) — self-description verification
- `src/neurosymbolic/refinement-pipeline.ts` (from S8) — enhanced pipeline for experiment

---

## 6. Expected Score Impact

| Advisor | Before | After | Rationale |
|---------|--------|-------|-----------|
| Sutskever | 8.0 | 8.5 | Experiment demonstrates direction; native categorical is Phase 7+ |
| Voevodsky | 9.0 | 9.5 | Tokenization connects to HoTT properly |
| Kay | 7.5 | 8.5 | Self-hosting PoC + transition plan; full self-hosting is Phase 7+ |
| **Composite** | **9.0** | **9.2** | **+0.2** |

---

## 7. Risk Mitigation

**Risk**: Categorical tokenization experiment produces inconclusive or negative results.
**Mitigation**: Frame as a research contribution regardless of outcome. Negative results (e.g., "current transformers cannot learn categorical token embeddings efficiently") are valuable — they bound the problem space and inform Phase 7 research direction. Document findings thoroughly.

**Risk**: Self-hosting PoC is trivially circular (describing the pipeline is just creating VPIR nodes).
**Mitigation**: Ensure the self-description is *verified and executed*, not just constructed. The pipeline describing itself must pass the same Z3 verification and DPN execution as any other VPIR graph. This makes the self-reference non-trivial.

---

## 8. Definition of Done

- [ ] Categorical tokenizer prototype with ~50 token vocabulary
- [ ] Experiment results comparing 3 tokenization approaches
- [ ] Self-hosting PoC: pipeline described, verified, and executed as VPIR
- [ ] Paradigm transition roadmap with M1-M5 milestones
- [ ] Advisory review alignment package with all 10 advisors addressed
- [ ] ~30 new tests, all passing
- [ ] `npm test`, `npm run typecheck`, `npm run lint` all pass
- [ ] Final advisory review: full panel re-assessment targeting 9.0+
