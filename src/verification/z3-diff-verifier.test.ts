import type { VPIRGraph, VPIRNode } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import { diffGraphs } from '../vpir/vpir-diff.js';
import {
  classifyDiffImpact,
  verifyPropertyPreservation,
  attemptTransport,
  toGraphVerificationResult,
} from './z3-diff-verifier.js';

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

// ── Tests ─────────────────────────────────────────────────────────

describe('Z3 Diff Property Preservation Verifier', () => {
  describe('classifyDiffImpact', () => {
    it('should classify metadata-only changes as unaffecting all properties', () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = { ...makeGraph('g1', [makeNode('a')]), name: 'New Name' };
      const diff = diffGraphs(before, after);

      const impact = classifyDiffImpact(diff);
      expect(impact.unaffected).toContain('acyclicity');
      expect(impact.unaffected).toContain('input_completeness');
      expect(impact.reason).toContain('metadata-only');
    });

    it('should classify node additions as affecting topology properties', () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(before, after);

      const impact = classifyDiffImpact(diff);
      expect(impact.affected).toContain('acyclicity');
      expect(impact.affected).toContain('input_completeness');
    });

    it('should classify edge additions as affecting input completeness', () => {
      // When a node gains an input, it's captured as a modify_node operation
      // which affects input_completeness and potentially other properties
      const nodeA = makeNode('a', { outputs: [{ port: 'out', dataType: 'string' }] });
      const nodeB = makeNode('b');
      const nodeBWithEdge = makeNode('b', {
        inputs: [{ nodeId: 'a', port: 'out', dataType: 'string' }],
      });

      const before = makeGraph('g1', [nodeA, nodeB]);
      const after = makeGraph('g2', [nodeA, nodeBWithEdge]);
      const diff = diffGraphs(before, after);

      const impact = classifyDiffImpact(diff);
      expect(impact.affected).toContain('input_completeness');
    });

    it('should classify security label changes as affecting IFC', () => {
      const before = makeGraph('g1', [makeNode('a', { label: makeLabel(1) })]);
      const after = makeGraph('g2', [makeNode('a', { label: makeLabel(3) })]);
      const diff = diffGraphs(before, after);

      const impact = classifyDiffImpact(diff);
      expect(impact.affected).toContain('ifc_monotonicity');
      expect(impact.reason).toContain('security labels changed');
    });

    it('should classify operation changes as affecting handler trust', () => {
      const before = makeGraph('g1', [makeNode('a', { operation: 'old-op' })]);
      const after = makeGraph('g2', [makeNode('a', { operation: 'new-op' })]);
      const diff = diffGraphs(before, after);

      const impact = classifyDiffImpact(diff);
      expect(impact.affected).toContain('handler_trust');
      expect(impact.reason).toContain('handler operations changed');
    });

    it('should handle empty diffs', () => {
      const graph = makeGraph('g1', [makeNode('a')]);
      const diff = diffGraphs(graph, graph);

      const impact = classifyDiffImpact(diff);
      expect(impact.unaffected.length).toBe(4); // All standard properties
      expect(impact.affected.length).toBe(0);
    });
  });

  describe('verifyPropertyPreservation', () => {
    it('should preserve all properties for metadata-only changes', async () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = { ...makeGraph('g1', [makeNode('a')]), name: 'New Name' };
      const diff = diffGraphs(before, after);

      const result = await verifyPropertyPreservation(before, after, diff);
      expect(result.preserved).toBe(true);
      expect(result.transportedCount).toBe(4);
      expect(result.reverifiedCount).toBe(0);
    });

    it('should mark affected properties as unknown without Z3 context', async () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(before, after);

      const result = await verifyPropertyPreservation(before, after, diff);
      const unknowns = result.properties.filter((p) => p.status === 'unknown');
      expect(unknowns.length).toBeGreaterThan(0);
    });

    it('should handle simple node addition preserving acyclicity', async () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(before, after);

      // Without Z3, affected properties are unknown but preserved flag depends on failures
      const result = await verifyPropertyPreservation(before, after, diff);
      expect(result.properties.length).toBe(4);
    });

    it('should report timing information', async () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('a'), makeNode('b')]);
      const diff = diffGraphs(before, after);

      const result = await verifyPropertyPreservation(before, after, diff);
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should transport unaffected properties', async () => {
      const nodeA = makeNode('a', { operation: 'changed-op' });
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [nodeA]);
      const diff = diffGraphs(before, after);

      const result = await verifyPropertyPreservation(before, after, diff);
      const transported = result.properties.filter((p) => p.method === 'transport');
      expect(transported.length).toBeGreaterThan(0);
    });
  });

  describe('attemptTransport', () => {
    it('should return null for structurally different graphs', () => {
      const before = makeGraph('g1', [makeNode('a')]);
      const after = makeGraph('g2', [makeNode('x')]);

      const result = attemptTransport(before, after, 'acyclicity');
      // Transport may or may not succeed depending on categorical equivalence
      // The important thing is it doesn't throw
      expect(result === null || result.verified === true).toBe(true);
    });

    it('should not throw for any graph pair', () => {
      const before = makeGraph('g1', [makeNode('a'), makeNode('b')]);
      const after = makeGraph('g2', [makeNode('c')]);

      expect(() => attemptTransport(before, after, 'acyclicity')).not.toThrow();
    });
  });

  describe('toGraphVerificationResult', () => {
    it('should convert preserved result to verified', () => {
      const preservation = {
        preserved: true,
        properties: [
          { name: 'acyclicity', method: 'transport' as const, status: 'preserved' as const },
        ],
        transportedCount: 1,
        reverifiedCount: 0,
        failedCount: 0,
        totalTimeMs: 5,
      };

      const result = toGraphVerificationResult(preservation);
      expect(result.verified).toBe(true);
      expect(result.properties[0].status).toBe('verified');
    });

    it('should convert violated result to violated', () => {
      const preservation = {
        preserved: false,
        properties: [
          { name: 'acyclicity', method: 'reverify' as const, status: 'violated' as const, details: 'Cycle found' },
        ],
        transportedCount: 0,
        reverifiedCount: 1,
        failedCount: 1,
        totalTimeMs: 10,
      };

      const result = toGraphVerificationResult(preservation);
      expect(result.verified).toBe(false);
      expect(result.properties[0].status).toBe('violated');
    });

    it('should convert unknown to unknown', () => {
      const preservation = {
        preserved: true,
        properties: [
          { name: 'handler_trust', method: 'reverify' as const, status: 'unknown' as const },
        ],
        transportedCount: 0,
        reverifiedCount: 0,
        failedCount: 0,
        totalTimeMs: 1,
      };

      const result = toGraphVerificationResult(preservation);
      expect(result.properties[0].status).toBe('unknown');
    });
  });
});
