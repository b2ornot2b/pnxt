# Sprint 5: "Formal Guarantees" — Noninterference Proofs + Liveness

> **Phase**: 6, Sprint 5
> **Priority**: P1
> **Primary Advisors**: Andrew Myers, Gul Agha, Leonardo de Moura
> **Prerequisite**: Sprint 4 complete
> **Score Target**: 7.9 → 8.2

---

## 1. Sprint Goal

Move from structural safety enforcement to formal mathematical proofs. The two P1 items are naturally grouped — both involve Z3 verification expansion, targeting the gap between "label checking" and "formal guarantees."

---

## 2. Alignment Gaps Addressed

### Andrew Myers — Formal Noninterference
> *"Can an untrusted component influence a trusted computation through this path?"*

Current IFC enforces explicit flow through labels (tree-walk in `llmbda.ts:363`), but noninterference guarantees are structural, not proven. Covert channels (timing, memory access, bridge grammar) are unanalyzed. The master prompt calls for "mathematical noninterference guarantees against prompt injections."

### Gul Agha — Liveness & Fairness
> *"How does this behave under arbitrary message interleavings?"*

All 10 Z3-verified properties are safety-focused (type correctness, trust invariants, lattice laws). No fairness, progress, or liveness properties exist. Actor systems must guarantee messages are eventually processed and no actor starves.

### Leonardo de Moura — Verification Depth
> *"Is this constraint decidable, and can Z3 solve it in bounded time?"*

Current properties are straightforward algebraic/lattice properties. The harder verification targets — program-level properties, liveness, noninterference — are not yet addressed.

---

## 3. Deliverables

### 3.1 Formal Noninterference via Z3
**File**: `src/verification/z3-noninterference.ts`

Encode the noninterference property as an SMT formula:

> For any two executions that differ only in high-security inputs, the low-security outputs must be identical.

Specifically:
- Model LLMbda Calculus execution as state transitions with IFC labels
- Encode two parallel executions with identical low-security inputs but different high-security inputs
- Assert that low-security outputs differ → check UNSAT (proving noninterference)
- If SAT, the model provides a concrete counterexample (a noninterference violation)

New Z3 property: `ifc_noninterference_proof`

This replaces the tree-walk approach in `src/lambda/llmbda.ts:363` with a mathematically rigorous Z3-backed proof.

### 3.2 Covert Channel Analysis
**File**: `src/verification/covert-channel-analysis.ts`

Structured analysis covering three vectors:

**Timing channels** (DPN):
- Can channel send/receive timing reveal labeled data?
- Does backpressure behavior differ based on message content labels?
- Mitigation: constant-time channel operations or timing noise

**Memory access patterns** (Knowledge Graph):
- Do query patterns against the KG leak information about labeled nodes?
- Can an observer distinguish queries for high-security vs low-security data?
- Mitigation: oblivious access patterns or query padding

**Bridge Grammar side channels**:
- Does constrained decoding time correlate with security labels?
- Can schema selection reveal information about the security context?
- Mitigation: fixed-schema decoding or timing normalization

Output: `CovertChannelReport` with identified risks, severity, and mitigations.

### 3.3 Liveness/Progress Properties via Z3
**File**: `src/verification/z3-liveness.ts`

Three new Z3-verified properties:

**`dpn_progress`**: If a channel has a pending sender and a pending receiver, the transfer eventually completes.
- Model: bounded steps, show that after N steps, transfer has occurred
- Encoding: ∀ channel c, ∀ step t: (hasSender(c, t) ∧ hasReceiver(c, t)) → transferred(c, t+k) for some bounded k

**`dpn_deadlock_freedom`**: No circular wait condition in the channel dependency graph.
- Model: channel dependency as a directed graph
- Encoding: assert cycle exists → check UNSAT
- Applies to any DPN configuration produced from a VPIR graph

**`dpn_fairness`**: In a DPN with multiple ready processes, every process eventually executes.
- Model: round-robin scheduling guarantee
- Encoding: ∀ process p, ∀ step t: (ready(p, t)) → executed(p, t+k) for bounded k

### 3.4 Z3Context Extension
**File**: `src/verification/z3-invariants.ts` (modify existing)

Add to the `Z3Context` interface:
```typescript
/** Verify noninterference for IFC-labeled lambda terms. */
verifyNoninterference(
  terms: LambdaTerm[],
): Promise<VerificationResult>;

/** Verify progress: pending transfers eventually complete. */
verifyDPNProgress(
  config: DPNConfiguration,
): Promise<VerificationResult>;

/** Verify deadlock freedom: no circular waits. */
verifyDPNDeadlockFreedom(
  config: DPNConfiguration,
): Promise<VerificationResult>;

/** Verify fairness: all ready processes eventually execute. */
verifyDPNFairness(
  config: DPNConfiguration,
): Promise<VerificationResult>;
```

Total Z3 properties: 10 → **14**

---

## 4. Acceptance Criteria

| # | Criterion | Advisor | Verification |
|---|-----------|---------|-------------|
| 1 | Noninterference proved via Z3, not just label walks | Myers | Z3 returns UNSAT for negated noninterference |
| 2 | Covert channel analysis covers timing, memory, bridge | Myers | Structured report with 3 vectors |
| 3 | At least 2 liveness properties verified via Z3 | Agha | `dpn_progress` + `dpn_deadlock_freedom` pass |
| 4 | Fairness property verified for DPN | Agha | `dpn_fairness` returns UNSAT for negation |
| 5 | Weather API benchmark verified with new properties | de Moura | S4 benchmark passes with S5 verification |

---

## 5. Technical Dependencies

- `src/lambda/llmbda.ts` — current `checkNoninterference` at line 363 (to be augmented)
- `src/channel/process.ts` — DPN process model for liveness encoding
- `src/channel/dpn-runtime.ts` (from S4) — DPN configurations for deadlock analysis
- `src/verification/z3-invariants.ts` — Z3Context interface extension
- `src/types/verification.ts` — extend `VerificationResult` for new property types

---

## 6. Expected Score Impact

| Advisor | Before | After | Rationale |
|---------|--------|-------|-----------|
| Myers | 7.5 | 9.0 | Formal proofs + covert channel analysis |
| Agha | 7.0 | 8.5 | Liveness/fairness verified |
| de Moura | 7.0 | 8.0 | Verification depth increased (still no CVC5) |
| **Composite** | **7.9** | **8.2** | **+0.3** |

---

## 7. Risk Mitigation

**Risk**: Z3 liveness properties may be undecidable for general DPN configurations.
**Mitigation**: Restrict to bounded model checking (verify for bounded step count N). Document the decidability boundary explicitly. This is standard practice — Agha and de Moura would accept bounded verification with documented limits.

---

## 8. Definition of Done

- [ ] `ifc_noninterference_proof` verified via Z3 (UNSAT for negation)
- [ ] Covert channel analysis report with timing/memory/bridge vectors
- [ ] `dpn_progress`, `dpn_deadlock_freedom`, `dpn_fairness` verified via Z3
- [ ] Z3Context extended with 4 new verification methods
- [ ] ~50 new tests, all passing
- [ ] `npm test`, `npm run typecheck`, `npm run lint` all pass
- [ ] Advisory review checkpoint: Myers, Agha, de Moura re-assess
