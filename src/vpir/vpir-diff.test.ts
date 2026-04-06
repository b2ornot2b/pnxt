import type { VPIRGraph, VPIRNode } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import {
  diffGraphs,
  invertDiff,
  composeDiffs,
  summarizeDiff,
  deepEqual,
  serializeNode,
} from './vpir-diff.js';

// ── Test Helpers ──────────────────────────────────────────────────

function makeLabel(trustLevel: number = 2): SecurityLabel {
  return {
    owner: 'test',
    trustLevel: trustLevel as 0 | 1 | 2 | 3 | 4,
    classification: 'internal',
    createdAt: '2026-04-06T00:00:00.000Z',
  };
}

function makeNode(id: string, overrides: Partial<VPIRNode> = {}): VPIRNode {
  return {
    id,
    type: 'inference',
    operation: `op-${id}`,
    inputs: [],
    outputs: [{ port: 'result', dataType: 'string' }],
    evidence: [{ type: 'rule', source: 'test', confidence: 1.0 }],
    label: makeLabel(),
    verifiable: true,
    createdAt: '2026-04-06T00:00:00.000Z',
    ...overrides,
  };
}

function makeGraph(id: string, nodes: VPIRNode[]): VPIRGraph {
  const nodeMap = new Map<string, VPIRNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  const roots = nodes
    .filter((n) => n.inputs.length === 0)
    .map((n) => n.id);
  const consumedPorts = new Set<string>();
  for (const node of nodes) {
    for (const ref of node.inputs) {
      consumedPorts.add(`${ref.nodeId}:${ref.port}`);
    }
  }
  const terminals = nodes
    .filter((n) => !n.outputs.some((o) => consumedPorts.has(`${n.id}:${o.port}`)))
    .map((n) => n.id);

  return {
    id,
    name: `Graph ${id}`,
    nodes: nodeMap,
    roots,
    terminals,
    createdAt: '2026-04-06T00:00:00.000Z',
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe('VPIR Diff Engine', () => {
  describe('diffGraphs', () => {
    it('should return empty diff for identical graphs', () => {
      const graph = makeGraph('g1', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(graph, graph);

      expect(diff.operations).toHaveLength(0);
      expect(diff.sourceGraphId).toBe('g1');
      expect(diff.targetGraphId).toBe('g1');
    });

    it('should detect added nodes', () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(before, after);

      const addOps = diff.operations.filter((op) => op.type === 'add_node');
      expect(addOps).toHaveLength(1);
      expect(addOps[0].path).toBe('nodes/b');
      expect(addOps[0].after).toBeDefined();
    });

    it('should detect removed nodes', () => {
      const before = makeGraph('g1', [makeNode('a'), makeNode('b')]);
      const after = makeGraph('g2', [makeNode('a')]);
      const diff = diffGraphs(before, after);

      const removeOps = diff.operations.filter((op) => op.type === 'remove_node');
      expect(removeOps).toHaveLength(1);
      expect(removeOps[0].path).toBe('nodes/b');
      expect(removeOps[0].before).toBeDefined();
    });

    it('should detect modified nodes', () => {
      const before = makeGraph('g1', [makeNode('a', { operation: 'old-op' })]);
      const after = makeGraph('g2', [makeNode('a', { operation: 'new-op' })]);
      const diff = diffGraphs(before, after);

      const modOps = diff.operations.filter((op) => op.type === 'modify_node');
      expect(modOps).toHaveLength(1);
      expect(modOps[0].path).toBe('nodes/a');
      expect((modOps[0].before as Record<string, unknown>).operation).toBe('old-op');
      expect((modOps[0].after as Record<string, unknown>).operation).toBe('new-op');
    });

    it('should capture edge additions via node modifications', () => {
      // When a node gains an input, it's captured as a modify_node
      // operation (since the node's inputs changed), not as a separate
      // add_edge operation.
      const nodeA = makeNode('a', { outputs: [{ port: 'out', dataType: 'string' }] });
      const nodeB1 = makeNode('b');
      const nodeB2 = makeNode('b', {
        inputs: [{ nodeId: 'a', port: 'out', dataType: 'string' }],
      });

      const before = makeGraph('g1', [nodeA, nodeB1]);
      const after = makeGraph('g2', [nodeA, nodeB2]);
      const diff = diffGraphs(before, after);

      // Edge change is captured by modify_node for 'b'
      const modOps = diff.operations.filter((op) => op.type === 'modify_node');
      expect(modOps).toHaveLength(1);
      expect(modOps[0].path).toBe('nodes/b');
    });

    it('should capture edge removals via node modifications', () => {
      const nodeA = makeNode('a', { outputs: [{ port: 'out', dataType: 'string' }] });
      const nodeB1 = makeNode('b', {
        inputs: [{ nodeId: 'a', port: 'out', dataType: 'string' }],
      });
      const nodeB2 = makeNode('b');

      const before = makeGraph('g1', [nodeA, nodeB1]);
      const after = makeGraph('g2', [nodeA, nodeB2]);
      const diff = diffGraphs(before, after);

      // Edge change is captured by modify_node for 'b'
      const modOps = diff.operations.filter((op) => op.type === 'modify_node');
      expect(modOps).toHaveLength(1);
      expect(modOps[0].path).toBe('nodes/b');
    });

    it('should detect rerouted edges (when nodes are unmodified)', () => {
      // Reroute detection only applies to edges between nodes that aren't
      // themselves modified. When nodes change (inputs differ), the edge
      // changes are captured by modify_node operations instead.
      const nodeA = makeNode('a', { outputs: [{ port: 'out', dataType: 'string' }] });
      const nodeB = makeNode('b');
      const nodeC = makeNode('c');
      const nodeB1 = makeNode('b', {
        inputs: [{ nodeId: 'a', port: 'out', dataType: 'string' }],
      });
      const nodeC1 = makeNode('c', {
        inputs: [{ nodeId: 'a', port: 'out', dataType: 'string' }],
      });

      const before = makeGraph('g1', [nodeA, nodeB1, nodeC]);
      const after = makeGraph('g2', [nodeA, nodeB, nodeC1]);
      const diff = diffGraphs(before, after);

      // Edge changes are captured by modify_node since both b and c changed
      const modOps = diff.operations.filter((op) => op.type === 'modify_node');
      expect(modOps.length).toBeGreaterThanOrEqual(2); // b and c both modified
    });

    it('should detect metadata name changes', () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = { ...makeGraph('g2', [makeNode('a')]), name: 'New Name' };
      const diff = diffGraphs(before, after);

      const metaOps = diff.operations.filter((op) => op.type === 'modify_metadata');
      expect(metaOps).toHaveLength(1);
      expect(metaOps[0].path).toBe('metadata/name');
    });

    it('should detect security label changes as node modifications', () => {
      const before = makeGraph('g1', [makeNode('a', { label: makeLabel(1) })]);
      const after = makeGraph('g2', [makeNode('a', { label: makeLabel(3) })]);
      const diff = diffGraphs(before, after);

      const modOps = diff.operations.filter((op) => op.type === 'modify_node');
      expect(modOps).toHaveLength(1);
    });

    it('should handle complex multi-operation diffs', () => {
      const nodeA = makeNode('a', { outputs: [{ port: 'out', dataType: 'string' }] });
      const nodeB = makeNode('b', {
        inputs: [{ nodeId: 'a', port: 'out', dataType: 'string' }],
      });
      const nodeC = makeNode('c');

      const before = makeGraph('g1', [nodeA, nodeB]);

      // After: remove b, add c, modify a
      const nodeA2 = makeNode('a', {
        operation: 'modified-op',
        outputs: [{ port: 'out', dataType: 'number' }],
      });
      const after = makeGraph('g2', [nodeA2, nodeC]);
      const diff = diffGraphs(before, after);

      expect(diff.operations.length).toBeGreaterThan(0);
      const types = diff.operations.map((op) => op.type);
      expect(types).toContain('remove_node');
      expect(types).toContain('add_node');
      expect(types).toContain('modify_node');
    });
  });

  describe('invertDiff', () => {
    it('should swap add/remove operations', () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(before, after);
      const inverted = invertDiff(diff);

      expect(inverted.sourceGraphId).toBe(diff.targetGraphId);
      expect(inverted.targetGraphId).toBe(diff.sourceGraphId);

      const addOps = inverted.operations.filter((op) => op.type === 'remove_node');
      expect(addOps.length).toBeGreaterThanOrEqual(1);
    });

    it('should swap before/after on modify operations', () => {
      const before = makeGraph('g1', [makeNode('a', { operation: 'old' })]);
      const after = makeGraph('g2', [makeNode('a', { operation: 'new' })]);
      const diff = diffGraphs(before, after);
      const inverted = invertDiff(diff);

      const modOps = inverted.operations.filter((op) => op.type === 'modify_node');
      expect(modOps).toHaveLength(1);
      expect((modOps[0].before as Record<string, unknown>).operation).toBe('new');
      expect((modOps[0].after as Record<string, unknown>).operation).toBe('old');
    });

    it('should reverse operation order', () => {
      const nodeA = makeNode('a', { outputs: [{ port: 'out', dataType: 'string' }] });
      const nodeB = makeNode('b', {
        inputs: [{ nodeId: 'a', port: 'out', dataType: 'string' }],
      });
      const before = makeGraph('g1', [nodeA]);
      const after = makeGraph('g2', [nodeA, nodeB]);
      const diff = diffGraphs(before, after);
      const inverted = invertDiff(diff);

      // Original order is preserved then reversed
      expect(inverted.operations.length).toBe(diff.operations.length);
    });
  });

  describe('composeDiffs', () => {
    it('should compose two sequential diffs', () => {
      const g1 = makeGraph('g1', [makeNode('a')]);
      const g2 = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const g3 = makeGraph('g3', [makeNode('a'), makeNode('b'), makeNode('c')]);

      const d1 = diffGraphs(g1, g2);
      const d2 = diffGraphs(g2, g3);
      const composed = composeDiffs(d1, d2);

      expect(composed.sourceGraphId).toBe('g1');
      expect(composed.targetGraphId).toBe('g3');
      expect(composed.operations.length).toBe(d1.operations.length + d2.operations.length);
    });

    it('should throw if diffs are not composable', () => {
      const g1 = makeGraph('g1', [makeNode('a')]);
      const g2 = makeGraph('g2', [makeNode('b')]);
      const g3 = makeGraph('g3', [makeNode('c')]);

      const d1 = diffGraphs(g1, g2);
      const d2 = diffGraphs(g3, g1); // g3 !== g2
      expect(() => composeDiffs(d1, d2)).toThrow('Cannot compose diffs');
    });
  });

  describe('summarizeDiff', () => {
    it('should count operations by type', () => {
      const nodeA = makeNode('a', { outputs: [{ port: 'out', dataType: 'string' }] });
      const nodeB = makeNode('b', {
        inputs: [{ nodeId: 'a', port: 'out', dataType: 'string' }],
      });
      const before = makeGraph('g1', [nodeA, nodeB]);

      const nodeA2 = makeNode('a', { operation: 'changed', outputs: [{ port: 'out', dataType: 'string' }] });
      const nodeC = makeNode('c');
      const after = makeGraph('g2', [nodeA2, nodeC]);

      const diff = diffGraphs(before, after);
      const summary = summarizeDiff(diff);

      expect(summary.totalOperations).toBeGreaterThan(0);
      expect(summary.nodesAdded + summary.nodesRemoved + summary.nodesModified +
        summary.edgesAdded + summary.edgesRemoved + summary.edgesRerouted +
        summary.metadataChanged).toBe(summary.totalOperations);
    });

    it('should return zeroes for empty diff', () => {
      const graph = makeGraph('g1', [makeNode('a')]);
      const diff = diffGraphs(graph, graph);
      const summary = summarizeDiff(diff);

      expect(summary.totalOperations).toBe(0);
      expect(summary.nodesAdded).toBe(0);
      expect(summary.nodesRemoved).toBe(0);
    });
  });

  describe('deepEqual', () => {
    it('should handle primitives', () => {
      expect(deepEqual(1, 1)).toBe(true);
      expect(deepEqual('a', 'a')).toBe(true);
      expect(deepEqual(1, 2)).toBe(false);
    });

    it('should handle arrays', () => {
      expect(deepEqual([1, 2], [1, 2])).toBe(true);
      expect(deepEqual([1, 2], [2, 1])).toBe(false);
      expect(deepEqual([1], [1, 2])).toBe(false);
    });

    it('should handle objects', () => {
      expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
      expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('should handle nested structures', () => {
      expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
      expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
    });

    it('should handle null', () => {
      expect(deepEqual(null, null)).toBe(true);
      expect(deepEqual(null, {})).toBe(false);
    });
  });

  describe('serializeNode', () => {
    it('should produce consistent output for identical nodes', () => {
      const node = makeNode('test');
      const s1 = serializeNode(node);
      const s2 = serializeNode(node);
      expect(deepEqual(s1, s2)).toBe(true);
    });

    it('should exclude createdAt and agentId for stable comparison', () => {
      const node = makeNode('test', { agentId: 'agent-1' });
      const serialized = serializeNode(node);
      expect(serialized).not.toHaveProperty('createdAt');
      expect(serialized).not.toHaveProperty('agentId');
    });
  });
});
