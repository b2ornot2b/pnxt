/**
 * Tests for Univalence Axiom Encoding.
 *
 * Sprint 6 — Advisory Panel: Vladimir Voevodsky (HoTT).
 */

import {
  createTypeEquivalence,
  equivalenceToPath,
  pathToEquivalence,
  verifyUnivalenceRoundTrip,
  applyUnivalence,
  findTypeEquivalences,
  resetUnivalenceIdCounter,
} from './univalence.js';
import {
  createCategory,
  addObject,
  addMorphism,
} from './category.js';
import type { HoTTObject, Morphism, Category } from '../types/hott.js';

// --- Helpers ---

function makeObject(id: string, kind: 'type' | 'term' | 'context' = 'term'): HoTTObject {
  return { id, kind, label: id };
}

function makeMorphism(id: string, sourceId: string, targetId: string): Morphism {
  return { id, sourceId, targetId, label: `${sourceId}→${targetId}`, properties: [] };
}

function buildEquivalenceCategory(): Category {
  const cat = createCategory('test-cat', 'Test Category');
  const objA = makeObject('A', 'type');
  const objB = makeObject('B', 'type');
  addObject(cat, objA);
  addObject(cat, objB);
  const fwd = makeMorphism('f_AB', 'A', 'B');
  const bwd = makeMorphism('g_BA', 'B', 'A');
  addMorphism(cat, fwd);
  addMorphism(cat, bwd);
  return cat;
}

beforeEach(() => {
  resetUnivalenceIdCounter();
});

// --- createTypeEquivalence ---

describe('createTypeEquivalence', () => {
  it('should create an equivalence from valid objects and morphisms', () => {
    const cat = buildEquivalenceCategory();
    const objA = cat.objects.get('A')!;
    const objB = cat.objects.get('B')!;
    const fwd = cat.morphisms.get('f_AB')!;
    const bwd = cat.morphisms.get('g_BA')!;

    const equiv = createTypeEquivalence(objA, objB, fwd, bwd, cat);

    expect(equiv.id).toMatch(/^equiv_/);
    expect(equiv.leftType.id).toBe('A');
    expect(equiv.rightType.id).toBe('B');
    expect(equiv.forward.id).toBe('f_AB');
    expect(equiv.backward.id).toBe('g_BA');
    expect(equiv.sectionWitness).toContain('id_A');
    expect(equiv.retractionWitness).toContain('id_B');
  });

  it('should throw if forward morphism direction is wrong', () => {
    const cat = buildEquivalenceCategory();
    const objA = cat.objects.get('A')!;
    const objB = cat.objects.get('B')!;
    const bwd = cat.morphisms.get('g_BA')!;

    expect(() => createTypeEquivalence(objA, objB, bwd, bwd, cat)).toThrow(
      /Forward morphism/,
    );
  });

  it('should throw if backward morphism direction is wrong', () => {
    const cat = buildEquivalenceCategory();
    const objA = cat.objects.get('A')!;
    const objB = cat.objects.get('B')!;
    const fwd = cat.morphisms.get('f_AB')!;

    expect(() => createTypeEquivalence(objA, objB, fwd, fwd, cat)).toThrow(
      /Backward morphism/,
    );
  });

  it('should throw if morphism not in category', () => {
    const cat = buildEquivalenceCategory();
    const objA = cat.objects.get('A')!;
    const objB = cat.objects.get('B')!;
    const fakeFwd: Morphism = { id: 'fake', sourceId: 'A', targetId: 'B', label: 'fake', properties: [] };
    const bwd = cat.morphisms.get('g_BA')!;

    expect(() => createTypeEquivalence(objA, objB, fakeFwd, bwd, cat)).toThrow(
      /not found in category/,
    );
  });
});

// --- equivalenceToPath ---

describe('equivalenceToPath', () => {
  it('should produce a path term from an equivalence', () => {
    const cat = buildEquivalenceCategory();
    const objA = cat.objects.get('A')!;
    const objB = cat.objects.get('B')!;
    const fwd = cat.morphisms.get('f_AB')!;
    const bwd = cat.morphisms.get('g_BA')!;

    const equiv = createTypeEquivalence(objA, objB, fwd, bwd, cat);
    const path = equivalenceToPath(equiv);

    expect(path.id).toMatch(/^path_/);
    expect(path.sourceId).toBe('A');
    expect(path.targetId).toBe('B');
    expect(path.witness).toContain('ua(');
    expect(path.fromEquivalence).toBe(equiv);
  });
});

// --- pathToEquivalence ---

describe('pathToEquivalence', () => {
  it('should recover the original equivalence from a path constructed by equivalenceToPath', () => {
    const cat = buildEquivalenceCategory();
    const objA = cat.objects.get('A')!;
    const objB = cat.objects.get('B')!;
    const fwd = cat.morphisms.get('f_AB')!;
    const bwd = cat.morphisms.get('g_BA')!;

    const equiv = createTypeEquivalence(objA, objB, fwd, bwd, cat);
    const path = equivalenceToPath(equiv);
    const recovered = pathToEquivalence(path, cat);

    expect(recovered).toBeDefined();
    expect(recovered!.leftType.id).toBe('A');
    expect(recovered!.rightType.id).toBe('B');
    expect(recovered!.forward.id).toBe('f_AB');
    expect(recovered!.backward.id).toBe('g_BA');
  });

  it('should construct an equivalence from a path without fromEquivalence', () => {
    const cat = buildEquivalenceCategory();

    const path = {
      id: 'manual-path',
      sourceId: 'A',
      targetId: 'B',
      witness: 'manual',
    };

    const equiv = pathToEquivalence(path, cat);
    expect(equiv).toBeDefined();
    expect(equiv!.leftType.id).toBe('A');
    expect(equiv!.rightType.id).toBe('B');
  });

  it('should return undefined if no matching morphisms exist', () => {
    const cat = createCategory('empty', 'Empty');
    addObject(cat, makeObject('A'));
    addObject(cat, makeObject('B'));

    const path = { id: 'p', sourceId: 'A', targetId: 'B', witness: 'none' };
    const equiv = pathToEquivalence(path, cat);
    expect(equiv).toBeUndefined();
  });

  it('should return undefined if objects do not exist', () => {
    const cat = createCategory('empty', 'Empty');
    const path = { id: 'p', sourceId: 'X', targetId: 'Y', witness: 'none' };
    const equiv = pathToEquivalence(path, cat);
    expect(equiv).toBeUndefined();
  });
});

// --- verifyUnivalenceRoundTrip ---

describe('verifyUnivalenceRoundTrip', () => {
  it('should verify round-trip for a valid equivalence', () => {
    const cat = buildEquivalenceCategory();
    const objA = cat.objects.get('A')!;
    const objB = cat.objects.get('B')!;
    const fwd = cat.morphisms.get('f_AB')!;
    const bwd = cat.morphisms.get('g_BA')!;

    const equiv = createTypeEquivalence(objA, objB, fwd, bwd, cat);
    const result = verifyUnivalenceRoundTrip(equiv, cat);

    expect(result.valid).toBe(true);
    expect(result.message).toContain('recovered intact');
  });
});

// --- applyUnivalence ---

describe('applyUnivalence', () => {
  it('should merge equivalent objects in a category', () => {
    const cat = buildEquivalenceCategory();
    // Add a third object and morphisms to make the category interesting
    addObject(cat, makeObject('C', 'type'));
    addMorphism(cat, makeMorphism('h_AC', 'A', 'C'));
    addMorphism(cat, makeMorphism('h_BC', 'B', 'C'));

    const objA = cat.objects.get('A')!;
    const objB = cat.objects.get('B')!;
    const fwd = cat.morphisms.get('f_AB')!;
    const bwd = cat.morphisms.get('g_BA')!;
    const equiv = createTypeEquivalence(objA, objB, fwd, bwd, cat);

    const merged = applyUnivalence(cat, [equiv]);

    // A and B should be merged: B maps to A
    expect(merged.objects.has('A')).toBe(true);
    expect(merged.objects.has('B')).toBe(false);
    expect(merged.objects.has('C')).toBe(true);
    // Paths should witness the equivalence
    expect(merged.paths.size).toBeGreaterThan(0);
  });

  it('should handle empty equivalences', () => {
    const cat = buildEquivalenceCategory();
    const merged = applyUnivalence(cat, []);

    expect(merged.objects.size).toBe(cat.objects.size);
  });
});

// --- findTypeEquivalences ---

describe('findTypeEquivalences', () => {
  it('should find equivalences from round-trip morphism pairs', () => {
    const cat = buildEquivalenceCategory();
    const equivs = findTypeEquivalences(cat);

    expect(equivs.length).toBe(1);
    expect(equivs[0].leftType.id).toBe('A');
    expect(equivs[0].rightType.id).toBe('B');
  });

  it('should return empty for a category with no round-trip morphisms', () => {
    const cat = createCategory('one-way', 'One Way');
    addObject(cat, makeObject('A'));
    addObject(cat, makeObject('B'));
    addMorphism(cat, makeMorphism('f', 'A', 'B'));

    const equivs = findTypeEquivalences(cat);
    expect(equivs.length).toBe(0);
  });

  it('should return empty for an empty category', () => {
    const cat = createCategory('empty', 'Empty');
    const equivs = findTypeEquivalences(cat);
    expect(equivs.length).toBe(0);
  });

  it('should not duplicate equivalence pairs', () => {
    const cat = buildEquivalenceCategory();
    // Add a second pair of round-trip morphisms between the same objects
    addMorphism(cat, makeMorphism('f2_AB', 'A', 'B'));
    addMorphism(cat, makeMorphism('g2_BA', 'B', 'A'));

    const equivs = findTypeEquivalences(cat);
    // Should find multiple equivalences but not duplicate the same pair
    // With 2 forward and 2 backward morphisms, we get 4 pairs, but
    // since we deduplicate by object pair, we get 1 canonical pair
    expect(equivs.length).toBe(1);
  });
});
