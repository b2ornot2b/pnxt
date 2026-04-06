import type { VPIRGraph, VPIRNode, VPIRDiff } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import { applyPatch, dryRunPatch, validatePatchedGraph, cloneGraph } from './vpir-patch.js';
import { diffGraphs } from './vpir-diff.js';

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

describe('VPIR Patch Engine', () => {
  describe('applyPatch', () => {
    it('should apply a diff that adds a node', () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(before, after);

      const result = applyPatch(before, diff);
      expect(result.success).toBe(true);
      expect(result.graph).toBeDefined();
      expect(result.graph!.nodes.size).toBe(2);
      expect(result.graph!.nodes.has('b')).toBe(true);
    });

    it('should apply a diff that removes a node', () => {
      const before = makeGraph('g1', [makeNode('a'), makeNode('b')]);
      const after = makeGraph('g2', [makeNode('a')]);
      const diff = diffGraphs(before, after);

      const result = applyPatch(before, diff);
      expect(result.success).toBe(true);
      expect(result.graph!.nodes.size).toBe(1);
      expect(result.graph!.nodes.has('b')).toBe(false);
    });

    it('should apply a diff that modifies a node', () => {
      const before = makeGraph('g1', [makeNode('a', { operation: 'old-op' })]);
      const after = makeGraph('g2', [makeNode('a', { operation: 'new-op' })]);
      const diff = diffGraphs(before, after);

      const result = applyPatch(before, diff);
      expect(result.success).toBe(true);
      expect(result.graph!.nodes.get('a')!.operation).toBe('new-op');
    });

    it('should apply a diff that adds an edge', () => {
      const nodeA = makeNode('a', { outputs: [{ port: 'out', dataType: 'string' }] });
      const nodeB = makeNode('b');
      const nodeBWithEdge = makeNode('b', {
        inputs: [{ nodeId: 'a', port: 'out', dataType: 'string' }],
      });

      const before = makeGraph('g1', [nodeA, nodeB]);
      const after = makeGraph('g2', [nodeA, nodeBWithEdge]);
      const diff = diffGraphs(before, after);

      const result = applyPatch(before, diff);
      expect(result.success).toBe(true);
      const bNode = result.graph!.nodes.get('b')!;
      expect(bNode.inputs.some((i) => i.nodeId === 'a')).toBe(true);
    });

    it('should not mutate the original graph', () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(before, after);

      applyPatch(before, diff);
      expect(before.nodes.size).toBe(1); // Original unchanged
    });

    it('should recompute roots and terminals after patching', () => {
      const nodeA = makeNode('a', { outputs: [{ port: 'out', dataType: 'string' }] });
      const nodeB = makeNode('b', {
        inputs: [{ nodeId: 'a', port: 'out', dataType: 'string' }],
      });
      const nodeC = makeNode('c', {
        inputs: [{ nodeId: 'b', port: 'result', dataType: 'string' }],
      });

      const before = makeGraph('g1', [nodeA, nodeB]);
      const after = makeGraph('g2', [nodeA, nodeB, nodeC]);
      const diff = diffGraphs(before, after);

      const result = applyPatch(before, diff);
      expect(result.success).toBe(true);
      expect(result.graph!.roots).toContain('a');
      expect(result.graph!.terminals).toContain('c');
    });

    it('should update graph ID to target', () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(before, after);

      const result = applyPatch(before, diff);
      expect(result.graph!.id).toBe('g2');
    });

    it('should apply metadata changes', () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = { ...makeGraph('g2', [makeNode('a')]), name: 'New Name' };
      const diff = diffGraphs(before, after);

      const result = applyPatch(before, diff);
      expect(result.success).toBe(true);
      expect(result.graph!.name).toBe('New Name');
    });

    it('should apply reroute edge operations', () => {
      const nodeA = makeNode('a', { outputs: [{ port: 'out', dataType: 'string' }] });
      const nodeB = makeNode('b', {
        inputs: [{ nodeId: 'a', port: 'out', dataType: 'string' }],
      });
      const nodeC = makeNode('c');
      const nodeCWithEdge = makeNode('c', {
        inputs: [{ nodeId: 'a', port: 'out', dataType: 'string' }],
      });
      const nodeBNoEdge = makeNode('b');

      const before = makeGraph('g1', [nodeA, nodeB, nodeC]);
      const after = makeGraph('g2', [nodeA, nodeBNoEdge, nodeCWithEdge]);
      const diff = diffGraphs(before, after);

      const result = applyPatch(before, diff);
      expect(result.success).toBe(true);
      const bNode = result.graph!.nodes.get('b')!;
      const cNode = result.graph!.nodes.get('c')!;
      expect(bNode.inputs.some((i) => i.nodeId === 'a')).toBe(false);
      expect(cNode.inputs.some((i) => i.nodeId === 'a')).toBe(true);
    });
  });

  describe('conflict detection', () => {
    it('should detect conflict when adding an existing node', () => {
      const graph = makeGraph('g1', [makeNode('a')]);
      const diff: VPIRDiff = {
        id: 'test-diff',
        sourceGraphId: 'g1',
        targetGraphId: 'g2',
        operations: [{
          type: 'add_node',
          path: 'nodes/a',
          after: { id: 'a', type: 'inference', operation: 'dup', inputs: [], outputs: [], evidence: [], label: { owner: 'test', trustLevel: 2, classification: 'internal' }, verifiable: true },
        }],
        metadata: { createdAt: new Date().toISOString() },
      };

      const result = applyPatch(graph, diff);
      expect(result.success).toBe(false);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].reason).toContain('already exists');
    });

    it('should detect conflict when removing a non-existent node', () => {
      const graph = makeGraph('g1', [makeNode('a')]);
      const diff: VPIRDiff = {
        id: 'test-diff',
        sourceGraphId: 'g1',
        targetGraphId: 'g2',
        operations: [{
          type: 'remove_node',
          path: 'nodes/missing',
          before: {},
        }],
        metadata: { createdAt: new Date().toISOString() },
      };

      const result = applyPatch(graph, diff);
      expect(result.success).toBe(false);
      expect(result.conflicts[0].reason).toContain('not found');
    });

    it('should detect conflict when modifying a non-existent node', () => {
      const graph = makeGraph('g1', [makeNode('a')]);
      const diff: VPIRDiff = {
        id: 'test-diff',
        sourceGraphId: 'g1',
        targetGraphId: 'g2',
        operations: [{
          type: 'modify_node',
          path: 'nodes/missing',
          before: {},
          after: {},
        }],
        metadata: { createdAt: new Date().toISOString() },
      };

      const conflicts = dryRunPatch(graph, diff);
      expect(conflicts).toHaveLength(1);
    });

    it('should detect conflict when adding edge to non-existent target', () => {
      const graph = makeGraph('g1', [makeNode('a')]);
      const diff: VPIRDiff = {
        id: 'test-diff',
        sourceGraphId: 'g1',
        targetGraphId: 'g2',
        operations: [{
          type: 'add_edge',
          path: 'edges/a:result→missing',
          after: { sourceId: 'a', port: 'result', dataType: 'string', targetId: 'missing' },
        }],
        metadata: { createdAt: new Date().toISOString() },
      };

      const conflicts = dryRunPatch(graph, diff);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].reason).toContain('not found');
    });
  });

  describe('dryRunPatch', () => {
    it('should return empty array for valid diffs', () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(before, after);

      const conflicts = dryRunPatch(before, diff);
      expect(conflicts).toHaveLength(0);
    });

    it('should detect cascading conflicts', () => {
      const graph = makeGraph('g1', [makeNode('a')]);
      const diff: VPIRDiff = {
        id: 'test-diff',
        sourceGraphId: 'g1',
        targetGraphId: 'g2',
        operations: [
          { type: 'remove_node', path: 'nodes/a', before: {} },
          { type: 'modify_node', path: 'nodes/a', before: {}, after: {} },
        ],
        metadata: { createdAt: new Date().toISOString() },
      };

      const conflicts = dryRunPatch(graph, diff);
      expect(conflicts).toHaveLength(1); // Second op conflicts because a was removed
    });
  });

  describe('validatePatchedGraph', () => {
    it('should validate a successfully patched graph', () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(before, after);

      const patchResult = applyPatch(before, diff);
      const validation = validatePatchedGraph(patchResult);
      expect(validation.valid).toBe(true);
    });

    it('should return invalid for failed patches', () => {
      const result = { success: false, conflicts: [{ operation: { type: 'add_node' as const, path: 'nodes/x' }, reason: 'test' }] };
      const validation = validatePatchedGraph(result);
      expect(validation.valid).toBe(false);
      expect(validation.errors[0].code).toBe('PATCH_FAILED');
    });
  });

  describe('cloneGraph', () => {
    it('should create an independent copy', () => {
      const original = makeGraph('g1', [makeNode('a')]);
      const clone = cloneGraph(original);

      clone.nodes.set('b', makeNode('b'));
      expect(original.nodes.size).toBe(1);
      expect(clone.nodes.size).toBe(2);
    });

    it('should deep clone node properties', () => {
      const original = makeGraph('g1', [makeNode('a')]);
      const clone = cloneGraph(original);

      clone.nodes.get('a')!.operation = 'modified';
      expect(original.nodes.get('a')!.operation).toBe('op-a');
    });
  });
});
