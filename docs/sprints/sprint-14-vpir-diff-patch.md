# Sprint 14: VPIR Diff/Patch + Self-Mutation

> **Phase**: 7, Sprint 14 — "VPIR Diff/Patch + Self-Mutation"
> **Priority**: P2
> **Primary Advisors**: Voevodsky, Kay, de Moura
> **Score Target**: 9.4 → 9.45
> **Milestone**: M4 foundation (Self-Modification)

---

## Summary

Sprint 14 lays the foundation for Milestone M4 (Self-Modification) by introducing structured diff/patch semantics for VPIR graphs, transactional modification with rollback, Z3-verified property preservation via HoTT transport, and a mutable self-description that extends Sprint 9's self-hosting PoC. The system can now propose, verify, and apply modifications to its own pipeline graph — the first step toward self-modification.

---

## Deliverables

### 1. VPIR Diff Engine

**File**: `src/vpir/vpir-diff.ts`

- `diffGraphs()` — compute structured diff between two VPIR graphs
- `invertDiff()` — generate inverse diff for rollback
- `composeDiffs()` — compose sequential diffs
- `summarizeDiff()` — produce human-readable diff summary
- Node-level operations: add, remove, modify
- Edge-level operations: add, remove, reroute (for edges not captured by node modifications)
- Metadata change tracking

### 2. VPIR Patch Engine

**File**: `src/vpir/vpir-patch.ts`

- `applyPatch()` — atomic all-or-nothing patch application
- `dryRunPatch()` — conflict detection without mutation
- `validatePatchedGraph()` — structural validation post-patch
- `cloneGraph()` — deep graph cloning for immutability
- Conflict detection: duplicate nodes, missing targets, duplicate edges

### 3. Graph Transaction Manager

**File**: `src/vpir/vpir-transaction.ts`

- `beginTransaction()` — snapshot + prepare inverse diff
- `executeTransaction()` — patch → validate → verify → commit/rollback pipeline
- `rollbackTransaction()` — restore from snapshot
- `getTransactionGraph()` — get current canonical graph
- Full execution trace with per-stage timing

### 4. Z3 Property Preservation Verifier

**File**: `src/verification/z3-diff-verifier.ts`

- `verifyPropertyPreservation()` — verify all standard properties across a modification
- `classifyDiffImpact()` — determine which properties are affected by a diff
- `attemptTransport()` — try HoTT transport before falling back to Z3
- `toGraphVerificationResult()` — adapter for transaction integration
- Two-strategy approach: HoTT transport for unaffected properties, Z3 re-verification for affected
- Direct verification fallbacks: acyclicity (topological sort), input completeness, IFC monotonicity

### 5. Mutable Self-Description

**File**: `src/experiments/self-mutation.ts`

- `createMutablePipelineDescription()` — wraps self-description with mutation API
- `proposePipelineModification()` — create a verified modification transaction
- `applyPipelineModification()` — execute and apply (or rollback) the transaction
- Modification types: add_stage, remove_stage, modify_stage, add_branch
- Automatic edge rerouting when inserting/removing stages
- IFC validation catches trust-level violations (e.g., raising source trust above downstream)

### 6. Self-Mutation Benchmark

**File**: `src/evaluation/self-mutation-benchmark.ts`

- 6 benchmark scenarios exercising the diff/patch/verify cycle:
  1. Add a caching stage (valid modification — commits)
  2. Remove an intermediate stage (topology change — commits)
  3. Modify trust levels (IFC violation — rolls back)
  4. Add a parallel branch (fan-out pattern — commits)
  5. Lower execution trust (IFC violation — rolls back)
  6. Modify stage operation (metadata change — commits)
- Metrics: diff operations, transported properties, re-verified properties, timing

---

## Alignment Impact

| Advisor | Gap Addressed | How |
|---------|--------------|-----|
| Voevodsky (HoTT) | "Transport should have practical utility beyond theory" | Transport carries Z3 proofs across graph modifications, avoiding redundant re-verification |
| Kay (Paradigm) | "System must be able to modify itself" | Mutable self-description with verified pipeline modifications |
| de Moura (SMT) | "Verification must compose across modifications" | Z3 property preservation verifier classifies diff impact, re-verifies only affected properties |

---

## Test Metrics

| Metric | Sprint 13 | Sprint 14 | Delta |
|--------|-----------|-----------|-------|
| Test Suites | 72 | 78 | +6 |
| Tests | 1286+ | 1387+ | +101 |
| Z3 Properties | 21 | 21 | +0 |
| Benchmarks | 7 | 8 | +1 |
| Modules | 27 | 30 | +3 |

---

## New Files

- `src/vpir/vpir-diff.ts` — VPIR graph diff engine
- `src/vpir/vpir-diff.test.ts` — Diff engine tests (20 tests)
- `src/vpir/vpir-patch.ts` — VPIR graph patch engine
- `src/vpir/vpir-patch.test.ts` — Patch engine tests (18 tests)
- `src/vpir/vpir-transaction.ts` — Graph transaction manager
- `src/vpir/vpir-transaction.test.ts` — Transaction tests (16 tests)
- `src/verification/z3-diff-verifier.ts` — Z3 property preservation verifier
- `src/verification/z3-diff-verifier.test.ts` — Property preservation tests (16 tests)
- `src/experiments/self-mutation.ts` — Mutable self-description + pipeline modification
- `src/experiments/self-mutation.test.ts` — Self-mutation tests (14 tests)
- `src/evaluation/self-mutation-benchmark.ts` — Self-mutation benchmark (6 scenarios)
- `src/evaluation/self-mutation-benchmark.test.ts` — Benchmark tests (12 tests)

## Modified Files

- `src/types/vpir.ts` — Added diff/patch types (DiffOperation, VPIRDiff, PatchConflict, PatchResult)
- `src/vpir/index.ts` — Export diff, patch, transaction modules
- `src/verification/index.ts` — Export z3-diff-verifier
- `src/experiments/index.ts` — Export self-mutation
- `src/evaluation/index.ts` — Export self-mutation benchmark
- `status.md` — Sprint 14 deliverables and metrics
- `docs/sprints/README.md` — Link Sprint 14, update score progression
