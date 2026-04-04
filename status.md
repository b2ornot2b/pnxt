# pnxt Project Status

> Last updated: 2026-04-04

---

## Current State

The pnxt project is in the **research phase**, with comprehensive theoretical foundations and architectural specifications complete. No prototype implementation exists yet — the repository is documentation-focused.

### Completed Work

| Phase | Focus | Deliverables |
|-------|-------|-------------|
| Phase 1 | Core Architecture, State Separation & FFI | Foundational architecture design (external) |
| Phase 2 | Bridge Layer & Mathematical Spec | Mathematical formalization, bridge grammar spec (external) |
| Phase 3 | Deep analysis of pillars, patterns, and architecture | Six research documents covering ACI, memory, coordination, trust, comparative analysis, and reference architecture |

### Phase 3 Deliverables (Complete)

1. **Agent-Computer Interface Specification** — Protocol layers, message taxonomy, capability discovery, error handling
2. **Semantic Memory Architecture** — Three-layer memory model (working, semantic, episodic) with lifecycle management
3. **Multi-Agent Coordination Patterns** — Topology models, task decomposition, conflict resolution
4. **Trust, Safety, and Governance Framework** — Graduated trust model, capability-based permissions, sandboxing
5. **Comparative Analysis** — ANP positioned against OOP, Actor Model, Microservices, EDA, FP
6. **Implementation Reference Architecture** — Concrete system design with deployment topologies and migration strategy

---

## Next Steps (Phase 4)

Phase 4 transitions from research to **prototype implementation and empirical evaluation**.

### Priority 1: Core Infrastructure

- [x] **Project scaffolding** — Initialize package.json, TypeScript config, test infrastructure, and CI pipeline
- [ ] **Memory Service prototype** — Implement the three-layer memory model (working, semantic, episodic) as the foundational service *(in-memory prototype complete; needs persistent storage backend)*
- [ ] **ACI Gateway prototype** — Build the structured protocol layer for agent-to-system communication *(in-memory prototype complete; needs trust integration and audit logging)*

### Priority 2: Agent Runtime

- [ ] **Agent runtime environment** — Basic agent lifecycle management (registration, execution, teardown)
- [ ] **Capability negotiation** — Implement versioned capability discovery and contract negotiation
- [ ] **Trust engine** — Graduated trust model with measurable trust scores

### Priority 3: Validation and Evaluation

- [ ] **Empirical evaluation** — Test multi-agent coordination patterns on real development tasks
- [ ] **Benchmark development** — Standardized benchmarks for evaluating ANP implementations
- [ ] **Security hardening** — Adversarial testing of trust and sandboxing mechanisms

---

## Future Goals

### Medium-Term

- **Bridge Grammar implementation** — Constrained-decoding JSON schema for valid VPIR node generation
- **Natural language protocol design** — Formalized communication patterns for agent-to-agent collaboration
- **VPIR compiler/interpreter** — Execute Verifiable Programmatic Intermediate Representation
- **Tree-sitter DKB integration** — Knowledge graph-based codebase representation

### Long-Term

- **LLMbda Calculus runtime** — Lambda calculus with Information Flow Control for noninterference guarantees
- **SMT solver integration** — Z3/CVC5 for constraint satisfaction and formal verification
- **Full Dataflow Process Network engine** — Actor-based execution with FIFO channel communication
- **Multi-agent orchestration at scale** — Enterprise deployment topology with audit and governance
- **Community and ecosystem** — Open specification, reference implementations, and adoption tooling

---

## Key Decisions and Constraints

- **Research-first approach**: Theoretical soundness before implementation speed
- **Incremental adoption**: Every component designed for phased introduction
- **Structural safety**: Correct behavior made easy by design, not by discipline
- **No legacy syntax**: This is a new paradigm for LLMs, not a wrapper around existing languages

---

## Repository Structure

```
pnxt/
├── AGENTS.md              # Agent development guidelines (CLAUDE.md symlinks here)
├── README.md              # Project overview
├── status.md              # This file — project status and roadmap
├── package.json           # Node.js project configuration
├── tsconfig.json          # TypeScript compiler configuration
├── jest.config.js         # Jest test configuration
├── eslint.config.js       # ESLint configuration
├── .prettierrc            # Prettier configuration
├── .github/workflows/
│   ├── ci.yml             # CI pipeline (typecheck, lint, test, build)
│   ├── deploy-website.yml # Website deployment
│   └── validate-website.yml
├── src/
│   ├── index.ts           # Package entry point
│   ├── types/             # Shared type definitions
│   │   ├── memory.ts      # Memory model types
│   │   ├── agent.ts       # Agent runtime types
│   │   ├── aci.ts         # ACI Gateway types
│   │   └── json-schema.ts # JSON Schema utility type
│   ├── memory/            # Memory Service
│   │   └── memory-service.ts  # Three-layer memory model (in-memory impl)
│   ├── aci/               # ACI Gateway
│   │   └── aci-gateway.ts     # Agent-computer interface gateway
│   └── agent/             # Agent Runtime
│       └── agent-runtime.ts   # Agent lifecycle management
├── docs/
│   └── research/
│       ├── original-prompt.md
│       ├── Designing Agent-Native Programming Paradigm.md
│       └── phase-3/          # Phase 3 research deliverables
└── website/               # Astro Starlight documentation site
```
