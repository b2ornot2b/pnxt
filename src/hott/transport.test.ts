/**
 * Tests for Transport Along Paths.
 *
 * Sprint 6 — Advisory Panel: Vladimir Voevodsky (HoTT).
 */

import {
  transport,
  createVerificationTypeFamily,
  transportVerificationResult,
  transportAllVerificationResults,
  canTransport,
} from './transport.js';
import {
  createTypeEquivalence,
  equivalenceToPath,
  resetUnivalenceIdCounter,
} from './univalence.js';
import {
  createCategory,
  addObject,
  addMorphism,
} from './category.js';
import type {
  PathTerm,
  TypeFamily,
  TypeFamilyValue,
  HoTTObject,
  Morphism,
} from '../types/hott.js';
import type { VerificationResult } from '../types/verification.js';
import type { VPIRGraph, VPIRNode } from '../types/vpir.js';

// --- Helpers ---

function makeObject(id: string, kind: 'type' | 'term' | 'context' = 'term'): HoTTObject {
  return { id, kind, label: id };
}

function makeMorphism(id: string, sourceId: string, targetId: string): Morphism {
  return { id, sourceId, targetId, label: `${sourceId}→${targetId}`, properties: [] };
}

function makeLabel(owner: string = 'test') {
  return { owner, trustLevel: 2 as const, classification: 'internal' as const, createdAt: new Date().toISOString() };
}

function makeGraph(id: string, name: string): VPIRGraph {
  const node: VPIRNode = {
    id: `node_${id}`,
    type: 'observation',
    operation: `op_${id}`,
    inputs: [],
    outputs: [{ port: 'out', dataType: 'string' }],
    evidence: [{ type: 'data', source: 'test', confidence: 1.0 }],
    label: makeLabel(),
    verifiable: true,
    createdAt: new Date().toISOString(),
  };
  return {
    id,
    name,
    nodes: new Map([[node.id, node]]),
    roots: [node.id],
    terminals: [node.id],
    createdAt: new Date().toISOString(),
  };
}

function makeVerificationResult(property: string, verified: boolean = true): VerificationResult {
  return {
    verified,
    solver: 'z3',
    duration: 42,
    property: property as VerificationResult['property'],
  };
}

beforeEach(() => {
  resetUnivalenceIdCounter();
});

// --- transport ---

describe('transport', () => {
  it('should transport a value along a path', () => {
    const path: PathTerm = {
      id: 'p1',
      sourceId: 'A',
      targetId: 'B',
      witness: 'A = B',
    };

    const typeFamily: TypeFamily = {
      id: 'tf1',
      label: 'Test Family',
      fibers: new Map(),
    };

    const value: TypeFamilyValue = {
      typeId: 'A',
      value: { verified: true },
      label: 'property(A)',
    };

    const result = transport(path, typeFamily, value);

    expect(result.success).toBe(true);
    expect(result.sourceValue).toBe(value);
    expect(result.transportedValue).toBeDefined();
    expect(result.transportedValue!.typeId).toBe('B');
    expect(result.transportedValue!.value).toEqual({ verified: true });
    expect(result.transportedValue!.label).toContain('transport');
  });

  it('should use existing fiber if available', () => {
    const existingFiber: TypeFamilyValue = {
      typeId: 'B',
      value: { cached: true },
      label: 'cached(B)',
    };

    const path: PathTerm = { id: 'p1', sourceId: 'A', targetId: 'B', witness: 'test' };
    const typeFamily: TypeFamily = {
      id: 'tf1',
      label: 'Test',
      fibers: new Map([['B', existingFiber]]),
    };
    const value: TypeFamilyValue = { typeId: 'A', value: 'orig', label: 'orig' };

    const result = transport(path, typeFamily, value);
    expect(result.success).toBe(true);
    expect(result.transportedValue).toBe(existingFiber);
  });

  it('should fail if value does not belong to source type', () => {
    const path: PathTerm = { id: 'p1', sourceId: 'A', targetId: 'B', witness: 'test' };
    const typeFamily: TypeFamily = { id: 'tf1', label: 'Test', fibers: new Map() };
    const value: TypeFamilyValue = { typeId: 'C', value: 'wrong', label: 'wrong' };

    const result = transport(path, typeFamily, value);
    expect(result.success).toBe(false);
    expect(result.transportedValue).toBeUndefined();
  });
});

// --- createVerificationTypeFamily ---

describe('createVerificationTypeFamily', () => {
  it('should create a type family from verification results', () => {
    const results = new Map<string, VerificationResult>([
      ['graph1', makeVerificationResult('ifc_flow_lattice')],
      ['graph2', makeVerificationResult('morphism_composition_associativity')],
    ]);

    const tf = createVerificationTypeFamily('test_property', results);

    expect(tf.id).toBe('tf_test_property');
    expect(tf.fibers.size).toBe(2);
    expect(tf.fibers.get('graph1')!.label).toContain('verified');
    expect(tf.fibers.get('graph2')!.typeId).toBe('graph2');
  });

  it('should handle empty results', () => {
    const tf = createVerificationTypeFamily('empty', new Map());
    expect(tf.fibers.size).toBe(0);
  });
});

// --- transportVerificationResult ---

describe('transportVerificationResult', () => {
  it('should transport a verified result between equivalent graphs', () => {
    const g1 = makeGraph('g1', 'Graph 1');
    const g2 = makeGraph('g2', 'Graph 2');

    const cat = createCategory('cat', 'Cat');
    addObject(cat, makeObject('g1'));
    addObject(cat, makeObject('g2'));
    addMorphism(cat, makeMorphism('f', 'g1', 'g2'));
    addMorphism(cat, makeMorphism('g', 'g2', 'g1'));

    const equiv = createTypeEquivalence(
      cat.objects.get('g1')!,
      cat.objects.get('g2')!,
      cat.morphisms.get('f')!,
      cat.morphisms.get('g')!,
      cat,
    );
    const path = equivalenceToPath(equiv);

    const originalResult = makeVerificationResult('ifc_flow_lattice');
    const transported = transportVerificationResult(path, originalResult, g1, g2);

    expect(transported).toBeDefined();
    expect(transported!.verified).toBe(true);
    expect(transported!.property).toBe('ifc_flow_lattice');
    expect(transported!.duration).toBe(0); // No solver time
  });

  it('should not transport unverified results', () => {
    const g1 = makeGraph('g1', 'G1');
    const g2 = makeGraph('g2', 'G2');

    const path: PathTerm = { id: 'p', sourceId: 'g1', targetId: 'g2', witness: 'test' };
    const failedResult = makeVerificationResult('ifc_flow_lattice', false);

    const transported = transportVerificationResult(path, failedResult, g1, g2);
    expect(transported).toBeUndefined();
  });

  it('should return undefined if path source does not match graph', () => {
    const g1 = makeGraph('g1', 'G1');
    const g2 = makeGraph('g2', 'G2');

    const path: PathTerm = { id: 'p', sourceId: 'wrong', targetId: 'g2', witness: 'test' };
    const result = makeVerificationResult('ifc_flow_lattice');

    expect(transportVerificationResult(path, result, g1, g2)).toBeUndefined();
  });
});

// --- transportAllVerificationResults ---

describe('transportAllVerificationResults', () => {
  it('should transport multiple verified results', () => {
    const g1 = makeGraph('g1', 'G1');
    const g2 = makeGraph('g2', 'G2');

    const path: PathTerm = { id: 'p', sourceId: 'g1', targetId: 'g2', witness: 'test' };

    const results = [
      makeVerificationResult('ifc_flow_lattice'),
      makeVerificationResult('morphism_composition_associativity'),
      makeVerificationResult('identity_morphism_laws', false), // Not verified — should be skipped
    ];

    const transported = transportAllVerificationResults(path, results, g1, g2);

    expect(transported.size).toBe(2);
    expect(transported.has('ifc_flow_lattice')).toBe(true);
    expect(transported.has('morphism_composition_associativity')).toBe(true);
    expect(transported.has('identity_morphism_laws')).toBe(false);
  });
});

// --- canTransport ---

describe('canTransport', () => {
  it('should return true for matching graph IDs', () => {
    const cat = createCategory('cat', 'Cat');
    addObject(cat, makeObject('g1'));
    addObject(cat, makeObject('g2'));
    addMorphism(cat, makeMorphism('f', 'g1', 'g2'));
    addMorphism(cat, makeMorphism('g', 'g2', 'g1'));

    const equiv = createTypeEquivalence(
      cat.objects.get('g1')!,
      cat.objects.get('g2')!,
      cat.morphisms.get('f')!,
      cat.morphisms.get('g')!,
      cat,
    );

    expect(canTransport(equiv, 'g1', 'g2')).toBe(true);
  });

  it('should return false for non-matching IDs', () => {
    const cat = createCategory('cat', 'Cat');
    addObject(cat, makeObject('g1'));
    addObject(cat, makeObject('g2'));
    addMorphism(cat, makeMorphism('f', 'g1', 'g2'));
    addMorphism(cat, makeMorphism('g', 'g2', 'g1'));

    const equiv = createTypeEquivalence(
      cat.objects.get('g1')!,
      cat.objects.get('g2')!,
      cat.morphisms.get('f')!,
      cat.morphisms.get('g')!,
      cat,
    );

    expect(canTransport(equiv, 'g1', 'g3')).toBe(false);
  });
});
