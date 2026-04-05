# Paradigm Alignment Sprints

Sprint plans for closing the gap between the Phase 4 implementation and the foundational research vision, as identified in the [Advisory Review (2026-04-05)](../reviews/advisory-review-2026-04-05-alignment.md).

## Sprint Overview

| Sprint | Focus | Paradigm Pillars | Alignment Impact |
|--------|-------|-----------------|-----------------|
| [Sprint 1](sprint-1-dpn-ifc.md) | Channel primitives + DPN + IFC labels | DPN, IFC | +2 (3 → 5) |
| [Sprint 2](sprint-2-vpir-smt.md) | VPIR node types + SMT constraints | VPIR, SMT | +1 (5 → 6) |
| [Sprint 3](sprint-3-bridge-grammar.md) | Bridge Grammar JSON schema + LLM validation | Bridge Grammar, HoTT (partial) | +1 (6 → 7) |
| [Sprint 4](sprint-4-knowledge-graph.md) | Graph-based memory + entity relationships | Knowledge Graph, P-ASP (partial) | +1 (7 → 8) |

## Guiding Principles

1. **Every sprint delivers a paradigm-defining component** — no pure infrastructure sprints
2. **Compose with existing modules** — refactor, don't rewrite
3. **Test the theory empirically** — each sprint includes validation against real LLM behavior where applicable
4. **Maintain CI green** — all new code passes typecheck, lint, and test gates
