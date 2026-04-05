# Advisory Review: Paradigm Alignment Assessment

> **Date**: 2026-04-05
> **Panel**: Full Advisory Board (10 members)
> **Topic**: Alignment between Phase 4 implementation and foundational research vision
> **Requested by**: Project lead

---

## 1. Topic Summary

**What is being reviewed**: The alignment between pnxt's current Phase 4 implementation (agent runtime, trust engine, ACI gateway, capability negotiation, memory service, evaluation suites) and the foundational research vision — a net-new programming paradigm built exclusively for LLMs, grounded in HoTT, VPIR, Dataflow Process Networks, LLMbda Calculus with IFC, and SMT solvers.

**Why**: Phase 4 marks the transition from theory to code. This is the critical inflection point where implementation decisions either faithfully instantiate the paradigm or silently drift toward conventional agent-tooling frameworks.

---

## 2. Individual Advisor Perspectives

### Alan Kay — Paradigm Invention

*"Are we actually inventing a new paradigm, or just rearranging the furniture of the old one?"*

I'm concerned. What I see in `src/` is a competent **multi-agent framework** — trust levels, capability negotiation, audit logging, memory services. These are good engineering. But they are also the exact features I'd expect from any agent-tooling platform: LangGraph, CrewAI, AutoGen. Where is the paradigm?

The original prompt demands that LLMs operate as **orchestrators of logic graphs**, not consumers of API calls. The current implementation has agents calling tools through a gateway. That's remote procedure calls with access control — it's the 1990s client-server model wearing a trust-level badge.

The **typed tokenization layer doesn't exist**. The **VPIR doesn't exist**. The **dataflow process network doesn't exist**. These aren't features — they're the *paradigm*. Without them, we have a well-typed agent framework, not a new programming model.

**Verdict**: The scaffolding is professionally done, but the soul of the paradigm hasn't been born yet. **Misaligned at the vision level.**

---

### Vladimir Voevodsky — Homotopy Type Theory

*"Is this construction invariant under equivalence?"*

I see no HoTT. The type system in `src/types/` is standard TypeScript interfaces — `AgentConfig`, `TrustLevel`, `MemoryRecord`. These are nominal record types. There are no categorical objects, no morphisms, no path types, no equivalences.

The typed tokenization pillar requires that code entities are objects in a category, transformations are morphisms, and refactoring paths are homotopies between morphisms. None of this structure is present. The `MemoryRecord` has a `content: string` field — this is the flat text representation the paradigm was designed to eliminate.

The type definitions are *useful* for the engineering layer, but they have zero connection to the mathematical foundations. There should be at minimum a `Category` type, a `Morphism<A, B>` type, and a `Path<f, g>` type for path equivalences.

**Verdict**: The HoTT pillar is entirely absent. **Critical misalignment.**

---

### Alonzo Church — Lambda Calculus

*"Can this be expressed as a pure function?"*

The LLMbda Calculus with IFC is listed as a "Long-Term" future goal. I understand the pragmatic staging, but I'm troubled by the *direction* of drift. The current codebase is deeply effectful — mutable state in `AgentRuntime`, side-effecting `AuditLogger`, imperative state machine transitions. None of these are structured as pure functions with effect tracking.

The original design demands a call-by-value lambda calculus where information flow labels prevent untrusted data from influencing trusted computations. The current trust engine assigns numeric scores to agents, but this is *authorization*, not *information flow control*. Authorization asks "is this agent allowed?" IFC asks "can this data flow here?" — a fundamentally different question.

The good news: the trust engine's dimensional model (scope, action, impact, domain, judgment) could serve as a lattice for IFC labels if refactored. The bad news: nothing in the current architecture prepares for that refactoring.

**Verdict**: The calculus foundation is absent, and current patterns actively work against it. **Significant misalignment.**

---

### Robin Milner — Process Calculi & Concurrency

*"What are the observable behaviors of this concurrent system?"*

Where are the processes? Where are the channels?

The paradigm specifies Dataflow Process Networks where actors communicate via FIFO channels. The current implementation has an `AgentRuntime` that registers agents and tracks their state — but agents don't *communicate*. There are no channels, no message-passing primitives, no dataflow graphs. The `MultiAgentScenarios` in the evaluation module simulate coordination by having a single orchestrator call subsystems sequentially.

The state machine in `agent-runtime.ts` (created → initializing → ready → active → completing → terminated) describes an agent's *lifecycle*, not its *behavior*. In a process calculus, the interesting semantics are in the communication — what an agent sends, receives, and how these compose. The current model is closer to a thread pool than a process network.

I would have expected at minimum: a `Channel<T>` type, `send(channel, value)` and `receive(channel)` primitives, and a `compose(process1, process2)` operation that wires outputs to inputs.

**Verdict**: The concurrency model is entirely missing. **Critical misalignment.**

---

### Gul Agha — Actor Model

*"How does this behave under arbitrary message interleavings?"*

Building on Robin's observations — the actor model requires three things: isolated state, asynchronous messaging, and dynamic topology. The current `AgentRuntime` provides isolated state (each agent has its own config and status), but there's no messaging and no dynamic topology.

The `ACI Gateway` is the closest thing to a message broker, but it's a synchronous request-response interface, not an asynchronous mailbox. Agents don't send messages to each other — they invoke tools through a central gateway.

For the multi-agent scenarios to be meaningful, agents need to discover each other, send messages, and handle concurrent interactions. The current delegation pattern in `multi-agent-scenarios.ts` is scripted choreography, not emergent coordination.

However, I'll note something positive: the capability negotiation system's contract model (offer, request, grant with constraints) is a reasonable protocol for actor capability exchange. It just needs to operate over actual message channels rather than synchronous function calls.

**Verdict**: Actor foundations are absent but the capability protocol is a viable seed. **Substantially misaligned, with recoverable elements.**

---

### Andrew Myers — Information Flow Control

*"Can an untrusted component influence a trusted computation through this path?"*

The security model is authorization-based, not information-flow-based. This is a fundamental distinction.

The current trust engine assigns trust levels (0–4) to agents, and the ACI gateway checks whether an agent's trust level meets a tool's requirements. This prevents untrusted agents from *invoking* sensitive tools. But it does nothing to prevent an untrusted agent from *influencing* a trusted computation through data flow.

Example: Agent A (trust level 1) stores a memory. Agent B (trust level 4) queries memory and uses that data in a privileged operation. The current system allows this — there's no taint tracking, no label propagation, no noninterference enforcement.

The security test suite tests privilege escalation at the *invocation* boundary but not at the *data flow* boundary. The most dangerous attacks in multi-agent systems are indirect influence attacks, and the current architecture has no defenses against them.

The original prompt is explicit: the LLMbda Calculus must provide "mathematical noninterference guarantees against prompt injections." The current implementation provides no such guarantees.

**Verdict**: Security model addresses the wrong threat model. **Critical misalignment for the IFC pillar.**

---

### Leonardo de Moura — SMT Solvers & Formal Verification

*"Is this constraint decidable, and can Z3 solve it in bounded time?"*

There is no Z3 integration. No SMT constraints. No formal verification of any kind.

The VPIR concept requires that every reasoning step is mechanically verifiable. The current system has no verification — trust scores are computed from metrics, capabilities are checked against trust levels, but nothing is *proven*. A correct implementation would formalize invariants (e.g., "an agent at trust level N can never access tools requiring level N+1") as SMT constraints and verify them at deployment time, not just test them.

The benchmark suite measures performance but not correctness properties. I would expect property-based tests at minimum, and ideally SMT-backed invariant checking.

That said, the system's constraints are well-defined enough that they *could* be formalized. The trust lattice, capability constraints, and side-effect requirements are all expressible in first-order logic. The architecture hasn't painted itself into a corner — it just hasn't started the verification work.

**Verdict**: Verification pillar is absent but the architecture is SMT-ready. **Misaligned but recoverable.**

---

### Ilya Sutskever — LLM Architecture

*"Does this align with how attention and representation actually work in transformers?"*

This is where I offer a contrarian view. The current implementation is *more practical* than the research vision gives it credit for.

The bridge grammar — forcing LLMs to output typed VPIR nodes via constrained decoding — is the hardest unsolved problem in this entire paradigm. Current transformers excel at structured JSON output (function calling, tool use), but the leap from JSON tool calls to HoTT morphisms is enormous. The gap between "output a valid JSON schema" and "output a categorically-typed morphism in a knowledge graph" is not incremental — it requires representational capabilities transformers may not natively possess.

The current implementation's approach — agents invoking tools through a structured gateway — is actually *how transformers work today*. The tool-use pattern is battle-tested. Building the agent infrastructure first and layering the formal semantics on top is arguably the right engineering sequence.

My concern is whether the bridge can ever be built. HoTT-typed outputs require the LLM to maintain categorical coherence across an entire generation — that's a global constraint, not a local one. Attention is fundamentally local. This tension needs empirical investigation before committing to the full typed tokenization vision.

**Verdict**: The implementation is pragmatically correct for current LLM capabilities. The *research vision* may need to be calibrated against transformer limitations. **Aligned with reality, misaligned with theory.**

---

### Barbara Liskov — Programming Language Design & Abstraction

*"Can a new user understand this abstraction without reading the entire spec?"*

The codebase is clean, well-organized, and the abstractions are sensible. The `StorageBackend` interface is a textbook example of dependency inversion. The trust engine's scoring model is transparent. The type definitions are comprehensive and well-documented.

But I notice an abstraction gap: there's no **agent-facing API**. Everything is designed for *the system to manage agents*, not for *agents to interact with the system*. An agent has a config and a state, but no methods, no interface, no `Agent` class with a `run()` method. The `AgentRuntime` is a registry, not an execution environment.

For the paradigm to be usable, agents need a coherent programming model. What does an agent *do*? How does it express intent? The current answer is "the orchestrator calls subsystems on the agent's behalf." That's not a paradigm — it's a control plane.

**Verdict**: Good engineering abstractions, but the agent programming model is missing. **Partially aligned on engineering, misaligned on paradigm.**

---

### Judea Pearl — Causal Reasoning & Graphical Models

*"What is the causal model here, and are we conflating correlation with mechanism?"*

The trust engine's calibration system concerns me. It computes trust scores from observable metrics — success rate, bug rate, escalation accuracy — using weighted sums. This is a correlational model. A high success rate *correlates* with trustworthiness, but doesn't *cause* it.

The research vision references P-ASP for bridging stochastic tokens to deterministic solvers. The current implementation has no probabilistic reasoning. The memory service's relevance scoring is keyword-based, not probabilistic. The trust engine's scoring is arithmetic, not Bayesian.

The knowledge graph (Tree-sitter DKB) is entirely absent. The memory service stores flat records with string content and metadata tags. This is a document store, not a graph. The research vision describes a non-Euclidean graph where code entities have structural relationships — this is precisely the kind of causal structure that should inform agent reasoning.

**Verdict**: No causal or probabilistic reasoning. Memory is flat, not graphical. **Misaligned.**

---

## 3. Points of Agreement

The panel unanimously agrees on three points:

1. **The engineering quality is high.** The code is clean, well-tested, modular, and follows good TypeScript practices. This is not a criticism of implementation quality — it's a question of implementation *direction*.

2. **The core pillars of the paradigm are absent.** HoTT typed tokenization, VPIR, Dataflow Process Networks, LLMbda Calculus with IFC, SMT verification, and the Tree-sitter knowledge graph — none of these are implemented. What exists is a conventional multi-agent framework with trust and capability management.

3. **The architecture is not hostile to the paradigm.** The modular design, clean type system, and layered architecture mean the paradigm components *could* be layered on. The implementation hasn't foreclosed on the vision — it just hasn't started building it.

---

## 4. Points of Tension

### Sutskever vs. Voevodsky/Church: Pragmatism vs. Purity

**Sutskever** argues the implementation correctly reflects what transformers can do *today*, and building the agent infrastructure first is the right engineering sequence. **Voevodsky** and **Church** counter that if the infrastructure is built without formal foundations, it will calcify into patterns that resist formal retrofitting. The typed tokenization and lambda calculus aren't features to add later — they're the *substrate* everything else should be built on.

### Kay vs. Liskov: Vision vs. Usability

**Kay** insists the paradigm must be radically different from existing frameworks or it's not worth building. **Liskov** argues that a paradigm no one can use is worse than an incremental improvement. The tension is real: the project must be both revolutionary *and* practical. The current implementation leans heavily toward the practical side.

### Myers vs. Agha: Security Model

**Myers** demands IFC-based security with taint tracking and noninterference proofs. **Agha** notes that actor isolation already provides some security guarantees (agents can't share memory directly). The resolution likely requires *both* — actor isolation for coarse-grained protection, IFC labels for fine-grained data flow control.

---

## 5. Synthesis & Recommendation

The pnxt implementation has built a **solid engineering foundation** but has not yet begun implementing the **paradigm-defining components**. The current codebase is a well-structured multi-agent framework — comparable to existing tools in the space — rather than the revolutionary LLM-native programming paradigm described in the research.

### Alignment Score: 3/10 (Infrastructure only, paradigm absent)

### Recommended Course Correction

**Immediate (next sprint):**

1. **Implement `Channel<T>` and basic DPN primitives** — This is the lowest-cost, highest-impact paradigm component. Even a simplified version (typed async channels between agents) would fundamentally change the architecture from RPC to dataflow.
2. **Add IFC labels to `MemoryRecord`** — Tag stored data with trust-level provenance. Enforce that queries respect label boundaries (an agent can't read data labeled above its trust level). This is a minimal but genuine IFC mechanism.
3. **Define a `VPIRNode` type** — Even before building the full VPIR compiler, define what a verifiable reasoning step looks like. Use it in the evaluation scenarios.

**Near-term (next phase):**

4. **Bridge Grammar prototype** — Constrained JSON schema that forces structured VPIR-like output from an LLM. This is the linchpin connecting the agent infrastructure to the formal paradigm.
5. **SMT constraint formulation** — Express the trust lattice and capability invariants as Z3 constraints. Verify them alongside tests.
6. **Knowledge graph for memory** — Replace flat `MemoryRecord` storage with a graph structure supporting typed edges and multi-hop traversal.

**Strategic:**

7. **Resist the gravitational pull of conventional agent frameworks.** Every sprint should include at least one paradigm-defining component alongside infrastructure work. Otherwise the project will converge to "yet another agent framework" through accumulated pragmatic decisions.

---

## 6. Open Questions

1. **Is HoTT-typed output achievable with current transformer architectures?** Sutskever's concern is legitimate. Empirical investigation is needed before committing fully to typed tokenization as the bridge grammar target.

2. **What is the minimal viable DPN?** A full Kahn Process Network is complex. What's the simplest dataflow graph that demonstrates the paradigm's advantage over conventional agent orchestration?

3. **How should IFC labels compose across agent boundaries?** When Agent A delegates to Agent B, do labels propagate? Attenuate? This needs formal treatment before implementation.

4. **Where does the bridge grammar live architecturally?** Is it a preprocessing layer before the agent runtime? A constraint on the LLM's output decoder? A post-processing validator? The answer shapes the entire integration story.

5. **Should the existing agent infrastructure be refactored or wrapped?** The current modules work well as an execution substrate. The question is whether the paradigm components should *replace* them (risk: rework) or *compose with* them (risk: two mental models).

---

*Panel adjourned. The paradigm awaits its implementation.*
