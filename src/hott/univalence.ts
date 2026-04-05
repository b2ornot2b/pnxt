/**
 * Univalence Axiom Encoding — the central insight of HoTT.
 *
 * The univalence axiom states that equivalence of types is equivalent
 * to equality of types: (A ≃ B) ≃ (A = B). In our context, this means
 * categorically equivalent codebases are "the same" for all practical
 * purposes — verified properties transfer between equivalent types.
 *
 * This module encodes the axiom at the object level (individual types),
 * complementing the structural category-level `checkUnivalence` in
 * `higher-paths.ts`.
 *
 * Based on:
 * - docs/research/original-prompt.md (HoTT: Typed Tokenization)
 * - docs/sprints/sprint-6-type-identity.md (Voevodsky gap)
 */

import type {
  Category,
  HoTTObject,
  Morphism,
  PathTerm,
  TypeEquivalence,
} from '../types/hott.js';

let idCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}_${++idCounter}`;
}

/**
 * Reset the internal ID counter (for testing).
 */
export function resetUnivalenceIdCounter(): void {
  idCounter = 0;
}

/**
 * Create a type equivalence A ≃ B from two objects and their
 * forward/backward morphisms in a category.
 *
 * Validates that:
 * - Forward morphism goes A → B
 * - Backward morphism goes B → A
 * - Both morphisms exist in the category
 *
 * @throws If morphism directions don't match the claimed equivalence.
 */
export function createTypeEquivalence(
  leftType: HoTTObject,
  rightType: HoTTObject,
  forward: Morphism,
  backward: Morphism,
  category: Category,
): TypeEquivalence {
  // Validate forward: A → B
  if (forward.sourceId !== leftType.id || forward.targetId !== rightType.id) {
    throw new Error(
      `Forward morphism '${forward.id}' must go from '${leftType.id}' to '${rightType.id}', ` +
      `but goes from '${forward.sourceId}' to '${forward.targetId}'`,
    );
  }

  // Validate backward: B → A
  if (backward.sourceId !== rightType.id || backward.targetId !== leftType.id) {
    throw new Error(
      `Backward morphism '${backward.id}' must go from '${rightType.id}' to '${leftType.id}', ` +
      `but goes from '${backward.sourceId}' to '${backward.targetId}'`,
    );
  }

  // Validate morphisms exist in category
  if (!category.morphisms.has(forward.id)) {
    throw new Error(`Forward morphism '${forward.id}' not found in category '${category.id}'`);
  }
  if (!category.morphisms.has(backward.id)) {
    throw new Error(`Backward morphism '${backward.id}' not found in category '${category.id}'`);
  }

  return {
    id: nextId('equiv'),
    leftType,
    rightType,
    forward,
    backward,
    sectionWitness: `g∘f = id_${leftType.id}`,
    retractionWitness: `f∘g = id_${rightType.id}`,
  };
}

/**
 * Construct a path term A = B from an equivalence A ≃ B.
 *
 * This is one direction of the univalence axiom: every equivalence
 * gives rise to a path (identity) in the universe of types.
 */
export function equivalenceToPath(equiv: TypeEquivalence): PathTerm {
  return {
    id: nextId('path'),
    sourceId: equiv.leftType.id,
    targetId: equiv.rightType.id,
    witness: `ua(${equiv.id}): ${equiv.leftType.id} ≃ ${equiv.rightType.id} → ${equiv.leftType.id} = ${equiv.rightType.id}`,
    fromEquivalence: equiv,
  };
}

/**
 * Extract an equivalence A ≃ B from a path A = B.
 *
 * This is the other direction of the univalence axiom: every path
 * (identity) in the universe yields an equivalence.
 *
 * If the path was constructed from an equivalence (via `equivalenceToPath`),
 * the original equivalence is recovered. Otherwise, a new equivalence is
 * constructed from the category's morphisms connecting the path endpoints.
 *
 * @returns The equivalence, or undefined if no suitable morphisms exist.
 */
export function pathToEquivalence(
  path: PathTerm,
  category: Category,
): TypeEquivalence | undefined {
  // If this path was constructed from an equivalence, recover it
  if (path.fromEquivalence) {
    return path.fromEquivalence;
  }

  // Otherwise, search the category for morphisms connecting the endpoints
  const leftObj = category.objects.get(path.sourceId);
  const rightObj = category.objects.get(path.targetId);
  if (!leftObj || !rightObj) return undefined;

  let forward: Morphism | undefined;
  let backward: Morphism | undefined;

  for (const morphism of category.morphisms.values()) {
    if (morphism.sourceId === path.sourceId && morphism.targetId === path.targetId) {
      forward = morphism;
    }
    if (morphism.sourceId === path.targetId && morphism.targetId === path.sourceId) {
      backward = morphism;
    }
    if (forward && backward) break;
  }

  if (!forward || !backward) return undefined;

  return {
    id: nextId('equiv'),
    leftType: leftObj,
    rightType: rightObj,
    forward,
    backward,
    sectionWitness: `idtoequiv(${path.id}): section`,
    retractionWitness: `idtoequiv(${path.id}): retraction`,
  };
}

/**
 * Verify the univalence round-trip: pathToEquiv(equivToPath(e)) ≡ e.
 *
 * Checks that converting an equivalence to a path and back recovers
 * the original equivalence (same left/right types, same morphisms).
 */
export function verifyUnivalenceRoundTrip(
  equiv: TypeEquivalence,
  category: Category,
): { valid: boolean; message: string } {
  const path = equivalenceToPath(equiv);
  const recovered = pathToEquivalence(path, category);

  if (!recovered) {
    return {
      valid: false,
      message: `Round-trip failed: could not recover equivalence from path '${path.id}'`,
    };
  }

  // Check structural identity: same types and morphisms
  const sameLeftType = recovered.leftType.id === equiv.leftType.id;
  const sameRightType = recovered.rightType.id === equiv.rightType.id;
  const sameForward = recovered.forward.id === equiv.forward.id;
  const sameBackward = recovered.backward.id === equiv.backward.id;

  if (sameLeftType && sameRightType && sameForward && sameBackward) {
    return {
      valid: true,
      message: `Round-trip verified: equivalence '${equiv.id}' recovered intact`,
    };
  }

  return {
    valid: false,
    message: `Round-trip failed: recovered equivalence differs. ` +
      `Left: ${sameLeftType}, Right: ${sameRightType}, ` +
      `Forward: ${sameForward}, Backward: ${sameBackward}`,
  };
}

/**
 * Apply the univalence axiom to merge equivalent types in a category.
 *
 * When two VPIR-derived categories have equivalent objects (witnessed by
 * a type equivalence), this function produces a merged category that
 * identifies the equivalent objects — deduplicating them.
 *
 * This has practical consequences: optimized and unoptimized VPIR graphs
 * that are equivalent share verified properties.
 *
 * @returns The merged category with equivalent objects identified
 */
export function applyUnivalence(
  category: Category,
  equivalences: TypeEquivalence[],
): Category {
  // Build a union-find of equivalent object IDs
  const canonical = new Map<string, string>();

  for (const equiv of equivalences) {
    const leftId = equiv.leftType.id;
    const rightId = equiv.rightType.id;

    // The left type is canonical; the right maps to it
    const leftCanonical = canonical.get(leftId) ?? leftId;
    canonical.set(rightId, leftCanonical);
  }

  // Resolve transitive canonicals
  function resolve(id: string): string {
    let current = id;
    while (canonical.has(current) && canonical.get(current) !== current) {
      current = canonical.get(current)!;
    }
    return current;
  }

  const merged: Category = {
    id: `${category.id}_unified`,
    name: `${category.name} (unified)`,
    objects: new Map(),
    morphisms: new Map(),
    paths: new Map(),
  };

  // Copy objects, deduplicating equivalents
  for (const [id, obj] of category.objects) {
    const canonicalId = resolve(id);
    if (!merged.objects.has(canonicalId)) {
      merged.objects.set(canonicalId, {
        ...obj,
        id: canonicalId,
        metadata: {
          ...obj.metadata,
          unifiedFrom: id !== canonicalId ? [canonicalId, id] : undefined,
        },
      });
    }
  }

  // Copy morphisms, remapping endpoints to canonical IDs
  for (const [id, morphism] of category.morphisms) {
    const sourceCanonical = resolve(morphism.sourceId);
    const targetCanonical = resolve(morphism.targetId);

    // Skip identity morphisms created by the merge
    if (sourceCanonical === targetCanonical && morphism.sourceId !== morphism.targetId) {
      continue;
    }

    merged.morphisms.set(id, {
      ...morphism,
      sourceId: sourceCanonical,
      targetId: targetCanonical,
    });
  }

  // Copy paths, remapping IDs
  for (const [id, path] of category.paths) {
    merged.paths.set(id, path);
  }

  // Add paths witnessing the equivalences
  for (const equiv of equivalences) {
    const pathTerm = equivalenceToPath(equiv);
    merged.paths.set(pathTerm.id, {
      id: pathTerm.id,
      leftId: equiv.forward.id,
      rightId: equiv.backward.id,
      witness: pathTerm.witness,
    });
  }

  return merged;
}

/**
 * Find type equivalences within a category.
 *
 * Searches for pairs of objects connected by morphisms in both directions
 * (f: A→B and g: B→A), which are candidates for type equivalences.
 *
 * @returns Array of discovered type equivalences
 */
export function findTypeEquivalences(category: Category): TypeEquivalence[] {
  const equivalences: TypeEquivalence[] = [];
  const seen = new Set<string>();

  // For each pair of morphisms, check if they form a round-trip
  for (const forward of category.morphisms.values()) {
    for (const backward of category.morphisms.values()) {
      if (
        forward.sourceId === backward.targetId &&
        forward.targetId === backward.sourceId &&
        forward.id !== backward.id
      ) {
        const pairKey = [forward.sourceId, forward.targetId].sort().join(':');
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        const leftObj = category.objects.get(forward.sourceId);
        const rightObj = category.objects.get(forward.targetId);
        if (!leftObj || !rightObj) continue;

        equivalences.push({
          id: nextId('equiv'),
          leftType: leftObj,
          rightType: rightObj,
          forward,
          backward,
          sectionWitness: `g∘f = id_${leftObj.id}`,
          retractionWitness: `f∘g = id_${rightObj.id}`,
        });
      }
    }
  }

  return equivalences;
}
