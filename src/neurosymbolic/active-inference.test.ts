/**
 * Active Inference Engine test suite.
 *
 * Sprint 8 — Advisory Panel: Judea Pearl (neurosymbolic bridge).
 */

import { ActiveInferenceEngine } from './active-inference.js';
import type { VPIRGraph, VPIRNode, VPIROutput, VPIRRef, Evidence } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import type { NodeConfidenceMap } from '../types/neurosymbolic.js';
import type { ProgramVerificationResult } from '../types/verification.js';
import { createLabel } from '../types/ifc.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeLabel(trust: number = 2): SecurityLabel {
  return createLabel('test', trust as 0 | 1 | 2 | 3 | 4, 'internal');
}

function makeEvidence(
  type: 'data' | 'rule' | 'model_output' = 'data',
  confidence: number = 0.9,
): Evidence {
  return { type, source: 'test', confidence };
}

function makeOutput(port: string, dataType: string): VPIROutput {
  return { port, dataType };
}

function makeRef(nodeId: string, port: string, dataType: string = 'any'): VPIRRef {
  return { nodeId, port, dataType };
}

function makeNode(
  id: string,
  type: 'observation' | 'inference' | 'action' | 'assertion' | 'composition',
  opts: {
    inputs?: VPIRRef[];
    outputs?: VPIROutput[];
    evidence?: Evidence[];
  } = {},
): VPIRNode {
  return {
    id,
    type,
    operation: `Test ${type} ${id}`,
    inputs: opts.inputs ?? [],
    outputs: opts.outputs ?? [makeOutput('out', 'TestData')],
    evidence: opts.evidence ?? [makeEvidence()],
    label: makeLabel(),
    verifiable: true,
    createdAt: new Date().toISOString(),
  };
}

function makeGraph(nodes: VPIRNode[]): VPIRGraph {
  const nodeMap = new Map<string, VPIRNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const roots = nodes.filter((n) => n.inputs.length === 0).map((n) => n.id);
  const consumed = new Set(nodes.flatMap((n) => n.inputs.map((i) => i.nodeId)));
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

function makeConfidenceMap(
  entries: Array<[string, number]>,
): NodeConfidenceMap {
  const scores = new Map(entries);
  const allScores = entries.map(([, s]) => s);
  const graphConfidence =
    allScores.length > 0
      ? allScores.reduce((sum, s) => sum + s, 0) / allScores.length
      : 0;
  const lowConfidenceNodes = entries
    .filter(([, s]) => s < 0.6)
    .map(([id]) => id);

  return { scores, graphConfidence, lowConfidenceNodes };
}

function makeFailedResult(
  nodeIds: string[],
  propId: string,
): ProgramVerificationResult {
  return {
    verified: false,
    solver: 'z3',
    duration: 10,
    property: 'user_invariant',
    programProperty: {
      id: propId,
      kind: 'invariant',
      targetNodes: nodeIds,
      formula: '(>= trust 2)',
      description: `Test property ${propId}`,
    },
    boundVariables: {},
  };
}

function makePassedResult(
  nodeIds: string[],
  propId: string,
): ProgramVerificationResult {
  return {
    ...makeFailedResult(nodeIds, propId),
    verified: true,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('ActiveInferenceEngine', () => {
  let engine: ActiveInferenceEngine;

  beforeEach(() => {
    engine = new ActiveInferenceEngine();
  });

  describe('identifyPatchTargets', () => {
    it('should rank targets by free energy (1-confidence) * failures', () => {
      const obs = makeNode('obs', 'observation');
      const inf = makeNode('inf', 'inference', {
        inputs: [makeRef('obs', 'out')],
      });
      const act = makeNode('act', 'action', {
        inputs: [makeRef('inf', 'out')],
      });
      const graph = makeGraph([obs, inf, act]);

      const confidenceMap = makeConfidenceMap([
        ['obs', 0.9],
        ['inf', 0.3], // Low confidence
        ['act', 0.4], // Low confidence
      ]);

      // inf blocks 2 properties, act blocks 1
      const failed = [
        makeFailedResult(['inf'], 'prop-1'),
        makeFailedResult(['inf'], 'prop-2'),
        makeFailedResult(['act'], 'prop-3'),
      ];

      const targets = engine.identifyPatchTargets(graph, failed, confidenceMap);

      expect(targets.length).toBe(2);
      // inf: (1-0.3)*2 = 1.4, act: (1-0.4)*1 = 0.6
      expect(targets[0].nodeId).toBe('inf');
      expect(targets[1].nodeId).toBe('act');
    });

    it('should respect patch budget', () => {
      const nodes = Array.from({ length: 5 }, (_, i) =>
        makeNode(`n${i}`, 'observation'),
      );
      const graph = makeGraph(nodes);
      const confidenceMap = makeConfidenceMap(
        nodes.map((n) => [n.id, 0.3] as [string, number]),
      );
      const failed = nodes.map((n) =>
        makeFailedResult([n.id], `prop-${n.id}`),
      );

      const targets = engine.identifyPatchTargets(graph, failed, confidenceMap, 2);

      expect(targets.length).toBe(2);
    });

    it('should include 1-hop context nodes', () => {
      const obs = makeNode('obs', 'observation', {
        outputs: [makeOutput('data', 'X')],
      });
      const inf = makeNode('inf', 'inference', {
        inputs: [makeRef('obs', 'data', 'X')],
        outputs: [makeOutput('result', 'Y')],
      });
      const act = makeNode('act', 'action', {
        inputs: [makeRef('inf', 'result', 'Y')],
      });
      const graph = makeGraph([obs, inf, act]);

      const confidenceMap = makeConfidenceMap([
        ['obs', 0.9],
        ['inf', 0.2],
        ['act', 0.8],
      ]);
      const failed = [makeFailedResult(['inf'], 'prop-1')];

      const targets = engine.identifyPatchTargets(graph, failed, confidenceMap);

      expect(targets[0].nodeId).toBe('inf');
      expect(targets[0].contextNodes).toContain('obs'); // input provider
      expect(targets[0].contextNodes).toContain('act'); // output consumer
    });

    it('should skip oscillating nodes', () => {
      const node = makeNode('osc', 'observation');
      const graph = makeGraph([node]);
      const failed = [makeFailedResult(['osc'], 'prop-1')];

      // Simulate oscillation: confidence goes up-down-up
      engine.recordConfidence(makeConfidenceMap([['osc', 0.3]]));
      engine.recordConfidence(makeConfidenceMap([['osc', 0.6]]));
      engine.recordConfidence(makeConfidenceMap([['osc', 0.3]]));

      const confidenceMap = makeConfidenceMap([['osc', 0.3]]);
      const targets = engine.identifyPatchTargets(graph, failed, confidenceMap);

      expect(targets.length).toBe(0);
    });

    it('should return empty array when no properties failed', () => {
      const node = makeNode('obs', 'observation');
      const graph = makeGraph([node]);
      const confidenceMap = makeConfidenceMap([['obs', 0.9]]);

      const targets = engine.identifyPatchTargets(graph, [], confidenceMap);

      expect(targets).toEqual([]);
    });

    it('should return empty when all failed nodes are verified', () => {
      const node = makeNode('obs', 'observation');
      const graph = makeGraph([node]);
      const confidenceMap = makeConfidenceMap([['obs', 0.5]]);
      const passed = [makePassedResult(['obs'], 'prop-1')];

      const targets = engine.identifyPatchTargets(graph, passed, confidenceMap);

      expect(targets).toEqual([]);
    });

    it('should skip nodes not in graph', () => {
      const node = makeNode('obs', 'observation');
      const graph = makeGraph([node]);
      const confidenceMap = makeConfidenceMap([['obs', 0.9]]);
      const failed = [makeFailedResult(['nonexistent'], 'prop-1')];

      const targets = engine.identifyPatchTargets(graph, failed, confidenceMap);

      expect(targets).toEqual([]);
    });
  });

  describe('generatePatchQuery', () => {
    it('should generate a focused prompt for the target node', () => {
      const obs = makeNode('obs', 'observation');
      const inf = makeNode('inf', 'inference', {
        inputs: [makeRef('obs', 'out')],
      });
      const graph = makeGraph([obs, inf]);

      const target = {
        nodeId: 'inf',
        reason: 'Low confidence (0.30) blocking 2 properties',
        confidence: 0.3,
        failedProperties: ['prop-1', 'prop-2'],
        contextNodes: ['obs'],
      };

      const query = engine.generatePatchQuery(target, graph);

      expect(query.targetNodeId).toBe('inf');
      expect(query.prompt).toContain('inf');
      expect(query.prompt).toContain('prop-1');
      expect(query.prompt).toContain('prop-2');
      expect(query.contextNodes).toHaveLength(1);
      expect(query.contextNodes[0].id).toBe('obs');
      expect(query.constraints).toHaveLength(2);
    });

    it('should handle target node not in graph gracefully', () => {
      const graph = makeGraph([]);
      const target = {
        nodeId: 'missing',
        reason: 'Missing node',
        confidence: 0,
        failedProperties: ['prop-1'],
        contextNodes: [],
      };

      const query = engine.generatePatchQuery(target, graph);

      expect(query.targetNodeId).toBe('missing');
      expect(query.prompt).toContain('missing');
    });
  });

  describe('applyPatch', () => {
    it('should replace the target node in the graph', () => {
      const obs = makeNode('obs', 'observation');
      const inf = makeNode('inf', 'inference', {
        inputs: [makeRef('obs', 'out')],
      });
      const graph = makeGraph([obs, inf]);

      const replacement = makeNode('inf', 'inference', {
        inputs: [makeRef('obs', 'out')],
        evidence: [makeEvidence('model_output', 0.95)],
      });

      const target = {
        nodeId: 'inf',
        reason: 'Low confidence',
        confidence: 0.3,
        failedProperties: ['prop-1'],
        contextNodes: ['obs'],
      };

      const result = engine.applyPatch(graph, target, replacement);

      expect(result.graph.nodes.get('inf')).toBeDefined();
      expect(result.graph.nodes.get('inf')!.evidence[0].confidence).toBe(0.95);
      expect(result.affectedNodes).toContain('inf');
      expect(result.previousConfidence).toBe(0.3);
    });

    it('should include downstream consumers in affectedNodes', () => {
      const obs = makeNode('obs', 'observation');
      const inf = makeNode('inf', 'inference', {
        inputs: [makeRef('obs', 'out')],
      });
      const act = makeNode('act', 'action', {
        inputs: [makeRef('inf', 'out')],
      });
      const graph = makeGraph([obs, inf, act]);

      const replacement = makeNode('inf', 'inference', {
        inputs: [makeRef('obs', 'out')],
      });

      const target = {
        nodeId: 'inf',
        reason: 'Test',
        confidence: 0.3,
        failedProperties: [],
        contextNodes: [],
      };

      const result = engine.applyPatch(graph, target, replacement);

      expect(result.affectedNodes).toContain('inf');
      expect(result.affectedNodes).toContain('act'); // consumer of inf
    });

    it('should not modify the original graph', () => {
      const obs = makeNode('obs', 'observation');
      const graph = makeGraph([obs]);
      const original = graph.nodes.get('obs')!;

      const replacement = makeNode('obs', 'observation', {
        evidence: [makeEvidence('data', 0.99)],
      });

      const target = {
        nodeId: 'obs',
        reason: 'Test',
        confidence: 0.5,
        failedProperties: [],
        contextNodes: [],
      };

      engine.applyPatch(graph, target, replacement);

      // Original graph should be unchanged
      expect(graph.nodes.get('obs')!.evidence[0].confidence).toBe(
        original.evidence[0].confidence,
      );
    });

    it('should preserve the target node ID on the replacement', () => {
      const obs = makeNode('obs', 'observation');
      const graph = makeGraph([obs]);

      // Replacement has a different ID
      const replacement = makeNode('wrong-id', 'observation');

      const target = {
        nodeId: 'obs',
        reason: 'Test',
        confidence: 0.5,
        failedProperties: [],
        contextNodes: [],
      };

      const result = engine.applyPatch(graph, target, replacement);

      expect(result.graph.nodes.has('obs')).toBe(true);
      expect(result.graph.nodes.get('obs')!.id).toBe('obs');
    });
  });

  describe('oscillation detection', () => {
    it('should detect up-down-up oscillation pattern', () => {
      engine.recordConfidence(makeConfidenceMap([['n1', 0.3]]));
      engine.recordConfidence(makeConfidenceMap([['n1', 0.7]]));
      engine.recordConfidence(makeConfidenceMap([['n1', 0.3]]));

      const report = engine.getOscillationReport();

      expect(report.oscillatingNodes).toContain('n1');
    });

    it('should detect down-up-down oscillation pattern', () => {
      engine.recordConfidence(makeConfidenceMap([['n1', 0.7]]));
      engine.recordConfidence(makeConfidenceMap([['n1', 0.3]]));
      engine.recordConfidence(makeConfidenceMap([['n1', 0.7]]));

      const report = engine.getOscillationReport();

      expect(report.oscillatingNodes).toContain('n1');
    });

    it('should not flag monotonically improving nodes', () => {
      engine.recordConfidence(makeConfidenceMap([['n1', 0.3]]));
      engine.recordConfidence(makeConfidenceMap([['n1', 0.5]]));
      engine.recordConfidence(makeConfidenceMap([['n1', 0.7]]));

      const report = engine.getOscillationReport();

      expect(report.oscillatingNodes).not.toContain('n1');
    });

    it('should not flag nodes with insufficient history', () => {
      engine.recordConfidence(makeConfidenceMap([['n1', 0.3]]));
      engine.recordConfidence(makeConfidenceMap([['n1', 0.7]]));

      const report = engine.getOscillationReport();

      expect(report.oscillatingNodes).not.toContain('n1');
    });

    it('should clear history on reset', () => {
      engine.recordConfidence(makeConfidenceMap([['n1', 0.3]]));
      engine.recordConfidence(makeConfidenceMap([['n1', 0.7]]));
      engine.recordConfidence(makeConfidenceMap([['n1', 0.3]]));

      engine.reset();

      const report = engine.getOscillationReport();
      expect(report.oscillatingNodes).toHaveLength(0);
      expect(report.history.size).toBe(0);
    });
  });
});
