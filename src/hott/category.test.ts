/**
 * Tests for HoTT Category Operations.
 */

import {
  createCategory,
  addObject,
  addMorphism,
  identity,
  compose,
  addPath,
  findMorphisms,
  areEquivalent,
  validateCategory,
} from './category.js';
import type { HoTTObject, Morphism, HoTTPath } from '../types/hott.js';

function makeObject(id: string, kind: 'type' | 'term' | 'context' = 'term'): HoTTObject {
  return { id, kind, label: id };
}

function makeMorphism(id: string, sourceId: string, targetId: string): Morphism {
  return { id, sourceId, targetId, label: `${sourceId}→${targetId}`, properties: [] };
}

describe('HoTT Category', () => {
  describe('createCategory', () => {
    it('should create an empty category', () => {
      const cat = createCategory('c1', 'TestCategory');
      expect(cat.id).toBe('c1');
      expect(cat.name).toBe('TestCategory');
      expect(cat.objects.size).toBe(0);
      expect(cat.morphisms.size).toBe(0);
      expect(cat.paths.size).toBe(0);
    });
  });

  describe('addObject', () => {
    it('should add an object to the category', () => {
      const cat = createCategory('c1', 'Test');
      const obj = makeObject('A');
      addObject(cat, obj);
      expect(cat.objects.size).toBe(1);
      expect(cat.objects.get('A')).toBe(obj);
    });

    it('should throw on duplicate object ID', () => {
      const cat = createCategory('c1', 'Test');
      addObject(cat, makeObject('A'));
      expect(() => addObject(cat, makeObject('A'))).toThrow("Object 'A' already exists");
    });

    it('should support objects with security labels', () => {
      const cat = createCategory('c1', 'Test');
      const obj: HoTTObject = {
        id: 'A',
        kind: 'type',
        label: 'A',
        securityLabel: {
          owner: 'agent-1',
          trustLevel: 2,
          classification: 'internal',
          createdAt: new Date().toISOString(),
        },
      };
      addObject(cat, obj);
      expect(cat.objects.get('A')?.securityLabel?.owner).toBe('agent-1');
    });
  });

  describe('addMorphism', () => {
    it('should add a morphism between existing objects', () => {
      const cat = createCategory('c1', 'Test');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      const m = makeMorphism('f', 'A', 'B');
      addMorphism(cat, m);
      expect(cat.morphisms.size).toBe(1);
      expect(cat.morphisms.get('f')).toBe(m);
    });

    it('should throw if source object is missing', () => {
      const cat = createCategory('c1', 'Test');
      addObject(cat, makeObject('B'));
      expect(() => addMorphism(cat, makeMorphism('f', 'A', 'B'))).toThrow(
        "Source object 'A' not found",
      );
    });

    it('should throw if target object is missing', () => {
      const cat = createCategory('c1', 'Test');
      addObject(cat, makeObject('A'));
      expect(() => addMorphism(cat, makeMorphism('f', 'A', 'B'))).toThrow(
        "Target object 'B' not found",
      );
    });

    it('should throw on duplicate morphism ID', () => {
      const cat = createCategory('c1', 'Test');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));
      expect(() => addMorphism(cat, makeMorphism('f', 'A', 'B'))).toThrow(
        "Morphism 'f' already exists",
      );
    });
  });

  describe('identity', () => {
    it('should create an identity morphism', () => {
      const id = identity('A');
      expect(id.sourceId).toBe('A');
      expect(id.targetId).toBe('A');
      expect(id.properties).toContain('identity');
      expect(id.id).toBe('id_A');
    });
  });

  describe('compose', () => {
    it('should compose two compatible morphisms', () => {
      const f: Morphism = makeMorphism('f', 'A', 'B');
      const g: Morphism = makeMorphism('g', 'B', 'C');
      const gf = compose(f, g);
      expect(gf.sourceId).toBe('A');
      expect(gf.targetId).toBe('C');
      expect(gf.properties).toContain('composition');
    });

    it('should throw if morphisms are not composable', () => {
      const f = makeMorphism('f', 'A', 'B');
      const h = makeMorphism('h', 'C', 'D');
      expect(() => compose(f, h)).toThrow('Cannot compose');
    });

    it('should satisfy identity law: id ∘ f = f endpoints', () => {
      const f = makeMorphism('f', 'A', 'B');
      const idB = identity('B');
      const composed = compose(f, idB);
      expect(composed.sourceId).toBe('A');
      expect(composed.targetId).toBe('B');
    });

    it('should satisfy identity law: f ∘ id = f endpoints', () => {
      const f = makeMorphism('f', 'A', 'B');
      const idA = identity('A');
      const composed = compose(idA, f);
      expect(composed.sourceId).toBe('A');
      expect(composed.targetId).toBe('B');
    });

    it('should satisfy associativity: (h ∘ g) ∘ f = h ∘ (g ∘ f) endpoints', () => {
      const f = makeMorphism('f', 'A', 'B');
      const g = makeMorphism('g', 'B', 'C');
      const h = makeMorphism('h', 'C', 'D');

      const gf = compose(f, g);
      const hgf_left = compose(gf, h);

      const hg = compose(g, h);
      const hgf_right = compose(f, hg);

      expect(hgf_left.sourceId).toBe(hgf_right.sourceId);
      expect(hgf_left.targetId).toBe(hgf_right.targetId);
    });
  });

  describe('addPath', () => {
    it('should add a path between morphisms with same endpoints', () => {
      const cat = createCategory('c1', 'Test');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));
      addMorphism(cat, makeMorphism('g', 'A', 'B'));
      const path: HoTTPath = { id: 'p1', leftId: 'f', rightId: 'g', witness: 'refactoring' };
      addPath(cat, path);
      expect(cat.paths.size).toBe(1);
    });

    it('should throw if morphisms have different endpoints', () => {
      const cat = createCategory('c1', 'Test');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addObject(cat, makeObject('C'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));
      addMorphism(cat, makeMorphism('g', 'A', 'C'));
      expect(() =>
        addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'test' }),
      ).toThrow('Path endpoints mismatch');
    });

    it('should throw if left morphism does not exist', () => {
      const cat = createCategory('c1', 'Test');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addMorphism(cat, makeMorphism('g', 'A', 'B'));
      expect(() =>
        addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'test' }),
      ).toThrow("Left morphism 'f' not found");
    });
  });

  describe('findMorphisms', () => {
    it('should find morphisms between two objects', () => {
      const cat = createCategory('c1', 'Test');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addObject(cat, makeObject('C'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));
      addMorphism(cat, makeMorphism('g', 'A', 'B'));
      addMorphism(cat, makeMorphism('h', 'A', 'C'));

      const results = findMorphisms(cat, 'A', 'B');
      expect(results).toHaveLength(2);
      expect(results.map((m) => m.id).sort()).toEqual(['f', 'g']);
    });

    it('should return empty array when no morphisms exist', () => {
      const cat = createCategory('c1', 'Test');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      expect(findMorphisms(cat, 'A', 'B')).toHaveLength(0);
    });
  });

  describe('areEquivalent', () => {
    it('should return true for same morphism', () => {
      const cat = createCategory('c1', 'Test');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));
      expect(areEquivalent(cat, 'f', 'f')).toBe(true);
    });

    it('should return true for directly connected morphisms', () => {
      const cat = createCategory('c1', 'Test');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));
      addMorphism(cat, makeMorphism('g', 'A', 'B'));
      addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'test' });
      expect(areEquivalent(cat, 'f', 'g')).toBe(true);
      expect(areEquivalent(cat, 'g', 'f')).toBe(true);
    });

    it('should return true for transitively connected morphisms', () => {
      const cat = createCategory('c1', 'Test');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));
      addMorphism(cat, makeMorphism('g', 'A', 'B'));
      addMorphism(cat, makeMorphism('h', 'A', 'B'));
      addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'step1' });
      addPath(cat, { id: 'p2', leftId: 'g', rightId: 'h', witness: 'step2' });
      expect(areEquivalent(cat, 'f', 'h')).toBe(true);
    });

    it('should return false for unconnected morphisms', () => {
      const cat = createCategory('c1', 'Test');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));
      addMorphism(cat, makeMorphism('g', 'A', 'B'));
      expect(areEquivalent(cat, 'f', 'g')).toBe(false);
    });
  });

  describe('validateCategory', () => {
    it('should validate a well-formed category', () => {
      const cat = createCategory('c1', 'Test');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));
      const result = validateCategory(cat);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should validate an empty category', () => {
      const cat = createCategory('c1', 'Empty');
      const result = validateCategory(cat);
      expect(result.valid).toBe(true);
    });

    it('should validate a category with a chain A→B→C→D', () => {
      const cat = createCategory('c1', 'Chain');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addObject(cat, makeObject('C'));
      addObject(cat, makeObject('D'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));
      addMorphism(cat, makeMorphism('g', 'B', 'C'));
      addMorphism(cat, makeMorphism('h', 'C', 'D'));
      const result = validateCategory(cat);
      expect(result.valid).toBe(true);
    });
  });
});
