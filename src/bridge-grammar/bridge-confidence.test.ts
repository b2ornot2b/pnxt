/**
 * Tests for Bridge Grammar Confidence Scorer.
 *
 * Sprint 12 — Advisory Panel: Pearl (causal reasoning).
 */

import { scoreGraphConfidence } from './bridge-confidence.js';
import type { VPIRGraph, VPIRNode } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import { createStandardRegistry } from '../aci/tool-registry.js';

// ── Helpers ─────────────────────────────────────────────────────────

function makeLabel(): SecurityLabel {
  return {
    owner: 'test',
    trustLevel: 2,
    classification: 'internal',
    createdAt: new Date().toISOString(),
  };
}

function makeNode(overrides: Partial<VPIRNode> & { id: string }): VPIRNode {
  return {
    type: 'observation',
    operation: 'test-operation',
    inputs: [],
    outputs: [{ port: 'data', dataType: 'string' }],
    evidence: [{ type: 'data', source: 'test', confidence: 0.9 }],
    label: makeLabel(),
    verifiable: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeGraph(nodes: VPIRNode[], roots?: string[], terminals?: string[]): VPIRGraph {
  const nodeMap = new Map<string, VPIRNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }
  return {
    id: 'test-graph',
    name: 'Test Graph',
    nodes: nodeMap,
    roots: roots ?? [nodes[0]?.id].filter(Boolean),
    terminals: terminals ?? [nodes[nodes.length - 1]?.id].filter(Boolean),
    createdAt: new Date().toISOString(),
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('scoreGraphConfidence', () => {
  describe('well-formed graph', () => {
    it('should score a valid single-node graph highly', () => {
      const node = makeNode({ id: 'root' });
      const graph = makeGraph([node]);

      const score = scoreGraphConfidence(graph);

      expect(score.overall).toBeGreaterThan(0.8);
      expect(score.structural).toBeGreaterThan(0.8);
      expect(score.semantic).toBeGreaterThan(0.8);
      expect(score.topological).toBeGreaterThan(0.8);
      expect(score.handlerCoverage).toBe(1.0); // no registry → skip
      expect(score.lowConfidenceNodes).toHaveLength(0);
    });

    it('should score a valid multi-node pipeline highly', () => {
      const observe = makeNode({
        id: 'observe',
        type: 'observation',
        evidence: [{ type: 'data', source: 'input', confidence: 1.0 }],
      });
      const infer = makeNode({
        id: 'infer',
        type: 'inference',
        inputs: [{ nodeId: 'observe', port: 'data', dataType: 'string' }],
        evidence: [{ type: 'model_output', source: 'llm', confidence: 0.85 }],
      });
      const act = makeNode({
        id: 'act',
        type: 'action',
        operation: 'http-fetch',
        inputs: [{ nodeId: 'infer', port: 'data', dataType: 'string' }],
        evidence: [{ type: 'data', source: 'api', confidence: 0.9 }],
        verifiable: false,
      });

      const graph = makeGraph([observe, infer, act], ['observe'], ['act']);
      const score = scoreGraphConfidence(graph);

      expect(score.overall).toBeGreaterThan(0.7);
      expect(score.nodeScores).toHaveLength(3);
    });
  });

  describe('structural scoring', () => {
    it('should penalize empty graph', () => {
      const graph: VPIRGraph = {
        id: 'empty',
        name: 'Empty',
        nodes: new Map(),
        roots: [],
        terminals: [],
        createdAt: new Date().toISOString(),
      };

      const score = scoreGraphConfidence(graph);
      expect(score.structural).toBe(0);
      expect(score.overall).toBeLessThan(0.5);
    });

    it('should penalize nodes with missing evidence', () => {
      const node = makeNode({
        id: 'no-evidence',
        evidence: [],
      });
      const graph = makeGraph([node]);

      const score = scoreGraphConfidence(graph);
      expect(score.structural).toBeLessThan(0.9);
    });

    it('should penalize nodes with missing outputs', () => {
      const node = makeNode({
        id: 'no-outputs',
        outputs: [],
      });
      const graph = makeGraph([node]);

      const score = scoreGraphConfidence(graph);
      expect(score.structural).toBeLessThan(0.9);
    });
  });

  describe('semantic scoring', () => {
    it('should penalize observation nodes with inputs', () => {
      const node = makeNode({
        id: 'bad-observation',
        type: 'observation',
        inputs: [{ nodeId: 'other', port: 'data', dataType: 'string' }],
      });
      const graph = makeGraph([node]);

      const score = scoreGraphConfidence(graph);
      expect(score.semantic).toBeLessThan(0.95);
    });

    it('should penalize low evidence confidence', () => {
      const node = makeNode({
        id: 'low-conf',
        evidence: [{ type: 'data', source: 'test', confidence: 0.2 }],
      });
      const graph = makeGraph([node]);

      const score = scoreGraphConfidence(graph);
      expect(score.semantic).toBeLessThan(0.95);
    });

    it('should penalize wrong evidence type for node type', () => {
      const node = makeNode({
        id: 'wrong-evidence',
        type: 'observation',
        evidence: [{ type: 'model_output', source: 'llm', confidence: 0.9 }],
      });
      const graph = makeGraph([node]);

      const score = scoreGraphConfidence(graph);
      expect(score.semantic).toBeLessThan(0.95);
    });
  });

  describe('handler coverage scoring', () => {
    it('should return 1.0 when no registry provided', () => {
      const node = makeNode({ id: 'action', type: 'action', operation: 'anything' });
      const graph = makeGraph([node]);

      const score = scoreGraphConfidence(graph);
      expect(score.handlerCoverage).toBe(1.0);
    });

    it('should score handler coverage with registry', () => {
      const registry = createStandardRegistry();

      const node = makeNode({
        id: 'action',
        type: 'action',
        operation: 'http-fetch',
      });
      const graph = makeGraph([node]);

      const score = scoreGraphConfidence(graph, registry);
      expect(score.handlerCoverage).toBe(1.0);
    });

    it('should penalize unknown handler operations', () => {
      const registry = createStandardRegistry();

      const node = makeNode({
        id: 'action',
        type: 'action',
        operation: 'nonexistent-handler',
      });
      const graph = makeGraph([node]);

      const score = scoreGraphConfidence(graph, registry);
      expect(score.handlerCoverage).toBe(0);
    });

    it('should handle mixed available/unavailable handlers', () => {
      const registry = createStandardRegistry();

      const a1 = makeNode({
        id: 'a1',
        type: 'action',
        operation: 'http-fetch',
        inputs: [{ nodeId: 'root', port: 'data', dataType: 'string' }],
      });
      const a2 = makeNode({
        id: 'a2',
        type: 'action',
        operation: 'fake-handler',
        inputs: [{ nodeId: 'root', port: 'data', dataType: 'string' }],
      });
      const root = makeNode({ id: 'root' });
      const graph = makeGraph([root, a1, a2], ['root'], ['a1', 'a2']);

      const score = scoreGraphConfidence(graph, registry);
      expect(score.handlerCoverage).toBe(0.5);
    });
  });

  describe('topological scoring', () => {
    it('should penalize dangling references', () => {
      const root = makeNode({ id: 'root', type: 'observation' });
      const dangling = makeNode({
        id: 'dangling',
        type: 'inference',
        inputs: [{ nodeId: 'nonexistent', port: 'data', dataType: 'string' }],
        evidence: [{ type: 'rule', source: 'test', confidence: 0.9 }],
      });
      const graph = makeGraph([root, dangling], ['root'], ['dangling']);

      const score = scoreGraphConfidence(graph);
      expect(score.topological).toBeLessThan(0.95);
    });

    it('should penalize root nodes with inputs in multi-node graph', () => {
      const root = makeNode({
        id: 'bad-root',
        inputs: [{ nodeId: 'leaf', port: 'data', dataType: 'string' }],
      });
      const leaf = makeNode({
        id: 'leaf',
        type: 'inference',
        inputs: [{ nodeId: 'bad-root', port: 'data', dataType: 'string' }],
        evidence: [{ type: 'rule', source: 'test', confidence: 0.9 }],
      });
      const graph = makeGraph([root, leaf], ['bad-root'], ['leaf']);

      const score = scoreGraphConfidence(graph);
      expect(score.topological).toBeLessThan(1.0);
    });

    it('should score well-connected graph highly', () => {
      const a = makeNode({ id: 'a', type: 'observation' });
      const b = makeNode({
        id: 'b',
        type: 'inference',
        inputs: [{ nodeId: 'a', port: 'data', dataType: 'string' }],
        evidence: [{ type: 'rule', source: 'logic', confidence: 0.95 }],
      });
      const c = makeNode({
        id: 'c',
        type: 'assertion',
        inputs: [{ nodeId: 'b', port: 'data', dataType: 'string' }],
        evidence: [{ type: 'rule', source: 'check', confidence: 1.0 }],
      });
      const graph = makeGraph([a, b, c], ['a'], ['c']);

      const score = scoreGraphConfidence(graph);
      expect(score.topological).toBeGreaterThan(0.8);
    });
  });

  describe('low confidence flagging', () => {
    it('should flag low-confidence nodes', () => {
      const good = makeNode({ id: 'good' });
      const bad = makeNode({
        id: 'bad',
        type: 'observation',
        evidence: [],
        outputs: [],
        operation: 'x',
      });
      const graph = makeGraph([good, bad], ['good', 'bad'], ['good', 'bad']);

      // The "bad" node has no evidence + no outputs + short operation → low score
      const score = scoreGraphConfidence(graph, undefined, { threshold: 0.8 });
      expect(score.lowConfidenceNodes).toContain('bad');
      expect(score.lowConfidenceNodes).not.toContain('good');
    });

    it('should respect custom threshold', () => {
      const node = makeNode({ id: 'node' });
      const graph = makeGraph([node]);

      const highThreshold = scoreGraphConfidence(graph, undefined, { threshold: 0.99 });
      const lowThreshold = scoreGraphConfidence(graph, undefined, { threshold: 0.1 });

      // With very high threshold, node might be flagged
      // With very low threshold, node should not be flagged
      expect(lowThreshold.lowConfidenceNodes).toHaveLength(0);
    });
  });

  describe('composite score', () => {
    it('should weight dimensions correctly', () => {
      const node = makeNode({ id: 'node' });
      const graph = makeGraph([node]);

      const score = scoreGraphConfidence(graph);

      // Composite should be weighted average of dimensions
      const expected =
        0.30 * score.structural +
        0.25 * score.semantic +
        0.25 * score.handlerCoverage +
        0.20 * score.topological;

      expect(score.overall).toBeCloseTo(expected, 5);
    });
  });
});
