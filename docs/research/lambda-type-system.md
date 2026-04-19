# LLMbda Calculus Type System: Should pnxt Adopt Hindley-Milner Extensions?

**Date:** 2026-04-19
**Status:** Position paper — tentative recommendation, pending empirical data
**Audience:** pnxt core contributors, advisory reviewers

---

## Abstract

pnxt's LLMbda Calculus (`src/lambda/llmbda.ts`) currently uses a first-order type system: only `'base'` and `'arrow'` types, no polymorphism, no unions, no nullable types. Weft and similar LLM-tooling systems extend their calculi with Hindley-Milner (HM) inference, generics, sum types, and null propagation. This paper asks whether pnxt should follow suit. The tentative answer is: **not yet, and possibly never — but the question must be answered from retry data, not from priors.** The lever is whichever layer catches the most bridge-grammar retries. Build the telemetry first; decide on HM from what the data shows.

---

## 1. The Current Calculus

`src/types/lambda.ts:26-38` defines the complete type language:

```typescript
export interface LambdaType {
  tag: 'base' | 'arrow';
  name?: string;
  param?: LambdaType;
  result?: LambdaType;
}
```

Two constructors. Nothing else. A `'base'` type is a named atom (`'Int'`, `'Bool'`, `'String'`, or any string the caller supplies). An `'arrow'` type is a function from `param` to `result`. There are no type variables, no universal quantifiers, no sum types (`A | B`), no product types (`A * B`), no option wrapper (`T?`), and no recursive types.

The type-checker in `src/lambda/llmbda.ts:130-137` is structural and nominal:

```typescript
export function typesEqual(a: LambdaType, b: LambdaType): boolean {
  if (a.tag !== b.tag) return false;
  if (a.tag === 'base' && b.tag === 'base') return a.name === b.name;
  if (a.tag === 'arrow' && b.tag === 'arrow') {
    return typesEqual(a.param!, b.param!) && typesEqual(a.result!, b.result!);
  }
  return false;
}
```

There is no inference pass. There is no algorithm W. There is no unification. When `checkTerm` (line 279) encounters an application, it checks `typesEqual(funcType.param!, argType)` directly (line 332). Either the types match literally or a `'Type mismatch'` error is pushed. There is no opportunity for a type variable to be unified with a concrete type.

IFC security labels live entirely outside the type lattice. `LambdaTerm` carries a `label: SecurityLabel` field (line 50 in `src/types/lambda.ts`), and violations accumulate in a separate `IFCViolation[]` channel (lines 121-122, 267). A term's security classification is not encoded in its `LambdaType`; it is orthogonal to it. An expression of type `base('Int')` at trust level 0 and an expression of type `base('Int')` at trust level 3 have identical `LambdaType` representations. The type system sees them as the same; the IFC subsystem distinguishes them.

This design is not an oversight. The calculus is intentionally first-order so that its primary artifact — a VPIR graph — can be checked against a flat JSON schema without a type-inference engine in the critical path.

---

## 2. The HoTT Layer

`src/types/hott.ts` defines a rich categorical vocabulary: `HoTTObject`, `Morphism`, `HoTTPath`, `HigherPath`, `NPath`, `GroupoidStructure`, `Functor`, `CategoryEquivalence`, and `UnivalenceWitness` (lines 37-308). This machinery operates at the level of code entities and transformations, not at the level of lambda term types.

`src/hott/vpir-bridge.ts:44-50` makes the layering concrete: VPIR nodes become HoTT objects, VPIR dependency edges become morphisms, and composition nodes become composed morphisms. The HoTT layer is a categorical view of the reasoning graph — it is not a type-refinement pass over lambda terms. A path in `src/types/hott.ts:84-96` witnesses that two morphisms (transformations) are homotopically equivalent. That is a statement about program equivalence, not about the type of a value inside a term.

The consequence is that adding HM to `LambdaType` would not conflict with the HoTT layer. They live at orthogonal levels:

- HoTT: categorical structure over VPIR reasoning graphs (`src/hott/vpir-bridge.ts`)
- Lambda types: structure over individual computational terms (`src/types/lambda.ts`)

However, there is a non-trivial interaction worth noting. HoTT path-based equivalence (`TypeEquivalence`, `src/types/hott.ts:317-338`) already provides a notion of type equivalence `A ≃ B`. In a sufficiently developed HoTT layer, this can subsume some of what HM union types offer categorically: instead of `A | B` as a sum type, one might describe a span `A ← C → B` as a categorical construction. Whether this categorical encoding is more useful than a straightforward union type depends on what the system needs to express. That question, too, is empirical.

---

## 3. The Weft Comparison

Weft-style Hindley-Milner type systems for LLM-authored code provide four capabilities that pnxt's current calculus lacks:

**Generics (universal quantification).** A polymorphic handler `∀α. α → α` can be instantiated at any type. In pnxt, a handler that operates on `base('String')` cannot be reused for `base('Int')` without code duplication.

**Sum types / unions.** A handler whose output varies by input shape — returning either an error record or a success record — cannot be represented as a single `LambdaType` in the current calculus. The caller must resolve ambiguity by naming conventions, not by type.

**Null propagation / option types.** A handler output that may be absent (`T?`) has no representation. A field that might be missing in a JSON payload must be typed as `base('unknown')` or elided from the type entirely. Neither is verifiable.

**Algorithm W inference.** Without inference, every variable binding requires an explicit type annotation in the context (`TypeContext`, `src/types/lambda.ts:103`). The LLM generating VPIR must supply every type; there is no fallback.

These are real expressiveness gaps. Weft's defense is: by the time LLM-authored code reaches the type-checker, HM inference catches argument-count mismatches, shape mismatches, and nullable field omissions that would otherwise surface as runtime errors.

---

## 4. Pnxt's Upstream Defense

Pnxt's defense against malformed programs is not located at the type-checker. It is located further upstream, at the constrained-decoding Bridge Grammar.

`src/bridge-grammar/llm-vpir-generator.ts:67-125` implements the generation loop. The LLM is forced to emit output through a tool-use call (`tool_choice: { type: 'tool', name: 'emit_vpir_graph' }`, line 125). The tool's input schema is the VPIR JSON schema defined in `src/bridge-grammar/vpir-schema.ts`. The schema validator at `src/bridge-grammar/schema-validator.ts` runs `parseVPIRGraph` (line 149) on every response before it is accepted. If validation fails, the errors are serialized back to the LLM as a correction prompt and the loop retries (lines 161-167), up to `maxRetries` attempts (default 2, line 103).

`src/bridge-grammar/bridge-errors.ts:18-31` documents the taxonomy of failure categories the system already distinguishes:

- `SCHEMA`: JSON structure violations (missing fields, wrong types)
- `SEMANTIC`: Valid JSON but invalid VPIR semantics (wrong evidence types, etc.)
- `HANDLER`: References to non-existent tool handlers
- `TOPOLOGY`: Graph structure issues (cycles, dangling refs, missing roots)
- `TRUNCATION`: Partial or incomplete LLM output
- `CONFIDENCE`: Confidence scores below threshold

Of these, `SCHEMA` and `TOPOLOGY` errors are almost entirely structural — the kind of error a JSON schema or a DAG-validity check catches. These categories overlap substantially with what HM would catch: a `SCHEMA/MISSING_FIELD` error is often equivalent to a missing required type annotation, and a `TOPOLOGY/DANGLING_REF` is equivalent to an unbound variable. The Bridge Grammar is already catching them at generation time.

The `categorical-tokenizer.ts` experiment (`src/experiments/categorical-tokenizer.ts:49-95`) adds another upstream filter: the ~50-token categorical vocabulary with morphism composition rules enforces that adjacent tokens in a generation sequence are categorically compatible (e.g., an `observation` token can be followed by `inference`, `action`, or `dataflow`, but not by `composition` directly). This rejects structurally ill-formed token sequences before they reach schema validation.

The net effect: many errors that HM would catch at type-check time are caught at generation time by the combination of constrained tool-use, JSON schema validation, and categorical token composition. The lambda type-checker is rarely the first line of defense, and in many cases it is not exercised at all before a VPIR graph is accepted.

---

## 5. What HM Would Add

If pnxt extended `LambdaType` with HM, the concrete additions would be:

**Type variables.** A new tag `'var'` with a name field. Algorithm W would unify type variables with concrete types during inference. Polymorphic handlers would be expressible as `∀α. arrow(var('α'), var('α'))`.

**Sum types.** A new tag `'union'` with an array of member types. Handler outputs that vary by input shape — the dominant pattern in LLM-authored code — would be representable.

**Option types.** A new tag `'option'` wrapping a base type. Fields that may be absent would have a typed representation rather than being typed as `base('unknown')`.

**Algorithm W.** The inference pass would replace the current `typesEqual` check with a unification procedure, propagating type constraints across the term tree and filling in type variables.

These would be genuine additions. Polymorphic handlers would reduce code duplication in the VPIR schema. Sum types would make handler output contracts explicit and machine-checkable. Option types would make nullable field handling verifiable rather than implicit.

---

## 6. What HM Would Cost

Three concrete costs are worth naming before committing.

**Interaction with IFC labels.** IFC labels are currently orthogonal to `LambdaType` (`src/types/lambda.ts:50`, `src/types/lambda.ts:103-105`). Under HM, the question becomes: are security labels a dimension of the type (e.g., `int@trust0`), or do they remain a separate lattice? Folding labels into types would allow the type-checker to enforce noninterference without a separate walk (`checkNoninterference`, `src/lambda/llmbda.ts:363-386`), but it would substantially complicate the type language and require a dependent-type-style treatment to handle label polymorphism correctly.

**Interaction with Z3 encoding.** `src/verification/z3-graph-verifier.ts` encodes graph structure (acyclicity, input completeness, IFC monotonicity, handler trust) as Z3 integer-ordering and Boolean constraints (lines 58-296). These are quantifier-free. HM universal quantification (`∀α`) requires first-order quantifier logic. Z3 supports quantifiers, but the current encoding exercises none of that machinery. Extending the Z3 verifier to reason about polymorphic types would require a substantially different encoding strategy and would increase solver complexity.

**Interaction with Bridge Grammar schemas.** The JSON schema in `src/bridge-grammar/vpir-schema.ts` encodes the structure of valid VPIR nodes. If `LambdaType` gains type variables and unions, the schema must represent them. More complex type expressions in the schema mean a larger, more ambiguous generation target for the LLM. Constrained decoding works well on flat, finite schemas; it is less effective on recursive, polymorphic schemas. The upstream defense may weaken precisely as the downstream defense strengthens.

**Risk of duplicating HoTT.** As noted in section 2, HoTT path-based equivalence already provides a notion of type equivalence at the categorical level. If the team extends both the lambda type system (with HM) and the HoTT layer (with categorical type families), there is a risk of building two overlapping representations of the same concept. The interaction cost of maintaining consistency between them would be non-trivial.

---

## 7. Decision Framework

The open empirical question is: what fails in practice? What are the actual retry reasons in the Bridge Grammar loop?

`src/bridge-grammar/llm-vpir-generator.ts:162-167` currently logs retries as unstructured strings:

```typescript
const attemptErrors = validationResult.errors.map(
  (e) => `[${e.code}] ${e.path}: ${e.message}`,
);
errors.push(`Attempt ${attempt + 1}: Validation failed — ${attemptErrors.join('; ')}`);
```

The error codes are present (from `src/bridge-grammar/bridge-errors.ts:72-110`), but they are embedded in a string and discarded after the retry loop. There is no persistent telemetry, no aggregation, and no categorization across sessions.

The proposed telemetry-first approach:

**Step 1.** Instrument `src/bridge-grammar/llm-vpir-generator.ts` to persist each retry event with its structured error codes. Emit a record containing: attempt number, error category (from `BridgeErrorCategory`), error code, JSON path, and task description hash.

**Step 2.** Categorize accumulated retry records into four buckets:
- (a) `SCHEMA` / `TOPOLOGY` / `TRUNCATION`: structural errors the Bridge Grammar already catches
- (b) Type-level mismatches: argument-count wrong, shape wrong, nullable field absent — errors HM would additionally prevent
- (c) Semantic errors: wrong handler chosen, wrong prompt interpretation, missing domain context
- (d) Other

**Step 3.** After N=100 retry events (a realistic corpus for a research prototype), evaluate the distribution:
- If bucket (b) dominates: HM extension is well-motivated. The residue that survives constrained decoding is type-adjacent, and HM would intercept it.
- If bucket (c) dominates: the lever is elsewhere. Prompt engineering, handler documentation quality, and retrieval augmentation would yield more improvement per unit of implementation effort than a type-system extension.
- If bucket (a) still dominates: the Bridge Grammar schema is not tight enough; tighten the schema before adding HM.

This is not a difficult engineering decision to set up. It requires one structured log record per retry loop iteration. The architectural work of HM extension is substantially larger.

---

## 8. Tentative Recommendation

Defer HM extensions until the retry telemetry data arrives.

The current calculus (`tag: 'base' | 'arrow'`, `src/types/lambda.ts:28`) is not a limitation to be apologized for. It is a deliberate scope boundary that keeps the type-checker simple, keeps the Z3 encoding quantifier-free, and keeps the Bridge Grammar JSON schema flat enough for reliable constrained decoding. Document it as such.

The recommended immediate actions:

1. Add a comment to `src/types/lambda.ts` above the `LambdaType` interface explaining that the two-tag design is deliberate. Link to this paper. Note the HM defer decision and the condition under which it should be revisited (retry bucket (b) dominating after N=100 events).

2. Instrument `src/bridge-grammar/llm-vpir-generator.ts` to emit structured retry telemetry. This is a small change with high diagnostic value.

3. Do not implement HM now. The risk of weakening the Bridge Grammar's upstream defense by making the JSON schema more complex is not justified by current evidence.

---

## 9. Open Questions

**Is the correct next step a retry-telemetry spike rather than a type-system spike?** Yes, based on the analysis above. The type-system spike requires changes to the type language, the type-checker, the Z3 encoding, and the Bridge Grammar schema. The telemetry spike requires changes to one function in `src/bridge-grammar/llm-vpir-generator.ts`. The telemetry spike provides the data needed to justify or reject the type-system spike.

**Should IFC labels be types?** The current separation — labels as a `SecurityLabel` field on `LambdaTerm`, flowing violations reported separately — is workable and simple. If HM is eventually adopted, the question becomes unavoidable: label-polymorphic functions (handlers that operate correctly at any security level) require either label variables in the type, or a separate label-polymorphism mechanism. This is an open design question; the literature on dependent information flow types (Zdancewic, Myers) is relevant. It is not a question that needs answering today.

**Is there a categorical equivalent of HM inference over morphisms?** In principle, yes. Algorithm W can be formulated as a functor between categories of typing derivations. The HoTT layer (`src/hott/`) provides the categorical vocabulary that such a formulation would need. Whether this is a productive direction depends on whether the team is building a type-theoretic foundation or a working system. The two goals are not incompatible, but they have different time horizons.

---

## Referenced Code Locations

| Claim | File | Lines |
|-------|------|-------|
| `LambdaType` — two-tag union | `src/types/lambda.ts` | 26-38 |
| `LambdaTerm` — IFC label field | `src/types/lambda.ts` | 44-53 |
| `TypeCheckResult` — IFC violations channel | `src/types/lambda.ts` | 110-122 |
| `typesEqual` — nominal structural equality, no inference | `src/lambda/llmbda.ts` | 130-137 |
| `checkTerm` — type mismatch without unification | `src/lambda/llmbda.ts` | 279-352 |
| `checkNoninterference` — separate IFC walk | `src/lambda/llmbda.ts` | 363-386 |
| HoTT type hierarchy — categories, morphisms, paths | `src/types/hott.ts` | 37-308 |
| VPIR-to-HoTT bridge — VPIR nodes become HoTT objects | `src/hott/vpir-bridge.ts` | 44-50 |
| Bridge Grammar retry loop | `src/bridge-grammar/llm-vpir-generator.ts` | 103-176 |
| Retry error string serialization (no persistent telemetry) | `src/bridge-grammar/llm-vpir-generator.ts` | 162-167 |
| `BridgeErrorCategory` taxonomy | `src/bridge-grammar/bridge-errors.ts` | 18-31 |
| Error code constants | `src/bridge-grammar/bridge-errors.ts` | 72-110 |
| Categorical token vocabulary (~50 tokens) | `src/experiments/categorical-tokenizer.ts` | 49-95 |
| Morphism composition rules between token categories | `src/experiments/categorical-tokenizer.ts` | 55-85 |
| Z3 verifier — quantifier-free integer/Boolean encoding | `src/verification/z3-graph-verifier.ts` | 58-296 |
