import type { VPIRGraph, VPIRNode, VPIRDiff } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import type { GraphVerificationResult } from '../verification/z3-graph-verifier.js';
import { diffGraphs } from './vpir-diff.js';
import {
  beginTransaction,
  executeTransaction,
  rollbackTransaction,
  getTransactionGraph,
} from './vpir-transaction.js';

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
  const roots = nodes.filter((n) => n.inputs.length === 0).map((n) => n.id);
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
    id, name: `Graph ${id}`, nodes: nodeMap, roots, terminals,
    createdAt: '2026-04-06T00:00:00.000Z',
  };
}

function makePassingVerifier(): (before: VPIRGraph, after: VPIRGraph) => Promise<GraphVerificationResult> {
  return async () => ({
    verified: true,
    properties: [{ name: 'acyclicity', status: 'verified' }],
    z3TimeMs: 1,
  });
}

function makeFailingVerifier(): (before: VPIRGraph, after: VPIRGraph) => Promise<GraphVerificationResult> {
  return async () => ({
    verified: false,
    properties: [{ name: 'acyclicity', status: 'violated', details: 'Cycle detected' }],
    z3TimeMs: 1,
  });
}

// ── Tests ─────────────────────────────────────────────────────────

describe('VPIR Graph Transaction Manager', () => {
  describe('beginTransaction', () => {
    it('should create a pending transaction with snapshot', () => {
      const graph = makeGraph('g1', [makeNode('a')]);
      const diff = diffGraphs(graph, makeGraph('g2', [makeNode('a'), makeNode('b')]));

      const txn = beginTransaction(graph, diff);
      expect(txn.status).toBe('pending');
      expect(txn.sourceGraph.id).toBe('g1');
      expect(txn.diff).toBe(diff);
      expect(txn.rollbackDiff).toBeDefined();
      expect(txn.trace).toHaveLength(0);
    });

    it('should snapshot the graph independently', () => {
      const graph = makeGraph('g1', [makeNode('a')]);
      const diff = diffGraphs(graph, makeGraph('g2', [makeNode('a')]));
      const txn = beginTransaction(graph, diff);

      graph.nodes.set('new', makeNode('new'));
      expect(txn.sourceGraph.nodes.size).toBe(1); // Snapshot unchanged
    });
  });

  describe('executeTransaction', () => {
    it('should commit when patch and validation succeed', async () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(before, after);
      const txn = beginTransaction(before, diff);

      const result = await executeTransaction(txn);
      expect(result.status).toBe('committed');
      expect(result.patchedGraph).toBeDefined();
      expect(result.patchedGraph!.nodes.size).toBe(2);
      expect(result.trace.some((t) => t.stage === 'patch' && t.status === 'success')).toBe(true);
      expect(result.trace.some((t) => t.stage === 'commit' && t.status === 'success')).toBe(true);
    });

    it('should fail when patch has conflicts', async () => {
      const graph = makeGraph('g1', [makeNode('a')]);
      const badDiff: VPIRDiff = {
        id: 'bad',
        sourceGraphId: 'g1',
        targetGraphId: 'g2',
        operations: [{ type: 'remove_node', path: 'nodes/missing', before: {} }],
        metadata: { createdAt: new Date().toISOString() },
      };
      const txn = beginTransaction(graph, badDiff);

      const result = await executeTransaction(txn);
      expect(result.status).toBe('failed');
      expect(result.trace.some((t) => t.stage === 'patch' && t.status === 'failure')).toBe(true);
    });

    it('should commit with passing verification', async () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(before, after);
      const txn = beginTransaction(before, diff);

      const result = await executeTransaction(txn, {
        verify: makePassingVerifier(),
      });
      expect(result.status).toBe('committed');
      expect(result.verificationResult?.verified).toBe(true);
    });

    it('should auto-rollback on verification failure', async () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(before, after);
      const txn = beginTransaction(before, diff);

      const result = await executeTransaction(txn, {
        verify: makeFailingVerifier(),
      });
      expect(result.status).toBe('rolled_back');
      expect(result.patchedGraph).toBeUndefined();
      expect(result.trace.some((t) => t.stage === 'rollback')).toBe(true);
    });

    it('should fail without rollback when autoRollback is false', async () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(before, after);
      const txn = beginTransaction(before, diff);

      const result = await executeTransaction(txn, {
        verify: makeFailingVerifier(),
        autoRollback: false,
      });
      expect(result.status).toBe('failed');
    });

    it('should skip validation when disabled', async () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(before, after);
      const txn = beginTransaction(before, diff);

      const result = await executeTransaction(txn, { validate: false });
      expect(result.status).toBe('committed');
      expect(result.trace.every((t) => t.stage !== 'validate')).toBe(true);
    });

    it('should handle verification errors gracefully', async () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(before, after);
      const txn = beginTransaction(before, diff);

      const result = await executeTransaction(txn, {
        verify: async () => { throw new Error('Z3 crashed'); },
      });
      expect(result.status).toBe('rolled_back');
      expect(result.trace.some((t) => t.stage === 'verify' && t.status === 'failure')).toBe(true);
    });

    it('should include timing in all trace entries', async () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(before, after);
      const txn = beginTransaction(before, diff);

      const result = await executeTransaction(txn);
      for (const entry of result.trace) {
        expect(typeof entry.durationMs).toBe('number');
        expect(entry.durationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('rollbackTransaction', () => {
    it('should restore to source graph', () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(before, after);
      const txn = beginTransaction(before, diff);

      const rolled = rollbackTransaction(txn);
      expect(rolled.status).toBe('rolled_back');
      expect(rolled.patchedGraph).toBeUndefined();
      expect(rolled.sourceGraph.nodes.size).toBe(1);
    });
  });

  describe('getTransactionGraph', () => {
    it('should return patched graph when committed', async () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(before, after);
      const txn = beginTransaction(before, diff);

      const result = await executeTransaction(txn);
      const graph = getTransactionGraph(result);
      expect(graph.nodes.size).toBe(2);
    });

    it('should return source graph when rolled back', async () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(before, after);
      const txn = beginTransaction(before, diff);

      const result = await executeTransaction(txn, {
        verify: makeFailingVerifier(),
      });
      const graph = getTransactionGraph(result);
      expect(graph.nodes.size).toBe(1);
    });

    it('should return source graph when pending', () => {
      const graph = makeGraph('g1', [makeNode('a')]);
      const diff = diffGraphs(graph, makeGraph('g2', [makeNode('a')]));
      const txn = beginTransaction(graph, diff);

      expect(getTransactionGraph(txn).id).toBe('g1');
    });
  });
});
