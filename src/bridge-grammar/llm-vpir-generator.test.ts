/**
 * Tests for LLM-Driven VPIR Generation via Bridge Grammar.
 *
 * Validates the generation pipeline with mock clients, and optionally
 * tests against the live Claude API when ANTHROPIC_API_KEY is set.
 */

import {
  generateVPIRGraph,
  createMockClient,
  createSampleVPIRGraphJSON,
  buildSystemPrompt,
  VPIR_SYSTEM_PROMPT_BASE,
} from './llm-vpir-generator.js';
import { parseVPIRGraph } from './schema-validator.js';
import { createStandardRegistry, ToolRegistry } from '../aci/tool-registry.js';
import type { SecurityLabel } from '../types/ifc.js';

// --- Mock client tests (always run) ---

describe('LLM VPIR Generator (Mock)', () => {
  describe('generateVPIRGraph', () => {
    it('should generate a valid VPIR graph from mock client', async () => {
      const sampleJSON = createSampleVPIRGraphJSON('test-task');
      const mockClient = createMockClient(sampleJSON);

      const result = await generateVPIRGraph('Analyze and process input data', {
        client: mockClient,
      });

      expect(result.success).toBe(true);
      expect(result.graph).toBeDefined();
      expect(result.graph!.nodes.size).toBe(4);
      expect(result.graph!.roots).toEqual(['observe-input']);
      expect(result.graph!.terminals).toEqual(['assert-success']);
      expect(result.attempts).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should produce a DAG with correct node types', async () => {
      const sampleJSON = createSampleVPIRGraphJSON();
      const mockClient = createMockClient(sampleJSON);

      const result = await generateVPIRGraph('Process data', {
        client: mockClient,
      });

      expect(result.success).toBe(true);
      const graph = result.graph!;

      const observe = graph.nodes.get('observe-input');
      expect(observe).toBeDefined();
      expect(observe!.type).toBe('observation');
      expect(observe!.inputs).toHaveLength(0);

      const infer = graph.nodes.get('infer-plan');
      expect(infer).toBeDefined();
      expect(infer!.type).toBe('inference');
      expect(infer!.inputs).toHaveLength(1);
      expect(infer!.inputs[0].nodeId).toBe('observe-input');

      const action = graph.nodes.get('execute-action');
      expect(action).toBeDefined();
      expect(action!.type).toBe('action');
      expect(action!.verifiable).toBe(false);

      const assertion = graph.nodes.get('assert-success');
      expect(assertion).toBeDefined();
      expect(assertion!.type).toBe('assertion');
    });

    it('should apply security label override', async () => {
      const sampleJSON = createSampleVPIRGraphJSON();
      const mockClient = createMockClient(sampleJSON);

      const customLabel: SecurityLabel = {
        owner: 'custom-agent',
        trustLevel: 3,
        classification: 'confidential',
        createdAt: new Date().toISOString(),
      };

      const result = await generateVPIRGraph('Secure task', {
        client: mockClient,
        securityLabel: customLabel,
      });

      expect(result.success).toBe(true);
      for (const node of result.graph!.nodes.values()) {
        expect(node.label.owner).toBe('custom-agent');
        expect(node.label.trustLevel).toBe(3);
        expect(node.label.classification).toBe('confidential');
      }
    });

    it('should retry on missing tool_use block', async () => {
      const sampleJSON = createSampleVPIRGraphJSON();
      const mockClient = createMockClient(sampleJSON, true); // First call fails

      const result = await generateVPIRGraph('Retry test', {
        client: mockClient,
        maxRetries: 2,
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2); // First attempt failed, second succeeded
    });

    it('should fail after max retries with invalid output', async () => {
      const invalidJSON = {
        id: 'bad-graph',
        name: '',  // Empty name — invalid
        nodes: [],  // Empty nodes — invalid
        roots: [],
        terminals: [],
        createdAt: new Date().toISOString(),
      };
      const mockClient = createMockClient(invalidJSON);

      const result = await generateVPIRGraph('Bad task', {
        client: mockClient,
        maxRetries: 1,
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(2); // initial + 1 retry
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should include raw response for debugging', async () => {
      const sampleJSON = createSampleVPIRGraphJSON();
      const mockClient = createMockClient(sampleJSON);

      const result = await generateVPIRGraph('Debug test', {
        client: mockClient,
      });

      expect(result.rawResponse).toBeDefined();
      expect(typeof result.rawResponse).toBe('string');
    });

    it('should handle partially invalid graph with correct error reporting', async () => {
      const now = new Date().toISOString();
      const partiallyInvalid = {
        id: 'partial-graph',
        name: 'Partial',
        nodes: [
          {
            id: 'node-1',
            type: 'observation',
            operation: 'observe',
            inputs: [],
            outputs: [{ port: 'out', dataType: 'Data' }],
            evidence: [{ type: 'data', source: 'test', confidence: 0.5 }],
            label: { owner: 'test', trustLevel: 2, classification: 'internal', createdAt: now },
            verifiable: true,
            createdAt: now,
          },
          {
            id: 'node-2',
            type: 'inference',
            operation: 'infer',
            inputs: [{ nodeId: 'nonexistent', port: 'out', dataType: 'Data' }], // Bad ref
            outputs: [{ port: 'result', dataType: 'Result' }],
            evidence: [{ type: 'rule', source: 'test', confidence: 0.8 }],
            label: { owner: 'test', trustLevel: 2, classification: 'internal', createdAt: now },
            verifiable: true,
            createdAt: now,
          },
        ],
        roots: ['node-1'],
        terminals: ['node-2'],
        createdAt: now,
      };
      const mockClient = createMockClient(partiallyInvalid);

      const result = await generateVPIRGraph('Partial test', {
        client: mockClient,
        maxRetries: 0,
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Validation failed');
    });
  });

  describe('createSampleVPIRGraphJSON', () => {
    it('should produce valid Bridge Grammar JSON', () => {
      const sample = createSampleVPIRGraphJSON('validation-test');
      const result = parseVPIRGraph(sample);

      expect(result.valid).toBe(true);
      expect(result.graph).toBeDefined();
      expect(result.graph!.nodes.size).toBe(4);
    });

    it('should accept custom task name', () => {
      const sample = createSampleVPIRGraphJSON('my-custom-task');
      expect(sample.id).toBe('vpir-my-custom-task');
      expect(sample.name).toContain('my-custom-task');
    });
  });

  describe('Bridge Grammar integration', () => {
    it('should produce VPIR compatible with HoTT conversion', async () => {
      const { vpirGraphToCategory, validateCategoricalStructure } = await import(
        '../hott/vpir-bridge.js'
      );

      const sampleJSON = createSampleVPIRGraphJSON();
      const mockClient = createMockClient(sampleJSON);

      const result = await generateVPIRGraph('HoTT integration test', {
        client: mockClient,
      });

      expect(result.success).toBe(true);

      const category = vpirGraphToCategory(result.graph!);
      expect(category.objects.size).toBe(4);
      expect(category.morphisms.size).toBe(3); // 3 dependency edges

      const validation = validateCategoricalStructure(result.graph!);
      expect(validation.valid).toBe(true);
    });
  });
});

// --- Live API tests (only run with ANTHROPIC_API_KEY) ---

const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

(hasApiKey ? describe : describe.skip)('LLM VPIR Generator (Live API)', () => {
  it(
    'should generate a valid VPIR graph from a simple task',
    async () => {
      const result = await generateVPIRGraph(
        'Read a JSON configuration file, validate its schema, and write the validated config to a database.',
        { maxRetries: 2, temperature: 0.0 },
      );

      expect(result.success).toBe(true);
      expect(result.graph).toBeDefined();
      expect(result.graph!.nodes.size).toBeGreaterThanOrEqual(2);
      expect(result.graph!.roots.length).toBeGreaterThanOrEqual(1);
      expect(result.graph!.terminals.length).toBeGreaterThanOrEqual(1);

      // All nodes should have valid types
      for (const node of result.graph!.nodes.values()) {
        expect(['observation', 'inference', 'action', 'assertion', 'composition']).toContain(
          node.type,
        );
        expect(node.evidence.length).toBeGreaterThanOrEqual(1);
      }
    },
    30000,
  );

  it(
    'should generate a valid VPIR graph with security label override',
    async () => {
      const label: SecurityLabel = {
        owner: 'test-agent',
        trustLevel: 3,
        classification: 'confidential',
        createdAt: new Date().toISOString(),
      };

      const result = await generateVPIRGraph(
        'Fetch data from an API and store results.',
        { securityLabel: label, maxRetries: 2 },
      );

      expect(result.success).toBe(true);
      for (const node of result.graph!.nodes.values()) {
        expect(node.label.owner).toBe('test-agent');
      }
    },
    30000,
  );
});

// --- buildSystemPrompt (Sprint 18 / M7) ---

describe('buildSystemPrompt', () => {
  it('returns the static base verbatim when handler list is empty', () => {
    expect(buildSystemPrompt([])).toBe(VPIR_SYSTEM_PROMPT_BASE);
  });

  it('returns the base verbatim when argument is omitted', () => {
    expect(buildSystemPrompt()).toBe(VPIR_SYSTEM_PROMPT_BASE);
  });

  it('appends an Available action operations stanza when handlers are supplied', () => {
    const prompt = buildSystemPrompt(['http-fetch', 'llm-inference']);
    expect(prompt.startsWith(VPIR_SYSTEM_PROMPT_BASE)).toBe(true);
    expect(prompt).toContain('Available action operations');
    expect(prompt).toContain('- http-fetch');
    expect(prompt).toContain('- llm-inference');
  });

  it('lists handlers in the order provided', () => {
    const prompt = buildSystemPrompt(['beta', 'alpha']);
    const betaIdx = prompt.indexOf('- beta');
    const alphaIdx = prompt.indexOf('- alpha');
    expect(betaIdx).toBeGreaterThan(-1);
    expect(alphaIdx).toBeGreaterThan(-1);
    expect(betaIdx).toBeLessThan(alphaIdx);
  });

  it('is stable across calls for the same input (snapshot)', () => {
    const a = buildSystemPrompt(['x', 'y']);
    const b = buildSystemPrompt(['x', 'y']);
    expect(a).toBe(b);
  });

  it('produces a prompt populated with every standard handler when fed the registry', () => {
    const registry = createStandardRegistry();
    const prompt = buildSystemPrompt(registry.listTools());
    for (const name of registry.listTools()) {
      expect(prompt).toContain(`- ${name}`);
    }
    expect(prompt).toContain('- llm-inference');
  });

  it('tolerates an empty registry without throwing', () => {
    const empty = new ToolRegistry();
    expect(() => buildSystemPrompt(empty.listTools())).not.toThrow();
    expect(buildSystemPrompt(empty.listTools())).toBe(VPIR_SYSTEM_PROMPT_BASE);
  });
});

describe('generateVPIRGraph + registry (Sprint 18 / M7)', () => {
  it('injects the registry manifest into the system prompt at call time', async () => {
    const registry = createStandardRegistry();
    const sampleJSON = createSampleVPIRGraphJSON('manifest-test');
    let capturedSystem: string | undefined;
    const spyClient = {
      messages: {
        create: async (args: { system: string }) => {
          capturedSystem = args.system;
          return {
            id: 'mock',
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'tu',
                name: 'emit_vpir_graph',
                input: sampleJSON,
              },
            ],
            model: 'mock',
            stop_reason: 'tool_use',
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          };
        },
      },
    };

    await generateVPIRGraph('Plan a task', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: spyClient as any,
      registry,
    });

    expect(capturedSystem).toBeDefined();
    expect(capturedSystem).toContain('Available action operations');
    for (const name of registry.listTools()) {
      expect(capturedSystem).toContain(`- ${name}`);
    }
  });

  it('falls back to the base prompt when no registry is supplied', async () => {
    const sampleJSON = createSampleVPIRGraphJSON('no-registry-test');
    let capturedSystem: string | undefined;
    const spyClient = {
      messages: {
        create: async (args: { system: string }) => {
          capturedSystem = args.system;
          return {
            id: 'mock',
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'tu',
                name: 'emit_vpir_graph',
                input: sampleJSON,
              },
            ],
            model: 'mock',
            stop_reason: 'tool_use',
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          };
        },
      },
    };

    await generateVPIRGraph('Plan a task', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: spyClient as any,
    });

    expect(capturedSystem).toBe(VPIR_SYSTEM_PROMPT_BASE);
    expect(capturedSystem).not.toContain('Available action operations');
  });
});
