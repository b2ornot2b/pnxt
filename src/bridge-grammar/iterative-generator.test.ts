/**
 * Tests for Iterative Refinement Generator.
 *
 * Sprint 13 — Advisory Panel: Sutskever, Pearl, Kay.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  generateWithRefinement,
  buildRefinementPrompt,
} from './iterative-generator.js';
import { diagnose } from './bridge-errors.js';

// ── Helpers ─────────────────────────────────────────────────────────

function createValidTaskGraphJSON(): Record<string, unknown> {
  const now = new Date().toISOString();
  const label = {
    owner: 'test',
    trustLevel: 2,
    classification: 'internal',
    createdAt: now,
  };

  return {
    id: 'iterative-test',
    name: 'Iterative Test Graph',
    nodes: [
      {
        id: 'observe-input',
        type: 'observation',
        operation: 'gather-input-data',
        inputs: [],
        outputs: [{ port: 'data', dataType: 'object', value: { x: 42 } }],
        evidence: [{ type: 'data', source: 'user-input', confidence: 1.0 }],
        label,
        verifiable: true,
        createdAt: now,
      },
      {
        id: 'process-data',
        type: 'action',
        operation: 'math-eval',
        inputs: [{ nodeId: 'observe-input', port: 'data', dataType: 'object' }],
        outputs: [{ port: 'result', dataType: 'number' }],
        evidence: [{ type: 'data', source: 'math-eval', confidence: 1.0 }],
        label,
        verifiable: true,
        createdAt: now,
      },
    ],
    roots: ['observe-input'],
    terminals: ['process-data'],
    createdAt: now,
  };
}

function createLowConfidenceGraphJSON(): Record<string, unknown> {
  const now = new Date().toISOString();
  const label = { owner: 'test', trustLevel: 2, classification: 'internal', createdAt: now };
  return {
    id: 'low-conf',
    name: 'Low Confidence',
    nodes: [
      {
        id: 'node-1',
        type: 'observation',
        operation: 'x', // short operation name → low semantic score
        inputs: [],
        outputs: [], // no outputs → low structural score
        evidence: [{ type: 'model_output', source: 'test', confidence: 0.1 }],
        label,
        verifiable: true,
        createdAt: now,
      },
    ],
    roots: ['node-1'],
    terminals: ['node-1'],
    createdAt: now,
  };
}

function createInvalidGraphJSON(): Record<string, unknown> {
  return {
    id: 'invalid',
    name: 'Invalid Graph',
    nodes: [
      {
        id: 'broken-node',
        operation: 'test',
        inputs: [],
        outputs: [{ port: 'data', dataType: 'string' }],
      },
    ],
    roots: ['broken-node'],
    terminals: ['broken-node'],
    createdAt: new Date().toISOString(),
  };
}

function createMockClient(
  toolInput: unknown,
  options?: { failFirst?: boolean; failAll?: boolean },
): Anthropic {
  let callCount = 0;

  return {
    messages: {
      create: async (): Promise<Anthropic.Message> => {
        callCount++;

        if (options?.failAll) {
          return {
            id: `mock-msg-${callCount}`,
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'I failed to use the tool.' }],
            model: 'mock',
            stop_reason: 'end_turn',
            stop_sequence: null,
            stop_details: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          } as Anthropic.Message;
        }

        if (options?.failFirst && callCount === 1) {
          return {
            id: 'mock-msg-1',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'I failed to use the tool.' }],
            model: 'mock',
            stop_reason: 'end_turn',
            stop_sequence: null,
            stop_details: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          } as Anthropic.Message;
        }

        return {
          id: `mock-msg-${callCount}`,
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'mock-tool-1',
              name: 'emit_vpir_graph',
              input: JSON.parse(JSON.stringify(toolInput)),
            },
          ],
          model: 'mock',
          stop_reason: 'tool_use',
          stop_sequence: null,
          stop_details: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        } as Anthropic.Message;
      },
    },
  } as unknown as Anthropic;
}

/**
 * Create a mock client that returns different outputs on successive calls.
 */
function createSequentialMockClient(
  outputs: Array<unknown | null>,
): Anthropic {
  let callCount = 0;

  return {
    messages: {
      create: async (): Promise<Anthropic.Message> => {
        const idx = Math.min(callCount, outputs.length - 1);
        callCount++;
        const output = outputs[idx];

        if (output === null) {
          return {
            id: `mock-msg-${callCount}`,
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Failed.' }],
            model: 'mock',
            stop_reason: 'end_turn',
            stop_sequence: null,
            stop_details: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          } as Anthropic.Message;
        }

        return {
          id: `mock-msg-${callCount}`,
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: `mock-tool-${callCount}`,
              name: 'emit_vpir_graph',
              input: JSON.parse(JSON.stringify(output)),
            },
          ],
          model: 'mock',
          stop_reason: 'tool_use',
          stop_sequence: null,
          stop_details: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        } as Anthropic.Message;
      },
    },
  } as unknown as Anthropic;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('generateWithRefinement', () => {
  describe('successful first attempt', () => {
    it('should succeed on first attempt with valid output', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClient(graphJSON);

      const result = await generateWithRefinement('Calculate something', {
        client,
        maxAttempts: 3,
      });

      expect(result.success).toBe(true);
      expect(result.graph).toBeDefined();
      expect(result.totalAttempts).toBe(1);
      expect(result.converged).toBe(true);
      expect(result.refinementHistory).toHaveLength(0);
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].success).toBe(true);
    });

    it('should include confidence score on success', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClient(graphJSON);

      const result = await generateWithRefinement('Test task', { client });

      expect(result.confidence).toBeDefined();
      expect(result.confidence!.overall).toBeGreaterThan(0.5);
    });

    it('should record pipeline stages', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClient(graphJSON);

      const result = await generateWithRefinement('Test stages', { client });

      expect(result.pipelineStages.length).toBeGreaterThan(0);
      expect(result.pipelineStages.some((s) => s.stage === 'llm_generation')).toBe(true);
    });

    it('should track total duration', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClient(graphJSON);

      const result = await generateWithRefinement('Test duration', { client });

      expect(result.totalDurationMs).toBeGreaterThan(0);
    });
  });

  describe('refinement on failure', () => {
    it('should retry with feedback after first attempt fails', async () => {
      // First attempt returns invalid, second returns valid
      const invalidJSON = createInvalidGraphJSON();
      const validJSON = createValidTaskGraphJSON();
      const client = createSequentialMockClient([invalidJSON, validJSON]);

      const result = await generateWithRefinement('Test retry', {
        client,
        maxAttempts: 3,
        maxRetries: 0, // single-pass per attempt
      });

      expect(result.success).toBe(true);
      expect(result.totalAttempts).toBe(2);
      expect(result.refinementHistory.length).toBeGreaterThan(0);
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts[0].success).toBe(false);
      expect(result.attempts[1].success).toBe(true);
    });

    it('should fail after exhausting all attempts', async () => {
      const invalidJSON = createInvalidGraphJSON();
      const client = createMockClient(invalidJSON);

      const result = await generateWithRefinement('Bad task', {
        client,
        maxAttempts: 2,
        maxRetries: 0,
        enableRepair: false,
      });

      expect(result.success).toBe(false);
      expect(result.totalAttempts).toBe(2);
      expect(result.converged).toBe(false);
    });

    it('should accumulate refinement history across attempts', async () => {
      const invalidJSON = createInvalidGraphJSON();
      const client = createMockClient(invalidJSON);

      const result = await generateWithRefinement('Accumulate errors', {
        client,
        maxAttempts: 3,
        maxRetries: 0,
        enableRepair: false,
      });

      // Should have feedback messages for all but the last attempt
      expect(result.refinementHistory.length).toBeGreaterThan(0);
    });

    it('should use structured feedback strategy by default', async () => {
      const invalidJSON = createInvalidGraphJSON();
      const validJSON = createValidTaskGraphJSON();
      const client = createSequentialMockClient([invalidJSON, validJSON]);

      const result = await generateWithRefinement('Structured feedback', {
        client,
        maxAttempts: 2,
        maxRetries: 0,
      });

      if (result.refinementHistory.length > 0) {
        expect(result.refinementHistory[0]).toContain('structured diagnosis');
      }
    });

    it('should use contextual feedback strategy when specified', async () => {
      const invalidJSON = createInvalidGraphJSON();
      const validJSON = createValidTaskGraphJSON();
      const client = createSequentialMockClient([invalidJSON, validJSON]);

      const result = await generateWithRefinement('Contextual feedback', {
        client,
        maxAttempts: 2,
        maxRetries: 0,
        feedbackStrategy: 'contextual',
      });

      if (result.refinementHistory.length > 0) {
        expect(result.refinementHistory[0]).toContain('error(s)');
      }
    });
  });

  describe('convergence', () => {
    it('should report converged=true when confidence meets threshold', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClient(graphJSON);

      const result = await generateWithRefinement('Converge test', {
        client,
        minConfidence: 0.5,
      });

      expect(result.converged).toBe(true);
    });

    it('should report converged=false when confidence below threshold', async () => {
      const lowConfJSON = createLowConfidenceGraphJSON();
      const client = createMockClient(lowConfJSON);

      const result = await generateWithRefinement('Low confidence', {
        client,
        maxAttempts: 2,
        maxRetries: 0,
        minConfidence: 0.99,
      });

      expect(result.converged).toBe(false);
    });
  });

  describe('timeout handling', () => {
    it('should respect refinement timeout', async () => {
      const graphJSON = createValidTaskGraphJSON();
      // Create a client that delays responses
      let callCount = 0;
      const client = {
        messages: {
          create: async (): Promise<Anthropic.Message> => {
            callCount++;
            // Simulate delay
            await new Promise((r) => setTimeout(r, 50));
            return {
              id: `mock-msg-${callCount}`,
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  id: 'mock-tool-1',
                  name: 'emit_vpir_graph',
                  input: JSON.parse(JSON.stringify(graphJSON)),
                },
              ],
              model: 'mock',
              stop_reason: 'tool_use',
              stop_sequence: null,
              stop_details: null,
              usage: { input_tokens: 0, output_tokens: 0 },
            } as Anthropic.Message;
          },
        },
      } as unknown as Anthropic;

      const result = await generateWithRefinement('Timeout test', {
        client,
        maxAttempts: 100,
        refinementTimeout: 1, // Very short timeout
      });

      // Should complete quickly due to timeout
      expect(result.totalAttempts).toBeLessThanOrEqual(2);
    });
  });

  describe('best result selection', () => {
    it('should fail when no attempt meets confidence threshold', async () => {
      // All attempts produce valid but low-confidence graphs that the
      // reliable generator rejects
      const lowConfJSON = createLowConfidenceGraphJSON();
      const client = createMockClient(lowConfJSON);

      const result = await generateWithRefinement('Best effort', {
        client,
        maxAttempts: 2,
        maxRetries: 0,
        minConfidence: 0.99, // unreachably high
      });

      // The reliable generator rejects below-threshold graphs
      expect(result.success).toBe(false);
      expect(result.converged).toBe(false);
      expect(result.totalAttempts).toBe(2);
    });

    it('should fail when all attempts produce no valid graph', async () => {
      const client = createMockClient(null, { failAll: true });

      const result = await generateWithRefinement('All fail', {
        client,
        maxAttempts: 2,
        maxRetries: 0,
      });

      expect(result.success).toBe(false);
      expect(result.graph).toBeUndefined();
    });
  });

  describe('attempt records', () => {
    it('should record duration for each attempt', async () => {
      const validJSON = createValidTaskGraphJSON();
      const client = createMockClient(validJSON);

      const result = await generateWithRefinement('Duration tracking', { client });

      for (const record of result.attempts) {
        expect(record.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should record errors for failed attempts', async () => {
      const invalidJSON = createInvalidGraphJSON();
      const validJSON = createValidTaskGraphJSON();
      const client = createSequentialMockClient([invalidJSON, validJSON]);

      const result = await generateWithRefinement('Error recording', {
        client,
        maxAttempts: 2,
        maxRetries: 0,
      });

      expect(result.attempts[0].errors.length).toBeGreaterThan(0);
    });
  });
});

describe('buildRefinementPrompt', () => {
  it('should build structured feedback from diagnosis', () => {
    const diagnosis = diagnose([
      { code: 'MISSING_FIELD', path: '/nodes/0/createdAt', message: 'Missing required field: createdAt' },
    ]);

    const prompt = buildRefinementPrompt(diagnosis, [], 'structured');

    expect(prompt).toContain('structured diagnosis');
    expect(prompt).toContain('regenerate');
  });

  it('should build contextual feedback from diagnosis', () => {
    const diagnosis = diagnose([
      { code: 'MISSING_FIELD', path: '/nodes/0/createdAt', message: 'Missing required field: createdAt' },
    ]);

    const prompt = buildRefinementPrompt(diagnosis, [], 'contextual');

    expect(prompt).toContain('error(s)');
    expect(prompt).toContain('How to fix');
  });

  it('should include previous errors in feedback', () => {
    const diagnosis = diagnose([
      { code: 'MISSING_FIELD', path: '/nodes/0/id', message: 'Missing id' },
    ]);

    const prompt = buildRefinementPrompt(
      diagnosis,
      ['Earlier error: bad format'],
      'structured',
    );

    expect(prompt).toContain('Earlier error: bad format');
  });

  it('should handle empty diagnosis', () => {
    const diagnosis = diagnose([]);
    const prompt = buildRefinementPrompt(diagnosis, [], 'structured');

    expect(prompt).toContain('No errors found');
  });

  it('should limit included previous errors', () => {
    const diagnosis = diagnose([
      { code: 'MISSING_FIELD', path: '/nodes/0/id', message: 'Missing id' },
    ]);

    const manyErrors = Array.from({ length: 10 }, (_, i) => `Error ${i}`);
    const prompt = buildRefinementPrompt(diagnosis, manyErrors, 'structured');

    // Should only include last 3 errors
    expect(prompt).toContain('Error 7');
    expect(prompt).toContain('Error 8');
    expect(prompt).toContain('Error 9');
    expect(prompt).not.toContain('Error 0');
  });
});
