# Advisory Review: Phase 4 Prototype Assessment

> **Date**: 2026-04-05
> **Panel**: Dream Team Advisory Board (10 members)
> **Subject**: Phase 4 implementation review and Phase 5 readiness assessment

---

## Topic Summary

Phase 4 of the pnxt Agent-Native Programming paradigm has completed all three priority tiers: core infrastructure (Memory, ACI Gateway), agent runtime (lifecycle, capability negotiation, trust engine), and validation/evaluation (multi-agent scenarios, benchmarks, security suite). The panel convenes to assess whether the foundation supports the paradigm-defining pillars and to recommend Phase 5 priorities.

---

## Individual Advisor Perspectives

### 1. Vladimir Voevodsky — Homotopy Type Theory

> *"Is this construction invariant under equivalence?"*

The prototype is **purely operational** — no categorical structures, morphisms, or paths. TypeScript interfaces serve engineering but have no connection to HoTT foundations.

- `MemoryEntry` has flat entity lists, not graph-structured relationships
- Capabilities are flat operation strings with no type-level compatibility proofs
- `DimensionTrust` overrides exist in the type system but are stored and never consulted
- Trust is multidimensional in data but unidimensional in computation

**Verdict**: Acceptable for Phase 4 scaffolding. Phase 5 must introduce typed tokenization — Bridge Grammar outputs structured as categorical objects before further runtime work.

---

### 2. Alonzo Church — Lambda Calculus

> *"Can this be expressed as a pure function?"*

The architecture is stateful and imperative. Every module is a class with mutable `Map` state. `executeTask()` is a 100-line procedure with interleaved side effects.

- No separation of pure computation from effects
- LLMbda Calculus has zero implementation — not even a type signature
- Scenario outcomes are hardcoded, not derived from computation

**Verdict**: Factor out pure functions from effects. The trust scoring formula is pure but buried in a stateful class — extract it. The paradigm's calculus foundation is entirely missing.

---

### 3. Robin Milner — Process Calculi & Concurrency

> *"What are the observable behaviors of this concurrent system?"*

There is **no concurrency**. The DPN pillar is entirely absent. All scenario execution is sequential.

- `runScenario()` uses a `for` loop over tasks — no channels, no message passing
- Agent state transitions are synchronous; suspension never happens for concurrent reasons
- Benchmarks measure sequential throughput only

**Verdict**: Introduce a minimal DPN layer — typed FIFO queues between agents — and demonstrate one scenario with asynchronous agent communication.

---

### 4. Gul Agha — Actor Model

> *"How does this behave under arbitrary message interleavings?"*

Agents are state machines, not actors. No mailboxes, no autonomous message processing, no supervisor hierarchy.

**Positive**: ACI Gateway is essentially a message broker. Trust engine's event-sourcing is actor-compatible.

- No agent-to-agent communication — all interaction through shared mutable state
- No supervisor hierarchy for failure handling
- "Delegation" is sequential task assignment, not message-passing delegation

**Verdict**: Wrap each agent in an actor with a typed mailbox. Make ACI Gateway the supervisor. This solves both actor and concurrency concerns simultaneously.

---

### 5. Andrew Myers — Information Flow Control

> *"Can an untrusted component influence a trusted computation through this path?"*

Trust levels gate access, but IFC is entirely absent. No flow labels, no taint tracking, no noninterference proofs.

- **Memory has no flow labels**: Low-trust agent stores data, high-trust agent retrieves it — classic confused deputy
- **Tool outputs aren't labeled**: Results carry no trust provenance
- **Side effects are declared, not tracked**: Honor system only

**Positive**: Audit logger captures provenance for post-hoc analysis. Capability constraint tightening is crude but correct confinement.

**Verdict**: Add taint labels to every data value before any agent processes real LLM output. The LLMbda Calculus IFC layer is the primary defense against prompt injection.

---

### 6. Leonardo de Moura — SMT Solvers & Formal Verification

> *"Is this constraint decidable, and can Z3 solve it in bounded time?"*

No SMT integration. No Z3, no CVC5, no constraint formulation of any kind.

**Immediately formalizable**:
- Trust level requirements → decidable SAT
- Capability version compatibility → linear arithmetic
- State machine transitions → finite model checking
- Trust score thresholds → bounded integer arithmetic

**Verdict**: Introduce `z3-wasm` to verify capability grant consistency. Minimal effort, meaningful first demonstration of formal verification.

---

### 7. Ilya Sutskever — LLM Architecture

> *"Does this align with how attention and representation actually work in transformers?"*

No LLM integration. No constrained decoding, no bridge grammar, no structured output. **This is correct for Phase 4** — you cannot validate a framework while debugging LLM output quality.

- Bridge Grammar must be the immediate next priority
- Memory keyword matching must eventually become embedding-based (interface is correctly abstract)
- Capability constraints (maxFiles, maxLines) map naturally to structured output constraints

**Verdict**: Abstraction boundaries are clean enough to inject LLM components later. Bridge Grammar JSON schema constrained decoding should be the next module.

---

### 8. Barbara Liskov — Programming Language Design & Abstraction

> *"Can a new user understand this abstraction without reading the entire spec?"*

Module boundaries are clean — `TrustEngine` is understandable without `CapabilityNegotiation`.

- **Dead abstractions**: `BehaviorStyle`, `Verbosity`, `UncertaintyResponse` defined but never enforced
- **Inconsistent patterns**: Factory functions vs direct construction
- **Conflated concerns**: `SecurityTestSuite` is both test runner and validator
- **No error hierarchy**: Plain `Error` with strings; `ACIError` interface exists but isn't used

**Verdict**: Strip unimplemented abstractions or implement them. Every declared abstraction should work or not exist.

---

### 9. Judea Pearl — Causal Reasoning & Graphical Models

> *"What is the causal model here, and are we conflating correlation with mechanism?"*

Trust scoring is correlation-based. Fixed weights sum metrics, but the causal structure is implicit.

- High success rate may reflect easy tasks, not agent skill — no task difficulty modeling
- Trust formula weights (`30×success + 20×bugFree + ...`) should be learned or causally justified
- Memory consolidation should be causal inference, not counting
- Entity relationships are flat without the knowledge graph

**Verdict**: Add a causal DAG to trust: `{task_difficulty, agent_skill} → task_outcome → trust_update`. Even a simple DAG makes scoring principled.

---

### 10. Alan Kay — Paradigm Invention

> *"Are we actually inventing a new paradigm, or just rearranging the furniture of the old one?"*

**This is the critical question.** Currently pnxt is a well-engineered agent framework in TypeScript. Good engineering, but not a new paradigm.

- Original prompt says "abandon human-readable legacy syntax" — prototype is TypeScript
- Execution model is function calls and loops, not dataflow process networks
- Bridge Grammar doesn't exist yet
- LLMs think in graphs, not text — but the codebase is text processed linearly

**Positive**: Trust/capability models are genuinely novel (beyond RBAC). Audit-everything enables neurosymbolic state diffs. Infrastructure-first was the right Phase 4 strategy.

**Verdict**: Phase 5 must be the paradigm phase. The next deliverable should be the first VPIR node executed through a bridge grammar by an LLM. If that doesn't happen next, the paradigm vision dies.

---

## Points of Agreement

1. **Phase 4 is solid engineering.** Module boundaries, type safety, DI, and evaluation are well-done.
2. **Trust model is the strongest component.** Event-driven, multi-dimensional, graduated — publishable work.
3. **Paradigm pillars are absent.** No HoTT, VPIR, DPN, LLMbda Calculus, Bridge Grammar, SMT, or knowledge graph.
4. **IFC is urgently needed.** Memory and tool outputs lack provenance labels — real security gap.
5. **Concurrency must come next.** A DPN-based paradigm cannot remain sequential.

---

## Points of Tension

| Tension | Side A | Side B |
|---------|--------|--------|
| **Next priority** | Sutskever + Kay: Bridge Grammar (paradigm's soul) | Milner + Agha: DPN/Actor layer (concurrency first) |
| **Dead abstractions** | Liskov: Remove until implemented | Pearl: Keep as causal model placeholders |
| **Trust weights** | Pearl: Learn from causal model | de Moura: Fixed weights are verifiable |
| **Pure vs. practical** | Church: Factor pure functions now | Sutskever: Ship Bridge Grammar first |
| **Formalization timing** | Voevodsky + de Moura: Types and Z3 now | Agha + Liskov: Formalize after runtime works |

---

## Synthesis & Recommendation

Phase 4 is a credible deliverable. The runtime, trust, capability, and evaluation systems work together. Security tests pass. Benchmarks run. Scenarios execute.

**However, the project faces a paradigm-identity crisis.** Everything built could belong to any agent framework. The six pillars that make pnxt unique have zero implementation.

### Phase 5 Priorities (recommended order)

1. **Bridge Grammar** — JSON schema constraining LLM output to valid VPIR nodes. Paradigm's minimum viable differentiator.
2. **Channel/Actor layer** — Typed FIFO channels between agents, replacing sequential loops with message-passing concurrency.
3. **IFC taint labels** — Provenance labels on `MemoryEntry` and `ToolResult`. Block cross-trust-level flow without declassification.
4. **Z3 constraint verification** — Verify capability grants and trust transitions via SMT.
5. **Causal trust model** — Replace fixed-weight scoring with DAG-based model accounting for task difficulty.

### What NOT to do next

- Full VPIR compiler (needs Bridge Grammar first)
- Tree-sitter DKB (needs HoTT knowledge graph design)
- LLM API calls (needs Bridge Grammar schema)
- Major refactoring (existing modules work; improve incrementally)

---

## Open Questions

1. **Bridge Grammar bootstrap**: Can current LLMs produce valid VPIR nodes via constrained decoding today?
2. **Channel typing**: HoTT types from the start, or simple generics with upgrade path?
3. **IFC granularity**: Per-value (fine, expensive) or per-agent-output (coarse, cheap)?
4. **Z3 scope**: Static properties only, or runtime verification on every event?
5. **Consolidation semantics**: Is episodic→semantic promotion summarization, generalization, or causal abstraction?
6. **The TypeScript question**: When does the paradigm stop being implemented *in* TypeScript and start being implemented *as* its own representation?

---

*Panel session concluded. The board recommends proceeding to Phase 5 with Bridge Grammar as the lead deliverable, supported by concurrent work on the channel/actor layer.*
