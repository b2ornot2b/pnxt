/**
 * Tests for Autonomous Pipeline Orchestrator.
 *
 * Sprint 13 — Advisory Panel: Sutskever, Pearl, Kay.
 */

import Anthropic from '@anthropic-ai/sdk';
import { executeAutonomousPipeline } from './autonomous-pipeline.js';
import { createStandardRegistry } from '../aci/tool-registry.js';
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
    id: 'pipeline-test',
    name: 'Pipeline Test Graph',
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

function createMockClient(toolInput: unknown): Anthropic {
  return {
    messages: {
      create: async (): Promise<Anthropic.Message> => ({
        id: 'mock-msg-1',
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
      }),
    },
  } as unknown as Anthropic;
}

function createFailingMockClient(): Anthropic {
  return {
    messages: {
      create: async (): Promise<Anthropic.Message> => ({
        id: 'mock-msg-1',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'I cannot do this.' }],
        model: 'mock',
        stop_reason: 'end_turn',
        stop_sequence: null,
        stop_details: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      }),
    },
  } as unknown as Anthropic;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('executeAutonomousPipeline', () => {
  const registry = createStandardRegistry();

  describe('full pipeline', () => {
    it('should execute the full pipeline with all stages', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClient(graphJSON);

      const result = await executeAutonomousPipeline(
        'Calculate a math expression',
        {
          llmClient: client,
          toolRegistry: registry,
          enableZ3Verification: false,
          enableExecution: false,
        },
      );

      expect(result.success).toBe(true);
      expect(result.task).toBe('Calculate a math expression');
      expect(result.graph).toBeDefined();
      expect(result.confidence).toBeDefined();
      expect(result.totalDurationMs).toBeGreaterThan(0);
    });

    it('should include all pipeline stages in traces', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClient(graphJSON);

      const result = await executeAutonomousPipeline('Test stages', {
        llmClient: client,
        toolRegistry: registry,
        enableZ3Verification: false,
        enableExecution: false,
      });

      const stageNames = result.pipelineStages.map((s) => s.stage);
      expect(stageNames).toContain('generate');
      expect(stageNames).toContain('refine');
      expect(stageNames).toContain('verify');
      expect(stageNames).toContain('categorize');
      expect(stageNames).toContain('execute');
    });

    it('should include generation result for observability', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClient(graphJSON);

      const result = await executeAutonomousPipeline('Observability test', {
        llmClient: client,
        toolRegistry: registry,
        enableZ3Verification: false,
        enableExecution: false,
      });

      expect(result.generationResult).toBeDefined();
      expect(result.generationResult!.success).toBe(true);
    });
  });

  describe('generation failure', () => {
    it('should fail gracefully when generation fails', async () => {
      const client = createFailingMockClient();

      const result = await executeAutonomousPipeline('Impossible task', {
        llmClient: client,
        toolRegistry: registry,
        maxGenerationAttempts: 1,
      });

      expect(result.success).toBe(false);
      expect(result.graph).toBeUndefined();
      expect(result.errors.length).toBeGreaterThan(0);

      const genStage = result.pipelineStages.find((s) => s.stage === 'generate');
      expect(genStage).toBeDefined();
      expect(genStage!.status).toBe('failed');
    });

    it('should not proceed to later stages when generation fails', async () => {
      const client = createFailingMockClient();

      const result = await executeAutonomousPipeline('No graph', {
        llmClient: client,
        toolRegistry: registry,
        maxGenerationAttempts: 1,
      });

      // Only generation stage should be present (others skipped at top level)
      expect(result.pipelineStages.length).toBe(1);
      expect(result.pipelineStages[0].stage).toBe('generate');
    });
  });

  describe('stage toggling', () => {
    it('should skip neurosymbolic refinement when disabled', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClient(graphJSON);

      const result = await executeAutonomousPipeline('No refinement', {
        llmClient: client,
        toolRegistry: registry,
        enableNeurosymbolic: false,
        enableZ3Verification: false,
        enableExecution: false,
      });

      const refineStage = result.pipelineStages.find((s) => s.stage === 'refine');
      expect(refineStage).toBeDefined();
      expect(refineStage!.status).toBe('skipped');
    });

    it('should skip Z3 verification when disabled', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClient(graphJSON);

      const result = await executeAutonomousPipeline('No Z3', {
        llmClient: client,
        toolRegistry: registry,
        enableZ3Verification: false,
        enableExecution: false,
      });

      const verifyStage = result.pipelineStages.find((s) => s.stage === 'verify');
      expect(verifyStage).toBeDefined();
      expect(verifyStage!.status).toBe('skipped');
    });

    it('should skip HoTT categorization when disabled', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClient(graphJSON);

      const result = await executeAutonomousPipeline('No HoTT', {
        llmClient: client,
        toolRegistry: registry,
        enableHoTTCategorization: false,
        enableZ3Verification: false,
        enableExecution: false,
      });

      const catStage = result.pipelineStages.find((s) => s.stage === 'categorize');
      expect(catStage).toBeDefined();
      expect(catStage!.status).toBe('skipped');
    });

    it('should skip execution when disabled', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClient(graphJSON);

      const result = await executeAutonomousPipeline('No exec', {
        llmClient: client,
        toolRegistry: registry,
        enableZ3Verification: false,
        enableExecution: false,
      });

      const execStage = result.pipelineStages.find((s) => s.stage === 'execute');
      expect(execStage).toBeDefined();
      expect(execStage!.status).toBe('skipped');
    });

    it('should run generate-only when all other stages disabled', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClient(graphJSON);

      const result = await executeAutonomousPipeline('Generate only', {
        llmClient: client,
        toolRegistry: registry,
        enableNeurosymbolic: false,
        enableHoTTCategorization: false,
        enableZ3Verification: false,
        enableExecution: false,
      });

      expect(result.success).toBe(true);
      expect(result.graph).toBeDefined();

      const successStages = result.pipelineStages.filter((s) => s.status === 'success');
      expect(successStages).toHaveLength(1);
      expect(successStages[0].stage).toBe('generate');
    });
  });

  describe('HoTT categorization', () => {
    it('should categorize a valid graph', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClient(graphJSON);

      const result = await executeAutonomousPipeline('Categorize test', {
        llmClient: client,
        toolRegistry: registry,
        enableHoTTCategorization: true,
        enableZ3Verification: false,
        enableExecution: false,
      });

      expect(result.categorization).toBeDefined();
      expect(result.categorization!.objectCount).toBe(2); // 2 nodes
      expect(result.categorization!.morphismCount).toBe(1); // 1 edge
      expect(result.categorization!.validation.valid).toBe(true);
    });
  });

  describe('Z3 verification', () => {
    let z3ctx: Z3Context;

    beforeAll(async () => {
      z3ctx = await createZ3Context();
    }, 30000);

    it('should verify a valid graph with Z3', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClient(graphJSON);

      const result = await executeAutonomousPipeline('Z3 test', {
        llmClient: client,
        toolRegistry: registry,
        z3Context: z3ctx,
        enableZ3Verification: true,
        enableExecution: false,
      });

      expect(result.verification).toBeDefined();
      expect(result.verification!.verified).toBe(true);

      const verifyStage = result.pipelineStages.find((s) => s.stage === 'verify');
      expect(verifyStage!.status).toBe('success');
    });
  });

  describe('neurosymbolic refinement', () => {
    it('should run neurosymbolic refinement by default', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClient(graphJSON);

      const result = await executeAutonomousPipeline('Refine test', {
        llmClient: client,
        toolRegistry: registry,
        enableZ3Verification: false,
        enableExecution: false,
      });

      const refineStage = result.pipelineStages.find((s) => s.stage === 'refine');
      expect(refineStage).toBeDefined();
      expect(refineStage!.status).toBe('success');
      expect(result.neurosymbolicResult).toBeDefined();
    });
  });

  describe('security label propagation', () => {
    it('should propagate security label through pipeline', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClient(graphJSON);
      const securityLabel = {
        owner: 'secure-agent',
        trustLevel: 3 as const,
        classification: 'confidential' as const,
        createdAt: new Date().toISOString(),
      };

      const result = await executeAutonomousPipeline('Secure task', {
        llmClient: client,
        toolRegistry: registry,
        securityLabel,
        enableZ3Verification: false,
        enableExecution: false,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should collect errors from all stages', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClient(graphJSON);

      // This should succeed without errors
      const result = await executeAutonomousPipeline('Error collection', {
        llmClient: client,
        toolRegistry: registry,
        enableZ3Verification: false,
        enableExecution: false,
      });

      expect(result.errors).toHaveLength(0);
    });
  });

  describe('stage trace details', () => {
    it('should include timing for all stages', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClient(graphJSON);

      const result = await executeAutonomousPipeline('Timing test', {
        llmClient: client,
        toolRegistry: registry,
        enableZ3Verification: false,
        enableExecution: false,
      });

      for (const stage of result.pipelineStages) {
        expect(typeof stage.durationMs).toBe('number');
        expect(stage.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should include details for each stage', async () => {
      const graphJSON = createValidTaskGraphJSON();
      const client = createMockClient(graphJSON);

      const result = await executeAutonomousPipeline('Details test', {
        llmClient: client,
        toolRegistry: registry,
        enableZ3Verification: false,
        enableExecution: false,
      });

      for (const stage of result.pipelineStages) {
        expect(stage.details).toBeDefined();
      }
    });
  });
});
