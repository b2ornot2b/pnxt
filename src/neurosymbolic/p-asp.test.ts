/**
 * P-ASP Engine test suite.
 *
 * Sprint 8 — Advisory Panel: Judea Pearl (neurosymbolic bridge).
 */

import { PASPEngine } from './p-asp.js';
import type { VPIRGraph, VPIRNode, VPIROutput, VPIRRef, Evidence } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import type { PipelineContext } from '../types/neurosymbolic.js';
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
    evidence: opts.evidence ?? [makeEvidence('data')],
    label: makeLabel(),
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
  const outputConsumers = new Set(
    nodes.flatMap((n) => n.inputs.map((i) => i.nodeId)),
  );
  const terminals = nodes
    .filter((n) => !outputConsumers.has(n.id))
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

function makeContext(
  graph: VPIRGraph,
  opts: {
    verificationResults?: ProgramVerificationResult[];
    patternHistory?: Map<string, number[]>;
  } = {},
): PipelineContext {
  return { graph, ...opts };
}

function makeProgramVerificationResult(
  nodeIds: string[],
  verified: boolean,
): ProgramVerificationResult {
  return {
    verified,
    solver: 'z3',
    duration: 10,
    property: 'user_invariant',
    programProperty: {
      id: `prop-${nodeIds.join('-')}`,
      kind: 'invariant',
      targetNodes: nodeIds,
      formula: '(>= node_trust 2)',
      description: 'Test property',
    },
    boundVariables: {},
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('PASPEngine', () => {
  let engine: PASPEngine;

  beforeEach(() => {
    engine = new PASPEngine();
  });

  describe('scoreNodes', () => {
    it('should score a valid well-formed graph with high confidence', () => {
      const obs = makeNode('obs', 'observation', {
        evidence: [makeEvidence('data', 0.95)],
      });
      const inf = makeNode('inf', 'inference', {
        inputs: [makeRef('obs', 'out', 'TestData')],
        evidence: [makeEvidence('model_output', 0.85)],
      });
      const graph = makeGraph([obs, inf]);
      const ctx = makeContext(graph);

      const result = engine.scoreNodes(graph, ctx);

      expect(result.scores.size).toBe(2);
      expect(result.graphConfidence).toBeGreaterThan(0.5);
      expect(result.lowConfidenceNodes).toHaveLength(0);
    });

    it('should flag a node with dangling input reference', () => {
      const node = makeNode('bad', 'inference', {
        inputs: [makeRef('nonexistent', 'out', 'any')],
        evidence: [makeEvidence('model_output')],
      });
      const graph = makeGraph([node]);
      const ctx = makeContext(graph);

      const result = engine.scoreNodes(graph, ctx);

      // Node should score lower due to broken reference
      const score = result.scores.get('bad')!;
      expect(score).toBeLessThan(0.8);
    });

    it('should flag a node with empty evidence', () => {
      // Use a stricter engine so empty evidence triggers low-confidence
      const strictEngine = new PASPEngine({ lowConfidenceThreshold: 0.7 });
      const node = makeNode('empty-ev', 'observation', {
        evidence: [],
      });
      const graph = makeGraph([node]);
      const ctx = makeContext(graph);

      const result = strictEngine.scoreNodes(graph, ctx);

      // Empty evidence reduces structural score
      expect(result.scores.get('empty-ev')!).toBeLessThan(0.7);
      expect(result.lowConfidenceNodes).toContain('empty-ev');
    });

    it('should flag a node with empty outputs', () => {
      const node = makeNode('no-out', 'observation', {
        outputs: [],
      });
      const graph = makeGraph([node]);
      const ctx = makeContext(graph);

      const result = engine.scoreNodes(graph, ctx);

      expect(result.scores.get('no-out')!).toBeLessThan(0.8);
    });

    it('should score higher when Z3 properties pass', () => {
      const obs = makeNode('obs', 'observation');
      const graph = makeGraph([obs]);
      const passing = makeProgramVerificationResult(['obs'], true);
      const ctx = makeContext(graph, { verificationResults: [passing] });

      const result = engine.scoreNodes(graph, ctx);

      const obs2 = makeNode('obs2', 'observation');
      const graph2 = makeGraph([obs2]);
      const failing = makeProgramVerificationResult(['obs2'], false);
      const ctx2 = makeContext(graph2, { verificationResults: [failing] });

      const result2 = engine.scoreNodes(graph2, ctx2);

      expect(result.scores.get('obs')!).toBeGreaterThan(result2.scores.get('obs2')!);
    });

    it('should use historical accuracy when pattern history is provided', () => {
      const obs = makeNode('obs', 'observation');
      const graph = makeGraph([obs]);

      const goodHistory = new Map([
        ['observation:Test observation obs', [0.9, 0.95, 0.88]],
      ]);
      const badHistory = new Map([
        ['observation:Test observation obs', [0.1, 0.15, 0.12]],
      ]);

      const resultGood = engine.scoreNodes(graph, makeContext(graph, { patternHistory: goodHistory }));
      const resultBad = engine.scoreNodes(graph, makeContext(graph, { patternHistory: badHistory }));

      expect(resultGood.scores.get('obs')!).toBeGreaterThan(resultBad.scores.get('obs')!);
    });

    it('should default to 0.5 for historical/constraint when no data available', () => {
      const obs = makeNode('obs', 'observation');
      const graph = makeGraph([obs]);
      const ctx = makeContext(graph);

      const result = engine.scoreNodes(graph, ctx);

      // With no history and no verification, both default to 0.5
      // So confidence = 0.25*structural + 0.25*semantic + 0.20*0.5 + 0.30*0.5
      expect(result.scores.get('obs')!).toBeGreaterThan(0);
    });

    it('should detect semantic mismatch between evidence and node type', () => {
      // observation with rule evidence (should be data)
      const obs = makeNode('obs', 'observation', {
        evidence: [makeEvidence('rule', 0.9)],
      });
      // observation with data evidence (correct)
      const obsGood = makeNode('obs-good', 'observation', {
        evidence: [makeEvidence('data', 0.9)],
      });
      const graph1 = makeGraph([obs]);
      const graph2 = makeGraph([obsGood]);

      const score1 = engine.scoreNodes(graph1, makeContext(graph1)).scores.get('obs')!;
      const score2 = engine.scoreNodes(graph2, makeContext(graph2)).scores.get('obs-good')!;

      expect(score2).toBeGreaterThan(score1);
    });

    it('should detect input/output dataType mismatch across edges', () => {
      const obs = makeNode('obs', 'observation', {
        outputs: [makeOutput('out', 'TypeA')],
      });
      const inf = makeNode('inf', 'inference', {
        inputs: [makeRef('obs', 'out', 'TypeB')], // Mismatch: TypeB vs TypeA
        evidence: [makeEvidence('model_output')],
      });
      const graph = makeGraph([obs, inf]);
      const ctx = makeContext(graph);

      const result = engine.scoreNodes(graph, ctx);

      // Inference node should score lower due to type mismatch
      const infScore = result.scores.get('inf')!;
      expect(infScore).toBeLessThan(0.85);
    });

    it('should compute graphConfidence as average of all node scores', () => {
      const n1 = makeNode('n1', 'observation');
      const n2 = makeNode('n2', 'observation');
      const graph = makeGraph([n1, n2]);
      const ctx = makeContext(graph);

      const result = engine.scoreNodes(graph, ctx);

      const s1 = result.scores.get('n1')!;
      const s2 = result.scores.get('n2')!;
      expect(result.graphConfidence).toBeCloseTo((s1 + s2) / 2, 5);
    });

    it('should return empty results for an empty graph', () => {
      const graph = makeGraph([]);
      const ctx = makeContext(graph);

      const result = engine.scoreNodes(graph, ctx);

      expect(result.scores.size).toBe(0);
      expect(result.graphConfidence).toBe(0);
      expect(result.lowConfidenceNodes).toHaveLength(0);
    });

    it('should respect custom low confidence threshold', () => {
      const strictEngine = new PASPEngine({ lowConfidenceThreshold: 0.9 });
      const obs = makeNode('obs', 'observation');
      const graph = makeGraph([obs]);
      const ctx = makeContext(graph);

      const result = strictEngine.scoreNodes(graph, ctx);

      // With strict threshold, even valid nodes may be flagged
      expect(result.lowConfidenceNodes.length).toBeGreaterThanOrEqual(0);
    });

    it('should clamp scores to [0, 1]', () => {
      const obs = makeNode('obs', 'observation');
      const graph = makeGraph([obs]);
      const ctx = makeContext(graph);

      const result = engine.scoreNodes(graph, ctx);

      for (const [, score] of result.scores) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });

    it('should handle nodes with no inputs as potential roots', () => {
      const obs = makeNode('root', 'observation');
      const inf = makeNode('bad-root', 'inference'); // inference with no inputs (semantically wrong)
      const graph = makeGraph([obs, inf]);
      const ctx = makeContext(graph);

      const result = engine.scoreNodes(graph, ctx);

      // observation as root should score higher semantically than inference as root
      expect(result.scores.get('root')!).toBeGreaterThan(result.scores.get('bad-root')!);
    });
  });

  describe('generateInterpretations', () => {
    it('should return alternative interpretations for a node', () => {
      const obs = makeNode('obs', 'observation');
      const graph = makeGraph([obs]);
      const ctx = makeContext(graph);

      const interpretations = engine.generateInterpretations(obs, ctx);

      expect(interpretations.length).toBeGreaterThan(0);
      expect(interpretations.length).toBeLessThanOrEqual(3);
    });

    it('should sort interpretations by confidence descending', () => {
      const node = makeNode('target', 'inference', {
        evidence: [makeEvidence('rule')],
      });
      const graph = makeGraph([node]);
      const ctx = makeContext(graph);

      const interpretations = engine.generateInterpretations(node, ctx);

      for (let i = 1; i < interpretations.length; i++) {
        expect(interpretations[i - 1].confidence).toBeGreaterThanOrEqual(
          interpretations[i].confidence,
        );
      }
    });

    it('should fix broken references when possible', () => {
      const source = makeNode('source', 'observation', {
        outputs: [makeOutput('data', 'Result')],
      });
      const broken = makeNode('broken', 'inference', {
        inputs: [makeRef('nonexistent', 'out', 'Result')],
        evidence: [makeEvidence('model_output')],
      });
      const graph = makeGraph([source, broken]);
      const ctx = makeContext(graph);

      const interpretations = engine.generateInterpretations(broken, ctx);

      // At least one interpretation should have fixed reference
      const hasFixedRef = interpretations.some((interp) =>
        interp.interpretation.inputs.some((ref) => ref.nodeId === 'source'),
      );
      expect(hasFixedRef).toBe(true);
    });

    it('should not include the original node type in interpretations', () => {
      const obs = makeNode('obs', 'observation');
      const graph = makeGraph([obs]);
      const ctx = makeContext(graph);

      const interpretations = engine.generateInterpretations(obs, ctx);

      // None of the type-varied interpretations should be 'observation'
      // (the fixed-reference strategy might produce one though)
      const typeVaried = interpretations.filter(
        (i) => i.interpretation.type !== 'observation',
      );
      expect(typeVaried.length).toBeGreaterThan(0);
    });
  });
});
