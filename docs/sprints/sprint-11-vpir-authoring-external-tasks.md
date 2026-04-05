# Sprint 11: VPIR Authoring + External Tasks

> **Phase**: 7, Sprint 11 — "VPIR Authoring + External Tasks"
> **Priority**: P0
> **Primary Advisors**: Kay, Liskov, Agha
> **Score Target**: 9.25 → 9.3
> **Milestone**: **M2 complete** (External Task Expression)

---

## Summary

Sprint 11 closes Milestone M2 (External Task Expression) by delivering a VPIR Graph Builder that constructs validated graphs from pure JSON, a Task Runner that orchestrates the full JSON → build → verify → DPN execute pipeline, a task-aware Bridge Grammar extension for LLM-driven generation, and end-to-end benchmarks proving real tasks execute entirely in VPIR without TypeScript.

---

## Deliverables

### 1. VPIR Graph Builder

**File**: `src/vpir/vpir-graph-builder.ts`

- `VPIRGraphBuilder` class with fluent API: `addObservation()`, `addInference()`, `addAction()`, `addAssertion()`, `addComposition()`, `addNode()`
- `build()` → auto-computes roots/terminals, runs structural validation, returns `BuildResult`
- `fromJSON(json)` static → accepts bridge grammar JSON output, produces validated `VPIRGraph`. **M2 bridge: LLM output → `fromJSON()` → executable graph**
- `withToolRegistry(registry)` → pre-build validation of action operation availability
- Default evidence, labels, and outputs for convenience

### 2. External Task Runner

**File**: `src/aci/task-runner.ts`

- `TaskRunner` class with configurable tool registry, trust level, timeout
- `run(taskSpec)` → accepts JSON or `VPIRGraph`, validates tools + trust, executes via `DPNRuntime`
- Pipeline: JSON spec → `fromJSON()` → tool discovery → trust validation → DPN compile → DPN execute → `TaskExecutionResult`
- Returns outputs, timing, errors, and full DPN execution trace

### 3. Task-Aware Bridge Grammar

**File**: `src/bridge-grammar/task-vpir-generator.ts`

- `generateTaskVPIRGraph(description, options)` → enhanced LLM generation with handler-library awareness
- `buildTaskAwareSystemPrompt(registrations)` → system prompt listing all available handlers with input schemas
- `buildTaskAwareVPIRTool(registry)` → Anthropic tool definition with handler documentation
- Post-generation validation: rejects graphs referencing non-existent handlers, retries with error feedback

### 4. External Task Benchmark

**File**: `src/evaluation/external-task-benchmark.ts`

Two M2 validation benchmarks expressed as pure JSON specs:

- **Temperature Conversion**: observe(98.6°F) → unit-convert(F→C) → result (37°C)
- **Math Expression**: observe("2*(3+4)-1") → math-eval → result (13)

Each benchmark proves: JSON spec → `VPIRGraph` → DPN execution → correct result, with no TypeScript at any point.

---

## Alignment Impact

| Advisor | Gap Addressed | How |
|---------|--------------|-----|
| Kay | "When does pnxt eat its own dog food?" | Real tasks expressed and executed entirely in VPIR |
| Liskov | "Where is the Hello World?" | Temperature conversion — the simplest complete program |
| Agha | "DPN as general-purpose actor framework" | TaskRunner drives DPN execution for arbitrary external tasks |

---

## Test Metrics

| Metric | Sprint 10 | Sprint 11 | Delta |
|--------|-----------|-----------|-------|
| Test Suites | 58 | 62 | +4 |
| Tests | 1073+ | 1128+ | +55 |
| Z3 Properties | 17 | 17 | 0 |
| Benchmarks | 3 | 5 | +2 |
| Modules | 20 | 22 | +2 |

---

## New Files

- `src/vpir/vpir-graph-builder.ts` — VPIR Graph Builder (fluent API + fromJSON)
- `src/vpir/vpir-graph-builder.test.ts` — Builder tests (20 tests)
- `src/aci/task-runner.ts` — External Task Runner
- `src/aci/task-runner.test.ts` — Task Runner tests (10 tests)
- `src/bridge-grammar/task-vpir-generator.ts` — Task-aware VPIR generation
- `src/bridge-grammar/task-vpir-generator.test.ts` — Task generator tests (10 tests)
- `src/evaluation/external-task-benchmark.ts` — M2 benchmark (2 tasks)
- `src/evaluation/external-task-benchmark.test.ts` — Benchmark tests (15 tests)

## Modified Files

- `src/vpir/index.ts` — Added builder exports
- `src/aci/index.ts` — Added task-runner, tool-registry, handler-library exports
- `src/bridge-grammar/index.ts` — Added task generator exports
- `src/evaluation/index.ts` — Added benchmark exports
- `status.md` — Sprint 11 deliverables and metrics
- `docs/sprints/README.md` — Link Sprint 11 doc
