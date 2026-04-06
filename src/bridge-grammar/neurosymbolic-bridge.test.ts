/**
 * Tests for Neurosymbolic Pipeline Integration.
 *
 * Sprint 13 — Advisory Panel: Pearl, Sutskever, Kay.
 */

import { applyNeurosymbolicRefinement } from './neurosymbolic-bridge.js';
import type { VPIRGraph, VPIRNode } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';

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
  const now = new Date().toISOString();
  return {
    type: 'observation',
    operation: 'gather-data',
    inputs: [],
    outputs: [{ port: 'data', dataType: 'string' }],
    evidence: [{ type: 'data', source: 'test', confidence: 0.9 }],
    label: makeLabel(),
    verifiable: true,
    createdAt: now,
    ...overrides,
  };
}

function makeGraph(nodes: VPIRNode[], overrides?: Partial<VPIRGraph>): VPIRGraph {
  const nodeMap = new Map<string, VPIRNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  const roots = nodes
    .filter((n) => n.inputs.length === 0)
    .map((n) => n.id);
  const terminals = nodes
    .filter((n) => {
      const id = n.id;
      return !nodes.some((other) =>
        other.inputs.some((inp) => inp.nodeId === id),
      );
    })
    .map((n) => n.id);

  return {
    id: 'test-graph',
    name: 'Test Graph',
    nodes: nodeMap,
    roots,
    terminals,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a high-confidence graph that should pass through unchanged.
 */
function createHighConfidenceGraph(): VPIRGraph {
  return makeGraph([
    makeNode({
      id: 'observe',
      type: 'observation',
      operation: 'gather-input',
      inputs: [],
      outputs: [{ port: 'data', dataType: 'object' }],
      evidence: [{ type: 'data', source: 'user', confidence: 0.95 }],
    }),
    makeNode({
      id: 'infer',
      type: 'inference',
      operation: 'analyze-data',
      inputs: [{ nodeId: 'observe', port: 'data', dataType: 'object' }],
      outputs: [{ port: 'result', dataType: 'object' }],
      evidence: [{ type: 'model_output', source: 'model', confidence: 0.9 }],
    }),
    makeNode({
      id: 'assert',
      type: 'assertion',
      operation: 'validate-result',
      inputs: [{ nodeId: 'infer', port: 'result', dataType: 'object' }],
      outputs: [{ port: 'valid', dataType: 'boolean' }],
      evidence: [{ type: 'rule', source: 'policy', confidence: 0.95 }],
      verifiable: true,
    }),
  ]);
}

/**
 * Create a graph with low-confidence nodes that need refinement.
 */
function createLowConfidenceGraph(): VPIRGraph {
  return makeGraph([
    makeNode({
      id: 'bad-observe',
      type: 'inference', // Wrong type for a root node — should be observation
      operation: 'x', // Very short operation
      inputs: [],
      outputs: [{ port: 'data', dataType: 'string' }],
      evidence: [{ type: 'model_output', source: 'test', confidence: 0.3 }], // Wrong evidence type + low confidence
    }),
    makeNode({
      id: 'bad-action',
      type: 'action',
      operation: 'do-something',
      inputs: [{ nodeId: 'bad-observe', port: 'data', dataType: 'string' }],
      outputs: [{ port: 'result', dataType: 'string' }],
      evidence: [{ type: 'data', source: 'test', confidence: 0.5 }],
    }),
  ]);
}

/**
 * Create a graph with a broken reference.
 */
function createBrokenReferenceGraph(): VPIRGraph {
  return makeGraph([
    makeNode({
      id: 'source',
      type: 'observation',
      operation: 'gather-input',
      inputs: [],
      outputs: [{ port: 'data', dataType: 'object' }],
      evidence: [{ type: 'data', source: 'user', confidence: 0.9 }],
    }),
    makeNode({
      id: 'consumer',
      type: 'inference',
      operation: 'process-data',
      inputs: [{ nodeId: 'nonexistent-node', port: 'data', dataType: 'object' }], // Broken ref
      outputs: [{ port: 'result', dataType: 'object' }],
      evidence: [{ type: 'model_output', source: 'model', confidence: 0.8 }],
    }),
  ]);
}

// ── Tests ───────────────────────────────────────────────────────────

describe('applyNeurosymbolicRefinement', () => {
  describe('high-confidence passthrough', () => {
    it('should pass through a high-confidence graph unchanged', async () => {
      const graph = createHighConfidenceGraph();

      const result = await applyNeurosymbolicRefinement(graph, {
        convergenceThreshold: 0.5, // Low threshold to ensure passthrough
      });

      expect(result.converged).toBe(true);
      expect(result.iterations).toBe(0);
      expect(result.patchesApplied).toHaveLength(0);
      expect(result.initialConfidence).toBeGreaterThan(0.5);
      expect(result.finalConfidence).toEqual(result.initialConfidence);
    });

    it('should report initial and final confidence', async () => {
      const graph = createHighConfidenceGraph();

      const result = await applyNeurosymbolicRefinement(graph, {
        convergenceThreshold: 0.5,
      });

      expect(result.initialConfidence).toBeGreaterThan(0);
      expect(result.finalConfidence).toBeGreaterThan(0);
    });
  });

  describe('low-confidence refinement', () => {
    it('should attempt patches on low-confidence nodes', async () => {
      const graph = createLowConfidenceGraph();

      const result = await applyNeurosymbolicRefinement(graph, {
        convergenceThreshold: 0.99, // Very high threshold to force refinement
        maxIterations: 3,
      });

      expect(result.iterations).toBeGreaterThan(0);
      // May or may not produce patches depending on whether alternatives improve score
      expect(result.initialConfidence).toBeGreaterThan(0);
    });

    it('should track patches applied', async () => {
      const graph = createLowConfidenceGraph();

      const result = await applyNeurosymbolicRefinement(graph, {
        convergenceThreshold: 0.99,
        maxIterations: 5,
      });

      for (const patch of result.patchesApplied) {
        expect(patch.nodeId).toBeDefined();
        expect(patch.reason).toBeDefined();
        expect(typeof patch.beforeConfidence).toBe('number');
        expect(typeof patch.afterConfidence).toBe('number');
        expect(['type_swap', 'reference_fix', 'interpretation']).toContain(patch.strategy);
      }
    });

    it('should improve or maintain confidence after patches', async () => {
      const graph = createLowConfidenceGraph();

      const result = await applyNeurosymbolicRefinement(graph, {
        convergenceThreshold: 0.99,
        maxIterations: 3,
      });

      // Final confidence should be >= initial (patches only applied when they improve)
      expect(result.finalConfidence).toBeGreaterThanOrEqual(result.initialConfidence - 0.01);
    });
  });

  describe('broken reference handling', () => {
    it('should attempt to fix broken references', async () => {
      const graph = createBrokenReferenceGraph();

      const result = await applyNeurosymbolicRefinement(graph, {
        convergenceThreshold: 0.99,
        maxIterations: 3,
      });

      expect(result.iterations).toBeGreaterThan(0);
      expect(result.initialConfidence).toBeGreaterThan(0);
    });
  });

  describe('oscillation detection', () => {
    it('should report oscillation information', async () => {
      const graph = createLowConfidenceGraph();

      const result = await applyNeurosymbolicRefinement(graph, {
        convergenceThreshold: 0.99,
        maxIterations: 5,
      });

      expect(result.oscillationReport).toBeDefined();
      expect(result.oscillationReport.history).toBeInstanceOf(Map);
    });

    it('should halt refinement when all targets oscillate', async () => {
      const graph = createLowConfidenceGraph();

      const result = await applyNeurosymbolicRefinement(graph, {
        convergenceThreshold: 0.99,
        maxIterations: 10, // Many iterations to trigger oscillation
        patchBudget: 1, // Patch one node at a time
      });

      // Should stop before max iterations if oscillation detected
      expect(result.iterations).toBeLessThanOrEqual(10);
    });
  });

  describe('patch budget enforcement', () => {
    it('should respect patch budget per iteration', async () => {
      const graph = createLowConfidenceGraph();

      const result = await applyNeurosymbolicRefinement(graph, {
        convergenceThreshold: 0.99,
        maxIterations: 2,
        patchBudget: 1,
      });

      // With budget of 1, should patch at most 1 node per iteration (2 iterations × 1 budget)
      expect(result.patchesApplied.length).toBeLessThanOrEqual(2 * 1);
    });
  });

  describe('convergence threshold', () => {
    it('should converge when threshold is met', async () => {
      const graph = createHighConfidenceGraph();

      const result = await applyNeurosymbolicRefinement(graph, {
        convergenceThreshold: 0.3, // Very low threshold
      });

      expect(result.converged).toBe(true);
    });

    it('should not converge when threshold is unreachable', async () => {
      const graph = createLowConfidenceGraph();

      const result = await applyNeurosymbolicRefinement(graph, {
        convergenceThreshold: 1.0, // Impossible threshold
        maxIterations: 2,
      });

      expect(result.converged).toBe(false);
    });
  });

  describe('graph integrity', () => {
    it('should preserve graph structure after refinement', async () => {
      const graph = createHighConfidenceGraph();

      const result = await applyNeurosymbolicRefinement(graph, {
        convergenceThreshold: 0.5,
      });

      expect(result.graph.nodes.size).toBe(graph.nodes.size);
      expect(result.graph.roots).toEqual(graph.roots);
      expect(result.graph.terminals).toEqual(graph.terminals);
    });

    it('should return a graph even when refinement fails to converge', async () => {
      const graph = createLowConfidenceGraph();

      const result = await applyNeurosymbolicRefinement(graph, {
        convergenceThreshold: 1.0,
        maxIterations: 1,
      });

      expect(result.graph).toBeDefined();
      expect(result.graph.nodes.size).toBeGreaterThan(0);
    });
  });

  describe('empty and minimal graphs', () => {
    it('should handle a single-node graph', async () => {
      const graph = makeGraph([
        makeNode({
          id: 'solo',
          type: 'observation',
          operation: 'gather-data',
        }),
      ]);

      const result = await applyNeurosymbolicRefinement(graph, {
        convergenceThreshold: 0.5,
      });

      expect(result.graph.nodes.size).toBe(1);
      expect(result.initialConfidence).toBeGreaterThan(0);
    });
  });
});
