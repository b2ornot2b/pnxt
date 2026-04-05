# Sprint 4: "Paradigm Proof" — Weather API Benchmark MVP

> **Phase**: 6, Sprint 4
> **Priority**: P0
> **Primary Advisors**: Alan Kay, Barbara Liskov, Robin Milner
> **Prerequisite**: Phase 6 Sprint 3 complete
> **Score Target**: 7.5 → 7.9

---

## 1. Sprint Goal

Prove the paradigm works end-to-end on a real task. This is the single highest-priority item, unanimously supported by the advisory panel. The Weather API shim MVP from the original master prompt must be implemented as a concrete, runnable demonstration of the full pnxt pipeline.

---

## 2. Alignment Gaps Addressed

### Alan Kay — Paradigm Actualization
> *"Are we actually inventing a new paradigm, or just rearranging the furniture of the old one?"*

The system currently describes the paradigm but doesn't *be* the paradigm. A working end-to-end benchmark demonstrates the leap from "tools that implement concepts" to "an environment where LLMs actually program differently."

### Barbara Liskov — Practical Clarity
> *"Can a new user understand this abstraction without reading the entire spec?"*

No "Hello World" path exists. The Weather API benchmark provides a concrete, runnable demonstration that a new developer (or LLM agent) can follow to understand the paradigm in action.

### Robin Milner — DPN as Execution Paradigm
> *"What are the observable behaviors of this concurrent system?"*

DPN is currently a component, not THE execution model. This sprint elevates DPN from "a library" to "the execution substrate" by routing VPIR execution through DPN channels and processes.

---

## 3. Deliverables

### 3.1 Weather API Shim MVP
**File**: `src/benchmarks/weather-api-shim.ts`

Define a Weather API tool as an ACI tool with:
- Trust requirements (minimum trust level for weather data access)
- IFC labels (weather data classification, user query sensitivity)
- Capability negotiation (weather service capabilities)

Wire through the full pipeline:
```
Natural Language Task
    → Bridge Grammar (constrained JSON schema)
    → VPIR Graph (verified intermediate representation)
    → HoTT Category (categorical structure)
    → Z3 Verification (formal property checking)
    → DPN Execution (actor-based runtime)
    → Result (verified output)
```

The LLM receives "What's the weather in Tokyo?" and the system produces a verified, executed reasoning chain — not just a JSON blob.

### 3.2 DPN-as-Runtime Elevation
**File**: `src/channel/dpn-runtime.ts`

Create a `DPNRuntime` class that:
- Takes a VPIR graph as input
- Maps each VPIR node to a DPN `Process` actor
- Maps each VPIR edge to a typed DPN `Channel`
- Executes the graph through actor message-passing
- Collects results via output channels

This replaces direct VPIR interpreter calls for benchmark execution, making DPN the actual execution substrate rather than an optional module.

**Key interface**:
```typescript
interface DPNRuntime {
  /** Load a VPIR graph into the DPN execution model. */
  loadGraph(graph: VPIRGraph): DPNConfiguration;

  /** Execute the loaded graph through DPN channels. */
  execute(config: DPNConfiguration): Promise<ExecutionResult>;

  /** Get observable channel traces for verification. */
  getTraces(): ChannelTrace[];
}
```

### 3.3 Benchmark Harness
**File**: `src/benchmarks/benchmark-runner.ts`

Standardized benchmark framework:
- Input: natural language task description
- Expected stages: which pipeline components should fire
- Pass/fail criteria: structural + semantic checks on output
- Timing: wall-clock time per stage
- Report: structured JSON output with per-stage results

Weather API is the first benchmark; the harness is designed for expansion (Sprint 7 adds 2 more).

### 3.4 End-to-End Integration Tests
**File**: `tests/benchmarks/weather-api-shim.test.ts`

- **Mock LLM tests** (CI-safe): deterministic VPIR generation, full pipeline validation
- **Live LLM tests** (gated behind `ANTHROPIC_API_KEY`): actual Claude API calls through the pipeline
- Verify each stage produces valid output for the next stage
- ~60 new tests covering the full pipeline path

---

## 4. Acceptance Criteria

| # | Criterion | Advisor | Verification |
|---|-----------|---------|-------------|
| 1 | NL input produces verified VPIR output through full pipeline | Kay | Weather API benchmark passes end-to-end |
| 2 | A new developer can run the benchmark and understand what happened | Liskov | Benchmark report is self-explanatory |
| 3 | VPIR execution happens through DPN channels, not direct function calls | Milner | `DPNRuntime` is the execution path |
| 4 | Benchmark completes in < 30 seconds (mock LLM) | All | Timing assertion in test suite |
| 5 | Each pipeline stage is independently observable | All | `getTraces()` returns per-stage data |

---

## 5. Technical Dependencies

- `src/evaluation/integration-pipeline.ts` — wire benchmark into existing pipeline
- `src/channel/process.ts` — extend Process to accept VPIR node configurations
- `src/bridge-grammar/` — ensure schema covers weather API tool definitions
- `src/verification/z3-invariants.ts` — verify weather API-specific properties
- `src/aci/gateway.ts` — register weather API as an ACI tool

---

## 6. Expected Score Impact

| Advisor | Before | After | Rationale |
|---------|--------|-------|-----------|
| Kay | 6.0 | 7.5 | Paradigm actualization demonstrated; self-hosting still future |
| Liskov | 6.5 | 8.5 | Concrete benchmark exists; developer can follow it |
| Milner | 7.0 | 8.0 | DPN elevated to execution substrate |
| **Composite** | **7.5** | **7.9** | **+0.4** |

---

## 7. Definition of Done

- [ ] Weather API shim MVP runs end-to-end (NL → verified result)
- [ ] `DPNRuntime` executes VPIR graphs through actor message-passing
- [ ] Benchmark harness produces structured report
- [ ] ~60 new tests, all passing
- [ ] `npm test`, `npm run typecheck`, `npm run lint` all pass
- [ ] Advisory review checkpoint: Kay, Liskov, Milner re-assess
