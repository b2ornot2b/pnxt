# Sprint 6: "Type Identity" — Univalence Axiom + LLMbda Decision

> **Phase**: 6, Sprint 6
> **Priority**: P2
> **Primary Advisors**: Vladimir Voevodsky, Alonzo Church, Andrew Myers
> **Prerequisite**: Sprint 5 complete
> **Score Target**: 8.2 → 8.5

---

## 1. Sprint Goal

Strengthen the mathematical core: encode true HoTT univalence (the central insight that equivalent types are identical) and formally justify the typed LLMbda Calculus design decision. This sprint makes the "Homotopy" in HoTT meaningful and positions the LLMbda Calculus as the semantic foundation of VPIR.

---

## 2. Alignment Gaps Addressed

### Vladimir Voevodsky — Univalence Axiom
> *"Is this construction invariant under equivalence?"*

The current HoTT layer implements categorical structures (n-paths, groupoids, composition) but the **Univalence Axiom** — the central insight that equivalent types are identical — is not encoded. The `checkUnivalence` function at `higher-paths.ts:257` only checks structural round-trip of functors. Without univalence, we have category theory, not HoTT proper.

### Alonzo Church — LLMbda Calculus Positioning
> *"Can this be expressed as a pure function?"*

The original vision called for **untyped call-by-value** lambda calculus; the implementation is **typed**. Additionally, the LLMbda Calculus is positioned as a verification layer alongside VPIR, rather than as the computational substrate underlying it. Church's concern: the calculus should be the semantic foundation, not an optional annotation.

### Andrew Myers — Typed Justification
> *"Can an untrusted component influence a trusted computation through this path?"*

The typed choice needs formal justification through the lens of IFC: typed lambda calculus enables security-type checking at the term level, which is necessary for noninterference enforcement.

---

## 3. Deliverables

### 3.1 Univalence Axiom Encoding
**File**: `src/hott/univalence.ts`

Replace the structural round-trip check with proper univalence encoding:

**Core principle**: For any equivalence A ≃ B, there exists a path (identity) A = B in the universe of types, and conversely, any path A = B yields an equivalence A ≃ B.

```typescript
interface UnivalenceAxiom {
  /** Given an equivalence, construct the corresponding path. */
  equivalenceToPath(equiv: TypeEquivalence): PathTerm;

  /** Given a path, extract the corresponding equivalence. */
  pathToEquivalence(path: PathTerm): TypeEquivalence;

  /** Verify round-trip: pathToEquiv(equivToPath(e)) ≡ e */
  verifyRoundTrip(equiv: TypeEquivalence): boolean;
}
```

**Connection to VPIR**: When two VPIR graphs are categorically equivalent (same structure up to path-equivalence), the system treats them as *identical* in the knowledge graph — merging nodes, deduplicating reasoning. This has practical consequences: optimized and unoptimized VPIR graphs that are equivalent share verified properties.

**New Z3 property**: `univalence_axiom` — verify that the path-to-equivalence and equivalence-to-path maps are mutual inverses.

### 3.2 Transport Along Paths
**File**: `src/hott/transport.ts`

Implement the computational content of univalence:

```typescript
/**
 * Given a path p: A = B and a type family P, transport P(A) to P(B).
 * This is the fundamental operation that makes univalence useful:
 * properties proved about one type automatically apply to equivalent types.
 */
function transport<A, B>(
  path: PathTerm,          // evidence that A = B
  typeFamily: TypeFamily,  // P : Type → Type
  value: TypeFamilyValue,  // element of P(A)
): TypeFamilyValue;        // element of P(B)
```

**Practical consequence**: If Z3 verifies a property for VPIR graph G1, and G1 is equivalent to G2 (witnessed by a path), then transport gives us the same property for G2 *without re-verification*. This is refactoring correctness: restructuring a VPIR graph preserves all verified properties.

### 3.3 Typed vs. Untyped LLMbda Calculus ADR
**File**: `docs/decisions/typed-llmbda-calculus.md`

Formal Architecture Decision Record:

**Context**: The master prompt specifies untyped call-by-value lambda calculus enriched with IFC. The implementation uses typed lambda calculus.

**Decision**: Typed LLMbda Calculus is a deliberate, justified departure.

**Justification**:
1. **IFC Requirement** (Myers): Security labels must be checked at the type level. In untyped calculus, labels can only be checked dynamically, which admits timing-based leaks between check and use.
2. **Z3 Integration** (de Moura): Type information enables stronger SMT encoding — typed terms produce decidable verification queries; untyped terms require complex encoding with undecidable fragments.
3. **LLM Safety** (Sutskever): LLM-generated code is inherently untrusted. Types catch ill-formed outputs at the boundary rather than at runtime.
4. **Subsumption**: For the class of programs LLMs actually generate (no self-application, no Y-combinator), typed LLMbda subsumes untyped — every well-formed LLM output can be typed.

**Trade-off**: Loss of self-application (Ω = (λx.xx)(λx.xx)) and unrestricted recursion. Gain: compile-time IFC enforcement, decidable verification, and LLM output validation.

### 3.4 LLMbda as Semantic Foundation
**File**: `src/lambda/llmbda.ts` (refactor existing)

Reposition LLMbda Calculus as the semantic layer *underlying* VPIR:

1. **VPIR-Lambda bridge**: Every VPIR node gets an optional `lambdaSemantics: LambdaTerm` field giving its denotation as a lambda term
2. **Execution semantics**: VPIR execution can be understood as beta reduction in the LLMbda Calculus — each VPIR computation step corresponds to a reduction step
3. **Verification bridge**: Z3 properties on VPIR graphs can be expressed as type-level properties on their lambda denotations

This addresses Church's concern that the calculus is a "verification layer, not execution substrate" — it becomes the *meaning* of VPIR, not a parallel annotation.

---

## 4. Acceptance Criteria

| # | Criterion | Advisor | Verification |
|---|-----------|---------|-------------|
| 1 | Univalence encoded: path↔equivalence are mutual inverses | Voevodsky | Z3 `univalence_axiom` returns UNSAT |
| 2 | Transport enables property transfer between equivalent graphs | Voevodsky | Verified property on G1 transfers to equivalent G2 |
| 3 | ADR documents typed vs untyped with formal justification | Church | Document reviewed, rationale sound |
| 4 | LLMbda positioned as semantic foundation of VPIR | Church | VPIR nodes have `lambdaSemantics` denotations |
| 5 | Typed choice formally justified for IFC | Myers | ADR references noninterference requirements |

---

## 5. Technical Dependencies

- `src/hott/higher-paths.ts:257` — existing `checkUnivalence` to be replaced/augmented
- `src/types/hott.ts` — extend with `UnivalenceAxiom`, `Transport`, `TypeEquivalence` types
- `src/types/vpir.ts` — add optional `lambdaSemantics` field to VPIR node types
- `src/verification/z3-invariants.ts` — add `verifyUnivalenceAxiom()` to Z3Context
- `src/lambda/llmbda.ts` — refactor for semantic foundation positioning

---

## 6. Expected Score Impact

| Advisor | Before | After | Rationale |
|---------|--------|-------|-----------|
| Voevodsky | 7.0 | 9.0 | Univalence encoded; n-paths meaningful |
| Church | 6.5 | 8.5 | Decision documented; calculus repositioned |
| Myers | 9.0 | 9.5 | Typed choice formally justified |
| **Composite** | **8.2** | **8.5** | **+0.3** |

---

## 7. Definition of Done

- [x] Univalence axiom encoded with path↔equivalence round-trip
- [x] Transport implemented: properties transfer between equivalent types
- [x] Z3 `univalence_axiom` property verified
- [x] ADR `docs/decisions/typed-llmbda-calculus.md` complete
- [x] VPIR nodes carry `lambdaSemantics` denotations
- [x] ~50 new tests (817 total), all passing
- [x] `npm test`, `npm run typecheck`, `npm run lint` all pass
- [ ] Advisory review checkpoint: Voevodsky, Church, Myers re-assess
