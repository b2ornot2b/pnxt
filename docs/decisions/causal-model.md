# ADR: Causal Model of the pnxt Paradigm

> **Status**: Accepted
> **Date**: 2026-04-05
> **Advisory Panel**: Judea Pearl, Leonardo de Moura, Ilya Sutskever
> **Sprint**: 8 — Neurosymbolic Bridge

---

## Context

Judea Pearl's advisory review (lowest panel score: 5.0) identified a critical gap: the pnxt paradigm risks "conflating correlation with mechanism." The system lacked an explicit causal model describing *why* each pipeline stage produces its effects. Without causal transparency, it is impossible to distinguish between a system that works because of its design and one that works by accident.

This ADR makes the causal structure of pnxt explicit, testable, and traceable to implementation.

---

## Decision

Document four causal dimensions that span the paradigm. Each dimension describes a causal chain from inputs to outcomes, identifies the mechanism (not just correlation), and connects to testable predictions in the implementation.

---

## 1. Verification Causality

**Question**: What *causes* a Z3 property to be satisfied or violated?

**Causal chain**:

```
VPIR Graph Structure
  → Node Types (observation, inference, action, assertion, composition)
    → Edge Labels (dataType, port, security label)
      → SMT-LIB2 Formula Binding (node_<id>_trust, node_<id>_confidence, ...)
        → Z3 Solver Query
          → sat / unsat / unknown
```

**Mechanism**: The `ProgramVerifier` (`src/verification/z3-program-verifier.ts`) binds VPIR node attributes to Z3 integer constants. Each `ProgramProperty` constrains those constants. Z3 checks satisfiability of the formula under the bound values. The causal path is deterministic: given the same graph and the same property, the result is always the same.

**Testable prediction**: Changing a node's `trustLevel` from 2 to 1 will cause `(>= node_trust 2)` to transition from `sat` to `unsat`. This is verified in `src/verification/z3-program-verifier.test.ts`.

**Not a correlation**: The property does not fail because it "tends to fail on low-trust nodes." It fails because the bound value (1) is strictly less than the required minimum (2) in integer arithmetic.

---

## 2. Trust Flow Causality

**Question**: What *causes* an agent to gain or lose capabilities?

**Causal chain**:

```
Agent Actions (task success/failure)
  → Trust Score Update (causal scoring: difficulty-weighted)
    → Trust Level Threshold (0-4 graduated levels)
      → Capability Grants (trust-gated permissions)
        → ACI Tool Access (side-effect classification)
          → Data Classification Boundary (IFC label assignment)
```

**Mechanism**: The `TrustEngine` (`src/trust/trust-engine.ts`) updates trust scores based on task outcomes, weighted by difficulty via `computeCausalTrustScore` (`src/trust/causal-trust.ts`). Higher difficulty successes contribute more; trivial failures penalize more. Trust level determines which capabilities are granted through the `CapabilityNegotiator` (`src/capability/capability-negotiation.ts`). The ACI Gateway (`src/aci/aci-gateway.ts`) checks trust level against tool side-effect requirements.

**Testable prediction**: A trust level 2 agent cannot invoke tools with side-effect classification `restricted` (requires level 4). Promoting the agent to level 4 enables the invocation. This is verified in `src/aci/aci-gateway.test.ts`.

**Not a correlation**: The tool invocation is not blocked because "low-trust agents tend to fail." It is blocked because the ACI gateway's guard clause compares `agent.trustLevel < tool.requiredTrustLevel` and short-circuits with a denial.

---

## 3. IFC Enforcement Causality

**Question**: What *causes* noninterference to hold in the pipeline?

**Causal chain**:

```
Data Label Assignment (at creation: memory, channel, VPIR node)
  → Flow Check at Every Boundary (memory read, channel send, ACI invocation)
    → canFlowTo(source, destination) Lattice Check
      → Z3 Noninterference Proof (symbolic: no high→low data path)
        → Runtime Enforcement (blocked operation + audit entry)
```

**Mechanism**: Every data item in pnxt carries a `SecurityLabel` (`src/types/ifc.ts`). At each data-flow boundary — memory query, channel send, ACI tool invocation, VPIR node execution — the `canFlowTo` function checks whether the source label can flow to the destination label under the IFC lattice. The Z3 noninterference proof (`src/verification/z3-noninterference.ts`) symbolically verifies that no execution path can leak high-classified data to a low-classified observer.

**Testable prediction**: A `confidential` memory entry cannot be read by a `public`-labeled agent. Upgrading the agent's label to `confidential` enables the read. This is verified in `src/memory/ifc-labels.test.ts`.

**Not a correlation**: The read is not blocked because "public agents usually can't access confidential data." It is blocked because `canFlowTo({ classification: 'confidential' }, { classification: 'public' })` returns `false` via the lattice ordering `CLASSIFICATION_ORDER['confidential'] > CLASSIFICATION_ORDER['public']`.

---

## 4. Refinement Causality

**Question**: What *causes* the neurosymbolic refinement loop to converge?

**Causal chain**:

```
P-ASP Confidence Scoring (4-dimension weighted heuristic)
  → Low-Confidence Node Identification (threshold < 0.6)
    → Active Inference Targeting (free energy: (1-confidence) × properties blocked)
      → Focused LLM Re-Query (node-specific prompt with constraints)
        → Node Replacement (via Bridge Grammar validation)
          → Re-Scoring (P-ASP on updated graph)
            → Convergence Check (graph confidence ≥ threshold)
```

**Mechanism**: The `RefinementPipeline` (`src/neurosymbolic/refinement-pipeline.ts`) orchestrates the loop. `PASPEngine` (`src/neurosymbolic/p-asp.ts`) assigns confidence scores based on structural validity, semantic coherence, historical accuracy, and Z3 constraint satisfaction. `ActiveInferenceEngine` (`src/neurosymbolic/active-inference.ts`) ranks nodes by free energy and generates targeted LLM queries. Each iteration patches only the highest-impact nodes, avoiding full regeneration.

**Convergence mechanism**: Free energy decreases monotonically when patches succeed because (a) the patched node's confidence increases and (b) the number of blocked properties decreases. Oscillation detection (`ActiveInferenceEngine.getOscillationReport`) prevents infinite loops by excluding nodes that have been patched without improvement.

**Testable prediction**: A degraded Weather API graph with low evidence confidence converges to ≥ 0.85 graph confidence within 3 iterations when patches fix evidence types and confidence values. This is verified in `src/neurosymbolic/weather-convergence.test.ts`.

**Not a correlation**: The graph does not converge because "running the loop several times tends to help." It converges because each iteration targets the node with the highest `(1-confidence) × blocked_properties` product, and the replacement node (from the LLM, validated by Bridge Grammar) has strictly higher evidence confidence than the original.

**Failure mode**: If the LLM consistently produces replacements that are not better than the original, free energy does not decrease and oscillation detection triggers early termination. The pipeline returns the best-so-far graph with `converged: false`.

---

## Summary

| Dimension | Root Cause | Mechanism | Location |
|-----------|-----------|-----------|----------|
| Verification | Node attribute values vs. formula constants | Z3 integer arithmetic | `src/verification/z3-program-verifier.ts` |
| Trust Flow | Difficulty-weighted score updates | Threshold comparison + capability grants | `src/trust/`, `src/capability/`, `src/aci/` |
| IFC | Label lattice ordering | `canFlowTo` boundary checks | `src/types/ifc.ts`, `src/memory/`, `src/channel/` |
| Refinement | Free energy minimization | Targeted patching + oscillation detection | `src/neurosymbolic/` |

Each dimension is grounded in mechanism (deterministic computation), not correlation (statistical tendency). This directly addresses Pearl's concern that the paradigm must distinguish between "what works" and "why it works."
