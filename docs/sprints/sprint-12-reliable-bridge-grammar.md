# Sprint 12: Reliable Bridge Grammar + Error Recovery

> **Phase**: 7, Sprint 12 — "Reliable Bridge Grammar + Error Recovery"
> **Priority**: P1
> **Primary Advisors**: Sutskever, Pearl, de Moura
> **Score Target**: 9.3 → 9.35
> **Milestone**: **M3 foundation** (LLM-Native Programming)

---

## Summary

Sprint 12 lays the foundation for Milestone M3 (LLM-Native Programming) by making the Bridge Grammar **reliable**. Where Sprint 11 proved that external tasks can execute entirely in VPIR (M2 complete), Sprint 12 ensures LLM-generated VPIR graphs are robust — handling output errors, providing structured recovery, confidence scoring, and Z3 pre-verification before execution.

---

## Deliverables

### 1. Bridge Grammar Error Taxonomy

**File**: `src/bridge-grammar/bridge-errors.ts`

- `BridgeErrorCategory` enum with 6 categories: schema, semantic, handler, topology, truncation, confidence
- `BridgeError` interface with category, code, path, message, repairHint, severity
- `BridgeDiagnosis` with errors/warnings split, repairable detection, summary
- `diagnose()` — full diagnosis from validation errors + handler/truncation issues
- `formatDiagnosisForLLM()` — structured feedback grouped by category with repair hints
- `diagnoseTruncation()` — detect incomplete JSON via bracket balancing
- `diagnoseHandlerErrors()` — create errors for missing handler references

### 2. Auto-Repair Engine

**File**: `src/bridge-grammar/bridge-repair.ts`

- `repairBridgeOutput()` — 6 repair strategies:
  - Truncated JSON: close unbalanced brackets/braces
  - Missing fields: inject defaults (createdAt, label, evidence, inputs, outputs, verifiable)
  - Wrong enums: Levenshtein fuzzy-match to closest valid value
  - Missing roots/terminals: auto-compute from graph topology
  - Duplicate node IDs: auto-suffix with index
  - Graph-level defaults: inject id, name, createdAt
- `repairTruncatedJSON()` — standalone truncation repair utility

### 3. Confidence Scorer

**File**: `src/bridge-grammar/bridge-confidence.ts`

- `scoreGraphConfidence()` — 4 weighted dimensions (P-ASP-inspired):
  - Structural validity (0.30): required fields, evidence quality, label completeness
  - Semantic coherence (0.25): evidence-type matching, node-type semantics, confidence levels
  - Handler coverage (0.25): action operations resolve to registered handlers
  - Topological soundness (0.20): dangling refs, connectivity, depth/breadth ratio
- Per-node scoring with `NodeConfidence` breakdown
- Low-confidence node flagging with configurable threshold

### 4. Z3 Graph Pre-Verification

**File**: `src/verification/z3-graph-verifier.ts`

- `verifyGraphProperties()` — 4 formally verified properties:
  - **Acyclicity**: Z3 integer ordering constraints (edge u→v ⟹ order(u) < order(v))
  - **Input completeness**: all node input references resolve to existing nodes with matching ports
  - **IFC monotonicity**: classification(source) ≤ classification(target) along all edges
  - **Handler trust**: action node trust levels ≥ required handler trust levels
- Each property returns verified/violated/unknown with details
- +4 Z3 properties (total: 21)

### 5. Reliable Generation Pipeline

**File**: `src/bridge-grammar/reliable-generator.ts`

- `generateReliableVPIRGraph()` — 7-stage pipeline:
  1. LLM generation (Claude API with task-aware prompting)
  2. Schema validation + diagnosis
  3. Auto-repair (if repairable)
  4. Re-validation after repair
  5. Handler coverage check
  6. Confidence scoring (reject below threshold)
  7. Z3 pre-verification (if Z3 context provided)
- Full `GenerationStage` traces with timing for each stage
- `ReliableGenerationResult` extending base result with diagnosis, repairs, confidence, verification

### 6. Error Recovery Benchmark

**File**: `src/evaluation/error-recovery-benchmark.ts`

- 7 benchmark scenarios covering all error categories:
  1. Truncated JSON (cut-off mid-stream)
  2. Missing required fields (no id, type, evidence)
  3. Invalid handler references (nonexistent tools)
  4. Cyclic graph (circular dependencies)
  5. Wrong enum values (misspelled types)
  6. Mixed valid/invalid nodes
  7. Duplicate node IDs
- Measures: diagnosis accuracy, repair success rate, post-repair validation, confidence scores

---

## Alignment Impact

| Advisor | Gap Addressed | How |
|---------|--------------|-----|
| Sutskever | "Bridge Grammar is the hardest problem" — LLM output is unreliable | Auto-repair + structured retry feedback makes generation robust |
| Pearl | "Neurosymbolic bridge maturity" — probabilistic scoring is shallow | P-ASP-inspired confidence scoring with dimensional breakdown |
| de Moura | "Verification should precede execution" | Z3 pre-verification of 4 graph properties before DPN execution |

---

## Test Metrics

| Metric | Sprint 11 | Sprint 12 | Delta |
|--------|-----------|-----------|-------|
| Test Suites | 62 | 68 | +6 |
| Tests | 1128+ | 1220+ | +92 |
| Z3 Properties | 17 | 21 | +4 |
| Benchmarks | 5 | 6 | +1 |
| Modules | 22 | 24 | +2 |

---

## New Files

- `src/bridge-grammar/bridge-errors.ts` — Error taxonomy (26 tests)
- `src/bridge-grammar/bridge-errors.test.ts`
- `src/bridge-grammar/bridge-repair.ts` — Auto-repair engine (15 tests)
- `src/bridge-grammar/bridge-repair.test.ts`
- `src/bridge-grammar/bridge-confidence.ts` — Confidence scorer (18 tests)
- `src/bridge-grammar/bridge-confidence.test.ts`
- `src/verification/z3-graph-verifier.ts` — Z3 graph pre-verification (12 tests)
- `src/verification/z3-graph-verifier.test.ts`
- `src/bridge-grammar/reliable-generator.ts` — Reliable pipeline (10 tests)
- `src/bridge-grammar/reliable-generator.test.ts`
- `src/evaluation/error-recovery-benchmark.ts` — Error recovery benchmark (11 tests)
- `src/evaluation/error-recovery-benchmark.test.ts`

## Modified Files

- `src/bridge-grammar/index.ts` — Added exports for all new modules
- `src/verification/index.ts` — Added z3-graph-verifier exports
- `src/evaluation/index.ts` — Added error-recovery-benchmark exports
- `status.md` — Sprint 12 deliverables and metrics
- `docs/sprints/README.md` — Link Sprint 12 doc, update score progression
