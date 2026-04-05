import { renderNode, renderGraph, renderTrace, renderTraceStep } from './vpir-renderer.js';
import type { VPIRNode, VPIRGraph } from '../types/vpir.js';
import type { VPIRExecutionResult, VPIRExecutionTrace } from '../types/vpir-execution.js';
import { createLabel } from '../types/ifc.js';

function makeNode(overrides: Partial<VPIRNode> = {}): VPIRNode {
  return {
    id: 'node-1',
    type: 'inference',
    operation: 'default-op',
    inputs: [],
    outputs: [{ port: 'result', dataType: 'string' }],
    evidence: [{ type: 'data', source: 'test', confidence: 0.9 }],
    label: createLabel('agent-a', 2, 'internal'),
    verifiable: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeGraph(nodes: VPIRNode[], roots: string[], terminals: string[]): VPIRGraph {
  const nodeMap = new Map<string, VPIRNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }
  return {
    id: 'graph-1',
    name: 'test-graph',
    nodes: nodeMap,
    roots,
    terminals,
    createdAt: new Date().toISOString(),
  };
}

describe('renderNode', () => {
  it('should render a node with all fields', () => {
    const node = makeNode({
      id: 'obs-1',
      type: 'observation',
      operation: 'Read source file',
      inputs: [{ nodeId: 'prev', port: 'data', dataType: 'string' }],
      outputs: [{ port: 'source_code', dataType: 'string' }],
      evidence: [{ type: 'data', source: 'fs', confidence: 0.95 }],
      label: createLabel('agent-a', 2, 'internal'),
    });

    const output = renderNode(node);

    expect(output).toContain('[obs-1] observation: "Read source file"');
    expect(output).toContain('label: agent-a / trust:2 / internal');
    expect(output).toContain('inputs: prev:data');
    expect(output).toContain('evidence: data (confidence: 0.95)');
    expect(output).toContain('outputs: source_code (string)');
  });

  it('should render a node with no inputs', () => {
    const node = makeNode({
      id: 'root',
      type: 'observation',
      operation: 'Start',
      inputs: [],
    });

    const output = renderNode(node);

    expect(output).toContain('[root] observation: "Start"');
    expect(output).not.toContain('inputs:');
  });

  it('should render a node with multiple evidence items', () => {
    const node = makeNode({
      evidence: [
        { type: 'data', source: 'db', confidence: 0.8 },
        { type: 'rule', source: 'policy', confidence: 1.0 },
      ],
    });

    const output = renderNode(node);

    expect(output).toContain('evidence: data (confidence: 0.8)');
    expect(output).toContain('evidence: rule (confidence: 1)');
  });
});

describe('renderGraph', () => {
  it('should render empty graph', () => {
    const graph = makeGraph([], [], []);
    const output = renderGraph(graph);

    expect(output).toContain('(empty)');
  });

  it('should render single node graph', () => {
    const node = makeNode({ id: 'only', type: 'observation', operation: 'Solo' });
    const graph = makeGraph([node], ['only'], ['only']);
    const output = renderGraph(graph);

    expect(output).toContain('VPIR Graph: "test-graph" (1 node)');
    expect(output).toContain('[only] observation: "Solo"');
  });

  it('should render linear chain with arrows', () => {
    const obs = makeNode({
      id: 'obs-1',
      type: 'observation',
      operation: 'Read input',
      inputs: [],
      outputs: [{ port: 'data', dataType: 'string' }],
    });

    const inf = makeNode({
      id: 'inf-1',
      type: 'inference',
      operation: 'Process',
      inputs: [{ nodeId: 'obs-1', port: 'data', dataType: 'string' }],
      outputs: [{ port: 'result', dataType: 'string' }],
    });

    const graph = makeGraph([obs, inf], ['obs-1'], ['inf-1']);
    const output = renderGraph(graph);

    expect(output).toContain('VPIR Graph: "test-graph" (2 nodes)');
    expect(output).toContain('[obs-1]');
    expect(output).toContain('[inf-1]');
    // Should have arrow between nodes
    expect(output).toContain('\u25BC');
  });

  it('should render diamond DAG', () => {
    const root = makeNode({
      id: 'root',
      type: 'observation',
      operation: 'Input',
      inputs: [],
      outputs: [{ port: 'value', dataType: 'number' }],
    });

    const left = makeNode({
      id: 'left',
      type: 'inference',
      operation: 'Left path',
      inputs: [{ nodeId: 'root', port: 'value', dataType: 'number' }],
      outputs: [{ port: 'result', dataType: 'number' }],
    });

    const right = makeNode({
      id: 'right',
      type: 'inference',
      operation: 'Right path',
      inputs: [{ nodeId: 'root', port: 'value', dataType: 'number' }],
      outputs: [{ port: 'result', dataType: 'number' }],
    });

    const merge = makeNode({
      id: 'merge',
      type: 'inference',
      operation: 'Merge',
      inputs: [
        { nodeId: 'left', port: 'result', dataType: 'number' },
        { nodeId: 'right', port: 'result', dataType: 'number' },
      ],
      outputs: [{ port: 'result', dataType: 'number' }],
    });

    const graph = makeGraph([root, left, right, merge], ['root'], ['merge']);
    const output = renderGraph(graph);

    expect(output).toContain('4 nodes');
    expect(output).toContain('[root]');
    expect(output).toContain('[left]');
    expect(output).toContain('[right]');
    expect(output).toContain('[merge]');
  });
});

describe('renderTrace', () => {
  it('should render completed execution trace', () => {
    const result: VPIRExecutionResult = {
      graphId: 'graph-1',
      status: 'completed',
      outputs: { 'inf-1:result': 42 },
      trace: [
        {
          nodeId: 'obs-1',
          operation: 'Read input',
          inputs: {},
          output: 10,
          label: createLabel('agent-a', 2, 'internal'),
          durationMs: 1,
          timestamp: '2026-04-05T00:00:00Z',
          success: true,
        },
        {
          nodeId: 'inf-1',
          operation: 'Double',
          inputs: { 'obs-1:value': 10 },
          output: 42,
          label: createLabel('agent-a', 2, 'internal'),
          durationMs: 2,
          timestamp: '2026-04-05T00:00:01Z',
          success: true,
        },
      ],
      errors: [],
      durationMs: 5,
    };

    const output = renderTrace(result);

    expect(output).toContain('[OK]');
    expect(output).toContain('5ms');
    expect(output).toContain('obs-1');
    expect(output).toContain('inf-1');
    expect(output).toContain('Outputs:');
    expect(output).toContain('inf-1:result: 42');
  });

  it('should render failed execution with errors', () => {
    const result: VPIRExecutionResult = {
      graphId: 'graph-1',
      status: 'failed',
      outputs: {},
      trace: [
        {
          nodeId: 'assert-1',
          operation: 'Check invariant',
          inputs: { 'obs-1:value': -5 },
          output: undefined,
          label: createLabel('agent-a', 2, 'internal'),
          durationMs: 0,
          timestamp: '2026-04-05T00:00:00Z',
          success: false,
          error: 'Assertion failed',
        },
      ],
      errors: [
        {
          nodeId: 'assert-1',
          code: 'ASSERTION_FAILED',
          message: 'Assertion failed: Check invariant',
        },
      ],
      durationMs: 1,
    };

    const output = renderTrace(result);

    expect(output).toContain('[FAIL]');
    expect(output).toContain('Errors:');
    expect(output).toContain('ASSERTION_FAILED');
  });

  it('should render timeout status', () => {
    const result: VPIRExecutionResult = {
      graphId: 'graph-1',
      status: 'timeout',
      outputs: {},
      trace: [],
      errors: [{ nodeId: 'slow', code: 'TIMEOUT', message: 'Timed out' }],
      durationMs: 5000,
    };

    const output = renderTrace(result);

    expect(output).toContain('[TIMEOUT]');
    expect(output).toContain('5000ms');
  });

  it('should render empty trace', () => {
    const result: VPIRExecutionResult = {
      graphId: 'graph-1',
      status: 'failed',
      outputs: {},
      trace: [],
      errors: [{ nodeId: '', code: 'VALIDATION_ERROR', message: 'Empty graph' }],
      durationMs: 0,
    };

    const output = renderTrace(result);

    expect(output).toContain('(no steps executed)');
  });
});

describe('renderTraceStep', () => {
  it('should render a successful step in detail', () => {
    const step: VPIRExecutionTrace = {
      nodeId: 'inf-1',
      operation: 'Double the value',
      inputs: { 'obs-1:value': 10 },
      output: 20,
      label: createLabel('agent-a', 2, 'internal'),
      durationMs: 3,
      timestamp: '2026-04-05T12:00:00Z',
      success: true,
    };

    const output = renderTraceStep(step);

    expect(output).toContain('[inf-1] Double the value [OK]');
    expect(output).toContain('label: agent-a / trust:2 / internal');
    expect(output).toContain('obs-1:value: 10');
    expect(output).toContain('output: 20');
    expect(output).toContain('timestamp:');
  });

  it('should render a failed step with error', () => {
    const step: VPIRExecutionTrace = {
      nodeId: 'assert-1',
      operation: 'Validate',
      inputs: {},
      output: undefined,
      label: createLabel('agent-a', 2, 'internal'),
      durationMs: 0,
      timestamp: '2026-04-05T12:00:00Z',
      success: false,
      error: 'Assertion failed: value must be positive',
    };

    const output = renderTraceStep(step);

    expect(output).toContain('[FAIL]');
    expect(output).toContain('error: Assertion failed');
  });
});
