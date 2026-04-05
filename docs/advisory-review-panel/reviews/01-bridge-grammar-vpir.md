# Advisory Review #1: Bridge Grammar & VPIR Specification

**Date**: 2026-04-05
**Status**: Complete
**Priority**: Foundational

---

## Topic Summary

The Bridge Grammar and VPIR (Verifiable Programmatic Intermediate Representation) are the linchpin of the Agent-Native Programming paradigm -- the mechanism by which standard autoregressive LLMs output valid typed graph nodes instead of flat text. Phase 2 research (external Google Doc) specified this theoretically, but no formalization or implementation exists in the repository. The panel advises on: grammar constraint strictness, VPIR node design, constrained decoding feasibility, verification scope, and an MVP path.

---

## Individual Advisor Perspectives

### Vladimir Voevodsky -- Homotopy Type Theory

VPIR nodes map naturally to morphisms in a category, but the power of HoTT lies in higher structure: paths between paths, equivalences, and univalence. A flat JSON schema cannot capture this.

**Requirements**:
1. A type universe hierarchy in the VPIR schema -- nodes must declare their type level (level 0: data transforms, level 1: compositions of transforms, level 2: equivalences between compositions)
2. Path constructors as first-class VPIR nodes -- the system must express that two pipelines are equivalent paths, not just "two different programs"
3. Invariance under equivalence -- the JSON schema must make it impossible to write a node that distinguishes between equivalent representations

**Verdict**: MVP should be a simply-typed categorical IR (objects, morphisms, composition, identity). Design extensibly so path types can be added without breaking existing nodes. Do not attempt full HoTT encoding in the MVP.

---

### Alonzo Church -- Lambda Calculus

The proposal conflates two distinct things: a representation format (the JSON schema) and a calculus (the computational semantics). These must be separated cleanly.

**Requirements**:
1. VPIR core terms: variables, abstractions, applications, let-bindings, and primitives
2. Type annotations are mandatory, not optional -- constrained decoding should reject ill-typed terms at generation time
3. IFC labels must be part of the type, not metadata -- `String@Secret` is fundamentally different from `String@Public`
4. Call-by-value is correct for an agent system -- call-by-need would make IFC reasoning unsound

**Verdict**: Define the term language first, then derive the JSON schema from it. IFC labels in types, not metadata. JSON is acceptable serialization.

---

### Robin Milner -- Process Calculi & Concurrency

The critical missing piece is concurrency. VPIR treats operations as sequential pipeline stages, but the paradigm requires actors communicating via FIFO channels.

**Requirements**:
1. VPIR nodes should be processes, not functions -- send, receive, parallel composition, choice
2. Channel types must be part of the schema -- session types give each channel a protocol, not just a data type
3. Parallel composition (`P | Q`) must be a VPIR primitive
4. Recursive process definitions for long-running actors

**Disagreement with Church**: Pure lambda calculus is insufficient. VPIR needs lambda calculus extended with communication primitives. The pi-calculus provides exactly this.

**Verdict**: Two-tier design: CCS-like process terms for the concurrency layer, lambda terms for data transformation within actors.

---

### Gul Agha -- Actor Model

**Requirements**:
1. Top-level VPIR node should be an `ActorSystem` containing named actors, mailbox types, and behavior definitions
2. Actor behaviors must be expressible as state machines (receive, update state, send, transition)
3. Fairness guarantees must be specified -- every actor must eventually process its messages
4. Supervision trees belong in VPIR (restart strategies for failed actors)

**Bridge Grammar recommendation**: Include a `topology` section at the top level declaring all actors and channels before defining behaviors. This matches LLM reasoning patterns (outline first, then detail).

**Verdict**: VPIR top-level is an ActorSystem with topology + behaviors. Include supervision. Specify fairness guarantees.

---

### Andrew Myers -- Information Flow Control

Prompt injection is an information flow violation. The Bridge Grammar must enforce IFC structurally.

**Requirements**:
1. Every VPIR value must carry a security label forming a lattice: `Public <= AgentInternal <= SystemTrusted`
2. The Bridge Grammar must reject label-violating programs at parse time via constrained decoding
3. Declassification must be explicit with a `declassify` operator and justification field
4. Existing trust levels (Observer through Autonomous) should map to IFC labels

**Verdict**: Security labels are mandatory in VPIR types. Two-level lattice (`Untrusted`/`Trusted`) for MVP. Constrained decoding must enforce label discipline.

---

### Leonardo de Moura -- SMT Solvers & Formal Verification

**What Z3 can do for VPIR**:
- Type checking (decidable, fast)
- IFC label checking (decidable for finite lattices)
- Pre/post-condition checking (decidable for quantifier-free theories)
- Bounded model checking (finite steps)

**What Z3 cannot practically do**:
- Prove arbitrary properties of recursive actor systems (undecidable)
- Verify liveness properties (safety only)
- Full HoTT path equality (requires Lean, not Z3)

**Recommendations**:
1. Use SMT for the Bridge Grammar validator -- encode type constraints as SMT queries
2. Use SMT for IFC checking -- noninterference for finite lattices is decidable
3. Do NOT use SMT for full program verification -- verify nodes locally, compositionality from type system
4. Include a `constraints` field on each VPIR node with first-order assertions feeding Z3

**Verdict**: SMT for type checking + IFC label checking (fast, decidable). Defer program-level verification to later phases.

---

### Ilya Sutskever -- LLM Architecture

**Constrained decoding realities**:
- Modern LLMs reliably generate structured JSON with schemas of moderate complexity
- Fundamental tension: more constrained grammar = less leverage of learned representations
- Grammar should handle syntactic correctness; LLM should make semantic decisions

**Recommendations**:
1. Two-pass generation: natural language plan first, then constrained VPIR JSON (transformers need chain-of-thought)
2. Keep schema under ~50 distinct node types (accuracy drops precipitously beyond this)
3. Reference resolution over inline definition (attention handles references well, struggles with deep nesting)
4. Do NOT expect LLMs to generate valid IFC labels -- infer labels from topology and data sources

**Verdict**: Two-pass generation. Under 50 node types. Infer security labels. Reference-based topology.

---

### Barbara Liskov -- Programming Language Design & Abstraction

**Key concern**: Who is the user of VPIR? If humans need to debug or inspect it, the representation must be understandable.

**Recommendations**:
1. Separate abstract syntax from concrete syntax -- VPIR has a formal definition with multiple concrete representations (JSON for LLMs, visual graph for humans, textual for docs)
2. Crisp abstraction boundaries -- actor interface (messages, types) separate from implementation (behavior)
3. Actionable error messages -- Z3 rejections must tell the LLM what to fix with witnesses
4. Start with a small, complete language covering the weather API benchmark end-to-end

**Verdict**: Abstract syntax separate from concrete. Interface/implementation separation. Small complete MVP.

---

### Judea Pearl -- Causal Reasoning & Graphical Models

**Key concern**: VPIR represents computation but not causation. The causal provenance of decisions is lost.

**Recommendations**:
1. VPIR nodes should carry causal annotations -- what caused the node to be generated (user instruction, agent reasoning, external trigger, delegation)
2. The knowledge graph should be a causal model, distinguishing `A causes B` from `A correlates with B`
3. Support `do()` operator semantics for interventional reasoning (counterfactual queries)

**Verdict**: Add causal provenance to every VPIR node. Plan for interventional reasoning.

---

### Alan Kay -- Paradigm Invention

**Challenge to the panel**: Are we building something genuinely new, or encoding existing ideas in JSON?

**Provocations**:
1. Why start from lambda calculus? LLMs think in patterns, analogies, and continuations -- not lambda terms. What would a calculus designed for transformers look like?
2. Why separate plan from program? In a truly LLM-native paradigm, natural language intent should be first-class in VPIR, not a discarded scaffold
3. The Bridge Grammar should be a conversation, not a form -- iterative dialogue between LLM and verifier, not single-shot constrained generation

**Verdict**: Build conventional MVP on established theory AND run a parallel experiment with conversational verification. Let data decide which paradigm is actually new. Keep natural language intent as first-class in VPIR.

---

## Points of Agreement

1. **MVP should be small and complete** -- prove the concept with the weather API benchmark (5-10 node types per tier) before scaling. (Liskov, de Moura, Sutskever, Voevodsky)

2. **Type annotations are mandatory** -- VPIR nodes must carry their types explicitly. No type inference in the MVP. (Church, Voevodsky, Myers, de Moura)

3. **Security labels must be structural, not metadata** -- IFC labels belong in the type system. (Myers, Church, de Moura)

4. **JSON is acceptable serialization for the MVP** -- constrained decoding is a solved problem; focus on semantics. (Church, Sutskever, Liskov)

5. **SMT verification should be local, not global** -- verify individual nodes and interfaces; compositionality from the type system. (de Moura, Milner, Liskov)

6. **Provenance/causality metadata is valuable** -- knowing why a node exists aids debugging, trust, and audit. (Pearl, Myers, Agha)

---

## Points of Tension

### Tension 1: Lambda Calculus vs. Process Calculus

- **Church**: VPIR should be lambda terms. Functions are the right abstraction.
- **Milner**: VPIR must be process terms. Concurrency is fundamental.
- **Resolution**: Two-tier design. Process layer (actors, channels) for concurrency. Value layer (lambda terms) for computation within actors. Both serialize to JSON.

### Tension 2: LLM-Generated Labels vs. Inferred Labels

- **Myers**: Every value must carry a security label as part of its type.
- **Sutskever**: LLMs cannot reliably generate correct security labels. Infer them.
- **Resolution**: Infer labels from declared data sources and topology (Sutskever), represent them in the type system (Myers), verify via Z3 (de Moura).

### Tension 3: Conventional vs. Paradigm-Breaking Design

- **Kay**: Lambda calculus may be the wrong foundation. Explore LLM-native alternatives.
- **Church, Voevodsky, Milner**: Established theory has centuries of rigor.
- **Resolution**: Build MVP on established theory. Run parallel experiment with conversational verification. Compare empirically.

### Tension 4: Full HoTT vs. Simple Types

- **Voevodsky**: Path types and equivalence are essential for the vision.
- **de Moura, Liskov**: Full HoTT is not SMT-decidable and not practical for MVP.
- **Resolution**: Simple types + explicit composition for MVP. Design schema extensibly for path types. Add HoTT when type checker graduates from Z3 to Lean.

---

## Synthesis & Recommendation

### Recommended MVP Architecture: Two-Tier VPIR

```
Bridge Grammar (JSON Schema)
        |
        v
+---------------------------+
|   Process Layer (Tier 1)  |  <- Actors, channels, topology, supervision
|   Based on: CCS/pi-calc   |  <- Session-typed channels
|   ~10 node types           |  <- ActorSystem, Actor, Channel, Send, Receive,
|                            |     Parallel, Choice, Recurse, Supervise, Stop
+----------+----------------+
           | (actor behaviors contain)
           v
+---------------------------+
|   Value Layer (Tier 2)    |  <- Data transformation within actors
|   Based on: typed lambda   |  <- Variables, abstractions, applications,
|   ~10 node types           |     let-bindings, primitives, literals
|   IFC labels in types      |  <- Every value typed as T@Label
+---------------------------+
           |
           v
+---------------------------+
|   Metadata (per node)     |  <- Provenance, constraints, natural language intent
|   provenance: CausalOrigin |
|   constraints: SMT asserts |
|   intent: string           |  <- Kay's "intent as first-class"
+---------------------------+
```

### MVP Scope: Weather API Benchmark

- ~20 node types total (10 process + 10 value)
- 2-level IFC lattice: `Untrusted` / `Trusted`
- Labels inferred from data sources, checked by Z3
- Two-pass generation: natural language plan, then constrained JSON
- Local SMT verification: type checking + IFC label checking per node
- Provenance field on every node
- JSON serialization with schema under 50 distinct types

### Implementation Order

1. Define the VPIR abstract syntax (TypeScript types + formal grammar)
2. Create the Bridge Grammar JSON schema
3. Build the Z3-based type checker and IFC verifier
4. Implement constrained decoding integration (Claude/GPT structured output)
5. Execute the weather API benchmark end-to-end
6. Evaluate and iterate

---

## Open Questions

1. **Should the Phase 1-2 external research (Google Doc) be retrieved and committed to the repository?** The panel cannot fully validate alignment without seeing what was already specified.

2. **Which LLM API to target first for constrained decoding?** Claude's tool use / structured output vs. OpenAI's function calling vs. model-agnostic approach.

3. **How should the visual decompiler (human oversight) interact with the two-tier VPIR?** Does it show the process layer as a graph and the value layer as pseudocode within nodes?

4. **Should Kay's conversational-verification experiment be pursued in parallel with the conventional approach?** Resource implications vs. paradigm validation value.

5. **What is the performance budget for SMT verification?** Per-node verification should be under what latency threshold to remain practical for real-time agent execution?
