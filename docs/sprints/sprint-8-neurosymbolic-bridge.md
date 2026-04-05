# Sprint 8: "Neurosymbolic Bridge" — P-ASP + Active Inference

> **Phase**: 6, Sprint 8
> **Priority**: P3
> **Primary Advisors**: Judea Pearl, Ilya Sutskever, Leonardo de Moura
> **Prerequisite**: Sprint 7 complete
> **Score Target**: 8.8 → 9.0

---

## 1. Sprint Goal

Address the largest theoretical gap identified by the advisory panel: the missing probabilistic-to-deterministic bridge. Currently, LLM output is either accepted (valid VPIR) or rejected (fallback to deterministic generation). There is no probabilistic middle ground for iterative refinement. This sprint delivers a research prototype — not production maturity — of the neurosymbolic bridge.

---

## 2. Alignment Gaps Addressed

### Judea Pearl — Neurosymbolic Bridge (LARGEST GAP)
> *"What is the causal model here, and are we conflating correlation with mechanism?"*

The master prompt calls for three "Adjacent Sciences": Geometric Deep Learning (GNNs), Probabilistic Answer Set Programming (P-ASP), and Active Inference. None are implemented. Without P-ASP, the system cannot handle inherent uncertainty in LLM-generated VPIR. Without Active Inference, there is no automated graph patching. The binary accept/reject model misses the essential probabilistic refinement loop.

Pearl's score (5.0) is the lowest on the panel — this is the sprint that addresses it.

### Ilya Sutskever — Beyond JSON Template Filling
> *"Does this align with how attention and representation actually work in transformers?"*

The bridge grammar currently treats LLMs as structured-output generators ("fill in this JSON schema"). Probabilistic refinement leverages what transformers actually do well: iterative completion with confidence, contextual repair, and pattern-based generation. P-ASP confidence scores provide the feedback loop that makes the bridge grammar adaptive rather than rigid.

### Leonardo de Moura — Feasibility Anchor
> *"Is this constraint decidable, and can Z3 solve it in bounded time?"*

The neurosymbolic bridge must remain within decidable boundaries. de Moura's role is to ensure P-ASP rules and Active Inference patching produce verification queries that Z3/CVC5 can handle.

---

## 3. Deliverables

### 3.1 P-ASP Integration Prototype
**File**: `src/neurosymbolic/p-asp.ts`

Probabilistic Answer Set Programming layer:

```typescript
interface PASPEngine {
  /**
   * Score VPIR nodes with confidence based on:
   * - Structural validity (schema conformance)
   * - Semantic coherence (does the node make sense in context?)
   * - Historical accuracy (how often has this pattern been correct?)
   * - Constraint satisfaction (how many Z3 properties does it satisfy?)
   */
  scoreNodes(
    graph: VPIRGraph,
    context: PipelineContext,
  ): NodeConfidenceMap;

  /**
   * Generate weighted valid interpretations for ambiguous nodes.
   * Instead of binary accept/reject, produce a distribution:
   * [{interpretation: VPIRNode, confidence: 0.87}, ...]
   */
  generateInterpretations(
    node: VPIRNode,
    context: PipelineContext,
  ): WeightedInterpretation[];
}

interface NodeConfidenceMap {
  /** Per-node confidence scores (0.0 to 1.0) */
  scores: Map<string, number>;
  /** Overall graph confidence */
  graphConfidence: number;
  /** Nodes below threshold that need refinement */
  lowConfidenceNodes: string[];
}
```

P-ASP weighted rules combine:
1. **LLM output probability** — raw logprobs from the model
2. **Structural constraints** — schema conformance weight
3. **Historical accuracy** — patterns that have been correct/incorrect in past
4. **Z3 partial satisfaction** — how many properties the node helps satisfy

### 3.2 Active Inference Graph Patching
**File**: `src/neurosymbolic/active-inference.ts`

When a VPIR graph partially fails verification, Active Inference identifies and patches specific nodes:

```typescript
interface ActiveInferenceEngine {
  /**
   * Given a partially-verified graph, identify which nodes
   * to regenerate to minimize free energy (maximize verification).
   */
  identifyPatchTargets(
    graph: VPIRGraph,
    failedProperties: VerificationResult[],
    confidenceMap: NodeConfidenceMap,
  ): PatchTarget[];

  /**
   * Generate a targeted LLM query to repair specific nodes.
   * The query includes: the surrounding context, what failed,
   * and constraints the new node must satisfy.
   */
  generatePatchQuery(
    target: PatchTarget,
    graph: VPIRGraph,
  ): LLMQuery;

  /**
   * Apply a patch and re-score affected nodes.
   */
  applyPatch(
    graph: VPIRGraph,
    target: PatchTarget,
    replacement: VPIRNode,
  ): PatchedGraph;
}

interface PatchTarget {
  nodeId: string;
  reason: string;          // Why this node needs patching
  confidence: number;      // Current confidence (low)
  failedProperties: string[];  // Which Z3 properties it blocks
  contextNodes: string[];  // Surrounding nodes for context
}
```

**Free energy minimization**: The system iteratively refines the graph by targeting the lowest-confidence nodes that block the most verification properties. Each iteration re-queries the LLM for *specific nodes* rather than regenerating the entire graph — dramatically more efficient.

### 3.3 Probabilistic Refinement Pipeline
**File**: `src/neurosymbolic/refinement-pipeline.ts`

Replace the binary accept/reject in `src/bridge-grammar/llm-vpir-generator.ts`:

```
Previous: LLM → VPIR → valid? → accept / fallback (deterministic)

New:      LLM → VPIR → P-ASP scores → Z3 verify
              ↑                            ↓
              └── Active Inference ←── failed nodes
                  (targeted re-query)
```

```typescript
interface RefinementPipeline {
  /**
   * Run the full refinement loop:
   * 1. LLM generates initial VPIR graph
   * 2. P-ASP assigns confidence scores per node
   * 3. Z3 attempts verification
   * 4. If failed: Active Inference patches low-confidence nodes
   * 5. Repeat until convergence or max iterations
   */
  refine(
    task: NaturalLanguageTask,
    config: RefinementConfig,
  ): Promise<RefinementResult>;
}

interface RefinementConfig {
  maxIterations: number;       // Default: 5
  convergenceThreshold: number; // Min graph confidence to accept (0.85)
  patchBudget: number;         // Max nodes to patch per iteration (3)
  timeout: number;             // Total timeout in ms
}

interface RefinementResult {
  graph: VPIRGraph;
  finalConfidence: number;
  iterations: number;
  patchHistory: PatchRecord[];
  verificationResults: VerificationResult[];
  converged: boolean;
}
```

### 3.4 Causal Model Documentation
**File**: `docs/decisions/causal-model.md`

Formal causal model of the pnxt paradigm:

1. **Causal structure of verification**: What causes Z3 property satisfaction/failure? (graph structure → node types → edge labels → property formulas)
2. **Trust flow causality**: How does trust propagate through the pipeline? (agent trust level → capability grants → tool access → data classification)
3. **IFC enforcement causality**: What causes noninterference to hold? (label assignment → flow checking → verification → runtime enforcement)
4. **Refinement causality**: What causes the refinement loop to converge? (P-ASP scores → Active Inference targeting → focused LLM re-query → improved node quality)

This explicitly addresses Pearl's "are we conflating correlation with mechanism" concern by making the causal model transparent and testable.

---

## 4. Acceptance Criteria

| # | Criterion | Advisor | Verification |
|---|-----------|---------|-------------|
| 1 | P-ASP assigns confidence scores to VPIR nodes | Pearl | `scoreNodes` returns per-node confidences |
| 2 | Active Inference patches failed graphs incrementally | Pearl | Patch targets identified from failed Z3 |
| 3 | Refinement loop converges on Weather API benchmark | Pearl, Sutskever | Weather API passes with ≤ 3 iterations |
| 4 | Causal model formally documented | Pearl | ADR covers 4 causal dimensions |
| 5 | Bridge grammar enhanced with probabilistic outputs | Sutskever | Confidence scores flow through pipeline |

---

## 5. Technical Dependencies

- `src/bridge-grammar/llm-vpir-generator.ts` — current binary accept/reject to be replaced
- `src/verification/z3-program-verifier.ts` (from S7) — per-node verification results
- `src/benchmarks/weather-api-shim.ts` (from S4) — convergence target
- `src/evaluation/integration-pipeline.ts` — pipeline integration point

---

## 6. Expected Score Impact

| Advisor | Before | After | Rationale |
|---------|--------|-------|-----------|
| Pearl | 5.0 | 7.5 | Prototype exists; research frontier acknowledged |
| Sutskever | 7.0 | 8.0 | Bridge grammar adaptive; still not native categorical |
| de Moura | 9.0 | 9.0 | Maintains; ensures decidability of new constructs |
| **Composite** | **8.8** | **9.0** | **+0.2** |

---

## 7. Risk Mitigation

**Risk**: P-ASP prototype too slow for iterative refinement.
**Mitigation**: Set convergence timeout. Fall back to single-pass scoring (confidence scores without iteration) if the full loop doesn't converge within budget. Even single-pass P-ASP is a significant improvement over binary accept/reject.

**Risk**: Active Inference patching causes graph instability (fixing one node breaks another).
**Mitigation**: Limit patch budget per iteration. Track patch history to detect oscillation. If oscillation detected, accept best-so-far graph with documented low-confidence nodes.

---

## 8. Definition of Done

- [ ] P-ASP engine assigns confidence scores to VPIR nodes
- [ ] Active Inference identifies and patches failed graph nodes
- [ ] Refinement pipeline converges on Weather API benchmark
- [ ] Causal model documented in `docs/decisions/causal-model.md`
- [ ] ~40 new tests, all passing
- [ ] `npm test`, `npm run typecheck`, `npm run lint` all pass
- [ ] Advisory review checkpoint: Pearl, Sutskever, de Moura re-assess
