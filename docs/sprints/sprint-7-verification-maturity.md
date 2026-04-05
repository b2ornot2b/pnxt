# Sprint 7: "Verification Maturity" — User-Program Verification + Bisimulation

> **Phase**: 6, Sprint 7
> **Priority**: P1/P2 completion
> **Primary Advisors**: Leonardo de Moura, Robin Milner, Barbara Liskov
> **Prerequisite**: Sprint 6 complete
> **Score Target**: 8.5 → 8.8

---

## 1. Sprint Goal

Close remaining P1/P2 gaps. Verification transitions from "verify the paradigm's own laws" to "verify programs written in the paradigm." DPN gains formal equivalence checking via bisimulation, enabling provably-correct refactoring.

---

## 2. Alignment Gaps Addressed

### Leonardo de Moura — User-Program Verification
> *"Is this constraint decidable, and can Z3 solve it in bounded time?"*

Current Z3 properties verify infrastructure (capability grants, trust transitions, morphism laws). The harder targets — verification of actual programs written in the paradigm — are not addressed. Additionally, CVC5 was mentioned in the original vision alongside Z3 but is absent from implementation.

### Robin Milner — Bisimulation & Observational Equivalence
> *"What are the observable behaviors of this concurrent system?"*

No formal mechanism exists to check whether two DPN configurations are equivalent. Bisimulation is fundamental for refactoring dataflow programs — proving that a restructured actor network produces the same observable behavior.

### Barbara Liskov — Practical Demonstration
> *"Can a new user understand this abstraction without reading the entire spec?"*

The Weather API benchmark (S4) provides one example. More benchmarks are needed to demonstrate the paradigm's breadth — not just "one trick" but a pattern that generalizes.

---

## 3. Deliverables

### 3.1 User-Program Property Verification
**File**: `src/verification/z3-program-verifier.ts`

Enable users to specify and verify custom properties on VPIR programs:

```typescript
interface ProgramProperty {
  kind: 'precondition' | 'postcondition' | 'invariant' | 'assertion';
  /** The VPIR node(s) this property applies to. */
  targetNodes: string[];
  /** SMT-LIB2 formula expressing the property. */
  formula: string;
  /** Human-readable description. */
  description: string;
}

interface ProgramVerifier {
  /**
   * Verify a user-specified property on a VPIR graph.
   * Returns UNSAT if the property holds universally,
   * SAT with counterexample if violated.
   */
  verifyProgramProperty(
    graph: VPIRGraph,
    property: ProgramProperty,
  ): Promise<VerificationResult>;

  /**
   * Verify multiple properties, returning results for each.
   */
  verifyAll(
    graph: VPIRGraph,
    properties: ProgramProperty[],
  ): Promise<VerificationResult[]>;
}
```

Property types:
- **Precondition**: constraints on inputs to a VPIR subgraph
- **Postcondition**: guarantees on outputs of a VPIR subgraph
- **Invariant**: holds at every computation step within a subgraph
- **Assertion**: holds at a specific node

This transitions Z3 from meta-verification to program verification — the key step de Moura has flagged.

### 3.2 CVC5 Integration
**File**: `src/verification/cvc5-integration.ts`

Add CVC5 as an alternative solver:

```typescript
interface VerificationConfig {
  solver: 'z3' | 'cvc5' | 'auto';
  timeout: number;
  /** For 'auto': Z3 first, CVC5 as fallback for unknown/timeout. */
  fallbackOnTimeout: boolean;
}
```

CVC5 excels at:
- Quantifier alternation (∀∃ patterns common in liveness)
- Nonlinear integer arithmetic
- String constraints (relevant for bridge grammar validation)
- Finite model finding

Integration approach:
- CVC5 via subprocess (native binary) or WASM if available
- Same `VerificationResult` type — solvers are interchangeable
- `auto` mode: try Z3 first (faster for most properties), fall back to CVC5 on timeout/unknown

### 3.3 DPN Bisimulation Checking
**File**: `src/channel/bisimulation.ts`

Formal equivalence checking for DPN configurations:

```typescript
interface BisimulationChecker {
  /**
   * Check strong bisimulation between two DPN configurations.
   * Two configs are bisimilar if they can match each other's
   * transitions step-for-step, producing identical observations.
   */
  checkStrongBisimulation(
    config1: DPNConfiguration,
    config2: DPNConfiguration,
  ): BisimulationResult;

  /**
   * Check observational equivalence (weaker than bisimulation).
   * Two configs are observationally equivalent if no context
   * can distinguish them through external observations.
   */
  checkObservationalEquivalence(
    config1: DPNConfiguration,
    config2: DPNConfiguration,
  ): EquivalenceResult;

  /**
   * When bisimilar, produce a HoTT path witnessing the equivalence.
   * This connects bisimulation to univalence: bisimilar DPNs are
   * identical in the categorical structure.
   */
  toHoTTPath(result: BisimulationResult): PathTerm | null;
}
```

**Connection to HoTT (from S6)**: Bisimulation equivalence produces a path in the categorical structure. Combined with transport, this means Z3 properties verified for one DPN configuration automatically hold for any bisimilar configuration. This is provably-correct refactoring.

### 3.4 Benchmark Expansion
**Files**: `src/benchmarks/multi-agent-delegation.ts`, `src/benchmarks/secure-data-pipeline.ts`

Two new benchmarks beyond Weather API:

**Multi-Agent Task Delegation**:
- 3 agents with different trust levels coordinate to complete a research task
- Exercises: agent coordination, trust negotiation, DPN multi-process execution
- Demonstrates: graduated trust, capability negotiation, actor message-passing

**Security-Sensitive Data Pipeline**:
- Data flows through classification, redaction, and analysis stages
- Each stage has IFC labels enforced
- Exercises: IFC enforcement, noninterference (S5), Z3 verification of flow properties
- Demonstrates: the full security story from labels to formal proofs

---

## 4. Acceptance Criteria

| # | Criterion | Advisor | Verification |
|---|-----------|---------|-------------|
| 1 | Users can specify and verify custom properties on VPIR programs | de Moura | `ProgramVerifier` API works on Weather API |
| 2 | CVC5 available as alternative solver | de Moura | Config `solver: 'cvc5'` produces results |
| 3 | Bisimulation equivalence checking for DPN | Milner | Two equivalent DPN configs verified bisimilar |
| 4 | Bisimulation produces HoTT paths | Milner, Voevodsky | `toHoTTPath()` returns valid path term |
| 5 | 3+ working benchmarks | Liskov | Weather + delegation + pipeline all pass |

---

## 5. Technical Dependencies

- `src/verification/z3-invariants.ts` — Z3Context extension for program properties
- `src/channel/dpn-runtime.ts` (from S4) — DPN configurations for bisimulation
- `src/hott/univalence.ts` (from S6) — path construction for bisimulation results
- `src/hott/transport.ts` (from S6) — property transfer via bisimulation paths
- `src/benchmarks/benchmark-runner.ts` (from S4) — harness for new benchmarks

---

## 6. Expected Score Impact

| Advisor | Before | After | Rationale |
|---------|--------|-------|-----------|
| de Moura | 8.0 | 9.0 | User-program verification + CVC5 |
| Milner | 8.0 | 9.0 | Bisimulation; DPN as true execution model |
| Liskov | 8.5 | 9.0 | More benchmarks; clearer utility |
| **Composite** | **8.5** | **8.8** | **+0.3** |

---

## 7. Risk Mitigation

**Risk**: CVC5 WASM integration may not be available.
**Mitigation**: Use CVC5 via subprocess (native binary). If neither is feasible, implement the solver abstraction layer with Z3-only and document CVC5 as a future enhancement. The abstraction itself (multi-solver support) satisfies de Moura's concern.

---

## 8. Definition of Done

- [ ] `ProgramVerifier` verifies custom properties on VPIR programs
- [ ] CVC5 integrated (subprocess or WASM) with `VerificationConfig`
- [ ] Bisimulation checker produces HoTT paths for equivalent DPNs
- [ ] Multi-agent delegation benchmark passes end-to-end
- [ ] Secure data pipeline benchmark passes end-to-end
- [ ] ~55 new tests, all passing
- [ ] `npm test`, `npm run typecheck`, `npm run lint` all pass
- [ ] Advisory review checkpoint: de Moura, Milner, Liskov re-assess
