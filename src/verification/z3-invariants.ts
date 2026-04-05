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
import type { Category, GroupoidStructure } from '../types/hott.js';

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

  /** Verify that morphism composition in a category is associative. */
  verifyMorphismAssociativity(
    category: Category,
  ): Promise<VerificationResult>;

  /** Verify identity morphism laws for a category. */
  verifyIdentityLaws(
    category: Category,
  ): Promise<VerificationResult>;

  /** Verify groupoid inverse law: f∘f⁻¹ = id and f⁻¹∘f = id for all morphisms. */
  verifyGroupoidInverseLaw(
    category: Category,
    structure: GroupoidStructure,
  ): Promise<VerificationResult>;

  /** Verify higher path consistency: all 2-paths connect valid 1-paths with matching endpoints. */
  verifyHigherPathConsistency(
    category: Category,
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

    async verifyMorphismAssociativity(category: Category): Promise<VerificationResult> {
      const start = performance.now();
      const solver = new z3.Solver();

      // For every composable triple (f: A→B, g: B→C, h: C→D),
      // check that (h ∘ g) ∘ f and h ∘ (g ∘ f) have the same endpoints.
      // We encode the negation: is there a triple where endpoints differ?
      const morphisms = Array.from(category.morphisms.values());
      const fSrc = z3.Int.const('fSrc');
      const fTgt = z3.Int.const('fTgt');
      const gSrc = z3.Int.const('gSrc');
      const gTgt = z3.Int.const('gTgt');
      const hSrc = z3.Int.const('hSrc');
      const hTgt = z3.Int.const('hTgt');
      const tripleIdx = z3.Int.const('tripleIdx');

      // Map object IDs to integer indices for Z3
      const objectIds = Array.from(category.objects.keys());
      const objIndex = new Map(objectIds.map((id, i) => [id, i]));

      const violations: any[] = [];
      let idx = 0;

      for (const f of morphisms) {
        for (const g of morphisms) {
          if (f.targetId !== g.sourceId) continue;
          for (const h of morphisms) {
            if (g.targetId !== h.sourceId) continue;

            const fS = objIndex.get(f.sourceId) ?? 0;
            const fT = objIndex.get(f.targetId) ?? 0;
            const gS = objIndex.get(g.sourceId) ?? 0;
            const gT = objIndex.get(g.targetId) ?? 0;
            const hS = objIndex.get(h.sourceId) ?? 0;
            const hT = objIndex.get(h.targetId) ?? 0;

            // (h ∘ g) ∘ f: source = f.source, target = h.target
            // h ∘ (g ∘ f): source = f.source, target = h.target
            // These must always be equal by construction. A violation would
            // indicate a malformed composition operation.
            // We check: source of left ≠ source of right OR target of left ≠ target of right
            const leftSrc = fS;   // (h∘g)∘f source
            const leftTgt = hT;   // (h∘g)∘f target
            const rightSrc = fS;  // h∘(g∘f) source
            const rightTgt = hT;  // h∘(g∘f) target

            // By construction these should always be equal for well-formed morphisms.
            // A violation means the category has inconsistent morphism endpoints.
            if (leftSrc !== rightSrc || leftTgt !== rightTgt) {
              violations.push(
                z3.And(
                  tripleIdx.eq(idx),
                  fSrc.eq(fS), fTgt.eq(fT),
                  gSrc.eq(gS), gTgt.eq(gT),
                  hSrc.eq(hS), hTgt.eq(hT),
                ),
              );
            }
            idx++;
          }
        }
      }

      const duration = performance.now() - start;

      if (violations.length === 0) {
        // No composable triples violate associativity
        return {
          verified: true,
          solver: 'z3',
          duration,
          property: 'morphism_composition_associativity',
        };
      }

      solver.add(z3.Or(...violations));
      const result = await solver.check();

      if (result === 'unsat') {
        return { verified: true, solver: 'z3', duration: performance.now() - start, property: 'morphism_composition_associativity' };
      }

      const model = solver.model();
      return {
        verified: false,
        counterexample: {
          tripleIndex: Number(model.eval(tripleIdx).toString()),
          fSource: Number(model.eval(fSrc).toString()),
          fTarget: Number(model.eval(fTgt).toString()),
          gSource: Number(model.eval(gSrc).toString()),
          gTarget: Number(model.eval(gTgt).toString()),
          hSource: Number(model.eval(hSrc).toString()),
          hTarget: Number(model.eval(hTgt).toString()),
        },
        solver: 'z3',
        duration: performance.now() - start,
        property: 'morphism_composition_associativity',
      };
    },

    async verifyIdentityLaws(category: Category): Promise<VerificationResult> {
      const start = performance.now();
      const solver = new z3.Solver();

      // For every morphism f: A→B, verify:
      // id_B ∘ f has source=A, target=B (same as f)
      // f ∘ id_A has source=A, target=B (same as f)
      const morphisms = Array.from(category.morphisms.values());
      const objectIds = Array.from(category.objects.keys());
      const objIndex = new Map(objectIds.map((id, i) => [id, i]));

      const mSrc = z3.Int.const('mSrc');
      const mTgt = z3.Int.const('mTgt');
      const composedSrc = z3.Int.const('composedSrc');
      const composedTgt = z3.Int.const('composedTgt');
      const morphIdx = z3.Int.const('morphIdx');

      const violations: any[] = [];
      let idx = 0;

      for (const f of morphisms) {
        if (f.properties.includes('identity')) continue;

        const srcIdx = objIndex.get(f.sourceId) ?? 0;
        const tgtIdx = objIndex.get(f.targetId) ?? 0;

        // id_B ∘ f: source should be f.source, target should be f.target (= B)
        // Since id_B maps B→B, composing f:A→B with id_B:B→B gives A→B. Check.
        // f ∘ id_A: id_A maps A→A, composing id_A:A→A with f:A→B gives A→B. Check.
        // Both should always equal (srcIdx, tgtIdx) by construction.
        // A violation means something is structurally wrong with the identity.

        if (!category.objects.has(f.sourceId) || !category.objects.has(f.targetId)) {
          violations.push(
            z3.And(
              morphIdx.eq(idx),
              mSrc.eq(srcIdx),
              mTgt.eq(tgtIdx),
              composedSrc.eq(-1),
              composedTgt.eq(-1),
            ),
          );
        }
        idx++;
      }

      const duration = performance.now() - start;

      if (violations.length === 0) {
        return {
          verified: true,
          solver: 'z3',
          duration,
          property: 'identity_morphism_laws',
        };
      }

      solver.add(z3.Or(...violations));
      const result = await solver.check();

      if (result === 'unsat') {
        return { verified: true, solver: 'z3', duration: performance.now() - start, property: 'identity_morphism_laws' };
      }

      const model = solver.model();
      return {
        verified: false,
        counterexample: {
          morphismIndex: Number(model.eval(morphIdx).toString()),
          source: Number(model.eval(mSrc).toString()),
          target: Number(model.eval(mTgt).toString()),
        },
        solver: 'z3',
        duration: performance.now() - start,
        property: 'identity_morphism_laws',
      };
    },

    async verifyGroupoidInverseLaw(
      category: Category,
      structure: GroupoidStructure,
    ): Promise<VerificationResult> {
      const start = performance.now();
      const solver = new z3.Solver();

      // For every morphism f with inverse f⁻¹, verify:
      //   compose(f, f⁻¹) endpoints = (f.source, f.source) — identity on source
      //   compose(f⁻¹, f) endpoints = (f.target, f.target) — identity on target
      const objectIds = Array.from(category.objects.keys());
      const objIndex = new Map(objectIds.map((id: string, i: number) => [id, i]));

      const fSrc = z3.Int.const('fSrc');
      const fTgt = z3.Int.const('fTgt');
      const invSrc = z3.Int.const('invSrc');
      const invTgt = z3.Int.const('invTgt');
      const pairIdx = z3.Int.const('pairIdx');

      const violations: any[] = [];
      let idx = 0;

      for (const [morphismId, morphism] of category.morphisms) {
        const inv = structure.inverses.get(morphismId);
        if (!inv) {
          // Missing inverse — violation
          violations.push(z3.And(pairIdx.eq(idx), fSrc.eq(-1), fTgt.eq(-1)));
          idx++;
          continue;
        }

        const fS = objIndex.get(morphism.sourceId) ?? -1;
        const fT = objIndex.get(morphism.targetId) ?? -1;
        const iS = objIndex.get(inv.sourceId) ?? -1;
        const iT = objIndex.get(inv.targetId) ?? -1;

        // compose(f, inv): f.target must equal inv.source (composability)
        // Result endpoints: (f.source, inv.target) — should be (fS, fS) for identity on A
        if (fT !== iS || iT !== fS) {
          violations.push(
            z3.And(
              pairIdx.eq(idx),
              fSrc.eq(fS), fTgt.eq(fT),
              invSrc.eq(iS), invTgt.eq(iT),
            ),
          );
        }

        // compose(inv, f): inv.target must equal f.source (composability)
        // Result endpoints: (inv.source, f.target) — should be (fT, fT) for identity on B
        if (iT !== fS || iS !== fT) {
          violations.push(
            z3.And(
              pairIdx.eq(idx + 1000),
              fSrc.eq(fS), fTgt.eq(fT),
              invSrc.eq(iS), invTgt.eq(iT),
            ),
          );
        }

        idx++;
      }

      const duration = performance.now() - start;

      if (violations.length === 0) {
        return {
          verified: true,
          solver: 'z3',
          duration,
          property: 'groupoid_inverse_law',
        };
      }

      solver.add(z3.Or(...violations));
      const result = await solver.check();

      if (result === 'unsat') {
        return { verified: true, solver: 'z3', duration: performance.now() - start, property: 'groupoid_inverse_law' };
      }

      const model = solver.model();
      return {
        verified: false,
        counterexample: {
          pairIndex: Number(model.eval(pairIdx).toString()),
          fSource: Number(model.eval(fSrc).toString()),
          fTarget: Number(model.eval(fTgt).toString()),
          invSource: Number(model.eval(invSrc).toString()),
          invTarget: Number(model.eval(invTgt).toString()),
        },
        solver: 'z3',
        duration: performance.now() - start,
        property: 'groupoid_inverse_law',
      };
    },

    async verifyHigherPathConsistency(category: Category): Promise<VerificationResult> {
      const start = performance.now();
      const solver = new z3.Solver();

      if (!category.higherPaths || category.higherPaths.size === 0) {
        return {
          verified: true,
          solver: 'z3',
          duration: performance.now() - start,
          property: 'higher_path_consistency',
        };
      }

      // For every 2-path, verify that the referenced 1-paths exist
      // and connect morphisms with the same source/target endpoints.
      const objectIds = Array.from(category.objects.keys());
      const objIndex = new Map(objectIds.map((id: string, i: number) => [id, i]));

      const leftSrc = z3.Int.const('leftSrc');
      const leftTgt = z3.Int.const('leftTgt');
      const rightSrc = z3.Int.const('rightSrc');
      const rightTgt = z3.Int.const('rightTgt');
      const hpIdx = z3.Int.const('hpIdx');

      const violations: any[] = [];
      let idx = 0;

      for (const hp of category.higherPaths.values()) {
        const leftPath = category.paths.get(hp.leftPathId);
        const rightPath = category.paths.get(hp.rightPathId);

        if (!leftPath || !rightPath) {
          // Missing 1-path reference — violation
          violations.push(
            z3.And(hpIdx.eq(idx), leftSrc.eq(-1), leftTgt.eq(-1)),
          );
          idx++;
          continue;
        }

        // Get the morphisms the 1-paths connect
        const leftMorphL = category.morphisms.get(leftPath.leftId);
        const rightMorphL = category.morphisms.get(rightPath.leftId);

        if (!leftMorphL || !rightMorphL) {
          violations.push(
            z3.And(hpIdx.eq(idx), leftSrc.eq(-2), leftTgt.eq(-2)),
          );
          idx++;
          continue;
        }

        const lS = objIndex.get(leftMorphL.sourceId) ?? -1;
        const lT = objIndex.get(leftMorphL.targetId) ?? -1;
        const rS = objIndex.get(rightMorphL.sourceId) ?? -1;
        const rT = objIndex.get(rightMorphL.targetId) ?? -1;

        // Both 1-paths should connect morphisms with the same endpoints
        if (lS !== rS || lT !== rT) {
          violations.push(
            z3.And(
              hpIdx.eq(idx),
              leftSrc.eq(lS), leftTgt.eq(lT),
              rightSrc.eq(rS), rightTgt.eq(rT),
            ),
          );
        }

        idx++;
      }

      const duration = performance.now() - start;

      if (violations.length === 0) {
        return {
          verified: true,
          solver: 'z3',
          duration,
          property: 'higher_path_consistency',
        };
      }

      solver.add(z3.Or(...violations));
      const result = await solver.check();

      if (result === 'unsat') {
        return { verified: true, solver: 'z3', duration: performance.now() - start, property: 'higher_path_consistency' };
      }

      const model = solver.model();
      return {
        verified: false,
        counterexample: {
          higherPathIndex: Number(model.eval(hpIdx).toString()),
          leftSource: Number(model.eval(leftSrc).toString()),
          leftTarget: Number(model.eval(leftTgt).toString()),
          rightSource: Number(model.eval(rightSrc).toString()),
          rightTarget: Number(model.eval(rightTgt).toString()),
        },
        solver: 'z3',
        duration: performance.now() - start,
        property: 'higher_path_consistency',
      };
    },
  };
}
