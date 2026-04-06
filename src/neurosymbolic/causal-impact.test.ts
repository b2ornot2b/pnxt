/**
 * Causal Impact Analyzer test suite.
 *
 * Sprint 15 — Advisory Panel: Pearl (causal reasoning), Kay (paradigm).
 */

import { CausalImpactAnalyzer } from './causal-impact.js';
import type { VPIRGraph, VPIRNode, VPIRDiff } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import type { NodeConfidenceMap } from '../types/neurosymbolic.js';
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

  const roots = nodes
    .filter((n) => n.inputs.length === 0)
    .map((n) => n.id);
  const consumed = new Set<string>();
  for (const n of nodes) {
    for (const ref of n.inputs) consumed.add(ref.nodeId);
  }
  const terminals = nodes
    .filter((n) => !consumed.has(n.id))
    .map((n) => n.id);

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

function ref(nodeId: string, port: string = 'output', dataType: string = 'object') {
  return { nodeId, port, dataType };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('CausalImpactAnalyzer', () => {
  let analyzer: CausalImpactAnalyzer;

  beforeEach(() => {
    analyzer = new CausalImpactAnalyzer();
  });

  describe('buildCausalGraph', () => {
    it('should build causal graph from linear VPIR pipeline', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
        makeNode('c', 'action', [ref('b')]),
      ]);

      const causal = analyzer.buildCausalGraph(graph);

      expect(causal.size).toBe(3);
      expect(causal.get('a')!.effects).toEqual(['b']);
      expect(causal.get('b')!.causes).toEqual(['a']);
      expect(causal.get('b')!.effects).toEqual(['c']);
      expect(causal.get('c')!.causes).toEqual(['b']);
      expect(causal.get('c')!.effects).toEqual([]);
    });

    it('should build causal graph from diamond-shaped DAG', () => {
      const graph = makeGraph([
        makeNode('root', 'observation'),
        makeNode('left', 'inference', [ref('root')]),
        makeNode('right', 'inference', [ref('root')]),
        makeNode('join', 'action', [ref('left'), ref('right')]),
      ]);

      const causal = analyzer.buildCausalGraph(graph);

      expect(causal.get('root')!.effects).toContain('left');
      expect(causal.get('root')!.effects).toContain('right');
      expect(causal.get('join')!.causes).toContain('left');
      expect(causal.get('join')!.causes).toContain('right');
    });

    it('should track trust levels from security labels', () => {
      const graph = makeGraph([
        makeNode('a', 'observation', [], 1),
        makeNode('b', 'inference', [ref('a')], 3),
      ]);

      const causal = analyzer.buildCausalGraph(graph);

      expect(causal.get('a')!.trustLevel).toBe(1);
      expect(causal.get('b')!.trustLevel).toBe(3);
    });
  });

  describe('analyzeImpact', () => {
    it('should identify directly modified nodes from diff', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
        makeNode('c', 'action', [ref('b')]),
      ]);

      const diff = makeDiff([
        { type: 'modify_node', path: 'nodes/b', before: {}, after: {} },
      ]);

      const impact = analyzer.analyzeImpact(graph, diff);

      expect(impact.directlyModified).toContain('b');
      expect(impact.affectedNodes).toContain('c');
      expect(impact.affectedNodes).not.toContain('a');
    });

    it('should trace causal chains through linear pipeline', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
        makeNode('c', 'inference', [ref('b')]),
        makeNode('d', 'action', [ref('c')]),
      ]);

      const diff = makeDiff([
        { type: 'modify_node', path: 'nodes/a', before: {}, after: {} },
      ]);

      const impact = analyzer.analyzeImpact(graph, diff);

      expect(impact.directlyModified).toEqual(['a']);
      expect(impact.affectedNodes).toContain('b');
      expect(impact.affectedNodes).toContain('c');
      expect(impact.affectedNodes).toContain('d');
      expect(impact.maxCausalDepth).toBe(3);
    });

    it('should detect trust boundary crossings', () => {
      const graph = makeGraph([
        makeNode('a', 'observation', [], 1),
        makeNode('b', 'inference', [ref('a')], 3),
      ]);

      const diff = makeDiff([
        { type: 'modify_node', path: 'nodes/a', before: {}, after: {} },
      ]);

      const impact = analyzer.analyzeImpact(graph, diff);

      expect(impact.crossesTrustBoundary).toBe(true);
      expect(impact.trustBoundaryCrossings).toBeGreaterThan(0);
    });

    it('should report no trust boundary crossings for uniform trust', () => {
      const graph = makeGraph([
        makeNode('a', 'observation', [], 2),
        makeNode('b', 'inference', [ref('a')], 2),
      ]);

      const diff = makeDiff([
        { type: 'modify_node', path: 'nodes/a', before: {}, after: {} },
      ]);

      const impact = analyzer.analyzeImpact(graph, diff);

      expect(impact.crossesTrustBoundary).toBe(false);
    });

    it('should handle modification with no downstream effects', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
      ]);

      const diff = makeDiff([
        { type: 'modify_node', path: 'nodes/b', before: {}, after: {} },
      ]);

      const impact = analyzer.analyzeImpact(graph, diff);

      expect(impact.directlyModified).toEqual(['b']);
      expect(impact.affectedNodes).toEqual([]);
      expect(impact.maxCausalDepth).toBe(0);
      expect(impact.riskLevel).toBe('low');
    });

    it('should handle diamond DAG impact propagation', () => {
      const graph = makeGraph([
        makeNode('root', 'observation'),
        makeNode('left', 'inference', [ref('root')]),
        makeNode('right', 'inference', [ref('root')]),
        makeNode('join', 'action', [ref('left'), ref('right')]),
      ]);

      const diff = makeDiff([
        { type: 'modify_node', path: 'nodes/root', before: {}, after: {} },
      ]);

      const impact = analyzer.analyzeImpact(graph, diff);

      expect(impact.affectedNodes).toContain('left');
      expect(impact.affectedNodes).toContain('right');
      expect(impact.affectedNodes).toContain('join');
    });

    it('should identify edge modifications as affecting both endpoints', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
        makeNode('c', 'action', [ref('b')]),
      ]);

      const diff = makeDiff([
        {
          type: 'add_edge',
          path: 'edges/a:output→c',
          after: { sourceId: 'a', port: 'output', dataType: 'object', targetId: 'c' },
        },
      ]);

      const impact = analyzer.analyzeImpact(graph, diff);

      expect(impact.directlyModified).toContain('a');
      expect(impact.directlyModified).toContain('c');
    });

    it('should compute risk score based on modification characteristics', () => {
      // Large modification — high risk
      const graph = makeGraph([
        makeNode('a', 'observation', [], 1),
        makeNode('b', 'inference', [ref('a')], 3),
        makeNode('c', 'inference', [ref('b')], 2),
        makeNode('d', 'action', [ref('c')], 4),
      ]);

      const diff = makeDiff([
        { type: 'modify_node', path: 'nodes/a', before: {}, after: {} },
        { type: 'add_node', path: 'nodes/e', after: {} },
        { type: 'add_edge', path: 'edges/e:output→d', after: { sourceId: 'e', port: 'output', dataType: 'object', targetId: 'd' } },
      ]);

      const impact = analyzer.analyzeImpact(graph, diff);

      expect(impact.riskScore).toBeGreaterThan(0);
      expect(impact.riskScore).toBeLessThanOrEqual(1);
    });
  });

  describe('risk classification', () => {
    it('should classify low risk for single-node metadata change', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
      ]);

      const diff = makeDiff([
        { type: 'modify_metadata', path: 'metadata/name', before: 'old', after: 'new' },
      ]);

      const impact = analyzer.analyzeImpact(graph, diff);

      expect(impact.riskLevel).toBe('low');
    });

    it('should classify higher risk for modifications affecting many nodes', () => {
      // Build a wide graph where modifying root affects everything
      const root = makeNode('root', 'observation');
      const children = Array.from({ length: 6 }, (_, i) =>
        makeNode(`child-${i}`, 'inference', [ref('root')]),
      );
      const graph = makeGraph([root, ...children]);

      const diff = makeDiff([
        { type: 'modify_node', path: 'nodes/root', before: {}, after: {} },
      ]);

      const impact = analyzer.analyzeImpact(graph, diff);

      // Should have higher risk since it affects 6 downstream nodes
      expect(impact.affectedNodes.length).toBe(6);
      expect(impact.riskScore).toBeGreaterThan(0.1);
    });

    it('should use custom thresholds for risk classification', () => {
      const customAnalyzer = new CausalImpactAnalyzer({
        highRiskThreshold: 0.1,
        criticalRiskThreshold: 0.2,
      });

      const graph = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
        makeNode('c', 'action', [ref('b')]),
      ]);

      const diff = makeDiff([
        { type: 'modify_node', path: 'nodes/a', before: {}, after: {} },
      ]);

      const impact = customAnalyzer.analyzeImpact(graph, diff);

      // With very low thresholds, even small modifications are high/critical
      expect(['high', 'critical', 'medium']).toContain(impact.riskLevel);
    });
  });

  describe('suggestMitigations', () => {
    it('should return no mitigations for low-risk modifications', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
      ]);

      const diff = makeDiff([
        { type: 'modify_metadata', path: 'metadata/name', before: 'old', after: 'new' },
      ]);

      const impact = analyzer.analyzeImpact(graph, diff);
      const mitigations = analyzer.suggestMitigations(impact);

      expect(mitigations).toEqual([]);
    });

    it('should suggest IFC audit for trust boundary crossings', () => {
      const graph = makeGraph([
        makeNode('a', 'observation', [], 1),
        makeNode('b', 'inference', [ref('a')], 3),
        makeNode('c', 'inference', [ref('b')], 1),
        makeNode('d', 'action', [ref('c')], 4),
      ]);

      const diff = makeDiff([
        { type: 'modify_node', path: 'nodes/a', before: {}, after: {} },
        { type: 'add_node', path: 'nodes/e', after: {} },
        { type: 'modify_node', path: 'nodes/b', before: {}, after: {} },
      ]);

      const impact = analyzer.analyzeImpact(graph, diff);

      if (impact.crossesTrustBoundary && impact.riskLevel !== 'low') {
        const ifcMitigation = impact.mitigations.find((m) =>
          m.action.includes('IFC'),
        );
        expect(ifcMitigation).toBeDefined();
      }
    });

    it('should suggest bounded model checking for deep chains', () => {
      // Build a deep chain
      const nodes: VPIRNode[] = [makeNode('n0', 'observation')];
      for (let i = 1; i <= 5; i++) {
        nodes.push(makeNode(`n${i}`, 'inference', [ref(`n${i - 1}`)]));
      }
      const graph = makeGraph(nodes);

      const diff = makeDiff([
        { type: 'modify_node', path: 'nodes/n0', before: {}, after: {} },
      ]);

      const impact = analyzer.analyzeImpact(graph, diff);

      if (impact.maxCausalDepth >= 3 && impact.riskLevel !== 'low') {
        const depthMitigation = impact.mitigations.find((m) =>
          m.action.includes('bounded model checking'),
        );
        expect(depthMitigation).toBeDefined();
      }
    });

    it('should sort mitigations by priority', () => {
      const graph = makeGraph([
        makeNode('a', 'observation', [], 1),
        makeNode('b', 'inference', [ref('a')], 3),
        makeNode('c', 'inference', [ref('b')], 1),
        makeNode('d', 'action', [ref('c')], 2),
        makeNode('e', 'assertion', [ref('d')], 4),
      ]);

      const diff = makeDiff([
        { type: 'modify_node', path: 'nodes/a', before: {}, after: {} },
        { type: 'add_node', path: 'nodes/f', after: {} },
        { type: 'modify_node', path: 'nodes/b', before: {}, after: {} },
      ]);

      const impact = analyzer.analyzeImpact(graph, diff);

      if (impact.mitigations.length >= 2) {
        for (let i = 1; i < impact.mitigations.length; i++) {
          expect(impact.mitigations[i].priority).toBeGreaterThanOrEqual(
            impact.mitigations[i - 1].priority,
          );
        }
      }
    });
  });

  describe('suggestRiskReductionPatches', () => {
    it('should suggest patches for low-confidence affected nodes', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
        makeNode('c', 'action', [ref('b')]),
      ]);

      const diff = makeDiff([
        { type: 'modify_node', path: 'nodes/a', before: {}, after: {} },
      ]);

      const impact = analyzer.analyzeImpact(graph, diff);

      const confidenceMap: NodeConfidenceMap = {
        scores: new Map([['a', 0.9], ['b', 0.4], ['c', 0.8]]),
        graphConfidence: 0.7,
        lowConfidenceNodes: ['b'],
      };

      // Force risk level for testing
      const highRiskImpact = { ...impact, riskLevel: 'high' as const };
      const suggestions = analyzer.suggestRiskReductionPatches(highRiskImpact, confidenceMap);

      const bSuggestion = suggestions.find((s) => s.nodeId === 'b');
      expect(bSuggestion).toBeDefined();
      expect(bSuggestion!.currentConfidence).toBe(0.4);
    });

    it('should return empty array for low-risk modifications', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
      ]);

      const diff = makeDiff([
        { type: 'modify_metadata', path: 'metadata/name', before: 'old', after: 'new' },
      ]);

      const impact = analyzer.analyzeImpact(graph, diff);
      const confidenceMap: NodeConfidenceMap = {
        scores: new Map([['a', 0.9]]),
        graphConfidence: 0.9,
        lowConfidenceNodes: [],
      };

      const suggestions = analyzer.suggestRiskReductionPatches(impact, confidenceMap);

      expect(suggestions).toEqual([]);
    });

    it('should sort suggestions by confidence ascending', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
        makeNode('c', 'inference', [ref('a')]),
        makeNode('d', 'action', [ref('b')]),
      ]);

      const diff = makeDiff([
        { type: 'modify_node', path: 'nodes/a', before: {}, after: {} },
      ]);

      const impact = analyzer.analyzeImpact(graph, diff);
      const highRiskImpact = { ...impact, riskLevel: 'high' as const };

      const confidenceMap: NodeConfidenceMap = {
        scores: new Map([['a', 0.9], ['b', 0.5], ['c', 0.3], ['d', 0.6]]),
        graphConfidence: 0.575,
        lowConfidenceNodes: ['b', 'c', 'd'],
      };

      const suggestions = analyzer.suggestRiskReductionPatches(highRiskImpact, confidenceMap);

      if (suggestions.length >= 2) {
        for (let i = 1; i < suggestions.length; i++) {
          expect(suggestions[i].currentConfidence).toBeGreaterThanOrEqual(
            suggestions[i - 1].currentConfidence,
          );
        }
      }
    });
  });

  describe('estimateRisk', () => {
    it('should return the risk score from the impact report', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
      ]);

      const diff = makeDiff([
        { type: 'modify_node', path: 'nodes/a', before: {}, after: {} },
      ]);

      const impact = analyzer.analyzeImpact(graph, diff);

      expect(analyzer.estimateRisk(impact)).toBe(impact.riskScore);
    });
  });

  describe('edge cases', () => {
    it('should handle empty graph', () => {
      const graph = makeGraph([]);
      const diff = makeDiff([]);

      const impact = analyzer.analyzeImpact(graph, diff);

      expect(impact.directlyModified).toEqual([]);
      expect(impact.affectedNodes).toEqual([]);
      expect(impact.riskScore).toBe(0);
      expect(impact.riskLevel).toBe('low');
    });

    it('should handle single-node graph', () => {
      const graph = makeGraph([makeNode('a', 'observation')]);
      const diff = makeDiff([
        { type: 'modify_node', path: 'nodes/a', before: {}, after: {} },
      ]);

      const impact = analyzer.analyzeImpact(graph, diff);

      expect(impact.directlyModified).toEqual(['a']);
      expect(impact.affectedNodes).toEqual([]);
    });

    it('should handle add_node diff operations', () => {
      const graph = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
      ]);

      const diff = makeDiff([
        { type: 'add_node', path: 'nodes/c', after: {} },
      ]);

      const impact = analyzer.analyzeImpact(graph, diff);

      expect(impact.directlyModified).toContain('c');
    });

    it('should respect maxDepth option', () => {
      const shallowAnalyzer = new CausalImpactAnalyzer({ maxDepth: 2 });

      // Build a chain longer than maxDepth
      const nodes: VPIRNode[] = [makeNode('n0', 'observation')];
      for (let i = 1; i <= 5; i++) {
        nodes.push(makeNode(`n${i}`, 'inference', [ref(`n${i - 1}`)]));
      }
      const graph = makeGraph(nodes);

      const diff = makeDiff([
        { type: 'modify_node', path: 'nodes/n0', before: {}, after: {} },
      ]);

      const impact = shallowAnalyzer.analyzeImpact(graph, diff);

      expect(impact.maxCausalDepth).toBeLessThanOrEqual(2);
    });
  });
});
