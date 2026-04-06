---
title: Future Vision
description: Long-term goals and the full vision for the Agent-Native Programming paradigm.
---

The pnxt paradigm has realized many of its original theoretical goals through Phases 4–7. The roadmap now extends toward self-modification, self-hosting, and ecosystem growth.

---

## Completed Goals

The following goals from the original vision have been **fully implemented and verified**:

- **Bridge Grammar** — Constrained-decoding JSON Schema forcing LLMs to output valid VPIR nodes, with auto-repair and confidence scoring (Sprints 2, 11, 12)
- **VPIR Compiler/Interpreter** — Full execution engine with parallel wave scheduling, result caching, and DPN runtime compilation (Sprints 3–4, 10)
- **Natural Language Protocol Design** — Three protocol state machines (delegation, negotiation, resolution) over DPN channels (Sprint 3)
- **Tree-sitter DKB Integration** — Knowledge graph with 8 entity kinds, 8 relation types, traversal, and HoTT conversion (Sprint 5)
- **LLMbda Calculus** — Typed lambda calculus with IFC, noninterference, and VPIR semantic bridge (Sprint 3 of Phase 6)
- **SMT Solver Integration** — 21 formally verified Z3 properties plus CVC5 multi-solver support (accumulated across Sprints 2–12)
- **Dataflow Process Network Engine** — Typed FIFO channels, process actors, DPN runtime, supervisor pattern, bisimulation (Sprints 1, 4, 7, 10)
- **HoTT Typed Tokenization** — Categories, morphisms, n-paths, univalence, transport, categorical tokenizer experiment (Sprints 5–6, 9)
- **Neurosymbolic Bridge** — P-ASP confidence scoring, Active Inference graph patching, refinement pipeline (Sprint 8)
- **Self-Description (M1)** — pnxt describes, validates, categorizes, and executes its own pipeline as VPIR (Sprint 9)
- **External Task Expression (M2)** — Real-world tasks expressed entirely in VPIR JSON, no TypeScript required (Sprint 11)
- **LLM-Native Programming Foundation (M3)** — Reliable generation pipeline with error taxonomy, auto-repair, and confidence scoring (Sprint 12)

---

## Near-Term Goals (Phase 7 Remaining)

### M4: Self-Modification

pnxt modifies its own pipeline through VPIR:
- Pipeline stages themselves become VPIR-editable
- Agents propose optimizations as VPIR graph transformations
- Changes verified via Z3 before application

### M5: Self-Hosting

pnxt's core components expressed in pnxt itself:
- Transition from TypeScript host to pnxt-native execution
- Categorical syntax replaces JSON intermediate format
- Bootstrap compiler validates the paradigm end-to-end

---

## Long-Term Goals (Phase 8+)

### Web-Based Visualization Frontend

Interactive node-graph renderer consuming the JSON export format:
- VPIR graph visualization with execution trace overlay
- HoTT category browser with morphism navigation
- Pipeline stage flow with real-time execution monitoring

### Multi-Language Tree-sitter Parsers

Extend KG parsing beyond TypeScript:
- Python, Rust, Go, and Java parsers
- Cross-language dependency analysis
- Unified knowledge graph across polyglot codebases

### Categorical Token Embeddings

Transformer fine-tuning with morphism-structured embeddings:
- Build on the categorical tokenization experiment (42-token vocabulary)
- Train embeddings that preserve categorical structure
- Evaluate LLM performance on morphism-aware tokenization

### Distributed DPN

Multi-node actor execution for scale:
- Network-transparent channel communication
- Distributed supervisor trees
- Cross-node IFC enforcement

### Community & Ecosystem

Open standards and adoption tooling:
- Open specification for ANP protocols
- Reference implementations in multiple languages
- Developer tooling and IDE integrations
- Community governance and contribution model
