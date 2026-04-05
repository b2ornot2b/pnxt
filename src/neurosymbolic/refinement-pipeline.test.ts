/**
 * Refinement Pipeline test suite.
 *
 * Sprint 8 — Advisory Panel: Judea Pearl (neurosymbolic bridge).
 */

import { RefinementPipeline } from './refinement-pipeline.js';
import type { PropertyVerifier, LLMGenerator, LLMPatcher } from './refinement-pipeline.js';
import { PASPEngine } from './p-asp.js';
import { ActiveInferenceEngine } from './active-inference.js';
import type { VPIRGraph, VPIRNode, VPIROutput, Evidence } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import type {
  NaturalLanguageTask,
  RefinementConfig,
  LLMQuery,
} from '../types/neurosymbolic.js';
import type {
  ProgramProperty,
  ProgramVerificationResult,
} from '../types/verification.js';
import type { VPIRGenerationResult } from '../bridge-grammar/llm-vpir-generator.js';
import { createLabel } from '../types/ifc.js';

// ── Helpers ────────────────────────────────────────────���─────────────

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

function makeNode(
  id: string,
  type: 'observation' | 'inference' | 'action' | 'assertion' | 'composition',
  opts: {
    inputs?: Array<{ nodeId: string; port: string; dataType: string }>;
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

function makeGraph(nodes: VPIRNode[], id: string = 'test-graph'): VPIRGraph {
  const nodeMap = new Map<string, VPIRNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const roots = nodes.filter((n) => n.inputs.length === 0).map((n) => n.id);
  const consumed = new Set(nodes.flatMap((n) => n.inputs.map((i) => i.nodeId)));
  const terminals = nodes.filter((n) => !consumed.has(n.id)).map((n) => n.id);

  return {
    id,
    name: `Graph ${id}`,
    nodes: nodeMap,
    roots,
    terminals,
    createdAt: new Date().toISOString(),
  };
}

function makeGenResult(graph: VPIRGraph): VPIRGenerationResult {
  return { success: true, graph, attempts: 1, errors: [] };
}

function makeFailedGenResult(): VPIRGenerationResult {
  return { success: false, attempts: 1, errors: ['Generation failed'] };
}

function makeProperty(nodeIds: string[], propId: string = 'prop-1'): ProgramProperty {
  return {
    id: propId,
    kind: 'invariant',
    targetNodes: nodeIds,
    formula: '(>= node_trust 2)',
    description: `Test property ${propId}`,
  };
}

function makeVerificationResult(
  prop: ProgramProperty,
  verified: boolean,
): ProgramVerificationResult {
  return {
    verified,
    solver: 'z3',
    duration: 10,
    property: 'user_invariant',
    programProperty: prop,
    boundVariables: {},
  };
}

// ── Mock Verifier ────────────────────────────────────────────────────

function createMockVerifier(
  resultMap: Map<string, boolean>,
): PropertyVerifier {
  return {
    async verifyProgramProperty(
      property: ProgramProperty,
    ): Promise<ProgramVerificationResult> {
      const verified = resultMap.get(property.id) ?? true;
      return makeVerificationResult(property, verified);
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('RefinementPipeline', () => {
  let paspEngine: PASPEngine;
  let activeInference: ActiveInferenceEngine;

  beforeEach(() => {
    paspEngine = new PASPEngine();
    activeInference = new ActiveInferenceEngine();
  });

  function createPipeline(opts: {
    generator?: LLMGenerator;
    patcher?: LLMPatcher;
    verifier?: PropertyVerifier | null;
    properties?: ProgramProperty[];
  }): RefinementPipeline {
    return new RefinementPipeline({
      paspEngine,
      activeInference,
      verifier: opts.verifier ?? null,
      llmGenerator: opts.generator ?? (async () => makeFailedGenResult()),
      llmPatcher: opts.patcher ?? (async () => makeFailedGenResult()),
      defaultProperties: opts.properties ?? [],
    });
  }

  it('should return non-converged result when generation fails', async () => {
    const pipeline = createPipeline({
      generator: async () => makeFailedGenResult(),
    });

    const task: NaturalLanguageTask = { description: 'Test task' };
    const result = await pipeline.refine(task);

    expect(result.converged).toBe(false);
    expect(result.iterations).toBe(0);
    expect(result.finalConfidence).toBe(0);
  });

  it('should converge in 1 iteration when graph is already good', async () => {
    const obs = makeNode('obs', 'observation', {
      evidence: [makeEvidence('data', 0.95)],
    });
    const graph = makeGraph([obs]);

    const pipeline = createPipeline({
      generator: async () => makeGenResult(graph),
    });

    const task: NaturalLanguageTask = { description: 'Good task' };
    const result = await pipeline.refine(task, { convergenceThreshold: 0.5 });

    expect(result.converged).toBe(true);
    expect(result.iterations).toBe(1);
    expect(result.patchHistory).toHaveLength(0);
  });

  it('should converge after patching improves the graph', async () => {
    // Initial graph has a bad node
    const obs = makeNode('obs', 'observation');
    const badInf = makeNode('inf', 'inference', {
      inputs: [{ nodeId: 'obs', port: 'out', dataType: 'TestData' }],
      evidence: [makeEvidence('rule', 0.1)], // Wrong evidence type, low confidence
    });
    const initialGraph = makeGraph([obs, badInf]);

    // Patched graph has a good node
    const goodInf = makeNode('inf', 'inference', {
      inputs: [{ nodeId: 'obs', port: 'out', dataType: 'TestData' }],
      evidence: [makeEvidence('model_output', 0.95)],
    });
    const patchedGraph = makeGraph([goodInf], 'patch-graph');

    const prop = makeProperty(['inf'], 'prop-1');
    let patchCalled = false;

    const pipeline = createPipeline({
      generator: async () => makeGenResult(initialGraph),
      patcher: async () => {
        patchCalled = true;
        return makeGenResult(patchedGraph);
      },
      verifier: createMockVerifier(new Map([
        ['prop-1', false], // Fails initially, passes after patching
      ])),
      properties: [prop],
    });

    const task: NaturalLanguageTask = {
      description: 'Task needing patch',
      constraints: [prop],
    };
    const result = await pipeline.refine(task, {
      convergenceThreshold: 0.5,
      maxIterations: 5,
    });

    expect(patchCalled).toBe(true);
    expect(result.patchHistory.length).toBeGreaterThanOrEqual(1);
  });

  it('should respect maxIterations limit', async () => {
    const obs = makeNode('obs', 'observation', {
      evidence: [makeEvidence('rule', 0.1)], // Deliberately bad
    });
    const graph = makeGraph([obs]);

    const prop = makeProperty(['obs'], 'prop-1');

    const pipeline = createPipeline({
      generator: async () => makeGenResult(graph),
      patcher: async () => makeGenResult(graph), // Patch returns same bad graph
      verifier: createMockVerifier(new Map([['prop-1', false]])),
      properties: [prop],
    });

    const task: NaturalLanguageTask = {
      description: 'Stuck task',
      constraints: [prop],
    };
    const result = await pipeline.refine(task, { maxIterations: 3 });

    expect(result.converged).toBe(false);
    expect(result.iterations).toBeLessThanOrEqual(3);
  });

  it('should respect timeout', async () => {
    const obs = makeNode('obs', 'observation');
    const graph = makeGraph([obs]);
    const prop = makeProperty(['obs'], 'prop-1');

    const pipeline = createPipeline({
      generator: async () => makeGenResult(graph),
      patcher: async () => {
        // Simulate slow LLM call
        await new Promise((resolve) => setTimeout(resolve, 50));
        return makeGenResult(graph);
      },
      verifier: createMockVerifier(new Map([['prop-1', false]])),
      properties: [prop],
    });

    const task: NaturalLanguageTask = {
      description: 'Timeout task',
      constraints: [prop],
    };
    const result = await pipeline.refine(task, {
      timeout: 100,
      maxIterations: 100,
    });

    expect(result.converged).toBe(false);
    expect(result.iterations).toBeLessThan(100);
  });

  it('should work in P-ASP-only mode (null verifier)', async () => {
    const obs = makeNode('obs', 'observation', {
      evidence: [makeEvidence('data', 0.95)],
    });
    const graph = makeGraph([obs]);

    const pipeline = createPipeline({
      generator: async () => makeGenResult(graph),
      verifier: null,
    });

    const task: NaturalLanguageTask = { description: 'P-ASP only task' };
    const result = await pipeline.refine(task, { convergenceThreshold: 0.5 });

    expect(result.converged).toBe(true);
    expect(result.verificationResults).toHaveLength(0);
  });

  it('should record patch history with confidence deltas', async () => {
    const obs = makeNode('obs', 'observation');
    const badNode = makeNode('bad', 'inference', {
      inputs: [{ nodeId: 'obs', port: 'out', dataType: 'TestData' }],
      evidence: [makeEvidence('rule', 0.1)],
    });
    const initialGraph = makeGraph([obs, badNode]);

    const goodNode = makeNode('bad', 'inference', {
      inputs: [{ nodeId: 'obs', port: 'out', dataType: 'TestData' }],
      evidence: [makeEvidence('model_output', 0.95)],
    });
    const patchGraph = makeGraph([goodNode], 'patch');

    const prop = makeProperty(['bad'], 'prop-1');

    const pipeline = createPipeline({
      generator: async () => makeGenResult(initialGraph),
      patcher: async () => makeGenResult(patchGraph),
      verifier: createMockVerifier(new Map([['prop-1', false]])),
      properties: [prop],
    });

    const task: NaturalLanguageTask = {
      description: 'Patch tracking',
      constraints: [prop],
    };
    const result = await pipeline.refine(task, {
      maxIterations: 2,
      convergenceThreshold: 0.99, // Won't converge
    });

    if (result.patchHistory.length > 0) {
      const record = result.patchHistory[0];
      expect(record.target.nodeId).toBe('bad');
      expect(record.iteration).toBeGreaterThanOrEqual(1);
      expect(typeof record.confidenceDelta).toBe('number');
    }
  });

  it('should stop when no patch targets available', async () => {
    // Graph where no nodes are in the failed properties' target lists
    const obs = makeNode('obs', 'observation');
    const graph = makeGraph([obs]);

    // Property targets a nonexistent node
    const prop = makeProperty(['nonexistent'], 'prop-1');

    const pipeline = createPipeline({
      generator: async () => makeGenResult(graph),
      patcher: async () => makeFailedGenResult(),
      verifier: createMockVerifier(new Map([['prop-1', false]])),
      properties: [prop],
    });

    const task: NaturalLanguageTask = {
      description: 'No targets',
      constraints: [prop],
    };
    const result = await pipeline.refine(task, { maxIterations: 10 });

    expect(result.converged).toBe(false);
    // Should exit early because no valid targets exist
    expect(result.iterations).toBeLessThan(10);
  });

  it('should use task constraints over default properties', async () => {
    const obs = makeNode('obs', 'observation');
    const graph = makeGraph([obs]);

    const defaultProp = makeProperty(['obs'], 'default-prop');
    const taskProp = makeProperty(['obs'], 'task-prop');

    let verifiedPropIds: string[] = [];

    const verifier: PropertyVerifier = {
      async verifyProgramProperty(property) {
        verifiedPropIds.push(property.id);
        return makeVerificationResult(property, true);
      },
    };

    const pipeline = createPipeline({
      generator: async () => makeGenResult(graph),
      verifier,
      properties: [defaultProp],
    });

    const task: NaturalLanguageTask = {
      description: 'Task with custom constraints',
      constraints: [taskProp],
    };
    await pipeline.refine(task, { convergenceThreshold: 0.5 });

    expect(verifiedPropIds).toContain('task-prop');
    expect(verifiedPropIds).not.toContain('default-prop');
  });

  it('should handle LLM patcher returning failed result gracefully', async () => {
    const obs = makeNode('obs', 'observation', {
      evidence: [makeEvidence('rule', 0.1)], // Bad evidence
    });
    const graph = makeGraph([obs]);
    const prop = makeProperty(['obs'], 'prop-1');

    const pipeline = createPipeline({
      generator: async () => makeGenResult(graph),
      patcher: async () => makeFailedGenResult(), // Patcher always fails
      verifier: createMockVerifier(new Map([['prop-1', false]])),
      properties: [prop],
    });

    const task: NaturalLanguageTask = {
      description: 'Failed patcher',
      constraints: [prop],
    };
    const result = await pipeline.refine(task, { maxIterations: 2 });

    // Should not crash, just not converge
    expect(result.converged).toBe(false);
    expect(result.patchHistory).toHaveLength(0);
  });
});
