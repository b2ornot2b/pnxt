---
title: Phase 7 — Self-Hosting Paradigm
description: Transitioning pnxt from verified prototype to self-modifying, LLM-programmable system.
---

:::tip[Source Document]
The full paradigm transition roadmap is maintained in [`docs/roadmap/paradigm-transition.md`](https://github.com/b2ornot2b/pnxt/blob/main/docs/roadmap/paradigm-transition.md). Sprint details are in [`docs/sprints/`](https://github.com/b2ornot2b/pnxt/tree/main/docs/sprints).
:::

Phase 7 transitions pnxt from a verified prototype to a **self-modifying, LLM-programmable system**. It follows five milestones (M1–M5) that progressively move execution from TypeScript host code into the pnxt paradigm itself.

---

## Milestone Overview

| Milestone | Focus | Status |
|-----------|-------|--------|
| M1 | Self-Description — pnxt describes its own pipeline as VPIR | **Complete** (Sprint 9) |
| M2 | External Task Expression — real-world tasks in pure VPIR JSON | **Complete** (Sprint 11) |
| M3 | LLM-Native Programming — reliable LLM-driven VPIR generation | **Complete** (Sprint 12) |
| M4 | Self-Modification — pnxt modifies its own pipeline through VPIR | Planned |
| M5 | Self-Hosting — pnxt core components expressed in pnxt | Planned |

---

## Sprint 10: Handler Library + Tool Registry (Complete)

The foundation for external task execution — standard handlers and a declarative registry.

- **Standard Handler Library** — 8 pre-built tool handlers: http-fetch, json-transform, file-read, file-write, string-format, math-eval, data-validate, unit-convert
- **Declarative Tool Registry** — Operation-to-handler mapping with alias support, auto-registration, discovery API, and trust pre-validation
- **DPN Supervisor** — Supervisor actor pattern with bounded restart strategies (one-for-one, all-for-one), priority mailbox (high > normal > low), and full event log
- **DPN Runtime Integration** — Action and inference nodes resolve handlers from the tool registry with ACI gateway fallback

---

## Sprint 11: VPIR Authoring + External Tasks — M2 Complete (Complete)

The M2 bridge: LLM output flows directly into executable graphs without TypeScript.

- **VPIR Graph Builder** — Fluent API (`addObservation`, `addInference`, `addAction`, `addAssertion`, `addComposition`) and `fromJSON()` for constructing validated graphs from pure JSON. Auto-computes roots/terminals, runs structural validation, validates tool availability via registry
- **External Task Runner** — `TaskRunner` class orchestrating: JSON spec → `fromJSON()` → tool discovery → trust validation → DPN compile → DPN execute → `TaskExecutionResult`
- **Task-Aware Bridge Grammar** — Enhanced LLM generation with system prompts listing all available handlers and their input schemas. Post-generation validation rejects graphs referencing non-existent handlers
- **External Task Benchmarks** — Temperature Conversion (98.6F → 37C) and Math Expression (2*(3+4)-1 = 13) running end-to-end through DPN runtime

---

## Sprint 12: Reliable Bridge Grammar + Error Recovery — M3 Foundation (Complete)

Making LLM-generated VPIR reliable enough for production use.

- **Bridge Grammar Error Taxonomy** — `BridgeErrorCategory` enum with 6 categories (schema, semantic, handler, topology, truncation, confidence), repair hints, and `formatDiagnosisForLLM()` for structured retry feedback
- **Auto-Repair Engine** — 6 repair strategies: truncated JSON closure, missing field injection, fuzzy enum matching (Levenshtein), duplicate ID renaming, auto-computed roots/terminals, default security labels
- **Confidence Scorer** — 4-dimension scoring (structural 0.30, semantic 0.25, handler coverage 0.25, topological 0.20) with per-node low-confidence flagging
- **Z3 Graph Pre-Verification** — 4 formal properties via Z3: acyclicity, input completeness, IFC monotonicity, handler trust compatibility
- **Reliable Generation Pipeline** — 7-stage orchestration: LLM generation → schema validation → diagnosis → auto-repair → re-validation → confidence scoring → Z3 verification. Full pipeline stage tracing with timing
- **Error Recovery Benchmark** — 7 scenarios: truncated JSON, missing fields, invalid handlers, cyclic graphs, wrong enums, mixed validity, duplicate IDs

---

## What's Next: M4 and M5

### M4: Self-Modification

pnxt modifies its own pipeline through VPIR:
- Pipeline stages become VPIR-editable graphs
- Agents propose optimizations as graph transformations
- Changes verified via Z3 before application
- Transport ensures verified properties survive modification

### M5: Self-Hosting

pnxt's core components expressed in pnxt itself:
- Categorical syntax replaces JSON intermediate format
- Bootstrap compiler validates the paradigm end-to-end
- Full transition from TypeScript host to pnxt-native execution

---

## Advisory Panel Score Trajectory

| Sprint | Score | Key Advancement |
|--------|-------|-----------------|
| Phase 4 | 3.0/10 | Infrastructure only — no paradigm components |
| Sprint 5 | 7.5/10 | HoTT + Knowledge Graph + end-to-end pipeline |
| Sprint 9 | 9.2/10 | Self-hosting PoC + categorical tokenization |
| Sprint 10 | 9.25/10 | Handler library + tool registry |
| Sprint 12 | 9.35/10 | Reliable bridge grammar + M3 foundation |
