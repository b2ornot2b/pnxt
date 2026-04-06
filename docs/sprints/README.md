# Advisory Panel Sprint Breakdown: Phase 6 Sprints 4-9

> **Created**: 2026-04-05
> **Baseline**: Phase 6 Sprint 3 — Advisory Panel Score 7.5/10
> **Target**: 9.0+/10 full advisory panel alignment
> **Sprints**: 6 (S4-S9)

---

## Executive Summary

The advisory panel scored pnxt at **7.5/10** after Phase 6 Sprint 3. This sprint plan systematically closes every identified alignment gap, following P0→P3 priority ordering, targeting a final composite score of **9.2/10**.

**Baseline metrics**: 642 tests, 34 suites, 10 Z3-verified properties, 18 modules (~24,733 LOC).

---

## Sprint Index

| Sprint | Name | Priority | Primary Advisors | Score Target |
|--------|------|----------|-----------------|-------------|
| [S4](./sprint-4-paradigm-proof.md) | Paradigm Proof | P0 | Kay, Liskov, Milner | 7.5 → 7.9 |
| [S5](./sprint-5-formal-guarantees.md) | Formal Guarantees | P1 | Myers, Agha, de Moura | 7.9 → 8.2 |
| [S6](./sprint-6-type-identity.md) | Type Identity | P2 | Voevodsky, Church, Myers | 8.2 → 8.5 |
| [S7](./sprint-7-verification-maturity.md) | Verification Maturity | P1/P2 | de Moura, Milner, Liskov | 8.5 → 8.8 |
| [S8](./sprint-8-neurosymbolic-bridge.md) | Neurosymbolic Bridge | P3 | Pearl, Sutskever, de Moura | 8.8 → 9.0 |
| [S9](./sprint-9-categorical-frontier.md) | Categorical Frontier | P3 | Sutskever, Voevodsky, Kay | 9.0 → 9.2 |

---

## Score Progression

```
S3 ████████████████████████████████████░░░░░░░░░░░░░░  7.5/10 (baseline)
S4 ████████████████████████████████████████░░░░░░░░░░  7.9/10 (+0.4)
S5 █████████████████████████████████████████████░░░░░  8.2/10 (+0.3)
S6 ███████████████████████████████████████████████░░░  8.5/10 (+0.3)
S7 █████████████████████████████████████████████████░  8.8/10 (+0.3)
S8 ██████████████████████████████████████████████████  9.0/10 (+0.2)
S9 ██████████████████████████████████████████████████  9.2/10 (+0.2)
```

---

## Per-Advisor Score Trajectory

| Advisor | Domain | S3 | S4 | S5 | S6 | S7 | S8 | S9 |
|---------|--------|----|----|----|----|----|----|-----|
| Voevodsky | HoTT | 7.0 | 7.0 | 7.0 | **9.0** | 9.0 | 9.0 | 9.5 |
| Church | Lambda Calculus | 6.5 | 6.5 | 6.5 | **8.5** | 8.5 | 8.5 | 8.5 |
| Milner | Process Calculi | 7.0 | **8.0** | 8.0 | 8.0 | **9.0** | 9.0 | 9.0 |
| Agha | Actor Model | 7.0 | 7.0 | **8.5** | 8.5 | 8.5 | 8.5 | 8.5 |
| Myers | IFC Security | 7.5 | 7.5 | **9.0** | 9.5 | 9.5 | 9.5 | 9.5 |
| de Moura | SMT Solvers | 7.0 | 7.0 | **8.0** | 8.0 | **9.0** | 9.0 | 9.0 |
| Sutskever | LLM Architecture | 7.0 | 7.0 | 7.0 | 7.0 | 7.0 | **8.0** | 8.5 |
| Liskov | Language Design | 6.5 | **8.5** | 8.5 | 8.5 | 9.0 | 9.0 | 9.0 |
| Pearl | Causal Reasoning | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | **7.5** | 7.5 |
| Kay | Paradigm Design | 6.0 | **7.5** | 7.5 | 7.5 | 7.5 | 7.5 | **8.5** |

---

## Tension Resolutions

| Tension | Resolution Sprint | Approach |
|---------|------------------|----------|
| Theory Library vs. Execution Paradigm | S4 + S9 | DPN runtime in S4; self-hosting PoC in S9; full resolution Phase 7 |
| Typed vs. Untyped LLMbda Calculus | S6 | Formal ADR — typed justified by IFC requirements |
| Pragmatic vs. Native Tokenization | S9 | Pragmatic through S8; S9 runs native categorical experiment |
| Missing Neurosymbolic Bridge | S8 | P-ASP prototype; remaining gap is multi-year research |

---

## Risk Registry

| Risk | Sprint | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Z3 liveness undecidable for general DPN | S5 | Medium | Restrict to bounded model checking |
| CVC5 WASM integration unavailable | S7 | Medium | Use CVC5 via subprocess or document as future |
| P-ASP too slow for iterative refinement | S8 | High | Convergence timeout; single-pass with scores |
| Categorical tokenization inconclusive | S9 | High | Frame as research contribution regardless |
| Weather API benchmark feels contrived | S4 | Low | Design to exercise every pipeline stage |

---

## Test Growth Projection

| Sprint | New Tests | Total | New Z3 Props | Total Z3 |
|--------|-----------|-------|-------------|----------|
| S4 | ~60 | ~700 | 0 | 10 |
| S5 | ~50 | ~750 | 4 | 14 |
| S6 | ~45 | ~795 | 1 | 15 |
| S7 | ~55 | ~850 | 2+ | 17+ |
| S8 | ~40 | ~890 | 0 | 17+ |
| S9 | ~30 | ~920 | 0 | 17+ |

---

## Critical Files Across Sprints

| File | Sprints | Changes |
|------|---------|---------|
| `src/verification/z3-invariants.ts` | S5, S6, S7 | New Z3 properties + Z3Context extension |
| `src/evaluation/integration-pipeline.ts` | S4, S8 | Wire benchmark + probabilistic refinement |
| `src/hott/higher-paths.ts` | S6 | Replace `checkUnivalence` with proper encoding |
| `src/channel/process.ts` | S4 | Elevate to DPN runtime execution |
| `src/lambda/llmbda.ts` | S5, S6 | Replace `checkNoninterference` + semantic repositioning |
| `src/bridge-grammar/llm-vpir-generator.ts` | S8 | Replace binary accept/reject with refinement loop |

---

## Sprint Review Protocol

After each sprint:

1. Run `npm test` — all tests pass
2. Run `npm run typecheck` — no type errors
3. Run `npm run lint` — no lint violations
4. Conduct advisory panel review checkpoint targeting the sprint's specific advisors
5. Update `status.md` with sprint deliverables and test metrics
6. Document any deviations from the plan with rationale

---

## Phase 7: Self-Hosting Paradigm (S10-S15)

> **Baseline**: Phase 6 Sprint 9 — Advisory Panel Score 9.2/10
> **Target**: 9.5+/10 full advisory panel alignment
> **Milestones**: M2 (External Task Expression), M3 (LLM-Native Programming), M4 (Self-Modification)

### Sprint Index

| Sprint | Name | Priority | Primary Advisors | Score Target | Milestone |
|--------|------|----------|-----------------|-------------|-----------|
| [S10](./sprint-10-handler-library-tool-registry.md) | Handler Library + Tool Registry | P0 | Kay, Liskov, Milner | 9.2 → 9.25 | M2 foundation |
| [S11](./sprint-11-vpir-authoring-external-tasks.md) | VPIR Authoring + External Tasks | P0 | Kay, Liskov, Agha | 9.25 → 9.3 | **M2 complete** |
| [S12](./sprint-12-reliable-bridge-grammar.md) | Reliable Bridge Grammar + Error Recovery | P1 | Sutskever, Pearl, de Moura | 9.3 → 9.35 | M3 foundation |
| [S13](./sprint-13-autonomous-pipeline.md) | Autonomous LLM Pipeline | P1 | Sutskever, Pearl, Kay | 9.35 → 9.4 | **M3 complete** |
| [S14](./sprint-14-vpir-diff-patch.md) | VPIR Diff/Patch + Self-Mutation | P2 | Voevodsky, Kay, de Moura | 9.4 → 9.45 | **M4 foundation** |
| [S15](./sprint-15-verified-self-modification.md) | Verified Self-Modification + Research Frontier | P2/P3 | All | 9.45 → 9.5+ | **M4 complete** |

### Phase 7 Score Progression

```
 S9 ██████████████████████████████████████████████████  9.2/10 (baseline)
S10 ██████████████████████████████████████████████████  9.25/10
S11 ██████████████████████████████████████████████████  9.3/10 (M2 complete)
S12 ██████████████████████████████████████████████████  9.35/10 (M3 foundation)
S13 ██████████████████████████████████████████████████  9.4/10 (M3 complete)
S14 ██████████████████████████████████████████████████  9.45/10 (M4 foundation)
S15 ██████████████████████████████████████████████████  9.5+/10 (M4 complete — Phase 7 done)
```
