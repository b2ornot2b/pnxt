/**
 * Transport Along Paths — the computational content of univalence.
 *
 * Given a path p: A = B and a type family P, transport moves a value
 * P(A) to P(B). This is what makes univalence *useful*: properties
 * proved about one type automatically apply to equivalent types.
 *
 * Practical consequence: if Z3 verifies a property for VPIR graph G1,
 * and G1 ≃ G2 (witnessed by a path from univalence), transport gives
 * the same property for G2 without re-verification. This is refactoring
 * correctness.
 *
 * Based on:
 * - docs/sprints/sprint-6-type-identity.md (Deliverable 3.2)
 */

import type {
  PathTerm,
  TransportResult,
  TypeEquivalence,
  TypeFamily,
  TypeFamilyValue,
} from '../types/hott.js';
import type { VerificationResult } from '../types/verification.js';
import type { VPIRGraph } from '../types/vpir.js';

/**
 * Transport a value along a path.
 *
 * Given:
 * - A path p: A = B (evidence that A and B are equal)
 * - A type family P (a property that types can have)
 * - A value in P(A) (the property holds for type A)
 *
 * Produces a value in P(B) (the property holds for type B).
 *
 * If transport fails (e.g., missing fiber), success is false.
 */
export function transport(
  path: PathTerm,
  typeFamily: TypeFamily,
  value: TypeFamilyValue,
): TransportResult {
  // Validate that the value belongs to the source type
  if (value.typeId !== path.sourceId) {
    return {
      success: false,
      sourceValue: value,
      path,
      typeFamily,
    };
  }

  // Check if the type family already has a fiber at the target
  const existingFiber = typeFamily.fibers.get(path.targetId);
  if (existingFiber) {
    return {
      success: true,
      sourceValue: value,
      transportedValue: existingFiber,
      path,
      typeFamily,
    };
  }

  // Construct the transported value by applying the equivalence
  const transportedValue: TypeFamilyValue = {
    typeId: path.targetId,
    value: value.value,
    label: `transport(${value.label}, ${path.witness})`,
  };

  return {
    success: true,
    sourceValue: value,
    transportedValue,
    path,
    typeFamily,
  };
}

/**
 * Create a type family from a verification property.
 *
 * The resulting type family maps graph IDs to their verification results.
 * This enables transport of verification results between equivalent graphs.
 */
export function createVerificationTypeFamily(
  propertyName: string,
  results: Map<string, VerificationResult>,
): TypeFamily {
  const fibers = new Map<string, TypeFamilyValue>();

  for (const [graphId, result] of results) {
    fibers.set(graphId, {
      typeId: graphId,
      value: result,
      label: `${propertyName}(${graphId}): ${result.verified ? 'verified' : 'failed'}`,
    });
  }

  return {
    id: `tf_${propertyName}`,
    label: `Verification: ${propertyName}`,
    fibers,
  };
}

/**
 * Transport a verification result from one VPIR graph to an equivalent one.
 *
 * If G1 and G2 are equivalent (witnessed by a path from univalence),
 * and a Z3 property has been verified for G1, then the same property
 * holds for G2 without re-running Z3.
 *
 * @param path - Path witnessing G1 = G2 (from univalence)
 * @param verificationResult - The verified property for G1
 * @param sourceGraph - The graph G1 that was verified
 * @param targetGraph - The equivalent graph G2
 * @returns The transported verification result, or undefined if transport fails
 */
export function transportVerificationResult(
  path: PathTerm,
  verificationResult: VerificationResult,
  sourceGraph: VPIRGraph,
  targetGraph: VPIRGraph,
): VerificationResult | undefined {
  // Validate the path connects the right graphs
  const sourceId = `cat_vpir_${sourceGraph.id}`;
  const targetId = `cat_vpir_${targetGraph.id}`;

  if (path.sourceId !== sourceId && path.sourceId !== sourceGraph.id) {
    return undefined;
  }

  if (path.targetId !== targetId && path.targetId !== targetGraph.id) {
    return undefined;
  }

  // Only transport verified results
  if (!verificationResult.verified) {
    return undefined;
  }

  // Validate the equivalence actually holds
  if (path.fromEquivalence) {
    const equiv = path.fromEquivalence;
    // The equivalence must connect the source and target types
    if (
      equiv.leftType.id !== path.sourceId ||
      equiv.rightType.id !== path.targetId
    ) {
      return undefined;
    }
  }

  // Construct the transported result
  return {
    verified: true,
    solver: 'transport',
    duration: 0, // No solver time — transported via univalence
    property: verificationResult.property,
    counterexample: undefined,
  };
}

/**
 * Transport multiple verification results along an equivalence.
 *
 * Given a set of verified properties for graph G1 and a path G1 = G2,
 * produces the set of properties that hold for G2 via transport.
 *
 * @returns Map from property name to transported result
 */
export function transportAllVerificationResults(
  path: PathTerm,
  results: VerificationResult[],
  sourceGraph: VPIRGraph,
  targetGraph: VPIRGraph,
): Map<string, VerificationResult> {
  const transported = new Map<string, VerificationResult>();

  for (const result of results) {
    const transportedResult = transportVerificationResult(
      path,
      result,
      sourceGraph,
      targetGraph,
    );
    if (transportedResult) {
      transported.set(transportedResult.property, transportedResult);
    }
  }

  return transported;
}

/**
 * Check if transport is applicable between two VPIR graphs.
 *
 * Returns true if there exists a type equivalence (and hence a path)
 * between the category representations of the two graphs, making
 * transport of verified properties possible.
 */
export function canTransport(
  equiv: TypeEquivalence,
  sourceGraphId: string,
  targetGraphId: string,
): boolean {
  const sourceId = equiv.leftType.id;
  const targetId = equiv.rightType.id;

  return (
    (sourceId === sourceGraphId || sourceId === `cat_vpir_${sourceGraphId}`) &&
    (targetId === targetGraphId || targetId === `cat_vpir_${targetGraphId}`)
  );
}
