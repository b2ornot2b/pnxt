# Sprint 3: Bridge Grammar + LLM Output Validation

> **Status**: Planned
> **Paradigm Pillars**: Bridge Grammar, Typed Tokenization (partial)
> **Alignment Impact**: 6/10 → 7/10
> **Advisory Drivers**: Sutskever (transformer feasibility), Voevodsky (typed output), Liskov (usability), Kay (paradigm)
> **Depends on**: Sprint 2 (VPIR node types are the bridge grammar's target)

---

## Objective

Build the constrained-decoding bridge that forces LLM output into valid VPIR structures. This is the linchpin connecting the agent infrastructure to the formal paradigm — the point where LLM token generation meets typed, verifiable computation. This sprint also empirically tests Sutskever's concern about whether transformers can maintain categorical coherence in structured output.

---

## Deliverables

### 1. Bridge Grammar JSON Schema

**File**: `src/bridge/schema.ts`

A strict JSON schema that defines the valid output format for LLM-generated VPIR nodes. Designed for use with structured output / function-calling APIs.

```typescript
interface BridgeSchema {
  // The top-level schema for LLM output
  readonly nodeSchema: JSONSchema;       // single VPIR node
  readonly graphSchema: JSONSchema;      // complete VPIR graph
  readonly constraintSchema: JSONSchema; // constraint expression

  // Validate raw JSON against the schema
  validate(input: unknown): BridgeValidationResult;
}

type BridgeValidationResult =
  | { valid: true; node: VPIRNode }
  | { valid: true; graph: VPIRGraph }
  | { valid: false; errors: BridgeValidationError[] };

interface BridgeValidationError {
  path: string;         // JSON path to the error
  expected: string;     // what the schema expected
  received: string;     // what was actually provided
  suggestion?: string;  // how to fix it
}
```

### 2. Schema Definitions

**File**: `src/bridge/schemas/vpir-node.schema.json`

The actual JSON schema files, structured for:

- **Node emission**: LLM outputs a single VPIR node with typed ports, constraints, and metadata
- **Graph construction**: LLM outputs a set of nodes with edge definitions
- **Constraint specification**: LLM outputs preconditions/postconditions as structured constraint trees
- **Incremental building**: LLM can emit nodes one at a time, and the system assembles the graph

Key schema properties:
- `kind` is a strict enum (transform, assertion, branch, aggregate, source, sink)
- `inputs`/`outputs` ports require explicit type annotations
- `preconditions`/`postconditions` use the constraint algebra from Sprint 2
- Port types are recursive (supporting nested records, arrays, unions)

### 3. Schema Validator

**File**: `src/bridge/validator.ts`

Runtime validation layer that goes beyond JSON schema:

- **Type compatibility checking** — port types on edges must be compatible
- **Constraint well-formedness** — constraint expressions reference valid ports and fields
- **Graph acyclicity** — submitted graphs must be DAGs
- **Label consistency** — IFC labels on ports must satisfy flow constraints
- **Helpful error messages** — when validation fails, explain *why* and suggest fixes

```typescript
interface BridgeValidator {
  validateNode(raw: unknown): BridgeValidationResult;
  validateGraph(raw: unknown): BridgeValidationResult;
  validateIncremental(existing: VPIRGraph, newNode: unknown): BridgeValidationResult;
}
```

### 4. Bridge Decoder

**File**: `src/bridge/decoder.ts`

Transforms validated JSON into typed VPIR structures:

```typescript
interface BridgeDecoder {
  // Parse and validate raw LLM output into VPIR structures
  decodeNode(raw: unknown): VPIRNode;
  decodeGraph(raw: unknown): VPIRGraph;
  decodeConstraint(raw: unknown): Constraint;

  // Incremental: add a node to an existing graph
  appendNode(graph: VPIRGraph, raw: unknown): VPIRGraph;
}
```

### 5. Prompt Templates for VPIR Emission

**File**: `src/bridge/prompts.ts`

System prompt fragments that instruct an LLM to emit valid VPIR nodes:

- **Node emission prompt** — "Output a single VPIR node as JSON matching this schema..."
- **Graph construction prompt** — "Given these existing nodes, output the next node and its edges..."
- **Constraint specification prompt** — "Express the following requirement as a precondition..."
- **Few-shot examples** — 3-5 examples of valid VPIR nodes for common operations

```typescript
interface BridgePrompts {
  nodeEmission(context: PromptContext): string;
  graphConstruction(existing: VPIRGraph, task: string): string;
  constraintSpecification(requirement: string): string;
  fewShotExamples(): VPIRNode[];
}
```

### 6. Empirical Feasibility Evaluation

**File**: `src/bridge/evaluation.ts`

Test suite that evaluates whether current LLMs can produce valid VPIR output:

- **Schema compliance rate** — % of LLM outputs that pass JSON schema validation
- **Type correctness rate** — % of outputs with correctly typed ports
- **Constraint quality** — % of outputs with meaningful (non-trivial) pre/postconditions
- **Graph coherence** — when building multi-node graphs, % of edges that type-check
- **Repair rate** — when output is invalid, can a follow-up prompt fix it?

This directly addresses Sutskever's open question about transformer limitations.

```typescript
interface FeasibilityReport {
  totalAttempts: number;
  schemaCompliance: number;    // 0-1
  typeCorrectness: number;     // 0-1
  constraintQuality: number;   // 0-1
  graphCoherence: number;      // 0-1
  repairRate: number;          // 0-1
  failureCategories: Record<string, number>;  // common failure modes
  recommendations: string[];
}
```

---

## Integration with Existing Modules

| Module | Integration Point |
|--------|-------------------|
| VPIR (Sprint 2) | Bridge output targets `VPIRNode` and `VPIRGraph` types |
| Constraints (Sprint 2) | Bridge schema includes constraint algebra |
| SMT (Sprint 2) | Decoded VPIR graphs can be verified via SMT pipeline |
| DPN (Sprint 1) | Bridge-emitted graphs map to DPN process compositions |
| IFC (Sprint 1) | Bridge schema includes IFC label fields on ports |
| ACI Gateway | Bridge validator can be registered as a tool for agent self-validation |

---

## Tests

### Unit Tests

- `schema.test.ts` — valid and invalid JSON against each schema
- `validator.test.ts` — type compatibility, acyclicity, label consistency checks
- `decoder.test.ts` — JSON to VPIR structure conversion, edge cases
- `prompts.test.ts` — few-shot examples validate against own schema

### Integration Tests

- End-to-end: raw JSON → validate → decode → verify (SMT) → execute (DPN)
- Incremental graph building: emit nodes one at a time, validate each addition
- Error recovery: invalid output → error message → corrected output → success

### Evaluation Tests

- Run feasibility evaluation against mock LLM responses (deterministic)
- Record baseline metrics for future comparison against real LLM outputs
- Document failure modes for bridge grammar refinement

---

## Acceptance Criteria

1. JSON schema validates correct VPIR node output and rejects malformed output with clear errors
2. Bridge decoder produces typed `VPIRNode` and `VPIRGraph` instances from valid JSON
3. Incremental graph building works: nodes can be added one at a time with validation at each step
4. Few-shot examples in prompt templates all validate against the schema
5. Feasibility evaluation framework produces a structured report with compliance metrics
6. End-to-end pipeline works: LLM-format JSON → bridge → VPIR → SMT verification → DPN execution
7. All existing tests continue to pass

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| LLMs can't produce valid VPIR reliably | Feasibility evaluation identifies failure modes; simplify schema iteratively |
| Schema too complex for constrained decoding | Layered schemas: start simple (node-only), add complexity progressively |
| Recursive types in JSON schema | Use `$ref` with depth limits; test with major LLM providers' schema support |
| Bridge becomes a bottleneck | Validation is pure and stateless; benchmark to confirm sub-millisecond |

---

## Open Questions (to resolve during sprint)

1. **Should the bridge support partial nodes?** If an LLM can output ports but not constraints, should we accept and annotate as "unverified"?
2. **How strict should type matching be?** Exact match only, or allow compatible coercions (e.g., `number` to `string`)?
3. **Should the bridge enforce IFC labels, or just pass them through?** If enforcement happens here, it's a double-check with the DPN layer.
