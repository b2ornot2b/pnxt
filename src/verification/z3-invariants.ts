/**
 * Z3 SMT Invariant Verification — formally verify capability grants,
 * trust transitions, and IFC flow properties using Z3.
 *
 * Uses z3-solver (z3-wasm) to encode invariants as SMT constraints.
 * For each property, we check satisfiability of the *negation*: if UNSAT,
 * the invariant holds universally; if SAT, the model is a counterexample.
 *
 * Based on:
 * - docs/research/original-prompt.md (SMT Solvers: Z3/CVC5)
 * - Advisory Review 2026-04-05 (Leonardo de Moura — SMT solver pillar)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { VerificationResult } from '../types/verification.js';
import type { VPIRGraph } from '../types/vpir.js';
import type { TrustLevel } from '../types/agent.js';

/**
 * Z3 context wrapper. Create once and reuse — initialization is heavyweight (~30MB WASM).
 */
export interface Z3Context {
  /** The underlying Z3 API instance. */
  api: unknown;

  /** Verify that all capability grants respect trust requirements. */
  verifyCapabilityGrants(
    grants: CapabilityGrantInput[],
  ): Promise<VerificationResult>;

  /** Verify that trust transitions obey level constraints. */
  verifyTrustTransitions(
    transitions: TrustTransitionInput[],
  ): Promise<VerificationResult>;

  /** Verify that all IFC flows in a VPIR graph respect the lattice. */
  verifyIFCFlowConsistency(
    graph: VPIRGraph,
  ): Promise<VerificationResult>;

  /** Verify that tool trust requirements match their side effects. */
  verifySideEffectTrustRequirements(
    tools: ToolTrustInput[],
  ): Promise<VerificationResult>;
}

/** Input for capability grant verification. */
export interface CapabilityGrantInput {
  operation: string;
  agentTrustLevel: TrustLevel;
  requiredTrustLevel: TrustLevel;
}

/** Input for trust transition verification. */
export interface TrustTransitionInput {
  agentId: string;
  fromLevel: TrustLevel;
  toLevel: TrustLevel;
  reason: string;
}

/** Input for side-effect trust requirement verification. */
export interface ToolTrustInput {
  toolName: string;
  sideEffects: string[];
  declaredTrustLevel: TrustLevel;
  expectedMinTrustLevel: TrustLevel;
}

/**
 * Create a Z3 context by initializing the Z3 WASM solver.
 *
 * This is async and heavyweight — call once and reuse the context.
 */
export async function createZ3Context(): Promise<Z3Context> {
  const { init } = await import('z3-solver');
  const { Context } = await init();
  const z3: any = Context('main');

  return {
    api: z3,

    async verifyCapabilityGrants(grants: CapabilityGrantInput[]): Promise<VerificationResult> {
      const start = performance.now();
      const solver = new z3.Solver();

      const agentTrust = z3.Int.const('agentTrust');
      const requiredTrust = z3.Int.const('requiredTrust');

      // Existential: is there a grant where agent trust < required trust?
      const violations = grants.map((g: CapabilityGrantInput) =>
        z3.And(
          agentTrust.eq(g.agentTrustLevel),
          requiredTrust.eq(g.requiredTrustLevel),
          agentTrust.lt(requiredTrust),
        ),
      );

      if (violations.length === 0) {
        return {
          verified: true,
          solver: 'z3',
          duration: performance.now() - start,
          property: 'capability_grant_consistency',
        };
      }

      solver.add(z3.Or(...violations));
      const result = await solver.check();
      const duration = performance.now() - start;

      if (result === 'unsat') {
        return { verified: true, solver: 'z3', duration, property: 'capability_grant_consistency' };
      }

      // SAT — extract counterexample
      const model = solver.model();
      const counter: Record<string, unknown> = {
        agentTrust: Number(model.eval(agentTrust).toString()),
        requiredTrust: Number(model.eval(requiredTrust).toString()),
      };

      const atVal = counter.agentTrust as number;
      const rtVal = counter.requiredTrust as number;
      const violatingGrant = grants.find(
        (g) => g.agentTrustLevel === atVal && g.requiredTrustLevel === rtVal,
      );
      if (violatingGrant) {
        counter.operation = violatingGrant.operation;
      }

      return {
        verified: false,
        counterexample: counter,
        solver: 'z3',
        duration,
        property: 'capability_grant_consistency',
      };
    },

    async verifyTrustTransitions(transitions: TrustTransitionInput[]): Promise<VerificationResult> {
      const start = performance.now();
      const solver = new z3.Solver();

      const fromLevel = z3.Int.const('fromLevel');
      const toLevel = z3.Int.const('toLevel');
      const isReset = z3.Bool.const('isReset');

      // Invariant: trust can only increase by at most 1 level per transition,
      // OR decrease to 0 on reset events (model_update, security_violation).
      const violations = transitions.map((t: TrustTransitionInput) => {
        const isResetEvent = t.reason === 'model_update' || t.reason === 'security_violation';
        return z3.And(
          fromLevel.eq(t.fromLevel),
          toLevel.eq(t.toLevel),
          isReset.eq(isResetEvent),
          z3.Or(
            // Violation 1: increase by more than 1
            z3.And(toLevel.gt(fromLevel), toLevel.sub(fromLevel).gt(1)),
            // Violation 2: decrease, but not a reset to 0
            z3.And(toLevel.lt(fromLevel), z3.Not(isReset), toLevel.neq(fromLevel)),
            z3.And(toLevel.lt(fromLevel), isReset, toLevel.neq(0)),
          ),
        );
      });

      if (violations.length === 0) {
        return {
          verified: true,
          solver: 'z3',
          duration: performance.now() - start,
          property: 'trust_transition_monotonicity',
        };
      }

      solver.add(z3.Or(...violations));
      const result = await solver.check();
      const duration = performance.now() - start;

      if (result === 'unsat') {
        return { verified: true, solver: 'z3', duration, property: 'trust_transition_monotonicity' };
      }

      const model = solver.model();
      const counter: Record<string, unknown> = {
        fromLevel: Number(model.eval(fromLevel).toString()),
        toLevel: Number(model.eval(toLevel).toString()),
        isReset: model.eval(isReset).toString() === 'true',
      };

      const fl = counter.fromLevel as number;
      const tl = counter.toLevel as number;
      const violating = transitions.find((t) => t.fromLevel === fl && t.toLevel === tl);
      if (violating) {
        counter.agentId = violating.agentId;
        counter.reason = violating.reason;
      }

      return {
        verified: false,
        counterexample: counter,
        solver: 'z3',
        duration,
        property: 'trust_transition_monotonicity',
      };
    },

    async verifyIFCFlowConsistency(graph: VPIRGraph): Promise<VerificationResult> {
      const start = performance.now();
      const solver = new z3.Solver();

      const CLASSIFICATION_ORDER: Record<string, number> = {
        public: 0,
        internal: 1,
        confidential: 2,
        restricted: 3,
      };

      const srcTrust = z3.Int.const('srcTrust');
      const dstTrust = z3.Int.const('dstTrust');
      const srcClass = z3.Int.const('srcClass');
      const dstClass = z3.Int.const('dstClass');
      const edgeIdx = z3.Int.const('edgeIdx');

      const violations: any[] = [];
      let idx = 0;

      for (const graphNode of graph.nodes.values()) {
        for (const ref of graphNode.inputs) {
          const source = graph.nodes.get(ref.nodeId);
          if (!source || !source.label || !graphNode.label) continue;

          const srcTrustVal = source.label.trustLevel;
          const dstTrustVal = graphNode.label.trustLevel;
          const srcClassVal = CLASSIFICATION_ORDER[source.label.classification] ?? 0;
          const dstClassVal = CLASSIFICATION_ORDER[graphNode.label.classification] ?? 0;

          violations.push(
            z3.And(
              edgeIdx.eq(idx),
              srcTrust.eq(srcTrustVal),
              dstTrust.eq(dstTrustVal),
              srcClass.eq(srcClassVal),
              dstClass.eq(dstClassVal),
              z3.Or(srcTrust.gt(dstTrust), srcClass.gt(dstClass)),
            ),
          );
          idx++;
        }
      }

      if (violations.length === 0) {
        return {
          verified: true,
          solver: 'z3',
          duration: performance.now() - start,
          property: 'ifc_flow_lattice',
        };
      }

      solver.add(z3.Or(...violations));
      const result = await solver.check();
      const duration = performance.now() - start;

      if (result === 'unsat') {
        return { verified: true, solver: 'z3', duration, property: 'ifc_flow_lattice' };
      }

      const model = solver.model();
      const counter: Record<string, unknown> = {
        sourceTrustLevel: Number(model.eval(srcTrust).toString()),
        targetTrustLevel: Number(model.eval(dstTrust).toString()),
        sourceClassification: Number(model.eval(srcClass).toString()),
        targetClassification: Number(model.eval(dstClass).toString()),
      };

      return {
        verified: false,
        counterexample: counter,
        solver: 'z3',
        duration,
        property: 'ifc_flow_lattice',
      };
    },

    async verifySideEffectTrustRequirements(tools: ToolTrustInput[]): Promise<VerificationResult> {
      const start = performance.now();
      const solver = new z3.Solver();

      const declared = z3.Int.const('declaredTrust');
      const expected = z3.Int.const('expectedTrust');

      const violations = tools.map((t: ToolTrustInput) =>
        z3.And(
          declared.eq(t.declaredTrustLevel),
          expected.eq(t.expectedMinTrustLevel),
          declared.lt(expected),
        ),
      );

      if (violations.length === 0) {
        return {
          verified: true,
          solver: 'z3',
          duration: performance.now() - start,
          property: 'side_effect_trust_requirements',
        };
      }

      solver.add(z3.Or(...violations));
      const result = await solver.check();
      const duration = performance.now() - start;

      if (result === 'unsat') {
        return { verified: true, solver: 'z3', duration, property: 'side_effect_trust_requirements' };
      }

      const model = solver.model();
      const declVal = Number(model.eval(declared).toString());
      const expVal = Number(model.eval(expected).toString());
      const violating = tools.find(
        (t) => t.declaredTrustLevel === declVal && t.expectedMinTrustLevel === expVal,
      );

      return {
        verified: false,
        counterexample: {
          toolName: violating?.toolName,
          declaredTrustLevel: declVal,
          expectedMinTrustLevel: expVal,
          sideEffects: violating?.sideEffects,
        },
        solver: 'z3',
        duration,
        property: 'side_effect_trust_requirements',
      };
    },
  };
}
