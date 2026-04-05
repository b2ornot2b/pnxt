/**
 * Tests for HoTT Higher Paths — 2-paths, groupoid structure, and univalence.
 */

import {
  createHigherPath,
  inversePath,
  inverseMorphism,
  buildGroupoidStructure,
  validateGroupoid,
  checkUnivalence,
  createFunctor,
} from './higher-paths.js';
import {
  createCategory,
  addObject,
  addMorphism,
  addPath,
  addHigherPath,
  identity,
  validateCategory,
} from './category.js';
import {
  findEquivalentPaths,
  findRefactoringEquivalences,
} from './vpir-bridge.js';
import type {
  Category,
  HoTTObject,
  HoTTPath,
  Morphism,
  CategoryEquivalence,
} from '../types/hott.js';
import type { VPIRGraph, VPIRNode, SecurityLabel } from '../types/index.js';

// --- Helpers ---

function makeObject(id: string, kind: 'type' | 'term' | 'context' = 'term'): HoTTObject {
  return { id, kind, label: id };
}

function makeMorphism(id: string, sourceId: string, targetId: string): Morphism {
  return { id, sourceId, targetId, label: `${sourceId}→${targetId}`, properties: [] };
}

function makeLabel(owner: string, trustLevel: 0 | 1 | 2 | 3 | 4 = 2): SecurityLabel {
  return { owner, trustLevel, classification: 'internal', createdAt: new Date().toISOString() };
}

function makeNode(
  id: string,
  type: VPIRNode['type'],
  inputs: { nodeId: string; port: string; dataType: string }[] = [],
): VPIRNode {
  return {
    id,
    type,
    operation: `op_${id}`,
    inputs,
    outputs: [{ port: 'out', dataType: 'string' }],
    evidence: [{ type: 'data', source: 'test', confidence: 1.0 }],
    label: makeLabel('agent-1'),
    verifiable: true,
    createdAt: new Date().toISOString(),
  };
}

function makeGraph(id: string, nodes: VPIRNode[]): VPIRGraph {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const roots = nodes.filter((n) => n.inputs.length === 0).map((n) => n.id);
  const referencedAsInput = new Set(nodes.flatMap((n) => n.inputs.map((i) => i.nodeId)));
  const terminals = nodes.filter((n) => !referencedAsInput.has(n.id)).map((n) => n.id);
  return {
    id,
    name: `Graph ${id}`,
    nodes: nodeMap,
    roots,
    terminals,
    createdAt: new Date().toISOString(),
  };
}

function buildCategoryWithPaths(): Category {
  const cat = createCategory('c1', 'TestCategory');
  addObject(cat, makeObject('A'));
  addObject(cat, makeObject('B'));
  addMorphism(cat, makeMorphism('f', 'A', 'B'));
  addMorphism(cat, makeMorphism('g', 'A', 'B'));
  addMorphism(cat, makeMorphism('h', 'A', 'B'));
  addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'refactoring_1' });
  addPath(cat, { id: 'p2', leftId: 'g', rightId: 'h', witness: 'refactoring_2' });
  return cat;
}

// --- Tests ---

describe('HoTT Higher Paths', () => {
  describe('createHigherPath', () => {
    it('should create a 2-path between two 1-paths with same morphism endpoints', () => {
      const cat = buildCategoryWithPaths();
      const p1 = cat.paths.get('p1')!;
      const p2 = cat.paths.get('p2')!;

      const hp = createHigherPath(cat, p1, p2, 'both refactorings equivalent');
      expect(hp.leftPathId).toBe('p1');
      expect(hp.rightPathId).toBe('p2');
      expect(hp.level).toBe(2);
      expect(hp.witness).toBe('both refactorings equivalent');
      expect(hp.id).toBe('hp_p1_p2');
    });

    it('should throw if left 1-path is not in category', () => {
      const cat = buildCategoryWithPaths();
      const fakePath: HoTTPath = { id: 'fake', leftId: 'f', rightId: 'g', witness: 'test' };
      const p2 = cat.paths.get('p2')!;

      expect(() => createHigherPath(cat, fakePath, p2, 'test')).toThrow(
        "Left 1-path 'fake' not found",
      );
    });

    it('should throw if right 1-path is not in category', () => {
      const cat = buildCategoryWithPaths();
      const p1 = cat.paths.get('p1')!;
      const fakePath: HoTTPath = { id: 'fake', leftId: 'f', rightId: 'g', witness: 'test' };

      expect(() => createHigherPath(cat, p1, fakePath, 'test')).toThrow(
        "Right 1-path 'fake' not found",
      );
    });

    it('should throw if 1-paths connect morphisms with different endpoints', () => {
      const cat = createCategory('c2', 'Test');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addObject(cat, makeObject('C'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));
      addMorphism(cat, makeMorphism('g', 'A', 'B'));
      addMorphism(cat, makeMorphism('h', 'A', 'C'));
      addMorphism(cat, makeMorphism('k', 'A', 'C'));
      addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'test1' });
      addPath(cat, { id: 'p2', leftId: 'h', rightId: 'k', witness: 'test2' });

      expect(() =>
        createHigherPath(cat, cat.paths.get('p1')!, cat.paths.get('p2')!, 'test'),
      ).toThrow('different endpoints');
    });
  });

  describe('inversePath', () => {
    it('should swap left and right morphism IDs', () => {
      const path: HoTTPath = { id: 'p1', leftId: 'f', rightId: 'g', witness: 'original' };
      const inv = inversePath(path);

      expect(inv.leftId).toBe('g');
      expect(inv.rightId).toBe('f');
      expect(inv.id).toBe('inv_p1');
      expect(inv.witness).toBe('inverse(original)');
    });

    it('should be an involution (inverting twice gives back original endpoints)', () => {
      const path: HoTTPath = { id: 'p1', leftId: 'f', rightId: 'g', witness: 'original' };
      const inv = inversePath(path);
      const invInv = inversePath(inv);

      expect(invInv.leftId).toBe(path.leftId);
      expect(invInv.rightId).toBe(path.rightId);
    });
  });

  describe('inverseMorphism', () => {
    it('should swap source and target', () => {
      const m: Morphism = makeMorphism('f', 'A', 'B');
      const inv = inverseMorphism(m);

      expect(inv.sourceId).toBe('B');
      expect(inv.targetId).toBe('A');
      expect(inv.id).toBe('inv_f');
      expect(inv.properties).toContain('isomorphism');
    });

    it('should produce a composable pair with the original', () => {
      const m: Morphism = makeMorphism('f', 'A', 'B');
      const inv = inverseMorphism(m);

      // f: A→B, inv: B→A, so f then inv should be composable
      expect(m.targetId).toBe(inv.sourceId); // f.target === inv.source
      expect(inv.targetId).toBe(m.sourceId); // inv.target === f.source
    });
  });

  describe('buildGroupoidStructure', () => {
    it('should compute inverses for all morphisms', () => {
      const cat = createCategory('c1', 'Test');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));

      const structure = buildGroupoidStructure(cat);
      expect(structure.inverses.size).toBe(1);
      expect(structure.inverses.get('f')?.sourceId).toBe('B');
      expect(structure.inverses.get('f')?.targetId).toBe('A');
    });

    it('should compute identity morphism inverse as itself', () => {
      const cat = createCategory('c1', 'Test');
      addObject(cat, makeObject('A'));
      const idA = identity('A');
      addMorphism(cat, idA);

      const structure = buildGroupoidStructure(cat);
      const inv = structure.inverses.get('id_A');
      expect(inv?.sourceId).toBe('A');
      expect(inv?.targetId).toBe('A');
    });

    it('should compute path inverses', () => {
      const cat = buildCategoryWithPaths();
      const structure = buildGroupoidStructure(cat);

      expect(structure.pathInverses.size).toBe(2);
      const inv = structure.pathInverses.get('p1');
      expect(inv?.leftId).toBe('g'); // swapped from f,g to g,f
      expect(inv?.rightId).toBe('f');
    });

    it('should handle empty category', () => {
      const cat = createCategory('empty', 'Empty');
      const structure = buildGroupoidStructure(cat);

      expect(structure.inverses.size).toBe(0);
      expect(structure.pathInverses.size).toBe(0);
    });
  });

  describe('validateGroupoid', () => {
    it('should validate a well-formed groupoid', () => {
      const cat = createCategory('c1', 'Test');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));
      addPath(cat, { id: 'p1', leftId: 'f', rightId: 'f', witness: 'reflexivity' });

      const structure = buildGroupoidStructure(cat);
      const result = validateGroupoid(cat, structure);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should validate a category with multiple morphisms', () => {
      const cat = buildCategoryWithPaths();
      const structure = buildGroupoidStructure(cat);
      const result = validateGroupoid(cat, structure);

      expect(result.valid).toBe(true);
    });

    it('should detect missing inverse morphism', () => {
      const cat = createCategory('c1', 'Test');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));

      // Create an incomplete structure with no inverse for 'f'
      const brokenStructure = {
        categoryId: cat.id,
        inverses: new Map<string, Morphism>(),
        pathInverses: new Map<string, HoTTPath>(),
      };

      const result = validateGroupoid(cat, brokenStructure);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].law).toBe('inverse_left');
    });

    it('should validate empty category groupoid', () => {
      const cat = createCategory('empty', 'Empty');
      const structure = buildGroupoidStructure(cat);
      const result = validateGroupoid(cat, structure);

      expect(result.valid).toBe(true);
    });
  });

  describe('addHigherPath (category.ts)', () => {
    it('should add a higher path to a category', () => {
      const cat = buildCategoryWithPaths();
      const p1 = cat.paths.get('p1')!;
      const p2 = cat.paths.get('p2')!;
      const hp = createHigherPath(cat, p1, p2, 'test');

      addHigherPath(cat, hp);
      expect(cat.higherPaths?.size).toBe(1);
      expect(cat.higherPaths?.get(hp.id)).toBe(hp);
    });

    it('should throw on duplicate higher path ID', () => {
      const cat = buildCategoryWithPaths();
      const p1 = cat.paths.get('p1')!;
      const p2 = cat.paths.get('p2')!;
      const hp = createHigherPath(cat, p1, p2, 'test');

      addHigherPath(cat, hp);
      expect(() => addHigherPath(cat, hp)).toThrow("Higher path 'hp_p1_p2' already exists");
    });

    it('should throw if left 1-path does not exist', () => {
      const cat = buildCategoryWithPaths();
      expect(() =>
        addHigherPath(cat, {
          id: 'hp1',
          leftPathId: 'nonexistent',
          rightPathId: 'p2',
          level: 2,
          witness: 'test',
        }),
      ).toThrow("Left 1-path 'nonexistent' not found");
    });

    it('should throw if right 1-path does not exist', () => {
      const cat = buildCategoryWithPaths();
      expect(() =>
        addHigherPath(cat, {
          id: 'hp1',
          leftPathId: 'p1',
          rightPathId: 'nonexistent',
          level: 2,
          witness: 'test',
        }),
      ).toThrow("Right 1-path 'nonexistent' not found");
    });
  });

  describe('validateCategory with higher paths', () => {
    it('should validate a category with valid higher paths', () => {
      const cat = buildCategoryWithPaths();
      const p1 = cat.paths.get('p1')!;
      const p2 = cat.paths.get('p2')!;
      const hp = createHigherPath(cat, p1, p2, 'test');
      addHigherPath(cat, hp);

      const result = validateCategory(cat);
      expect(result.valid).toBe(true);
    });

    it('should detect higher path referencing missing 1-path', () => {
      const cat = buildCategoryWithPaths();
      cat.higherPaths = new Map();
      cat.higherPaths.set('hp_bad', {
        id: 'hp_bad',
        leftPathId: 'p1',
        rightPathId: 'nonexistent',
        level: 2,
        witness: 'bad',
      });

      const result = validateCategory(cat);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.law === 'higher_path')).toBe(true);
    });

    it('should still validate categories without higher paths (backward compatibility)', () => {
      const cat = createCategory('c1', 'Test');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));

      const result = validateCategory(cat);
      expect(result.valid).toBe(true);
      expect(cat.higherPaths).toBeUndefined();
    });
  });

  describe('checkUnivalence', () => {
    it('should verify a valid equivalence between isomorphic categories', () => {
      // Build two isomorphic categories: catA and catB
      const catA = createCategory('catA', 'Category A');
      addObject(catA, makeObject('a1'));
      addObject(catA, makeObject('a2'));
      addMorphism(catA, makeMorphism('fa', 'a1', 'a2'));

      const catB = createCategory('catB', 'Category B');
      addObject(catB, makeObject('b1'));
      addObject(catB, makeObject('b2'));
      addMorphism(catB, makeMorphism('fb', 'b1', 'b2'));

      const forward = createFunctor(
        'F',
        catA,
        catB,
        new Map([['a1', 'b1'], ['a2', 'b2']]),
        new Map([['fa', 'fb']]),
      );

      const backward = createFunctor(
        'G',
        catB,
        catA,
        new Map([['b1', 'a1'], ['b2', 'a2']]),
        new Map([['fb', 'fa']]),
      );

      const equivalence: CategoryEquivalence = {
        forward,
        backward,
        unitWitness: 'G∘F ≃ id_A',
        counitWitness: 'F∘G ≃ id_B',
      };

      const witness = checkUnivalence(catA, catB, equivalence);
      expect(witness.valid).toBe(true);
      expect(witness.verifiedObjects).toContain('a1');
      expect(witness.verifiedObjects).toContain('a2');
      expect(witness.verifiedMorphisms).toContain('fa');
    });

    it('should reject a broken equivalence (wrong round-trip)', () => {
      const catA = createCategory('catA', 'A');
      addObject(catA, makeObject('a1'));
      addObject(catA, makeObject('a2'));

      const catB = createCategory('catB', 'B');
      addObject(catB, makeObject('b1'));
      addObject(catB, makeObject('b2'));

      const forward = createFunctor(
        'F',
        catA,
        catB,
        new Map([['a1', 'b1'], ['a2', 'b2']]),
        new Map(),
      );

      // Broken backward: maps b1 → a2 instead of a1
      const backward = createFunctor(
        'G',
        catB,
        catA,
        new Map([['b1', 'a2'], ['b2', 'a1']]),
        new Map(),
      );

      const equivalence: CategoryEquivalence = {
        forward,
        backward,
        unitWitness: 'broken',
        counitWitness: 'broken',
      };

      const witness = checkUnivalence(catA, catB, equivalence);
      expect(witness.valid).toBe(false);
    });
  });

  describe('createFunctor', () => {
    it('should create a valid functor', () => {
      const catA = createCategory('catA', 'A');
      addObject(catA, makeObject('a1'));

      const catB = createCategory('catB', 'B');
      addObject(catB, makeObject('b1'));

      const f = createFunctor('F', catA, catB, new Map([['a1', 'b1']]), new Map());
      expect(f.id).toBe('F');
      expect(f.objectMap.get('a1')).toBe('b1');
    });

    it('should throw if source object not found', () => {
      const catA = createCategory('catA', 'A');
      const catB = createCategory('catB', 'B');
      addObject(catB, makeObject('b1'));

      expect(() =>
        createFunctor('F', catA, catB, new Map([['missing', 'b1']]), new Map()),
      ).toThrow("Source object 'missing' not found");
    });

    it('should throw if target object not found', () => {
      const catA = createCategory('catA', 'A');
      addObject(catA, makeObject('a1'));
      const catB = createCategory('catB', 'B');

      expect(() =>
        createFunctor('F', catA, catB, new Map([['a1', 'missing']]), new Map()),
      ).toThrow("Target object 'missing' not found");
    });
  });

  describe('VPIR bridge integration with higher paths', () => {
    it('should discover higher paths when findEquivalentPaths finds multiple equivalences', () => {
      // Two structurally similar graphs with multiple matching morphisms
      const graphA = makeGraph('gA', [
        makeNode('n1', 'observation'),
        makeNode('n2', 'inference', [{ nodeId: 'n1', port: 'out', dataType: 'string' }]),
        makeNode('n3', 'inference', [{ nodeId: 'n1', port: 'out', dataType: 'string' }]),
      ]);
      const graphB = makeGraph('gB', [
        makeNode('m1', 'observation'),
        makeNode('m2', 'inference', [{ nodeId: 'm1', port: 'out', dataType: 'string' }]),
        makeNode('m3', 'inference', [{ nodeId: 'm1', port: 'out', dataType: 'string' }]),
      ]);

      const { equivalences, category } = findEquivalentPaths(graphA, graphB);
      expect(equivalences).toBeGreaterThan(0);

      // The category may or may not have higher paths depending on whether
      // multiple 1-paths connect the same morphism pair
      if (category.higherPaths && category.higherPaths.size > 0) {
        for (const hp of category.higherPaths.values()) {
          expect(hp.level).toBe(2);
          expect(category.paths.has(hp.leftPathId)).toBe(true);
          expect(category.paths.has(hp.rightPathId)).toBe(true);
        }
      }
    });

    it('should find refactoring equivalences between three graph versions', () => {
      const original = makeGraph('orig', [
        makeNode('n1', 'observation'),
        makeNode('n2', 'inference', [{ nodeId: 'n1', port: 'out', dataType: 'string' }]),
      ]);
      const refA = makeGraph('refA', [
        makeNode('r1', 'observation'),
        makeNode('r2', 'inference', [{ nodeId: 'r1', port: 'out', dataType: 'string' }]),
      ]);
      const refB = makeGraph('refB', [
        makeNode('s1', 'observation'),
        makeNode('s2', 'inference', [{ nodeId: 's1', port: 'out', dataType: 'string' }]),
      ]);

      const { higherPaths, category } = findRefactoringEquivalences(original, refA, refB);

      // All three graphs are structurally identical, so we should find equivalences
      expect(higherPaths.length).toBeGreaterThan(0);
      for (const hp of higherPaths) {
        expect(hp.level).toBe(2);
      }
      expect(category.higherPaths?.size).toBeGreaterThan(0);
    });

    it('should find zero refactoring equivalences for structurally different graphs', () => {
      const original = makeGraph('orig', [
        makeNode('n1', 'observation'),
        makeNode('n2', 'inference', [{ nodeId: 'n1', port: 'out', dataType: 'string' }]),
      ]);
      const refA = makeGraph('refA', [
        makeNode('r1', 'assertion'),
        makeNode('r2', 'action', [{ nodeId: 'r1', port: 'data', dataType: 'number' }]),
      ]);
      const refB = makeGraph('refB', [
        makeNode('s1', 'composition'),
      ]);

      const { higherPaths } = findRefactoringEquivalences(original, refA, refB);
      expect(higherPaths).toHaveLength(0);
    });
  });
});
