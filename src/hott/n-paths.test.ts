/**
 * Tests for HoTT N-Paths — arbitrary-level paths in the homotopy tower.
 */

import type { Category, NPath } from '../types/hott.js';
import {
  createCategory,
  addObject,
  addMorphism,
  addPath,
  validateCategory,
} from './category.js';
import {
  createNPath,
  addNPath,
  composeNPaths,
  horizontalCompose,
  truncationLevel,
  isTruncated,
  buildNGroupoidStructure,
  validateNGroupoid,
} from './n-paths.js';

/** Create a minimal test category with objects A, B and morphisms f, g: A→B. */
function makeTestCategory(): Category {
  const cat = createCategory('test-cat', 'Test Category');
  addObject(cat, { id: 'A', kind: 'type', label: 'A' });
  addObject(cat, { id: 'B', kind: 'type', label: 'B' });
  addMorphism(cat, { id: 'f', sourceId: 'A', targetId: 'B', label: 'f', properties: [] });
  addMorphism(cat, { id: 'g', sourceId: 'A', targetId: 'B', label: 'g', properties: [] });
  addMorphism(cat, { id: 'h', sourceId: 'A', targetId: 'B', label: 'h', properties: [] });
  return cat;
}

describe('NPath creation', () => {
  it('should create a level-1 n-path between parallel morphisms', () => {
    const cat = makeTestCategory();
    const np = createNPath(cat, 1, 'f', 'g', 'f ≃ g');
    expect(np.level).toBe(1);
    expect(np.leftId).toBe('f');
    expect(np.rightId).toBe('g');
    expect(np.witness).toBe('f ≃ g');
  });

  it('should create a level-2 n-path between 1-paths', () => {
    const cat = makeTestCategory();
    // Add 1-paths as classic HoTTPath
    addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'p1' });
    addPath(cat, { id: 'p2', leftId: 'f', rightId: 'g', witness: 'p2' });

    const np2 = createNPath(cat, 2, 'p1', 'p2', 'p1 ≃ p2');
    expect(np2.level).toBe(2);
    expect(np2.leftId).toBe('p1');
    expect(np2.rightId).toBe('p2');
  });

  it('should create a level-3 n-path between 2-paths', () => {
    const cat = makeTestCategory();
    addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'p1' });
    addPath(cat, { id: 'p2', leftId: 'f', rightId: 'g', witness: 'p2' });
    addPath(cat, { id: 'p3', leftId: 'f', rightId: 'g', witness: 'p3' });

    // Add 2-paths via nPaths
    const np2a = createNPath(cat, 2, 'p1', 'p2', 'α');
    addNPath(cat, np2a);
    const np2b = createNPath(cat, 2, 'p1', 'p3', 'β');
    addNPath(cat, np2b);

    // Create 3-path between 2-paths
    const np3 = createNPath(cat, 3, np2a.id, np2b.id, 'α ≃ β');
    expect(np3.level).toBe(3);
    expect(np3.leftId).toBe(np2a.id);
    expect(np3.rightId).toBe(np2b.id);
  });

  it('should create a level-4 n-path', () => {
    const cat = makeTestCategory();
    addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'p1' });
    addPath(cat, { id: 'p2', leftId: 'f', rightId: 'g', witness: 'p2' });
    addPath(cat, { id: 'p3', leftId: 'f', rightId: 'g', witness: 'p3' });

    const np2a = createNPath(cat, 2, 'p1', 'p2', 'α');
    addNPath(cat, np2a);
    const np2b = createNPath(cat, 2, 'p1', 'p3', 'β');
    addNPath(cat, np2b);

    const np3a = createNPath(cat, 3, np2a.id, np2b.id, 'γ');
    addNPath(cat, np3a);
    // Create a second 3-path with distinct endpoints for unique ID
    const np2c = createNPath(cat, 2, 'p2', 'p3', 'ζ');
    addNPath(cat, np2c);
    const np3b = createNPath(cat, 3, np2b.id, np2c.id, 'δ');
    addNPath(cat, np3b);

    const np4 = createNPath(cat, 4, np3a.id, np3b.id, 'γ ≃ δ');
    expect(np4.level).toBe(4);
  });

  it('should throw for invalid level', () => {
    const cat = makeTestCategory();
    expect(() => createNPath(cat, 0, 'f', 'g', 'bad')).toThrow('positive integer');
    expect(() => createNPath(cat, -1, 'f', 'g', 'bad')).toThrow('positive integer');
    expect(() => createNPath(cat, 1.5, 'f', 'g', 'bad')).toThrow('positive integer');
  });

  it('should throw for missing morphism at level 1', () => {
    const cat = makeTestCategory();
    expect(() => createNPath(cat, 1, 'missing', 'g', 'bad')).toThrow('not found');
  });

  it('should throw for non-parallel morphisms at level 1', () => {
    const cat = makeTestCategory();
    addObject(cat, { id: 'C', kind: 'type', label: 'C' });
    addMorphism(cat, { id: 'k', sourceId: 'A', targetId: 'C', label: 'k', properties: [] });
    expect(() => createNPath(cat, 1, 'f', 'k', 'bad')).toThrow('different endpoints');
  });

  it('should throw for missing lower path at level 2+', () => {
    const cat = makeTestCategory();
    expect(() => createNPath(cat, 2, 'missing', 'also-missing', 'bad')).toThrow('not found');
  });
});

describe('addNPath', () => {
  it('should add n-paths and create level maps', () => {
    const cat = makeTestCategory();
    const np = createNPath(cat, 1, 'f', 'g', 'equiv');
    addNPath(cat, np);

    expect(cat.nPaths).toBeDefined();
    expect(cat.nPaths!.get(1)!.has(np.id)).toBe(true);
  });

  it('should throw for duplicate n-path ID', () => {
    const cat = makeTestCategory();
    const np = createNPath(cat, 1, 'f', 'g', 'equiv');
    addNPath(cat, np);
    expect(() => addNPath(cat, np)).toThrow('already exists');
  });
});

describe('composeNPaths', () => {
  it('should compose two n-paths at the same level', () => {
    const p: NPath = { id: 'p', level: 1, leftId: 'f', rightId: 'g', witness: 'w1' };
    const q: NPath = { id: 'q', level: 1, leftId: 'g', rightId: 'h', witness: 'w2' };
    const result = composeNPaths(p, q);
    expect(result.level).toBe(1);
    expect(result.leftId).toBe('f');
    expect(result.rightId).toBe('h');
  });

  it('should throw for different levels', () => {
    const p: NPath = { id: 'p', level: 1, leftId: 'f', rightId: 'g', witness: 'w1' };
    const q: NPath = { id: 'q', level: 2, leftId: 'g', rightId: 'h', witness: 'w2' };
    expect(() => composeNPaths(p, q)).toThrow('different levels');
  });

  it('should throw for mismatched endpoints', () => {
    const p: NPath = { id: 'p', level: 1, leftId: 'f', rightId: 'g', witness: 'w1' };
    const q: NPath = { id: 'q', level: 1, leftId: 'h', rightId: 'k', witness: 'w2' };
    expect(() => composeNPaths(p, q)).toThrow('right endpoint');
  });
});

describe('horizontalCompose', () => {
  it('should whisker a 2-path with a 1-path', () => {
    const alpha: NPath = { id: 'α', level: 2, leftId: 'p1', rightId: 'p2', witness: 'w_α' };
    const lower: NPath = { id: 'f', level: 1, leftId: 'a', rightId: 'b', witness: 'w_f' };
    const result = horizontalCompose(alpha, lower);
    expect(result.level).toBe(2);
    expect(result.id).toContain('whisker');
  });

  it('should throw for incorrect level difference', () => {
    const alpha: NPath = { id: 'α', level: 3, leftId: 'p1', rightId: 'p2', witness: 'w' };
    const lower: NPath = { id: 'f', level: 1, leftId: 'a', rightId: 'b', witness: 'w' };
    expect(() => horizontalCompose(alpha, lower)).toThrow('level difference of 1');
  });
});

describe('truncationLevel', () => {
  it('should return 0 for a category with no paths', () => {
    const cat = createCategory('empty', 'Empty');
    addObject(cat, { id: 'A', kind: 'type', label: 'A' });
    expect(truncationLevel(cat)).toBe(0);
  });

  it('should return 1 for a category with only 1-paths', () => {
    const cat = makeTestCategory();
    addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'p1' });
    expect(truncationLevel(cat)).toBe(1);
  });

  it('should return 2 for a category with legacy higherPaths', () => {
    const cat = makeTestCategory();
    addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'p1' });
    addPath(cat, { id: 'p2', leftId: 'f', rightId: 'h', witness: 'p2' });
    cat.higherPaths = new Map();
    cat.higherPaths.set('hp1', {
      id: 'hp1', leftPathId: 'p1', rightPathId: 'p2', level: 2, witness: 'hp',
    });
    expect(truncationLevel(cat)).toBe(2);
  });

  it('should return 3 for a category with 3-paths via nPaths', () => {
    const cat = makeTestCategory();
    addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'p1' });
    addPath(cat, { id: 'p2', leftId: 'f', rightId: 'g', witness: 'p2' });

    const np2a = createNPath(cat, 2, 'p1', 'p2', 'α');
    addNPath(cat, np2a);
    // Create with different ID to avoid duplicate
    const np2bManual: NPath = { id: 'np2_p1_p2_v2', level: 2, leftId: 'p1', rightId: 'p2', witness: 'β' };
    addNPath(cat, np2bManual);

    const np3 = createNPath(cat, 3, np2a.id, np2bManual.id, 'γ');
    addNPath(cat, np3);

    expect(truncationLevel(cat)).toBe(3);
  });
});

describe('isTruncated', () => {
  it('should return true for 0-truncated set', () => {
    const cat = createCategory('set', 'Set');
    addObject(cat, { id: 'A', kind: 'type', label: 'A' });
    expect(isTruncated(cat, 0)).toBe(true);
    expect(isTruncated(cat, 1)).toBe(true);
  });

  it('should return false when paths exceed level', () => {
    const cat = makeTestCategory();
    addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'p1' });
    expect(isTruncated(cat, 0)).toBe(false);
    expect(isTruncated(cat, 1)).toBe(true);
  });
});

describe('buildNGroupoidStructure', () => {
  it('should build inverses for 1-paths', () => {
    const cat = makeTestCategory();
    addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'p1' });

    const structure = buildNGroupoidStructure(cat, 1);
    expect(structure.inversesByLevel.get(1)?.has('p1')).toBe(true);
    const inv = structure.inversesByLevel.get(1)!.get('p1')!;
    expect(inv.leftId).toBe('g');
    expect(inv.rightId).toBe('f');
  });

  it('should build inverses for 2-paths', () => {
    const cat = makeTestCategory();
    addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'p1' });
    addPath(cat, { id: 'p2', leftId: 'f', rightId: 'g', witness: 'p2' });

    const np2 = createNPath(cat, 2, 'p1', 'p2', 'α');
    addNPath(cat, np2);

    const structure = buildNGroupoidStructure(cat, 2);
    expect(structure.inversesByLevel.get(2)?.has(np2.id)).toBe(true);
    const inv = structure.inversesByLevel.get(2)!.get(np2.id)!;
    expect(inv.leftId).toBe('p2');
    expect(inv.rightId).toBe('p1');
  });

  it('should handle legacy higherPaths at level 2', () => {
    const cat = makeTestCategory();
    addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'p1' });
    addPath(cat, { id: 'p2', leftId: 'f', rightId: 'h', witness: 'p2' });
    cat.higherPaths = new Map();
    cat.higherPaths.set('hp1', {
      id: 'hp1', leftPathId: 'p1', rightPathId: 'p2', level: 2, witness: 'hp',
    });

    const structure = buildNGroupoidStructure(cat, 2);
    const inv = structure.inversesByLevel.get(2)?.get('hp1');
    expect(inv).toBeDefined();
    expect(inv!.leftId).toBe('p2');
    expect(inv!.rightId).toBe('p1');
  });
});

describe('validateNGroupoid', () => {
  it('should validate a well-formed 1-groupoid', () => {
    const cat = makeTestCategory();
    addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'p1' });

    const structure = buildNGroupoidStructure(cat, 1);
    const result = validateNGroupoid(cat, structure, 1);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should validate a well-formed 2-groupoid', () => {
    const cat = makeTestCategory();
    addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'p1' });
    addPath(cat, { id: 'p2', leftId: 'f', rightId: 'g', witness: 'p2' });

    const np2 = createNPath(cat, 2, 'p1', 'p2', 'α');
    addNPath(cat, np2);

    const structure = buildNGroupoidStructure(cat, 2);
    const result = validateNGroupoid(cat, structure, 2);
    expect(result.valid).toBe(true);
  });

  it('should detect missing inverse', () => {
    const cat = makeTestCategory();
    addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'p1' });

    // Empty structure — no inverses
    const structure: import('../types/hott.js').NGroupoidStructure = {
      categoryId: cat.id,
      maxLevel: 1,
      inversesByLevel: new Map(),
    };

    const result = validateNGroupoid(cat, structure, 1);
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0].law).toBe('inverse_left');
  });

  it('should detect malformed inverse (not swapped)', () => {
    const cat = makeTestCategory();
    addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'p1' });

    const badInverse: NPath = {
      id: 'bad_inv', level: 1, leftId: 'f', rightId: 'g', witness: 'bad',
    };
    const structure: import('../types/hott.js').NGroupoidStructure = {
      categoryId: cat.id,
      maxLevel: 1,
      inversesByLevel: new Map([[1, new Map([['p1', badInverse]])]]),
    };

    const result = validateNGroupoid(cat, structure, 1);
    expect(result.valid).toBe(false);
    expect(result.violations[0].message).toContain('swap endpoints');
  });
});

describe('validateCategory with nPaths', () => {
  it('should validate a category with valid n-paths', () => {
    const cat = makeTestCategory();
    const np = createNPath(cat, 1, 'f', 'g', 'equiv');
    addNPath(cat, np);

    const result = validateCategory(cat);
    expect(result.valid).toBe(true);
  });

  it('should detect invalid n-path references', () => {
    const cat = makeTestCategory();
    // Manually add a bad n-path referencing non-existent morphism
    cat.nPaths = new Map([[1, new Map([['bad', {
      id: 'bad', level: 1, leftId: 'missing', rightId: 'g', witness: 'bad',
    }]])]]);

    const result = validateCategory(cat);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.message.includes('missing'))).toBe(true);
  });
});
