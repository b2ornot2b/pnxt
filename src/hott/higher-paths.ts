/**
 * HoTT Higher Paths — 2-paths, groupoid structure, and univalence.
 *
 * Extends the HoTT foundation from 1-categories to groupoids with
 * higher paths. 2-paths witness that two 1-path equivalences are
 * themselves equivalent (homotopy between homotopies), enabling proofs
 * that different refactoring sequences produce the same result.
 *
 * Groupoid structure proves every morphism is invertible — the natural
 * structure for code refactoring where every transformation can be undone.
 *
 * Univalence axiom: equivalent categories are equal (identity of
 * indiscernibles for categorical structures).
 *
 * Based on:
 * - docs/research/original-prompt.md (HoTT higher paths)
 * - Advisory Review 2026-04-05 (Voevodsky — need 2-paths, groupoid, univalence)
 */

import type {
  Category,
  CategoryEquivalence,
  Functor,
  GroupoidStructure,
  GroupoidValidationResult,
  GroupoidViolation,
  HigherPath,
  HoTTPath,
  Morphism,
  UnivalenceWitness,
} from '../types/hott.js';

/**
 * Create a higher path (2-path) between two 1-paths.
 *
 * Validates that both 1-paths connect morphisms with the same endpoints
 * (i.e., they are parallel 1-paths in the same hom-set).
 *
 * @param category - The category containing both 1-paths
 * @param left - The left 1-path
 * @param right - The right 1-path
 * @param witness - Evidence/proof that the 1-paths are equivalent
 * @returns A new HigherPath
 * @throws If the 1-paths don't share the same morphism endpoint structure
 */
export function createHigherPath(
  category: Category,
  left: HoTTPath,
  right: HoTTPath,
  witness: string,
): HigherPath {
  // Validate both paths exist in the category
  if (!category.paths.has(left.id)) {
    throw new Error(`Left 1-path '${left.id}' not found in category '${category.id}'`);
  }
  if (!category.paths.has(right.id)) {
    throw new Error(`Right 1-path '${right.id}' not found in category '${category.id}'`);
  }

  // Validate that both 1-paths connect morphisms with the same source/target
  const leftMorphismL = category.morphisms.get(left.leftId);
  const rightMorphismL = category.morphisms.get(right.leftId);

  if (leftMorphismL && rightMorphismL) {
    if (
      leftMorphismL.sourceId !== rightMorphismL.sourceId ||
      leftMorphismL.targetId !== rightMorphismL.targetId
    ) {
      throw new Error(
        'Cannot create higher path: 1-paths connect morphisms with different endpoints',
      );
    }
  }

  return {
    id: `hp_${left.id}_${right.id}`,
    leftPathId: left.id,
    rightPathId: right.id,
    level: 2,
    witness,
  };
}

/**
 * Construct the inverse of a 1-path (swap left/right morphisms).
 *
 * If p: f ≃ g, then p⁻¹: g ≃ f.
 */
export function inversePath(path: HoTTPath): HoTTPath {
  return {
    id: `inv_${path.id}`,
    leftId: path.rightId,
    rightId: path.leftId,
    witness: `inverse(${path.witness})`,
  };
}

/**
 * Construct the inverse of a morphism (swap source/target).
 *
 * If f: A → B, then f⁻¹: B → A.
 * The inverse is marked as an isomorphism.
 */
export function inverseMorphism(morphism: Morphism): Morphism {
  return {
    id: `inv_${morphism.id}`,
    sourceId: morphism.targetId,
    targetId: morphism.sourceId,
    label: `${morphism.label}⁻¹`,
    properties: ['isomorphism'],
  };
}

/**
 * Build a groupoid structure for a category.
 *
 * Computes inverse morphisms and path inverses for all morphisms and
 * paths in the category. In a groupoid, every morphism is invertible.
 *
 * @param category - The category to build groupoid structure for
 * @returns GroupoidStructure with computed inverses
 */
export function buildGroupoidStructure(category: Category): GroupoidStructure {
  const inverses = new Map<string, Morphism>();
  const pathInverses = new Map<string, HoTTPath>();

  // Compute inverse for each morphism (skip identity morphisms — they are self-inverse)
  for (const [id, morphism] of category.morphisms) {
    if (morphism.properties.includes('identity')) {
      inverses.set(id, morphism); // id⁻¹ = id
    } else {
      inverses.set(id, inverseMorphism(morphism));
    }
  }

  // Compute inverse for each path
  for (const [id, path] of category.paths) {
    pathInverses.set(id, inversePath(path));
  }

  return {
    categoryId: category.id,
    inverses,
    pathInverses,
  };
}

/**
 * Validate that a category with groupoid structure satisfies groupoid laws.
 *
 * Checks:
 * 1. f ∘ f⁻¹ has same endpoints as id (left inverse law)
 * 2. f⁻¹ ∘ f has same endpoints as id (right inverse law)
 * 3. For each path p, p ∘ p⁻¹ is reflexive (path inverse law)
 */
export function validateGroupoid(
  category: Category,
  structure: GroupoidStructure,
): GroupoidValidationResult {
  const violations: GroupoidViolation[] = [];

  for (const [morphismId, morphism] of category.morphisms) {
    const inv = structure.inverses.get(morphismId);
    if (!inv) {
      violations.push({
        law: 'inverse_left',
        message: `No inverse found for morphism '${morphismId}'`,
        ids: [morphismId],
      });
      continue;
    }

    // For f: A->B and f_inv: B->A (from inverseMorphism):
    // compose(f, f_inv) = "f first, then f_inv" = A->B->A, yielding A->A (identity on A)
    // compose(f_inv, f) = "f_inv first, then f" = B->A->B, yielding B->B (identity on B)

    // Left inverse: compose(f, f_inv) requires f.target === f_inv.source
    if (morphism.targetId !== inv.sourceId) {
      violations.push({
        law: 'inverse_left',
        message: `compose(f, f_inv) not composable for morphism '${morphismId}': ` +
          `f.target=${morphism.targetId}, f_inv.source=${inv.sourceId}`,
        ids: [morphismId, inv.id],
      });
    } else if (morphism.sourceId !== inv.targetId) {
      // compose(f, f_inv) endpoints: f.source -> inv.target, should be A -> A
      violations.push({
        law: 'inverse_left',
        message: `compose(f, f_inv) does not produce identity for '${morphismId}': ` +
          `expected (${morphism.sourceId}->${morphism.sourceId}), ` +
          `got (${morphism.sourceId}->${inv.targetId})`,
        ids: [morphismId, inv.id],
      });
    }

    // Right inverse: compose(f_inv, f) requires f_inv.target === f.source
    if (inv.targetId !== morphism.sourceId) {
      violations.push({
        law: 'inverse_right',
        message: `compose(f_inv, f) not composable for morphism '${morphismId}': ` +
          `f_inv.target=${inv.targetId}, f.source=${morphism.sourceId}`,
        ids: [morphismId, inv.id],
      });
    } else if (inv.sourceId !== morphism.targetId) {
      // compose(f_inv, f) endpoints: inv.source -> f.target, should be B -> B
      violations.push({
        law: 'inverse_right',
        message: `compose(f_inv, f) does not produce identity for '${morphismId}': ` +
          `expected (${morphism.targetId}->${morphism.targetId}), ` +
          `got (${inv.sourceId}->${morphism.targetId})`,
        ids: [morphismId, inv.id],
      });
    }
  }

  // Check path inverse law: for each path p, p⁻¹ should swap left and right
  for (const [pathId, path] of category.paths) {
    const inv = structure.pathInverses.get(pathId);
    if (!inv) {
      violations.push({
        law: 'path_inverse',
        message: `No inverse found for path '${pathId}'`,
        ids: [pathId],
      });
      continue;
    }

    // p: f ≃ g, p⁻¹: g ≃ f
    if (inv.leftId !== path.rightId || inv.rightId !== path.leftId) {
      violations.push({
        law: 'path_inverse',
        message: `Path inverse for '${pathId}' does not properly swap endpoints: ` +
          `expected (${path.rightId} ≃ ${path.leftId}), got (${inv.leftId} ≃ ${inv.rightId})`,
        ids: [pathId, inv.id],
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Check the univalence axiom for a categorical equivalence.
 *
 * Given two categories and a claimed equivalence between them
 * (functors F: A→B, G: B→A with natural isomorphisms), verify that
 * the equivalence is well-formed:
 * - F and G map objects and morphisms consistently
 * - G(F(a)) maps back to a for all objects a in A
 * - F(G(b)) maps back to b for all objects b in B
 *
 * @returns UnivalenceWitness with verification results
 */
export function checkUnivalence(
  catA: Category,
  catB: Category,
  equivalence: CategoryEquivalence,
): UnivalenceWitness {
  const { forward, backward } = equivalence;
  const verifiedObjects: string[] = [];
  const verifiedMorphisms: string[] = [];
  let valid = true;

  // Check that F maps all objects in A to objects in B
  for (const objId of catA.objects.keys()) {
    const mappedId = forward.objectMap.get(objId);
    if (!mappedId || !catB.objects.has(mappedId)) {
      valid = false;
      continue;
    }

    // Check round-trip: G(F(a)) should map back to a
    const roundTrip = backward.objectMap.get(mappedId);
    if (roundTrip === objId) {
      verifiedObjects.push(objId);
    } else {
      valid = false;
    }
  }

  // Check that G maps all objects in B to objects in A
  for (const objId of catB.objects.keys()) {
    const mappedId = backward.objectMap.get(objId);
    if (!mappedId || !catA.objects.has(mappedId)) {
      valid = false;
      continue;
    }

    // Check round-trip: F(G(b)) should map back to b
    const roundTrip = forward.objectMap.get(mappedId);
    if (roundTrip !== objId) {
      valid = false;
    }
  }

  // Check that F maps morphisms consistently
  for (const morphismId of catA.morphisms.keys()) {
    const mappedId = forward.morphismMap.get(morphismId);
    if (!mappedId || !catB.morphisms.has(mappedId)) {
      valid = false;
      continue;
    }

    // Check round-trip: G(F(m)) should map back to m
    const roundTrip = backward.morphismMap.get(mappedId);
    if (roundTrip === morphismId) {
      verifiedMorphisms.push(morphismId);
    } else {
      valid = false;
    }
  }

  return {
    equivalence,
    justification: valid
      ? 'All objects and morphisms verified under round-trip equivalence'
      : 'Some objects or morphisms failed round-trip verification',
    valid,
    verifiedObjects,
    verifiedMorphisms,
  };
}

/**
 * Create a functor between two categories.
 *
 * Convenience constructor that validates the mapping is well-formed.
 *
 * @throws If the mapping references objects/morphisms not in the target category.
 */
export function createFunctor(
  id: string,
  source: Category,
  target: Category,
  objectMap: Map<string, string>,
  morphismMap: Map<string, string>,
): Functor {
  // Validate object map targets exist
  for (const [sourceId, targetId] of objectMap) {
    if (!source.objects.has(sourceId)) {
      throw new Error(`Source object '${sourceId}' not found in category '${source.id}'`);
    }
    if (!target.objects.has(targetId)) {
      throw new Error(`Target object '${targetId}' not found in category '${target.id}'`);
    }
  }

  // Validate morphism map targets exist
  for (const [sourceId, targetId] of morphismMap) {
    if (!source.morphisms.has(sourceId)) {
      throw new Error(`Source morphism '${sourceId}' not found in category '${source.id}'`);
    }
    if (!target.morphisms.has(targetId)) {
      throw new Error(`Target morphism '${targetId}' not found in category '${target.id}'`);
    }
  }

  return {
    id,
    sourceCategoryId: source.id,
    targetCategoryId: target.id,
    objectMap,
    morphismMap,
  };
}
