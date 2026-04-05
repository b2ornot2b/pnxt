# Sprint 2: VPIR Node Types + SMT Constraints

> **Status**: Planned
> **Paradigm Pillars**: Verifiable Programmatic Intermediate Representation, SMT Solvers
> **Alignment Impact**: 5/10 → 6/10
> **Advisory Drivers**: de Moura (verification), Voevodsky (type correctness), Church (pure functions)
> **Depends on**: Sprint 1 (channels carry VPIR nodes; labels on verification results)

---

## Objective

Define the Verifiable Programmatic Intermediate Representation as a concrete type system and build a verification layer using SMT constraints. Every reasoning step becomes a typed, inspectable node with preconditions and postconditions that can be mechanically checked.

---

## Deliverables

### 1. `VPIRNode` — Verifiable Reasoning Steps

**File**: `src/vpir/node.ts`

A VPIR node represents a single verifiable computation step.

**Types**: `src/types/vpir.ts`

```typescript
interface VPIRNode {
  id: string;
  kind: VPIRNodeKind;
  inputs: VPIRPort[];           // typed input slots
  outputs: VPIRPort[];          // typed output slots
  preconditions: Constraint[];  // must hold before execution
  postconditions: Constraint[]; // must hold after execution
  metadata: VPIRMetadata;
}

type VPIRNodeKind =
  | 'transform'     // pure data transformation
  | 'assertion'     // constraint check (no output, pass/fail)
  | 'branch'        // conditional routing
  | 'aggregate'     // combine multiple inputs
  | 'source'        // external data ingestion
  | 'sink';         // external data emission

interface VPIRPort {
  name: string;
  type: VPIRType;
  label?: Label;    // IFC label from Sprint 1
}

type VPIRType =
  | { kind: 'primitive'; name: 'string' | 'number' | 'boolean' }
  | { kind: 'array'; element: VPIRType }
  | { kind: 'record'; fields: Record<string, VPIRType> }
  | { kind: 'union'; variants: VPIRType[] }
  | { kind: 'channel'; element: VPIRType };  // DPN channel reference
```

### 2. `VPIRGraph` — Reasoning Chain DAG

**File**: `src/vpir/graph.ts`

- DAG of `VPIRNode` instances connected by typed edges
- Edges represent data flow between output ports and input ports
- Type checking: edge source type must be compatible with edge target type
- Topological ordering for execution sequencing
- Cycle detection (DAG invariant enforcement)

```typescript
interface VPIRGraph {
  id: string;
  nodes: Map<string, VPIRNode>;
  edges: VPIREdge[];
  validate(): ValidationResult;
  topologicalOrder(): VPIRNode[];
  toSMT(): SMTConstraintSet;     // export for verification
}

interface VPIREdge {
  sourceNode: string;
  sourcePort: string;
  targetNode: string;
  targetPort: string;
}
```

### 3. `Constraint` — Formal Preconditions & Postconditions

**File**: `src/vpir/constraint.ts`

Constraints are logical propositions attached to VPIR nodes.

```typescript
type Constraint =
  | { kind: 'equals'; left: ConstraintExpr; right: ConstraintExpr }
  | { kind: 'lessThan'; left: ConstraintExpr; right: ConstraintExpr }
  | { kind: 'and'; constraints: Constraint[] }
  | { kind: 'or'; constraints: Constraint[] }
  | { kind: 'not'; constraint: Constraint }
  | { kind: 'implies'; antecedent: Constraint; consequent: Constraint }
  | { kind: 'forAll'; variable: string; type: VPIRType; body: Constraint }
  | { kind: 'exists'; variable: string; type: VPIRType; body: Constraint }
  | { kind: 'typeOf'; expr: ConstraintExpr; type: VPIRType }
  | { kind: 'labelFlowsTo'; source: string; target: string };  // IFC constraint

type ConstraintExpr =
  | { kind: 'literal'; value: unknown }
  | { kind: 'portRef'; nodeId: string; portName: string }
  | { kind: 'field'; expr: ConstraintExpr; field: string }
  | { kind: 'apply'; fn: string; args: ConstraintExpr[] };
```

### 4. SMT Constraint Translation

**File**: `src/smt/translator.ts`

Translate VPIR constraints to SMT-LIB2 format for Z3/CVC5 verification.

- `toSMTLIB(constraint: Constraint): string` — emit SMT-LIB2 assertions
- `toSMTLIB(graph: VPIRGraph): string` — emit full graph verification query
- Support for: integer/boolean arithmetic, uninterpreted functions, quantifiers, array theory

```typescript
interface SMTTranslator {
  translateConstraint(constraint: Constraint): string;
  translateGraph(graph: VPIRGraph): string;
  translateInvariant(invariant: SystemInvariant): string;
}
```

### 5. SMT Solver Interface

**File**: `src/smt/solver.ts`

Abstract interface for SMT solver execution. Initial implementation shells out to Z3.

```typescript
interface SMTSolver {
  check(query: string): Promise<SMTResult>;
}

type SMTResult =
  | { status: 'sat'; model?: Record<string, unknown> }  // counterexample found
  | { status: 'unsat' }                                   // invariant holds
  | { status: 'unknown'; reason: string }                  // solver gave up
  | { status: 'timeout' };

interface SMTSolverConfig {
  solverPath: string;   // path to Z3 binary
  timeoutMs: number;    // per-query timeout
}
```

### 6. System Invariant Verification

**File**: `src/smt/invariants.ts`

Formalize and verify core system invariants:

```typescript
const SYSTEM_INVARIANTS: SystemInvariant[] = [
  {
    id: 'trust-access-control',
    description: 'Agent at trust level N cannot invoke tools requiring level > N',
    // ∀ agent, tool: agent.trustLevel < tool.requiredLevel → ¬invoked(agent, tool)
  },
  {
    id: 'capability-constraint-tightening',
    description: 'Granted constraints are always at least as tight as offered constraints',
    // ∀ cap: granted(cap).maxFiles ≤ offered(cap).maxFiles
  },
  {
    id: 'ifc-noninterference',
    description: 'Data labeled at level N cannot flow to agents at level < N',
    // ∀ data, agent: data.label.trustLevel > agent.trustLevel → ¬reads(agent, data)
  },
  {
    id: 'label-propagation-monotonic',
    description: 'Label trust level never decreases through a processing chain',
    // ∀ edge in graph: output.label.trustLevel ≥ max(input.labels.trustLevel)
  },
];
```

### 7. Runtime Verification

**File**: `src/vpir/verifier.ts`

- `verify(node: VPIRNode, inputs: Record<string, unknown>): VerificationResult` — check preconditions at runtime
- `verifyPost(node: VPIRNode, outputs: Record<string, unknown>): VerificationResult` — check postconditions
- `verifyGraph(graph: VPIRGraph): Promise<VerificationResult>` — verify full graph via SMT

```typescript
type VerificationResult =
  | { status: 'verified' }
  | { status: 'violated'; constraint: Constraint; counterexample?: unknown }
  | { status: 'inconclusive'; reason: string };
```

---

## Integration with Existing Modules

| Module | Integration Point |
|--------|-------------------|
| DPN (Sprint 1) | Processes wrap VPIR nodes; channels carry VPIR-typed values |
| IFC Labels (Sprint 1) | `labelFlowsTo` constraint kind; labels on VPIR ports |
| Trust Engine | Trust invariants verified via SMT alongside unit tests |
| Capability Negotiation | Capability constraint invariants verified via SMT |
| CI Pipeline | `npm run verify` target runs SMT checks |

---

## Tests

### Unit Tests

- `node.test.ts` — VPIR node construction, port typing, constraint attachment
- `graph.test.ts` — DAG construction, type-compatible edges, cycle detection, topological sort
- `constraint.test.ts` — constraint construction, nested boolean logic
- `translator.test.ts` — SMT-LIB2 output for each constraint kind
- `verifier.test.ts` — runtime pre/postcondition checking

### Integration Tests

- Build a 3-node VPIR graph, translate to SMT-LIB2, verify with Z3
- Verify system invariants against current trust/capability configuration
- Intentionally violate an invariant; confirm Z3 finds the counterexample

### CI Integration

- Add `npm run verify` script that runs SMT invariant checks
- Fail CI if any system invariant is unsatisfiable (indicates a design contradiction)
- Warn (don't fail) if Z3 returns `unknown` or `timeout`

---

## Acceptance Criteria

1. A VPIR graph with typed ports rejects type-incompatible edge connections
2. Preconditions on a VPIR node are checked at runtime before execution
3. System invariants (trust access control, capability tightening, IFC noninterference) are expressed as SMT queries
4. Z3 confirms `unsat` (invariant holds) for all system invariants against the current design
5. A deliberately broken invariant produces a `sat` result with a counterexample
6. SMT verification runs in CI and completes within 30 seconds
7. All existing tests continue to pass

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Z3 not available in all environments | Make SMT verification optional in CI; skip if Z3 not found |
| Constraint language too limited | Start with propositional + integer arithmetic; extend as needed |
| SMT-LIB2 generation bugs | Golden-file tests comparing generated output against hand-verified queries |
| Runtime verification overhead | Verification is opt-in per node; benchmarks track overhead |
