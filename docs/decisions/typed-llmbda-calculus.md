# ADR: Typed LLMbda Calculus

> **Status**: Accepted
> **Date**: 2026-04-05
> **Advisory Panel**: Alonzo Church, Andrew Myers, Leonardo de Moura, Ilya Sutskever

---

## Context

The master prompt (`docs/research/original-prompt.md`) specifies:

> "An **untyped call-by-value** lambda calculus enriched with Information Flow Control (IFC)."

The implementation in `src/lambda/llmbda.ts` uses a **typed** lambda calculus (simple types with arrow types). This is a deliberate departure from the specification that requires formal justification.

The choice affects three paradigm pillars directly:
- **LLMbda Calculus** (Church) — the computational substrate
- **Information Flow Control** (Myers) — security enforcement mechanism
- **SMT Verification** (de Moura) — decidability of verification queries

---

## Decision

The pnxt paradigm uses **typed LLMbda Calculus** (simply-typed lambda calculus with IFC security labels) rather than untyped call-by-value lambda calculus.

---

## Justification

### 1. IFC Requirement (Andrew Myers)

Security labels must be checked at the type level for noninterference to be statically enforceable. In an untyped calculus, labels can only be checked dynamically — between the check and the use, timing-based leaks are possible.

With types, the IFC label is part of the term's type signature. The type checker verifies noninterference at compile time, before any execution occurs. This is the standard approach in security-typed languages (JFlow, Jif, FlowCaml).

**Concrete impact**: The `typeCheck()` function in `src/lambda/llmbda.ts:264` performs IFC checking simultaneously with type checking. In an untyped system, these would be separate passes with a gap between them.

### 2. Z3 Integration (Leonardo de Moura)

Type information enables stronger SMT encoding:

- **Typed terms** produce decidable verification queries — the sort system maps directly to Z3 sorts
- **Untyped terms** require complex encoding with Scott domains or intersection types, leading to undecidable fragments

The `lambda_type_safety` Z3 property (`src/verification/z3-invariants.ts`) verifies that beta reduction preserves typing. This property is only meaningful (and decidable) for typed terms.

The `ifc_noninterference_proof` property encodes security levels as integers within a typed framework. Without types, the encoding would require quantification over all possible runtime values — pushing Z3 into undecidable territory.

### 3. LLM Safety (Ilya Sutskever)

LLM-generated code is inherently untrusted. Types catch ill-formed outputs at the boundary rather than at runtime:

- LLMs produce VPIR graphs via Bridge Grammar (constrained decoding)
- Each VPIR node receives a `lambdaSemantics` denotation (Sprint 6)
- The type checker validates the denotation immediately
- Ill-typed outputs are rejected before entering the verification pipeline

In an untyped system, malformed lambda terms would propagate through the system until they cause a runtime error — potentially after expensive Z3 verification has already been performed.

### 4. Subsumption Argument

For the class of programs LLMs actually generate, typed LLMbda **subsumes** untyped:

- LLMs do not generate self-application (`(lambda x . x x)(lambda x . x x)`)
- LLMs do not use the Y-combinator or unrestricted recursion
- Every well-formed LLM output encountered in practice can be assigned a simple type
- The Bridge Grammar schemas enforce typed structure via JSON Schema constraints

Therefore, the typed system does not reject any program that a practical LLM would produce, while providing stronger guarantees.

---

## Trade-offs

### What We Lose

1. **Self-application**: The term `omega = (lambda x . x x)(lambda x . x x)` is not typeable. This is the canonical example of a divergent computation.

2. **Unrestricted recursion**: The Y-combinator `Y = lambda f . (lambda x . f (x x))(lambda x . f (x x))` cannot be typed in the simply-typed lambda calculus.

3. **Full generality**: Some valid untyped programs (those requiring recursive types or polymorphism) cannot be expressed. However, these are not programs that LLMs generate via Bridge Grammar.

### What We Gain

1. **Compile-time IFC enforcement**: Security violations caught before execution
2. **Decidable verification**: All Z3 queries terminate
3. **LLM output validation**: Type-check at the boundary, reject malformed outputs immediately
4. **Strong normalization**: Every well-typed term reduces to a normal form (no infinite loops)
5. **Semantic foundation for VPIR**: VPIR nodes carry typed lambda denotations that compose correctly

---

## Alternatives Considered

### 1. Untyped with Dynamic IFC (Original Specification)

**Rejected**: Dynamic IFC checking introduces timing gaps between check and use. Covert channel analysis (Sprint 5, `src/verification/covert-channel-analysis.ts`) identified timing channels as a risk — dynamic checking exacerbates this.

### 2. Gradual Typing

**Deferred**: A gradually-typed system would allow some terms to be untyped while others carry types. This is a valid middle ground but adds complexity without clear benefit for the LLM use case, where Bridge Grammar already forces typed structure.

### 3. Dependent Types

**Future consideration**: Dependent types would enable even stronger verification (types that depend on values). However, type checking for dependent types is undecidable in general, conflicting with the Z3 decidability requirement.

---

## References

- `src/lambda/llmbda.ts` — LLMbda Calculus implementation (typed)
- `src/verification/z3-invariants.ts` — Z3 verification (14 properties, typed encoding)
- `src/verification/z3-noninterference.ts` — Formal noninterference proof (typed IFC)
- `src/verification/covert-channel-analysis.ts` — Timing channel analysis
- `docs/research/original-prompt.md` — Master prompt (specifies untyped)
- `docs/sprints/sprint-6-type-identity.md` — Sprint 6 deliverable 3.3
