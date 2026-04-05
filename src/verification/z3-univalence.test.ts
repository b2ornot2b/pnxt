/**
 * Z3 Univalence Axiom Verification test suite.
 *
 * Sprint 6 — Advisory Panel: Vladimir Voevodsky (HoTT).
 */

import { createZ3Context } from './z3-invariants.js';
import type { Z3Context } from './z3-invariants.js';
import { extractEquivalencePairs } from './z3-univalence.js';
import {
  createCategory,
  addObject,
  addMorphism,
} from '../hott/category.js';
import type { HoTTObject, Morphism } from '../types/hott.js';

// --- Helpers ---

function makeObject(id: string, kind: 'type' | 'term' | 'context' = 'term'): HoTTObject {
  return { id, kind, label: id };
}

function makeMorphism(id: string, sourceId: string, targetId: string): Morphism {
  return { id, sourceId, targetId, label: `${sourceId}→${targetId}`, properties: [] };
}

// --- Tests ---

describe('Z3 Univalence Axiom Verification', () => {
  let ctx: Z3Context;

  beforeAll(async () => {
    ctx = await createZ3Context();
  }, 30000);

  afterAll(() => {
    ctx = undefined as unknown as Z3Context;
  });

  describe('extractEquivalencePairs', () => {
    it('should find round-trip morphism pairs', () => {
      const cat = createCategory('cat', 'Test');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));
      addMorphism(cat, makeMorphism('g', 'B', 'A'));

      const pairs = extractEquivalencePairs(cat);
      expect(pairs.length).toBe(1);
      expect(pairs[0].sourceId).toBe('A');
      expect(pairs[0].targetId).toBe('B');
    });

    it('should return empty for one-way morphisms', () => {
      const cat = createCategory('cat', 'Test');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));

      const pairs = extractEquivalencePairs(cat);
      expect(pairs.length).toBe(0);
    });

    it('should return empty for empty category', () => {
      const cat = createCategory('empty', 'Empty');
      const pairs = extractEquivalencePairs(cat);
      expect(pairs.length).toBe(0);
    });
  });

  describe('verifyUnivalenceAxiom', () => {
    it('should verify univalence for a valid equivalence (UNSAT)', async () => {
      const cat = createCategory('valid', 'Valid Equivalence');
      addObject(cat, makeObject('A', 'type'));
      addObject(cat, makeObject('B', 'type'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));
      addMorphism(cat, makeMorphism('g', 'B', 'A'));

      const result = await ctx.verifyUnivalenceAxiom(cat);
      expect(result.verified).toBe(true);
      expect(result.property).toBe('univalence_axiom');
    });

    it('should verify vacuously for category with no equivalences', async () => {
      const cat = createCategory('no-equiv', 'No Equivalences');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));

      const result = await ctx.verifyUnivalenceAxiom(cat);
      expect(result.verified).toBe(true);
      expect(result.property).toBe('univalence_axiom');
    });

    it('should verify for empty category', async () => {
      const cat = createCategory('empty', 'Empty');

      const result = await ctx.verifyUnivalenceAxiom(cat);
      expect(result.verified).toBe(true);
    });

    it('should verify for category with multiple equivalence pairs', async () => {
      const cat = createCategory('multi', 'Multi Equivalences');
      addObject(cat, makeObject('A', 'type'));
      addObject(cat, makeObject('B', 'type'));
      addObject(cat, makeObject('C', 'type'));
      addMorphism(cat, makeMorphism('f_ab', 'A', 'B'));
      addMorphism(cat, makeMorphism('g_ba', 'B', 'A'));
      addMorphism(cat, makeMorphism('f_bc', 'B', 'C'));
      addMorphism(cat, makeMorphism('g_cb', 'C', 'B'));

      const result = await ctx.verifyUnivalenceAxiom(cat);
      expect(result.verified).toBe(true);
    });

    it('should include duration in result', async () => {
      const cat = createCategory('cat', 'Cat');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));
      addMorphism(cat, makeMorphism('g', 'B', 'A'));

      const result = await ctx.verifyUnivalenceAxiom(cat);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.solver).toBe('z3');
    });
  });
});
