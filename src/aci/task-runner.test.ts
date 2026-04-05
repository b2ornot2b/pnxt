import { TaskRunner } from './task-runner.js';
import { ToolRegistry, createStandardRegistry } from './tool-registry.js';
import { VPIRGraphBuilder } from '../vpir/vpir-graph-builder.js';

function makeBridgeGrammarJSON(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = new Date().toISOString();
  const label = {
    owner: 'test',
    trustLevel: 2,
    classification: 'internal',
    createdAt: now,
  };

  return {
    id: 'task-test',
    name: 'Task Test Graph',
    nodes: [
      {
        id: 'observe-input',
        type: 'observation',
        operation: 'gather-input',
        inputs: [],
        outputs: [{ port: 'data', dataType: 'object', value: { value: 100, from: 'f', to: 'c' } }],
        evidence: [{ type: 'data', source: 'user', confidence: 1.0 }],
        label,
        verifiable: true,
        createdAt: now,
      },
      {
        id: 'convert-temp',
        type: 'action',
        operation: 'unit-convert',
        inputs: [{ nodeId: 'observe-input', port: 'data', dataType: 'object' }],
        outputs: [{ port: 'result', dataType: 'object' }],
        evidence: [{ type: 'data', source: 'unit-convert', confidence: 1.0 }],
        label,
        verifiable: false,
        createdAt: now,
      },
    ],
    roots: ['observe-input'],
    terminals: ['convert-temp'],
    createdAt: now,
    ...overrides,
  };
}

describe('TaskRunner', () => {
  let runner: TaskRunner;

  beforeEach(() => {
    runner = new TaskRunner();
  });

  describe('run with JSON spec', () => {
    it('should execute a simple unit-convert task from JSON', async () => {
      const json = makeBridgeGrammarJSON();
      const result = await runner.run(json);

      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.graphId).toBe('task-test');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // Check that outputs exist (unit-convert should produce a result)
      const outputKeys = Object.keys(result.outputs);
      expect(outputKeys.length).toBeGreaterThan(0);

      // The output should contain the conversion result
      const outputValue = Object.values(result.outputs)[0] as Record<string, unknown>;
      expect(outputValue).toBeDefined();
      expect(typeof outputValue.result).toBe('number');
    });

    it('should execute a math-eval task from JSON', async () => {
      const now = new Date().toISOString();
      const label = {
        owner: 'test',
        trustLevel: 2,
        classification: 'internal',
        createdAt: now,
      };

      const json = {
        id: 'math-task',
        name: 'Math Task',
        nodes: [
          {
            id: 'observe-expr',
            type: 'observation',
            operation: 'gather-expression',
            inputs: [],
            outputs: [{
              port: 'data',
              dataType: 'object',
              value: { expression: '2 * (3 + 4)', variables: {} },
            }],
            evidence: [{ type: 'data', source: 'user', confidence: 1.0 }],
            label,
            verifiable: true,
            createdAt: now,
          },
          {
            id: 'eval-math',
            type: 'action',
            operation: 'math-eval',
            inputs: [{ nodeId: 'observe-expr', port: 'data', dataType: 'object' }],
            outputs: [{ port: 'result', dataType: 'object' }],
            evidence: [{ type: 'data', source: 'math-eval', confidence: 1.0 }],
            label,
            verifiable: true,
            createdAt: now,
          },
        ],
        roots: ['observe-expr'],
        terminals: ['eval-math'],
        createdAt: now,
      };

      const result = await runner.run(json);
      expect(result.success).toBe(true);

      const output = Object.values(result.outputs)[0] as Record<string, unknown>;
      expect(output.result).toBe(14);
    });

    it('should execute a string-format task from JSON', async () => {
      const now = new Date().toISOString();
      const label = {
        owner: 'test',
        trustLevel: 2,
        classification: 'internal',
        createdAt: now,
      };

      const json = {
        id: 'format-task',
        name: 'Format Task',
        nodes: [
          {
            id: 'observe-data',
            type: 'observation',
            operation: 'gather-data',
            inputs: [],
            outputs: [{
              port: 'data',
              dataType: 'object',
              value: { template: 'Hello, {{name}}!', values: { name: 'World' } },
            }],
            evidence: [{ type: 'data', source: 'user', confidence: 1.0 }],
            label,
            verifiable: true,
            createdAt: now,
          },
          {
            id: 'format-str',
            type: 'action',
            operation: 'string-format',
            inputs: [{ nodeId: 'observe-data', port: 'data', dataType: 'object' }],
            outputs: [{ port: 'result', dataType: 'object' }],
            evidence: [{ type: 'data', source: 'string-format', confidence: 1.0 }],
            label,
            verifiable: true,
            createdAt: now,
          },
        ],
        roots: ['observe-data'],
        terminals: ['format-str'],
        createdAt: now,
      };

      const result = await runner.run(json);
      expect(result.success).toBe(true);

      const output = Object.values(result.outputs)[0] as Record<string, unknown>;
      expect(output.formatted).toBe('Hello, World!');
    });
  });

  describe('run with VPIRGraph', () => {
    it('should accept a pre-built VPIRGraph', async () => {
      const buildResult = new VPIRGraphBuilder({ id: 'pre-built' })
        .addObservation({
          id: 'obs',
          operation: 'input',
          outputs: [{
            port: 'data',
            dataType: 'object',
            value: { expression: '1 + 2' },
          }],
        })
        .addAction({
          id: 'calc',
          operation: 'math-eval',
          inputs: [{ nodeId: 'obs', port: 'data', dataType: 'object' }],
        })
        .build();

      expect(buildResult.success).toBe(true);

      const result = await runner.run(buildResult.graph!);
      expect(result.success).toBe(true);

      const output = Object.values(result.outputs)[0] as Record<string, unknown>;
      expect(output.result).toBe(3);
    });
  });

  describe('validation errors', () => {
    it('should fail on invalid JSON spec', async () => {
      const result = await runner.run({ invalid: 'not a graph' });
      expect(result.success).toBe(false);
      expect(result.status).toBe('build_error');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail when tool handler is missing', async () => {
      const now = new Date().toISOString();
      const label = {
        owner: 'test',
        trustLevel: 2,
        classification: 'internal',
        createdAt: now,
      };

      const json = {
        id: 'missing-tool',
        name: 'Missing Tool',
        nodes: [
          {
            id: 'obs',
            type: 'observation',
            operation: 'input',
            inputs: [],
            outputs: [{ port: 'data', dataType: 'string' }],
            evidence: [{ type: 'data', source: 'user', confidence: 1.0 }],
            label,
            verifiable: true,
            createdAt: now,
          },
          {
            id: 'act',
            type: 'action',
            operation: 'nonexistent-tool',
            inputs: [{ nodeId: 'obs', port: 'data', dataType: 'string' }],
            outputs: [{ port: 'result', dataType: 'string' }],
            evidence: [{ type: 'data', source: 'tool', confidence: 1.0 }],
            label,
            verifiable: false,
            createdAt: now,
          },
        ],
        roots: ['obs'],
        terminals: ['act'],
        createdAt: now,
      };

      // The fromJSON with toolRegistry should catch this
      const result = await runner.run(json);
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('nonexistent-tool'))).toBe(true);
    });

    it('should fail on insufficient trust level', async () => {
      // http-fetch requires trust level 2
      const lowTrustRunner = new TaskRunner({ agentTrust: 0 });

      const now = new Date().toISOString();
      const label = {
        owner: 'test',
        trustLevel: 0,
        classification: 'public',
        createdAt: now,
      };

      const json = {
        id: 'trust-test',
        name: 'Trust Test',
        nodes: [
          {
            id: 'obs',
            type: 'observation',
            operation: 'input',
            inputs: [],
            outputs: [{ port: 'data', dataType: 'object' }],
            evidence: [{ type: 'data', source: 'user', confidence: 1.0 }],
            label,
            verifiable: true,
            createdAt: now,
          },
          {
            id: 'fetch',
            type: 'action',
            operation: 'http-fetch',
            inputs: [{ nodeId: 'obs', port: 'data', dataType: 'object' }],
            outputs: [{ port: 'result', dataType: 'object' }],
            evidence: [{ type: 'data', source: 'http', confidence: 1.0 }],
            label,
            verifiable: false,
            createdAt: now,
          },
        ],
        roots: ['obs'],
        terminals: ['fetch'],
        createdAt: now,
      };

      const result = await lowTrustRunner.run(json);
      expect(result.success).toBe(false);
      expect(result.status).toBe('validation_error');
      expect(result.errors[0]).toContain('trust');
    });
  });

  describe('timeout handling', () => {
    it('should timeout on slow tasks', async () => {
      const slowRegistry = new ToolRegistry();
      slowRegistry.register(
        {
          name: 'slow-tool',
          description: 'A tool that takes forever',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          sideEffects: ['none'],
          ops: { timeout: 5000, retryable: false, idempotent: true, costCategory: 'cheap' },
        },
        async () => new Promise((resolve) => setTimeout(resolve, 10_000)),
      );

      const timeoutRunner = new TaskRunner({
        toolRegistry: slowRegistry,
        timeout: 200,
      });

      const buildResult = new VPIRGraphBuilder({ id: 'slow-task' })
        .addObservation({
          id: 'obs',
          operation: 'input',
          outputs: [{ port: 'data', dataType: 'object', value: {} }],
        })
        .addAction({
          id: 'slow',
          operation: 'slow-tool',
          inputs: [{ nodeId: 'obs', port: 'data', dataType: 'object' }],
        })
        .build();

      expect(buildResult.success).toBe(true);
      const result = await timeoutRunner.run(buildResult.graph!);
      expect(result.status).toBe('timeout');
    }, 10_000);
  });

  describe('multi-step pipeline', () => {
    it('should execute a 2-step pipeline with custom inference handlers', async () => {
      // Create a registry with a custom chaining-friendly handler
      const registry = createStandardRegistry();
      registry.register(
        {
          name: 'extract-result',
          description: 'Extract result field from input',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          sideEffects: ['none'],
          ops: { timeout: 5000, retryable: false, idempotent: true, costCategory: 'cheap' },
        },
        async (input: unknown) => {
          const obj = input as Record<string, unknown>;
          return { data: obj.result ?? obj, rules: [{ field: 'data', type: 'number' }] };
        },
      );

      const pipelineRunner = new TaskRunner({ toolRegistry: registry });

      const buildResult = new VPIRGraphBuilder({ id: 'pipeline-task', name: 'Pipeline' })
        .addObservation({
          id: 'observe',
          operation: 'input',
          outputs: [{
            port: 'data',
            dataType: 'object',
            value: { expression: '10 + 5' },
          }],
        })
        .addAction({
          id: 'calculate',
          operation: 'math-eval',
          inputs: [{ nodeId: 'observe', port: 'data', dataType: 'object' }],
          outputs: [{ port: 'result', dataType: 'object' }],
        })
        .addAction({
          id: 'reshape',
          operation: 'extract-result',
          inputs: [{ nodeId: 'calculate', port: 'result', dataType: 'object' }],
          outputs: [{ port: 'result', dataType: 'object' }],
        })
        .addAction({
          id: 'validate',
          operation: 'data-validate',
          inputs: [{ nodeId: 'reshape', port: 'result', dataType: 'object' }],
          outputs: [{ port: 'result', dataType: 'object' }],
        })
        .build();

      expect(buildResult.success).toBe(true);

      const result = await pipelineRunner.run(buildResult.graph!);
      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(Object.keys(result.outputs).length).toBeGreaterThan(0);
    });
  });

  describe('DPN execution result', () => {
    it('should include DPN execution result on success', async () => {
      const json = makeBridgeGrammarJSON();
      const result = await runner.run(json);

      expect(result.dpnResult).toBeDefined();
      expect(result.dpnResult!.status).toBe('completed');
      expect(result.dpnResult!.trace).toBeDefined();
    });
  });
});
