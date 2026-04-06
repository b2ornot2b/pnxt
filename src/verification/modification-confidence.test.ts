/**
 * Modification Confidence Scorer test suite.
 *
 * Sprint 15 — Advisory Panel: Pearl (causal), de Moura (SMT).
 */

import { scoreModificationConfidence } from './modification-confidence.js';
import type { ConfidenceInput } from './modification-confidence.js';
import type { PreservationResult } from './z3-diff-verifier.js';
import type { CausalImpactReport } from '../neurosymbolic/causal-impact.js';
import type { VPIRGraph, VPIRNode, VPIRDiff } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import { createLabel } from '../types/ifc.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeLabel(trust: number = 2): SecurityLabel {
  return createLabel('test', trust as 0 | 1 | 2 | 3 | 4, 'internal');
}

function makeNode(
  id: string,
  type: VPIRNode['type'],
  inputs: Array<{ nodeId: string; port: string; dataType: string }> = [],
  trust: number = 2,
): VPIRNode {
  return {
    id,
    type,
    operation: `${type} ${id}`,
    inputs,
    outputs: [{ port: 'output', dataType: 'object' }],
    evidence: [{ type: 'data', source: 'test', confidence: 0.9 }],
    label: makeLabel(trust),
    verifiable: true,
    createdAt: new Date().toISOString(),
  };
}

function makeGraph(nodes: VPIRNode[]): VPIRGraph {
  const nodeMap = new Map<string, VPIRNode>();
  for (const n of nodes) nodeMap.set(n.id, n);
  const roots = nodes.filter((n) => n.inputs.length === 0).map((n) => n.id);
  const consumed = new Set<string>();
  for (const n of nodes) for (const ref of n.inputs) consumed.add(ref.nodeId);
  const terminals = nodes.filter((n) => !consumed.has(n.id)).map((n) => n.id);

  return {
    id: 'test-graph',
    name: 'Test Graph',
    nodes: nodeMap,
    roots,
    terminals,
    createdAt: new Date().toISOString(),
  };
}

function makeDiff(operations: VPIRDiff['operations']): VPIRDiff {
  return {
    id: 'test-diff',
    sourceGraphId: 'test-graph',
    targetGraphId: 'test-graph-modified',
    operations,
    metadata: { createdAt: new Date().toISOString() },
  };
}

function ref(nodeId: string): { nodeId: string; port: string; dataType: string } {
  return { nodeId, port: 'output', dataType: 'object' };
}

function makePreservation(props: Array<{ name: string; preserved: boolean; transported: boolean }>): PreservationResult {
  return {
    preserved: props.every((p) => p.preserved),
    properties: props.map((p) => ({
      name: p.name,
      method: p.transported ? 'transport' as const : 'reverify' as const,
      status: p.preserved ? 'preserved' as const : 'violated' as const,
    })),
    transportedCount: props.filter((p) => p.transported).length,
    reverifiedCount: props.filter((p) => !p.transported).length,
    failedCount: props.filter((p) => !p.preserved).length,
    totalTimeMs: 10,
  };
}

function makeCausalImpact(riskScore: number): CausalImpactReport {
  return {
    directlyModified: ['a'],
    affectedNodes: ['b'],
    causalChains: [],
    riskScore,
    riskLevel: riskScore >= 0.8 ? 'critical' : riskScore >= 0.6 ? 'high' : riskScore >= 0.3 ? 'medium' : 'low',
    maxCausalDepth: 1,
    crossesTrustBoundary: false,
    trustBoundaryCrossings: 0,
    mitigations: [],
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Modification Confidence Scorer', () => {
  describe('scoreModificationConfidence', () => {
    it('should return high confidence for metadata-only change', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
      ]);

      const input: ConfidenceInput = {
        beforeGraph: graph,
        afterGraph: { ...graph, name: 'Renamed Graph' },
        diff: makeDiff([
          { type: 'modify_metadata', path: 'metadata/name', before: 'Test', after: 'Renamed' },
        ]),
      };

      const result = scoreModificationConfidence(input);

      expect(result.structuralSafety).toBeGreaterThan(0.8);
      expect(result.composite).toBeGreaterThan(0.5);
      expect(result.rollbackFeasibility).toBe(1.0);
    });

    it('should return lower confidence for node removal', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
        makeNode('c', 'action', [ref('b')]),
      ]);

      const input: ConfidenceInput = {
        beforeGraph: graph,
        afterGraph: makeGraph([
          makeNode('a', 'observation'),
          makeNode('c', 'action', [ref('a')]),
        ]),
        diff: makeDiff([
          { type: 'remove_node', path: 'nodes/b', before: {} },
          { type: 'reroute_edge', path: 'edges/b:output→c', before: {}, after: {} },
        ]),
      };

      const result = scoreModificationConfidence(input);

      // Removal is more risky
      expect(result.structuralSafety).toBeLessThan(1.0);
    });

    it('should score all five dimensions', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
      ]);

      const input: ConfidenceInput = {
        beforeGraph: graph,
        afterGraph: graph,
        diff: makeDiff([
          { type: 'modify_node', path: 'nodes/b', before: {}, after: {} },
        ]),
      };

      const result = scoreModificationConfidence(input);

      expect(result.structuralSafety).toBeGreaterThanOrEqual(0);
      expect(result.structuralSafety).toBeLessThanOrEqual(1);
      expect(result.propertyPreservation).toBeGreaterThanOrEqual(0);
      expect(result.propertyPreservation).toBeLessThanOrEqual(1);
      expect(result.ifcCompliance).toBeGreaterThanOrEqual(0);
      expect(result.ifcCompliance).toBeLessThanOrEqual(1);
      expect(result.causalImpact).toBeGreaterThanOrEqual(0);
      expect(result.causalImpact).toBeLessThanOrEqual(1);
      expect(result.rollbackFeasibility).toBeGreaterThanOrEqual(0);
      expect(result.rollbackFeasibility).toBeLessThanOrEqual(1);
      expect(result.composite).toBeGreaterThanOrEqual(0);
      expect(result.composite).toBeLessThanOrEqual(1);
    });

    it('should incorporate preservation results', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
      ]);

      const allPreserved = makePreservation([
        { name: 'acyclicity', preserved: true, transported: true },
        { name: 'ifc_monotonicity', preserved: true, transported: true },
        { name: 'input_completeness', preserved: true, transported: false },
      ]);

      const someViolated = makePreservation([
        { name: 'acyclicity', preserved: true, transported: true },
        { name: 'ifc_monotonicity', preserved: false, transported: false },
        { name: 'input_completeness', preserved: false, transported: false },
      ]);

      const inputPreserved: ConfidenceInput = {
        beforeGraph: graph,
        afterGraph: graph,
        diff: makeDiff([]),
        preservation: allPreserved,
      };

      const inputViolated: ConfidenceInput = {
        beforeGraph: graph,
        afterGraph: graph,
        diff: makeDiff([]),
        preservation: someViolated,
      };

      const resultPreserved = scoreModificationConfidence(inputPreserved);
      const resultViolated = scoreModificationConfidence(inputViolated);

      expect(resultPreserved.propertyPreservation).toBeGreaterThan(
        resultViolated.propertyPreservation,
      );
    });

    it('should incorporate causal impact results', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
      ]);

      const lowRiskInput: ConfidenceInput = {
        beforeGraph: graph,
        afterGraph: graph,
        diff: makeDiff([]),
        causalImpact: makeCausalImpact(0.1),
      };

      const highRiskInput: ConfidenceInput = {
        beforeGraph: graph,
        afterGraph: graph,
        diff: makeDiff([]),
        causalImpact: makeCausalImpact(0.9),
      };

      const lowRiskResult = scoreModificationConfidence(lowRiskInput);
      const highRiskResult = scoreModificationConfidence(highRiskInput);

      expect(lowRiskResult.causalImpact).toBeGreaterThan(highRiskResult.causalImpact);
      expect(lowRiskResult.composite).toBeGreaterThan(highRiskResult.composite);
    });
  });

  describe('IFC compliance scoring', () => {
    it('should score 1.0 for fully compliant graph', () => {
      const graph = makeGraph([
        makeNode('a', 'observation', [], 1),
        makeNode('b', 'inference', [ref('a')], 2),
        makeNode('c', 'action', [ref('b')], 3),
      ]);

      const input: ConfidenceInput = {
        beforeGraph: graph,
        afterGraph: graph,
        diff: makeDiff([]),
      };

      const result = scoreModificationConfidence(input);

      expect(result.ifcCompliance).toBe(1.0);
    });

    it('should score less than 1.0 for IFC violations', () => {
      // Trust flows downward — violation
      const graph = makeGraph([
        makeNode('a', 'observation', [], 3),
        makeNode('b', 'inference', [ref('a')], 1),
      ]);

      const input: ConfidenceInput = {
        beforeGraph: graph,
        afterGraph: graph,
        diff: makeDiff([]),
      };

      const result = scoreModificationConfidence(input);

      expect(result.ifcCompliance).toBeLessThan(1.0);
    });

    it('should score 1.0 for graph with no edges', () => {
      const graph = makeGraph([
        makeNode('a', 'observation', [], 1),
        makeNode('b', 'observation', [], 4),
      ]);

      const input: ConfidenceInput = {
        beforeGraph: graph,
        afterGraph: graph,
        diff: makeDiff([]),
      };

      const result = scoreModificationConfidence(input);

      expect(result.ifcCompliance).toBe(1.0);
    });
  });

  describe('decision classification', () => {
    it('should auto-approve high-confidence modifications', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
      ]);

      const input: ConfidenceInput = {
        beforeGraph: graph,
        afterGraph: graph,
        diff: makeDiff([
          { type: 'modify_metadata', path: 'metadata/name', before: 'old', after: 'new' },
        ]),
        preservation: makePreservation([
          { name: 'acyclicity', preserved: true, transported: true },
        ]),
        causalImpact: makeCausalImpact(0.0),
      };

      const result = scoreModificationConfidence(input);

      expect(result.decision).toBe('auto-approve');
    });

    it('should reject low-confidence modifications', () => {
      // Graph with IFC violations
      const graph = makeGraph([
        makeNode('a', 'observation', [], 4),
        makeNode('b', 'inference', [ref('a')], 0),
      ]);

      const input: ConfidenceInput = {
        beforeGraph: graph,
        afterGraph: graph,
        diff: makeDiff([
          { type: 'remove_node', path: 'nodes/a', before: {} },
          { type: 'remove_node', path: 'nodes/b', before: {} },
          { type: 'add_node', path: 'nodes/c', after: {} },
          { type: 'add_node', path: 'nodes/d', after: {} },
          { type: 'add_node', path: 'nodes/e', after: {} },
        ]),
        preservation: makePreservation([
          { name: 'acyclicity', preserved: false, transported: false },
          { name: 'ifc_monotonicity', preserved: false, transported: false },
        ]),
        causalImpact: makeCausalImpact(0.95),
      };

      const result = scoreModificationConfidence(input);

      expect(result.decision).toBe('reject');
    });

    it('should use custom thresholds', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
      ]);

      const input: ConfidenceInput = {
        beforeGraph: graph,
        afterGraph: graph,
        diff: makeDiff([]),
      };

      // Very high threshold for auto-approve
      const result = scoreModificationConfidence(input, {
        thresholds: { autoApprove: 0.99, requireReview: 0.98 },
      });

      // Without preservation and causal data, score should be neutral (~0.5-0.7)
      expect(result.decision).not.toBe('auto-approve');
    });
  });

  describe('property preservation scoring', () => {
    it('should give bonus for high transport ratio', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
      ]);

      const allTransported = makePreservation([
        { name: 'p1', preserved: true, transported: true },
        { name: 'p2', preserved: true, transported: true },
        { name: 'p3', preserved: true, transported: true },
      ]);

      const noneTransported = makePreservation([
        { name: 'p1', preserved: true, transported: false },
        { name: 'p2', preserved: true, transported: false },
        { name: 'p3', preserved: true, transported: false },
      ]);

      const inputTransported: ConfidenceInput = {
        beforeGraph: graph,
        afterGraph: graph,
        diff: makeDiff([]),
        preservation: allTransported,
      };

      const inputReverified: ConfidenceInput = {
        beforeGraph: graph,
        afterGraph: graph,
        diff: makeDiff([]),
        preservation: noneTransported,
      };

      const rTransported = scoreModificationConfidence(inputTransported);
      const rReverified = scoreModificationConfidence(inputReverified);

      expect(rTransported.propertyPreservation).toBeGreaterThanOrEqual(
        rReverified.propertyPreservation,
      );
    });

    it('should return 0.5 when no preservation data is available', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
      ]);

      const input: ConfidenceInput = {
        beforeGraph: graph,
        afterGraph: graph,
        diff: makeDiff([]),
        // No preservation result
      };

      const result = scoreModificationConfidence(input);

      expect(result.propertyPreservation).toBe(0.5);
    });
  });

  describe('rollback feasibility', () => {
    it('should score 1.0 for metadata-only changes', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
      ]);

      const input: ConfidenceInput = {
        beforeGraph: graph,
        afterGraph: graph,
        diff: makeDiff([
          { type: 'modify_metadata', path: 'metadata/name', before: 'old', after: 'new' },
        ]),
      };

      const result = scoreModificationConfidence(input);

      expect(result.rollbackFeasibility).toBe(1.0);
    });

    it('should score well for diffs with matching inverse operations', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
      ]);

      const input: ConfidenceInput = {
        beforeGraph: graph,
        afterGraph: graph,
        diff: makeDiff([
          { type: 'modify_node', path: 'nodes/b', before: { op: 'old' }, after: { op: 'new' } },
        ]),
      };

      const result = scoreModificationConfidence(input);

      expect(result.rollbackFeasibility).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty diff', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
      ]);

      const input: ConfidenceInput = {
        beforeGraph: graph,
        afterGraph: graph,
        diff: makeDiff([]),
      };

      const result = scoreModificationConfidence(input);

      expect(result.composite).toBeGreaterThan(0);
      expect(result.structuralSafety).toBe(1.0);
    });

    it('should handle empty graph', () => {
      const graph = makeGraph([]);

      const input: ConfidenceInput = {
        beforeGraph: graph,
        afterGraph: graph,
        diff: makeDiff([]),
      };

      const result = scoreModificationConfidence(input);

      expect(result.composite).toBeGreaterThan(0);
    });

    it('should clamp composite to [0, 1]', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
      ]);

      const input: ConfidenceInput = {
        beforeGraph: graph,
        afterGraph: graph,
        diff: makeDiff([]),
        preservation: makePreservation([
          { name: 'p1', preserved: true, transported: true },
        ]),
        causalImpact: makeCausalImpact(0.0),
      };

      const result = scoreModificationConfidence(input);

      expect(result.composite).toBeGreaterThanOrEqual(0);
      expect(result.composite).toBeLessThanOrEqual(1);
    });
  });
});
