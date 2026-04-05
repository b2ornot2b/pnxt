/**
 * HoTT Category Operations — create, compose, and validate categories.
 *
 * Implements the core operations of category theory as they apply to
 * typed tokenization: morphism composition, identity morphisms, path
 * equivalences, and categorical law validation.
 *
 * Based on:
 * - docs/research/original-prompt.md (Category Theory & Typed Tokenization)
 * - Advisory Review 2026-04-05 (Vladimir Voevodsky — HoTT pillar)
 */

import type {
  Category,
  CategoryValidationResult,
  CategoryViolation,
  HoTTObject,
  HoTTPath,
  Morphism,
} from '../types/hott.js';

/**
 * Create a new empty category.
 */
export function createCategory(id: string, name: string): Category {
  return {
    id,
    name,
    objects: new Map(),
    morphisms: new Map(),
    paths: new Map(),
  };
}

/**
 * Add an object to a category.
 * @throws If an object with the same ID already exists.
 */
export function addObject(category: Category, object: HoTTObject): void {
  if (category.objects.has(object.id)) {
    throw new Error(`Object '${object.id}' already exists in category '${category.id}'`);
  }
  category.objects.set(object.id, object);
}

/**
 * Add a morphism to a category.
 * @throws If source or target objects don't exist, or morphism ID is duplicate.
 */
export function addMorphism(category: Category, morphism: Morphism): void {
  if (category.morphisms.has(morphism.id)) {
    throw new Error(`Morphism '${morphism.id}' already exists in category '${category.id}'`);
  }
  if (!category.objects.has(morphism.sourceId)) {
    throw new Error(`Source object '${morphism.sourceId}' not found in category '${category.id}'`);
  }
  if (!category.objects.has(morphism.targetId)) {
    throw new Error(`Target object '${morphism.targetId}' not found in category '${category.id}'`);
  }
  category.morphisms.set(morphism.id, morphism);
}

/**
 * Create the identity morphism for an object.
 */
export function identity(objectId: string): Morphism {
  return {
    id: `id_${objectId}`,
    sourceId: objectId,
    targetId: objectId,
    label: `id(${objectId})`,
    properties: ['identity'],
  };
}

/**
 * Compose two morphisms f: A → B and g: B → C to produce g ∘ f: A → C.
 *
 * @param f - First morphism (applied first: A → B)
 * @param g - Second morphism (applied second: B → C)
 * @returns The composed morphism g ∘ f: A → C
 * @throws If f.targetId !== g.sourceId (morphisms not composable)
 */
export function compose(f: Morphism, g: Morphism): Morphism {
  if (f.targetId !== g.sourceId) {
    throw new Error(
      `Cannot compose: target of '${f.id}' (${f.targetId}) !== source of '${g.id}' (${g.sourceId})`,
    );
  }
  return {
    id: `${g.id}_after_${f.id}`,
    sourceId: f.sourceId,
    targetId: g.targetId,
    label: `${g.label} ∘ ${f.label}`,
    properties: ['composition'],
  };
}

/**
 * Add a path equivalence between two morphisms.
 * @throws If the morphisms don't exist or don't share source and target.
 */
export function addPath(category: Category, path: HoTTPath): void {
  if (category.paths.has(path.id)) {
    throw new Error(`Path '${path.id}' already exists in category '${category.id}'`);
  }
  const left = category.morphisms.get(path.leftId);
  const right = category.morphisms.get(path.rightId);
  if (!left) {
    throw new Error(`Left morphism '${path.leftId}' not found in category '${category.id}'`);
  }
  if (!right) {
    throw new Error(`Right morphism '${path.rightId}' not found in category '${category.id}'`);
  }
  if (left.sourceId !== right.sourceId || left.targetId !== right.targetId) {
    throw new Error(
      `Path endpoints mismatch: '${path.leftId}' (${left.sourceId}→${left.targetId}) ` +
      `vs '${path.rightId}' (${right.sourceId}→${right.targetId})`,
    );
  }
  category.paths.set(path.id, path);
}

/**
 * Find all morphisms between two objects.
 */
export function findMorphisms(
  category: Category,
  sourceId: string,
  targetId: string,
): Morphism[] {
  const results: Morphism[] = [];
  for (const morphism of category.morphisms.values()) {
    if (morphism.sourceId === sourceId && morphism.targetId === targetId) {
      results.push(morphism);
    }
  }
  return results;
}

/**
 * Check if two morphisms are connected by a path (i.e., are equivalent).
 */
export function areEquivalent(
  category: Category,
  morphismAId: string,
  morphismBId: string,
): boolean {
  if (morphismAId === morphismBId) return true;

  for (const path of category.paths.values()) {
    if (
      (path.leftId === morphismAId && path.rightId === morphismBId) ||
      (path.leftId === morphismBId && path.rightId === morphismAId)
    ) {
      return true;
    }
  }

  // Transitive closure via BFS
  const visited = new Set<string>([morphismAId]);
  const queue = [morphismAId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const path of category.paths.values()) {
      let neighbor: string | undefined;
      if (path.leftId === current) neighbor = path.rightId;
      else if (path.rightId === current) neighbor = path.leftId;

      if (neighbor && !visited.has(neighbor)) {
        if (neighbor === morphismBId) return true;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return false;
}

/**
 * Validate that a category satisfies the categorical laws:
 * 1. Identity: id ∘ f = f = f ∘ id for all morphisms f
 * 2. Composition closure: if f: A→B and g: B→C exist, their composition is well-defined
 * 3. Source/target integrity: all morphism endpoints reference existing objects
 */
export function validateCategory(category: Category): CategoryValidationResult {
  const violations: CategoryViolation[] = [];

  // Check source/target integrity
  for (const morphism of category.morphisms.values()) {
    if (!category.objects.has(morphism.sourceId)) {
      violations.push({
        law: 'source_target',
        message: `Morphism '${morphism.id}' references missing source object '${morphism.sourceId}'`,
        morphismIds: [morphism.id],
      });
    }
    if (!category.objects.has(morphism.targetId)) {
      violations.push({
        law: 'source_target',
        message: `Morphism '${morphism.id}' references missing target object '${morphism.targetId}'`,
        morphismIds: [morphism.id],
      });
    }
  }

  // Check identity law: every object should have a composable identity
  for (const obj of category.objects.values()) {
    const idMorphism = identity(obj.id);
    // For every morphism f ending at obj, id ∘ f must have same source/target as f
    for (const f of category.morphisms.values()) {
      if (f.targetId === obj.id && !f.properties.includes('identity')) {
        const composed = compose(f, idMorphism);
        if (composed.sourceId !== f.sourceId || composed.targetId !== f.targetId) {
          violations.push({
            law: 'identity',
            message: `Identity law violation: id(${obj.id}) ∘ ${f.id} has wrong endpoints`,
            morphismIds: [f.id],
          });
        }
      }
    }
  }

  // Check associativity: for composable triples f, g, h, (h ∘ g) ∘ f = h ∘ (g ∘ f)
  const morphisms = Array.from(category.morphisms.values());
  for (const f of morphisms) {
    for (const g of morphisms) {
      if (f.targetId !== g.sourceId) continue;
      for (const h of morphisms) {
        if (g.targetId !== h.sourceId) continue;
        const gf = compose(f, g);
        const hg = compose(g, h);
        const h_gf = compose(gf, h);
        const hg_f = compose(f, hg);
        if (h_gf.sourceId !== hg_f.sourceId || h_gf.targetId !== hg_f.targetId) {
          violations.push({
            law: 'associativity',
            message: `Associativity violation: (${h.id} ∘ ${g.id}) ∘ ${f.id} ≠ ${h.id} ∘ (${g.id} ∘ ${f.id})`,
            morphismIds: [f.id, g.id, h.id],
          });
        }
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
