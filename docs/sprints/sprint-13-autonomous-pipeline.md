# Sprint 13: Autonomous LLM Pipeline

> **Phase**: 7, Sprint 13 — "Autonomous LLM Pipeline"
> **Priority**: P1
> **Primary Advisors**: Sutskever, Pearl, Kay
> **Score Target**: 9.35 → 9.4
> **Milestone**: **M3 complete** (LLM-Native Programming)

---

## Summary

Sprint 13 completes Milestone M3 (LLM-Native Programming) by closing the gap between Sprint 12's single-pass reliable generation and fully autonomous end-to-end operation. Where Sprint 12 delivered error taxonomy, auto-repair, confidence scoring, and Z3 pre-verification, Sprint 13 adds **iterative refinement** (multi-attempt generation with structured feedback), **neurosymbolic integration** (P-ASP + Active Inference in the generation pipeline), and an **autonomous pipeline orchestrator** that chains NL → VPIR → Z3 → HoTT → DPN → Result without human intervention.

---

## Deliverables

### 1. Iterative Refinement Generator

**File**: `src/bridge-grammar/iterative-generator.ts`

- `generateWithRefinement()` — wraps `generateReliableVPIRGraph()` in a multi-attempt loop
- `buildRefinementPrompt()` — constructs structured LLM feedback from `BridgeDiagnosis`
- Two feedback strategies: 'structured' (machine-parseable via `formatDiagnosisForLLM`) and 'contextual' (specific fix instructions per error)
- Per-attempt `AttemptRecord` with diagnosis, confidence, repairs, timing
- Convergence detection: stops when confidence meets threshold
- Best-effort result selection across all attempts

### 2. Neurosymbolic Pipeline Integration

**File**: `src/bridge-grammar/neurosymbolic-bridge.ts`

- `applyNeurosymbolicRefinement()` — connects P-ASP scoring and Active Inference patching into the generation pipeline
- Scores graph via `PASPEngine` (4 dimensions: structural, semantic, historical, constraint)
- Identifies low-confidence nodes via `ActiveInferenceEngine` free energy minimization
- Generates patches using P-ASP's heuristic interpretation engine (no LLM calls)
- Oscillation detection prevents infinite refinement loops
- Patch strategies: type_swap, reference_fix, interpretation
- Full patch history with before/after confidence tracking

### 3. Autonomous Pipeline Orchestrator

**File**: `src/bridge-grammar/autonomous-pipeline.ts`

- `executeAutonomousPipeline()` — the top-level "one function" for LLM-native programming
- 5-stage pipeline: Generate → Refine → Verify → Categorize → Execute
- Each stage is optional, gated by configuration, and fully traced
- **Generate**: Iterative refinement generation (NL → VPIR via Bridge Grammar + LLM)
- **Refine**: Neurosymbolic refinement (P-ASP + Active Inference)
- **Verify**: Z3 formal property verification (acyclicity, input completeness, IFC, handler trust)
- **Categorize**: HoTT categorical structure validation (nodes → objects, edges → morphisms)
- **Execute**: DPN runtime execution (actor message-passing → results)
- Full `PipelineStageTrace` with timing, status, and details per stage
- Security label propagation end-to-end

### 4. Autonomous Pipeline Benchmark

**File**: `src/evaluation/autonomous-pipeline-benchmark.ts`

- 7 benchmark scenarios exercising different handler combinations:
  1. Data transformation (json-transform + data-validate)
  2. Multi-step computation (math-eval + string-format)
  3. File processing (file-read + json-transform + file-write)
  4. Unit conversion (unit-convert + data-validate)
  5. Validated API workflow (http-fetch + data-validate + json-transform)
  6. Complex multi-handler (file-read + math-eval + string-format + data-validate)
  7. Security-labeled pipeline (data-validate + json-transform + string-format)
- Metrics: generation success rate, avg confidence, refinement iterations, pipeline success rate, latency

---

## Alignment Impact

| Advisor | Gap Addressed | How |
|---------|--------------|-----|
| Sutskever | "LLM output reliability for autonomous operation" | Iterative refinement with structured feedback; autonomous pipeline proving LLMs can program in pnxt without human intervention |
| Pearl | "Neurosymbolic bridge maturity" | P-ASP + Active Inference integrated into generation pipeline; confidence-gated autonomy; oscillation-aware refinement |
| Kay | "Full paradigm realization" | Complete M3: NL → VPIR → Z3 → HoTT → DPN → Result, fully autonomous |

---

## Test Metrics

| Metric | Sprint 12 | Sprint 13 | Delta |
|--------|-----------|-----------|-------|
| Test Suites | 68 | 72 | +4 |
| Tests | 1220+ | 1286+ | +66 |
| Z3 Properties | 21 | 21 | +0 |
| Benchmarks | 6 | 7 | +1 |
| Modules | 24 | 27 | +3 |

---

## New Files

- `src/bridge-grammar/iterative-generator.ts` — Iterative refinement generator (20 tests)
- `src/bridge-grammar/iterative-generator.test.ts`
- `src/bridge-grammar/neurosymbolic-bridge.ts` — Neurosymbolic pipeline integration (14 tests)
- `src/bridge-grammar/neurosymbolic-bridge.test.ts`
- `src/bridge-grammar/autonomous-pipeline.ts` — Autonomous pipeline orchestrator (18 tests)
- `src/bridge-grammar/autonomous-pipeline.test.ts`
- `src/evaluation/autonomous-pipeline-benchmark.ts` — Autonomous pipeline benchmark (14 tests)
- `src/evaluation/autonomous-pipeline-benchmark.test.ts`

## Modified Files

- `src/bridge-grammar/index.ts` — Added exports for all new modules
- `src/evaluation/index.ts` — Added autonomous benchmark exports
- `status.md` — Sprint 13 deliverables and metrics
- `docs/sprints/README.md` — Link Sprint 13 doc, update score progression
