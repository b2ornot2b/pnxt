import {
  generateTaskVPIRGraph,
  buildTaskAwareSystemPrompt,
  buildTaskAwareVPIRTool,
} from './task-vpir-generator.js';
import { createStandardRegistry } from '../aci/tool-registry.js';
import { createMockClient } from './llm-vpir-generator.js';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Create a valid task-aware VPIR graph JSON that uses real handler names.
 */
function createTaskVPIRGraphJSON(): Record<string, unknown> {
  const now = new Date().toISOString();
  const label = {
    owner: 'task-generator',
    trustLevel: 2,
    classification: 'internal',
    createdAt: now,
  };

  return {
    id: 'vpir-temp-conversion',
    name: 'Temperature Conversion Task',
    nodes: [
      {
        id: 'observe-input',
        type: 'observation',
        operation: 'gather-temperature-input',
        inputs: [],
        outputs: [{ port: 'data', dataType: 'object', value: { value: 100, from: 'c', to: 'f' } }],
        evidence: [{ type: 'data', source: 'user-input', confidence: 1.0 }],
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
        verifiable: true,
        createdAt: now,
      },
    ],
    roots: ['observe-input'],
    terminals: ['convert-temp'],
    createdAt: now,
  };
}

/**
 * Create a VPIR graph JSON that references a non-existent handler.
 */
function createInvalidHandlerJSON(): Record<string, unknown> {
  const now = new Date().toISOString();
  const label = {
    owner: 'task-generator',
    trustLevel: 2,
    classification: 'internal',
    createdAt: now,
  };

  return {
    id: 'vpir-bad-handler',
    name: 'Invalid Handler Task',
    nodes: [
      {
        id: 'observe-input',
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
        id: 'bad-action',
        type: 'action',
        operation: 'nonexistent-handler',
        inputs: [{ nodeId: 'observe-input', port: 'data', dataType: 'string' }],
        outputs: [{ port: 'result', dataType: 'string' }],
        evidence: [{ type: 'data', source: 'tool', confidence: 1.0 }],
        label,
        verifiable: false,
        createdAt: now,
      },
    ],
    roots: ['observe-input'],
    terminals: ['bad-action'],
    createdAt: now,
  };
}

describe('Task-Aware VPIR Generator', () => {
  describe('buildTaskAwareSystemPrompt', () => {
    it('should include all standard handler names', () => {
      const registry = createStandardRegistry();
      const prompt = buildTaskAwareSystemPrompt(registry.listRegistrations());

      expect(prompt).toContain('http-fetch');
      expect(prompt).toContain('json-transform');
      expect(prompt).toContain('file-read');
      expect(prompt).toContain('file-write');
      expect(prompt).toContain('string-format');
      expect(prompt).toContain('math-eval');
      expect(prompt).toContain('data-validate');
      expect(prompt).toContain('unit-convert');
    });

    it('should include handler descriptions and input schemas', () => {
      const registry = createStandardRegistry();
      const prompt = buildTaskAwareSystemPrompt(registry.listRegistrations());

      expect(prompt).toContain('Perform an HTTP request');
      expect(prompt).toContain('url');
      expect(prompt).toContain('expression');
      expect(prompt).toContain('template');
    });

    it('should include task-aware instructions', () => {
      const registry = createStandardRegistry();
      const prompt = buildTaskAwareSystemPrompt(registry.listRegistrations());

      expect(prompt).toContain('Observation nodes');
      expect(prompt).toContain('Action nodes');
      expect(prompt).toContain('handler names');
    });
  });

  describe('buildTaskAwareVPIRTool', () => {
    it('should include handler names in tool description', () => {
      const registry = createStandardRegistry();
      const tool = buildTaskAwareVPIRTool(registry);

      expect(tool.name).toBe('emit_vpir_graph');
      expect(tool.description).toContain('unit-convert');
      expect(tool.description).toContain('math-eval');
    });

    it('should include security label when provided', () => {
      const registry = createStandardRegistry();
      const tool = buildTaskAwareVPIRTool(registry, {
        owner: 'test',
        trustLevel: 3,
        classification: 'confidential',
        createdAt: new Date().toISOString(),
      });

      expect(tool.description).toContain('trustLevel=3');
      expect(tool.description).toContain('confidential');
    });
  });

  describe('generateTaskVPIRGraph', () => {
    it('should generate a valid task graph using mock client', async () => {
      const taskJSON = createTaskVPIRGraphJSON();
      const client = createMockClient(taskJSON);

      const result = await generateTaskVPIRGraph(
        'Convert 100 degrees Celsius to Fahrenheit',
        { client },
      );

      expect(result.success).toBe(true);
      expect(result.graph).toBeDefined();
      expect(result.graph!.nodes.size).toBe(2);
      expect(result.attempts).toBe(1);
    });

    it('should reject graphs with missing handlers and retry', async () => {
      const invalidJSON = createInvalidHandlerJSON();
      const validJSON = createTaskVPIRGraphJSON();

      // Mock client that returns invalid graph first, then valid
      let callCount = 0;
      const mockClient = {
        messages: {
          create: async (): Promise<Anthropic.Message> => {
            callCount++;
            const input = callCount === 1 ? invalidJSON : validJSON;
            return {
              id: `msg-${callCount}`,
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  id: 'tool-1',
                  name: 'emit_vpir_graph',
                  input,
                },
              ],
              model: 'mock',
              stop_reason: 'tool_use',
              stop_sequence: null,
              usage: { input_tokens: 0, output_tokens: 0 },
            } as Anthropic.Message;
          },
        },
      } as unknown as Anthropic;

      const result = await generateTaskVPIRGraph(
        'Do something with a nonexistent tool',
        { client: mockClient },
      );

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(result.errors.length).toBe(0);
    });

    it('should fail after max retries if handler always missing', async () => {
      const invalidJSON = createInvalidHandlerJSON();
      const client = createMockClient(invalidJSON);

      const result = await generateTaskVPIRGraph(
        'Use a tool that does not exist',
        { client, maxRetries: 1 },
      );

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('Missing handlers'))).toBe(true);
    });

    it('should fail when no tool_use block is returned', async () => {
      const client = createMockClient(createTaskVPIRGraphJSON(), true);

      const result = await generateTaskVPIRGraph(
        'Generate a task',
        { client, maxRetries: 0 },
      );

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('No tool_use block');
    });

    it('should apply security label override', async () => {
      const taskJSON = createTaskVPIRGraphJSON();
      const client = createMockClient(taskJSON);

      const securityLabel = {
        owner: 'secure-agent',
        trustLevel: 3 as const,
        classification: 'confidential' as const,
        createdAt: new Date().toISOString(),
      };

      const result = await generateTaskVPIRGraph(
        'Secure temperature conversion',
        { client, securityLabel },
      );

      expect(result.success).toBe(true);
      // All nodes should have the overridden security label
      for (const node of result.graph!.nodes.values()) {
        expect(node.label.owner).toBe('secure-agent');
        expect(node.label.classification).toBe('confidential');
      }
    });
  });
});
