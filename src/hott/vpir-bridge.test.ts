/**
 * Tests for VPIR-to-HoTT Bridge.
 */

import { vpirGraphToCategory, validateCategoricalStructure, findEquivalentPaths } from './vpir-bridge.js';
import type { VPIRGraph, VPIRNode, SecurityLabel } from '../types/index.js';

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
  return { id, name: `Graph ${id}`, nodes: nodeMap, roots, terminals, createdAt: new Date().toISOString() };
}

describe('VPIR-to-HoTT Bridge', () => {
  describe('vpirGraphToCategory', () => {
    it('should convert a single-node graph', () => {
      const graph = makeGraph('g1', [makeNode('n1', 'observation')]);
      const category = vpirGraphToCategory(graph);

      expect(category.objects.size).toBe(1);
      expect(category.morphisms.size).toBe(0);
      expect(category.objects.get('n1')?.kind).toBe('term');
      expect(category.objects.get('n1')?.label).toBe('op_n1');
    });

    it('should convert a linear chain graph', () => {
      const graph = makeGraph('g1', [
        makeNode('n1', 'observation'),
        makeNode('n2', 'inference', [{ nodeId: 'n1', port: 'out', dataType: 'string' }]),
        makeNode('n3', 'action', [{ nodeId: 'n2', port: 'out', dataType: 'string' }]),
      ]);
      const category = vpirGraphToCategory(graph);

      expect(category.objects.size).toBe(3);
      expect(category.morphisms.size).toBe(2);
    });

    it('should map VPIR node types to correct HoTT object kinds', () => {
      const graph = makeGraph('g1', [
        makeNode('obs', 'observation'),
        makeNode('inf', 'inference', [{ nodeId: 'obs', port: 'out', dataType: 'string' }]),
        makeNode('act', 'action', [{ nodeId: 'inf', port: 'out', dataType: 'string' }]),
        makeNode('ast', 'assertion', [{ nodeId: 'act', port: 'out', dataType: 'string' }]),
        makeNode('comp', 'composition', [{ nodeId: 'ast', port: 'out', dataType: 'string' }]),
      ]);
      const category = vpirGraphToCategory(graph);

      expect(category.objects.get('obs')?.kind).toBe('term');
      expect(category.objects.get('inf')?.kind).toBe('term');
      expect(category.objects.get('act')?.kind).toBe('term');
      expect(category.objects.get('ast')?.kind).toBe('type');
      expect(category.objects.get('comp')?.kind).toBe('context');
    });

    it('should propagate security labels from VPIR nodes', () => {
      const graph = makeGraph('g1', [makeNode('n1', 'observation')]);
      const category = vpirGraphToCategory(graph);

      const obj = category.objects.get('n1');
      expect(obj?.securityLabel?.owner).toBe('agent-1');
      expect(obj?.securityLabel?.trustLevel).toBe(2);
    });

    it('should preserve metadata from VPIR nodes', () => {
      const graph = makeGraph('g1', [makeNode('n1', 'observation')]);
      const category = vpirGraphToCategory(graph);

      const obj = category.objects.get('n1');
      expect(obj?.metadata?.vpirType).toBe('observation');
      expect(obj?.metadata?.verifiable).toBe(true);
    });

    it('should handle diamond-shaped DAGs', () => {
      const graph = makeGraph('g1', [
        makeNode('root', 'observation'),
        makeNode('left', 'inference', [{ nodeId: 'root', port: 'out', dataType: 'string' }]),
        makeNode('right', 'inference', [{ nodeId: 'root', port: 'out', dataType: 'string' }]),
        makeNode('join', 'action', [
          { nodeId: 'left', port: 'out', dataType: 'string' },
          { nodeId: 'right', port: 'out', dataType: 'string' },
        ]),
      ]);
      const category = vpirGraphToCategory(graph);

      expect(category.objects.size).toBe(4);
      expect(category.morphisms.size).toBe(4); // root→left, root→right, left→join, right→join
    });
  });

  describe('validateCategoricalStructure', () => {
    it('should validate a well-formed VPIR graph', () => {
      const graph = makeGraph('g1', [
        makeNode('n1', 'observation'),
        makeNode('n2', 'inference', [{ nodeId: 'n1', port: 'out', dataType: 'string' }]),
      ]);
      const result = validateCategoricalStructure(graph);
      expect(result.valid).toBe(true);
    });

    it('should validate a single-node graph', () => {
      const graph = makeGraph('g1', [makeNode('n1', 'observation')]);
      const result = validateCategoricalStructure(graph);
      expect(result.valid).toBe(true);
    });
  });

  describe('findEquivalentPaths', () => {
    it('should find equivalences between structurally similar graphs', () => {
      const graphA = makeGraph('gA', [
        makeNode('n1', 'observation'),
        makeNode('n2', 'inference', [{ nodeId: 'n1', port: 'out', dataType: 'string' }]),
      ]);
      const graphB = makeGraph('gB', [
        makeNode('m1', 'observation'),
        makeNode('m2', 'inference', [{ nodeId: 'm1', port: 'out', dataType: 'string' }]),
      ]);

      const { equivalences, category } = findEquivalentPaths(graphA, graphB);
      expect(equivalences).toBeGreaterThan(0);
      expect(category.paths.size).toBeGreaterThan(0);
    });

    it('should find zero equivalences for structurally different graphs', () => {
      const graphA = makeGraph('gA', [
        makeNode('n1', 'observation'),
        makeNode('n2', 'inference', [{ nodeId: 'n1', port: 'out', dataType: 'string' }]),
      ]);
      const graphB = makeGraph('gB', [
        makeNode('m1', 'assertion'),
        makeNode('m2', 'action', [{ nodeId: 'm1', port: 'data', dataType: 'number' }]),
      ]);

      const { equivalences } = findEquivalentPaths(graphA, graphB);
      expect(equivalences).toBe(0);
    });

    it('should merge both graphs into a single category', () => {
      const graphA = makeGraph('gA', [makeNode('n1', 'observation')]);
      const graphB = makeGraph('gB', [makeNode('m1', 'observation')]);

      const { category } = findEquivalentPaths(graphA, graphB);
      expect(category.objects.has('a_n1')).toBe(true);
      expect(category.objects.has('b_m1')).toBe(true);
    });
  });
});
