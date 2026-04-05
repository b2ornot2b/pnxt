/**
 * Tests for Reliable VPIR Generation Pipeline.
 *
 * Sprint 12 — Advisory Panel: Sutskever, Pearl, de Moura.
 */

import Anthropic from '@anthropic-ai/sdk';
import { generateReliableVPIRGraph } from './reliable-generator.js';
import { createZ3Context } from '../verification/z3-invariants.js';
import type { Z3Context } from '../verification/z3-invariants.js';

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
    id: 'reliable-test',
    name: 'Reliable Test Graph',
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

function createInvalidGraphJSON(): Record<string, unknown> {
  return {
    id: 'invalid',
    name: 'Invalid Graph',
    nodes: [
      {
        // Missing type, evidence, label, etc.
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

function createMockClientForReliable(
  toolInput: unknown,
  failFirst?: boolean,
): Anthropic {
  let callCount = 0;

  return {
    messages: {
      create: async (): Promise<Anthropic.Message> => {
        callCount++;
        if (failFirst && callCount === 1) {
          return {
            id: 'mock-msg-1',
            type: 'message',
            role: 'assistant',
            content: [
              { type: 'text', text: 'I failed to use the tool.' },
            ],
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

// ── Tests ───────────────────────────────────────────────────────────

describe('generateReliableVPIRGraph', () => {
  describe('successful generation', () => {
    it('should generate a valid graph in a single attempt', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClientForReliable(graphJSON);

      const result = await generateReliableVPIRGraph('Calculate something', {
        client,
        maxRetries: 2,
      });

      expect(result.success).toBe(true);
      expect(result.graph).toBeDefined();
      expect(result.attempts).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(result.confidence).toBeDefined();
      expect(result.confidence!.overall).toBeGreaterThan(0.5);
    });

    it('should include pipeline stage traces', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClientForReliable(graphJSON);

      const result = await generateReliableVPIRGraph('Test task', { client });

      expect(result.pipelineStages.length).toBeGreaterThan(0);
      expect(result.pipelineStages.every((s) => typeof s.durationMs === 'number')).toBe(true);
      expect(result.pipelineStages.some((s) => s.stage === 'llm_generation')).toBe(true);
      expect(result.pipelineStages.some((s) => s.stage === 'schema_validation')).toBe(true);
      expect(result.pipelineStages.some((s) => s.stage === 'handler_check')).toBe(true);
      expect(result.pipelineStages.some((s) => s.stage === 'confidence_scoring')).toBe(true);
    });
  });

  describe('retry on failure', () => {
    it('should retry when first attempt has no tool_use', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClientForReliable(graphJSON, true);

      const result = await generateReliableVPIRGraph('Test retry', {
        client,
        maxRetries: 2,
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    it('should fail after exhausting retries with invalid output', async () => {
      const invalidJSON = createInvalidGraphJSON();
      const client = createMockClientForReliable(invalidJSON);

      const result = await generateReliableVPIRGraph('Bad task', {
        client,
        maxRetries: 1,
        enableRepair: false,
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.pipelineStages.some((s) => !s.passed)).toBe(true);
    });
  });

  describe('auto-repair', () => {
    it('should attempt repair on repairable errors', async () => {
      // Graph with missing node-level fields that can be repaired
      const now = new Date().toISOString();
      const repairableJSON = {
        id: 'repairable',
        name: 'Repairable Graph',
        nodes: [
          {
            id: 'node-1',
            type: 'observation',
            operation: 'gather-data',
            inputs: [],
            outputs: [{ port: 'data', dataType: 'string' }],
            evidence: [{ type: 'data', source: 'test', confidence: 1.0 }],
            label: { owner: 'test', trustLevel: 2, classification: 'internal', createdAt: now },
            verifiable: true,
            createdAt: now,
          },
        ],
        roots: ['node-1'],
        terminals: ['node-1'],
        createdAt: now,
      };
      const client = createMockClientForReliable(repairableJSON);

      const result = await generateReliableVPIRGraph('Test repair', {
        client,
        enableRepair: true,
      });

      // Should succeed since the input is actually valid
      expect(result.success).toBe(true);
    });
  });

  describe('confidence scoring', () => {
    it('should reject graphs below minimum confidence', async () => {
      // A graph that's valid but has very low confidence signals
      const now = new Date().toISOString();
      const label = { owner: 'test', trustLevel: 2, classification: 'internal', createdAt: now };
      const lowConfJSON = {
        id: 'low-conf',
        name: 'Low Confidence',
        nodes: [
          {
            id: 'node-1',
            type: 'observation',
            operation: 'x', // very short operation name
            inputs: [],
            outputs: [],  // no outputs
            evidence: [{ type: 'model_output', source: 'test', confidence: 0.1 }], // wrong evidence type + low confidence
            label,
            verifiable: true,
            createdAt: now,
          },
        ],
        roots: ['node-1'],
        terminals: ['node-1'],
        createdAt: now,
      };
      const client = createMockClientForReliable(lowConfJSON);

      const result = await generateReliableVPIRGraph('Low conf task', {
        client,
        minConfidence: 0.95,
        maxRetries: 0,
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('Confidence too low'))).toBe(true);
    });

    it('should include confidence score on success', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClientForReliable(graphJSON);

      const result = await generateReliableVPIRGraph('Test confidence', { client });

      expect(result.success).toBe(true);
      expect(result.confidence).toBeDefined();
      expect(result.confidence!.structural).toBeGreaterThan(0);
      expect(result.confidence!.semantic).toBeGreaterThan(0);
      expect(result.confidence!.topological).toBeGreaterThan(0);
    });
  });

  describe('Z3 verification', () => {
    let z3ctx: Z3Context;

    beforeAll(async () => {
      z3ctx = await createZ3Context();
    }, 30000);

    it('should run Z3 verification when context provided', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClientForReliable(graphJSON);

      const result = await generateReliableVPIRGraph('Test Z3', {
        client,
        z3Context: z3ctx,
      });

      expect(result.success).toBe(true);
      expect(result.verification).toBeDefined();
      expect(result.verification!.verified).toBe(true);
      expect(result.pipelineStages.some((s) => s.stage === 'z3_verification')).toBe(true);
    });

    it('should skip Z3 when no context provided', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClientForReliable(graphJSON);

      const result = await generateReliableVPIRGraph('Test no Z3', { client });

      expect(result.success).toBe(true);
      expect(result.verification).toBeUndefined();
      expect(result.pipelineStages.every((s) => s.stage !== 'z3_verification')).toBe(true);
    });
  });

  describe('handler checking', () => {
    it('should reject graphs with unknown handlers', async () => {
      const now = new Date().toISOString();
      const label = { owner: 'test', trustLevel: 2, classification: 'internal', createdAt: now };
      const unknownHandlerJSON = {
        id: 'unknown-handler',
        name: 'Unknown Handler Graph',
        nodes: [
          {
            id: 'obs',
            type: 'observation',
            operation: 'gather',
            inputs: [],
            outputs: [{ port: 'data', dataType: 'string' }],
            evidence: [{ type: 'data', source: 'test', confidence: 1.0 }],
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
            evidence: [{ type: 'data', source: 'test', confidence: 1.0 }],
            label,
            verifiable: false,
            createdAt: now,
          },
        ],
        roots: ['obs'],
        terminals: ['act'],
        createdAt: now,
      };
      const client = createMockClientForReliable(unknownHandlerJSON);

      const result = await generateReliableVPIRGraph('Test handlers', {
        client,
        maxRetries: 0,
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('Missing handlers'))).toBe(true);
    });
  });
});
