# pnxt — Agent-Native Programming Paradigm

A research project designing a **net-new programming paradigm built exclusively for LLMs and AI agents**, moving beyond human-readable legacy syntax toward structured, verifiable, graph-based program representations.

## Vision

Traditional programming languages are optimized for human cognition — visual hierarchy, short-term memory, lexical parsing. LLMs excel at structural data manipulation (JSON/graphs) but struggle with implicit control flow and loop-state tracking. pnxt designs an execution environment where LLMs orchestrate logic graphs rather than generate syntax.

In the Agent-Native Programming (ANP) paradigm, AI agents are **first-class entities** with identity, memory, state, and tools — not just coding assistants bolted onto existing workflows.

## Theoretical Foundations

| Foundation | Purpose |
|---|---|
| **Typed Tokenization (HoTT)** | Code as categorical objects, morphisms, and paths — not flat text |
| **VPIR** | Verifiable Programmatic Intermediate Representation with mechanically verifiable reasoning chains |
| **Dataflow Process Networks** | Actors communicating via FIFO channels, eliminating imperative loops |
| **LLMbda Calculus (IFC)** | Lambda calculus with Information Flow Control for noninterference guarantees |
| **SMT Solvers** | Z3/CVC5 for constraint satisfaction and formal verification |
| **Bridge Grammar** | Constrained-decoding JSON schema forcing LLMs to output valid VPIR nodes |
| **Tree-sitter DKB Knowledge Graph** | Codebase stored as a non-Euclidean graph, not flat files |

## Three Pillars of ANP

1. **Agent-Computer Interface (ACI)** — Structured protocols for agent-to-system communication with versioned capabilities, clear error handling, and recovery patterns
2. **Semantic Memory** — Persistent, evolving memory (working, semantic, episodic) that makes agents more valuable in their hundredth session than their first
3. **Natural Language as Lingua Franca** — Natural language as the primary interface for task specification, progress reporting, and collaboration

## Research Status

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 1 | Core Architecture, State Separation & FFI | Complete |
| Phase 2 | Bridge Layer & Mathematical Spec | Complete |
| Phase 3 | Deep analysis of pillars, patterns, and architecture | Complete |
| Phase 4 | Prototype implementation & empirical evaluation | Complete |

See [`status.md`](status.md) for the detailed roadmap, future goals, and repository structure.

## Implementation

Phase 4 produced a working TypeScript prototype covering the core ANP subsystems:

| Module | Description |
|---|---|
| **Memory Service** (`src/memory/`) | Three-layer memory model (working, semantic, episodic) with pluggable storage backends |
| **ACI Gateway** (`src/aci/`) | Structured protocol layer with graduated trust checking and append-only audit logging |
| **Agent Runtime** (`src/agent/`) | Agent lifecycle management — registration, execution, and teardown |
| **Capability Negotiation** (`src/capability/`) | Versioned capability discovery with 3-phase handshake, revocation, and expiry support |
| **Trust Engine** (`src/trust/`) | Graduated 5-level trust model with multi-dimensional scoring and automatic calibration |
| **Evaluation Suite** (`src/evaluation/`) | Multi-agent coordination scenarios, benchmarks, and adversarial security tests |

## Getting Started

```bash
# Install dependencies
npm install

# Run tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint

# Build
npm run build

# Run full CI locally
npm run ci
```

## Documentation

- [`docs/research/original-prompt.md`](docs/research/original-prompt.md) — Master research prompt defining the foundational vision
- [`docs/research/Designing Agent-Native Programming Paradigm.md`](docs/research/Designing%20Agent-Native%20Programming%20Paradigm.md) — Core ANP design document
- [`docs/research/phase-3/`](docs/research/phase-3/) — Phase 3 deep dives:
  - Agent-Computer Interface Specification
  - Semantic Memory Architecture
  - Multi-Agent Coordination Patterns
  - Trust, Safety, and Governance Framework
  - Comparative Analysis with existing paradigms
  - Implementation Reference Architecture
- [**Project Website**](https://b2ornot2b.github.io/pnxt/) — Documentation site built with Astro Starlight

## Key Themes

- **Incrementalism** — Every component is designed for phased adoption
- **Structural safety over behavioral discipline** — Make correct behavior easy, incorrect behavior difficult
- **Explicit over implicit** — Side effects declared, capabilities negotiated, trust measured
- **Memory as foundation** — Persistent memory transforms stateless interactions into coherent agent experiences
- **Human partnership, not replacement** — Agents as colleagues with graduated trust

## Contributing

See [`CLAUDE.md`](CLAUDE.md) for development guidelines, code style, git workflow (git flow), and testing conventions.

## License

All rights reserved.
