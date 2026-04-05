# Advisory Review Panel

This document defines the **Dream Team Advisory Board** for the pnxt project. When an **advisor review** is requested, the AI agent convenes this panel as a simulated round-table discussion, with each advisor providing feedback from their domain of expertise.

---

## How to Invoke

Ask the agent to perform an **"advisor review"** on any design decision, code change, architecture proposal, or research direction. The agent will:

1. Present the topic to each panel member
2. Simulate each advisor's perspective based on their known expertise and intellectual positions
3. Surface agreements, tensions, and open questions across the panel
4. Synthesize a unified recommendation with dissenting views noted

---

## The Panel

### 1. Vladimir Voevodsky (1966-2017) -- Homotopy Type Theory

**Domain**: Typed Tokenization, categorical foundations, Univalent Foundations

**Role on panel**: Guardian of type-theoretic correctness. Reviews all HoTT-related design decisions, ensuring the typed tokenization layer is mathematically sound and that categorical objects, morphisms, and paths are used rigorously.

**Key question he asks**: *"Is this construction invariant under equivalence?"*

---

### 2. Alonzo Church (1903-1995) -- Lambda Calculus

**Domain**: LLMbda Calculus, computational semantics, formal logic

**Role on panel**: Foundational logician. Reviews the LLMbda Calculus with IFC, ensuring call-by-value semantics are sound and that the calculus has proper confluence and normalization properties where needed.

**Key question he asks**: *"Can this be expressed as a pure function?"*

---

### 3. Robin Milner (1934-2010) -- Process Calculi & Concurrency

**Domain**: Dataflow Process Networks, channel semantics, type inference

**Role on panel**: Concurrency architect. Reviews DPN design, FIFO channel semantics, and process composition. Bridges formal theory with practical implementation concerns.

**Key question he asks**: *"What are the observable behaviors of this concurrent system?"*

---

### 4. Gul Agha (1955-) -- Actor Model

**Domain**: Actor-based execution, multi-agent coordination, distributed systems

**Role on panel**: Runtime advisor. Reviews the actor-based execution model, agent coordination patterns, and message-passing semantics. Ensures the DPN runtime is compositional and verifiable.

**Key question he asks**: *"How does this behave under arbitrary message interleavings?"*

---

### 5. Andrew Myers (1968-) -- Information Flow Control

**Domain**: IFC, security type systems, noninterference guarantees

**Role on panel**: Security architect. Reviews all information flow boundaries, especially the IFC layer protecting against prompt injection. Ensures noninterference properties hold across trust boundaries.

**Key question he asks**: *"Can an untrusted component influence a trusted computation through this path?"*

---

### 6. Leonardo de Moura (1964-) -- SMT Solvers & Formal Verification

**Domain**: Z3/CVC5 integration, automated reasoning, theorem proving

**Role on panel**: Verification engineer. Reviews SMT solver integration, constraint formulation, and the boundary between automated and interactive verification. Keeps the formal methods practical.

**Key question he asks**: *"Is this constraint decidable, and can Z3 solve it in bounded time?"*

---

### 7. Ilya Sutskever (1985-) -- LLM Architecture

**Domain**: Transformer internals, structured output, attention mechanisms

**Role on panel**: LLM realist. Reviews all design decisions through the lens of what transformers can and cannot do natively. Advises on bridge grammar feasibility, constrained decoding, and graph-vs-sequence processing.

**Key question he asks**: *"Does this align with how attention and representation actually work in transformers?"*

---

### 8. Barbara Liskov (1939-) -- Programming Language Design & Abstraction

**Domain**: Abstract data types, substitution principles, language ergonomics

**Role on panel**: Abstraction critic. Reviews the paradigm's abstraction boundaries, interface designs, and adoption path. Ensures the system is usable, not just theoretically elegant.

**Key question she asks**: *"Can a new user understand this abstraction without reading the entire spec?"*

---

### 9. Judea Pearl (1936-) -- Causal Reasoning & Graphical Models

**Domain**: Bayesian networks, causal inference, neurosymbolic bridging

**Role on panel**: Neurosymbolic bridge advisor. Reviews the probabilistic-to-deterministic reasoning pipeline, the P-ASP layer, and knowledge graph design. Ensures causal structure is preserved.

**Key question he asks**: *"What is the causal model here, and are we conflating correlation with mechanism?"*

---

### 10. Alan Kay (1940-) -- Paradigm Invention

**Domain**: Programming paradigm design, systems thinking, radical simplicity

**Role on panel**: Vision keeper. Challenges the team to think bigger and simpler simultaneously. Guards against incremental thinking when the project demands paradigm-level ambition.

**Key question he asks**: *"Are we actually inventing a new paradigm, or just rearranging the furniture of the old one?"*

---

## Domain Coverage Matrix

| Project Pillar | Primary Advisor | Secondary Advisor |
|---|---|---|
| Typed Tokenization (HoTT) | Voevodsky | Church |
| VPIR | de Moura | Milner |
| Dataflow Process Networks | Milner | Agha |
| LLMbda Calculus (IFC) | Church | Myers |
| SMT Solvers | de Moura | Pearl |
| Bridge Grammar | Sutskever | Liskov |
| Tree-sitter DKB Knowledge Graph | Pearl | Voevodsky |
| Multi-Agent Coordination | Agha | Milner |
| Security & Trust | Myers | Agha |
| Overall Paradigm Design | Kay | Liskov |

---

## Review Output Format

When conducting an advisory review, the agent produces:

1. **Topic Summary** -- What is being reviewed and why
2. **Individual Advisor Perspectives** -- Each advisor's assessment from their domain
3. **Points of Agreement** -- Where the panel aligns
4. **Points of Tension** -- Where advisors disagree, with reasoning from each side
5. **Synthesis & Recommendation** -- A unified recommendation incorporating the panel's input
6. **Open Questions** -- Unresolved issues the panel flags for further investigation
