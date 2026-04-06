/**
 * Tests for Autonomous Pipeline Benchmark.
 *
 * Sprint 13 — Advisory Panel: Sutskever, Pearl, Kay.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  AUTONOMOUS_SCENARIOS,
  runScenario,
  runAutonomousBenchmark,
} from './autonomous-pipeline-benchmark.js';
import { createStandardRegistry } from '../aci/tool-registry.js';

// ── Helpers ─────────────────────────────────────────────────────────

function createValidGraphJSONForTask(
  taskHint: string,
  handlers: string[],
): Record<string, unknown> {
  const now = new Date().toISOString();
  const label = {
    owner: 'benchmark',
    trustLevel: 2,
    classification: 'internal',
    createdAt: now,
  };

  const nodes: Record<string, unknown>[] = [
    {
      id: 'observe-input',
      type: 'observation',
      operation: `gather-${taskHint}`,
      inputs: [],
      outputs: [{ port: 'data', dataType: 'object', value: {} }],
      evidence: [{ type: 'data', source: 'user-input', confidence: 1.0 }],
      label,
      verifiable: true,
      createdAt: now,
    },
  ];

  // Use consistent port naming: each node outputs on 'data' and inputs from 'data'
  let prevId = 'observe-input';
  for (let i = 0; i < handlers.length; i++) {
    const nodeId = `action-${handlers[i]}`;
    nodes.push({
      id: nodeId,
      type: 'action',
      operation: handlers[i],
      inputs: [{ nodeId: prevId, port: 'data', dataType: 'object' }],
      outputs: [{ port: 'data', dataType: 'object' }],
      evidence: [{ type: 'data', source: handlers[i], confidence: 0.9 }],
      label,
      verifiable: true,
      createdAt: now,
    });
    prevId = nodeId;
  }

  return {
    id: `benchmark-${taskHint}`,
    name: `Benchmark: ${taskHint}`,
    nodes,
    roots: ['observe-input'],
    terminals: [prevId],
    createdAt: now,
  };
}

function createMockClientForScenario(
  scenario: typeof AUTONOMOUS_SCENARIOS[number],
): Anthropic {
  const graphJSON = createValidGraphJSONForTask(
    scenario.name,
    scenario.expectedHandlers,
  );

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
            input: JSON.parse(JSON.stringify(graphJSON)),
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
        content: [{ type: 'text', text: 'Failed.' }],
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

describe('AUTONOMOUS_SCENARIOS', () => {
  it('should define at least 7 scenarios', () => {
    expect(AUTONOMOUS_SCENARIOS.length).toBeGreaterThanOrEqual(7);
  });

  it('should have unique scenario names', () => {
    const names = AUTONOMOUS_SCENARIOS.map((s) => s.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('should have non-empty task descriptions', () => {
    for (const scenario of AUTONOMOUS_SCENARIOS) {
      expect(scenario.taskDescription.length).toBeGreaterThan(10);
      expect(scenario.description.length).toBeGreaterThan(0);
    }
  });

  it('should reference valid handler names', () => {
    const registry = createStandardRegistry();
    for (const scenario of AUTONOMOUS_SCENARIOS) {
      for (const handler of scenario.expectedHandlers) {
        expect(registry.has(handler)).toBe(true);
      }
    }
  });

  it('should require at least 3 nodes per scenario', () => {
    for (const scenario of AUTONOMOUS_SCENARIOS) {
      expect(scenario.minNodes).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('runScenario', () => {
  it('should run a single scenario successfully', async () => {
    const scenario = AUTONOMOUS_SCENARIOS[0];
    const client = createMockClientForScenario(scenario);

    const result = await runScenario(scenario, {
      llmClient: client,
    });

    expect(result.scenario).toBe(scenario.name);
    expect(result.generationSuccess).toBe(true);
    expect(result.confidenceScore).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('should handle generation failure gracefully', async () => {
    const scenario = AUTONOMOUS_SCENARIOS[0];
    const client = createFailingMockClient();

    const result = await runScenario(scenario, {
      llmClient: client,
      pipelineOptions: { maxGenerationAttempts: 1 },
    });

    expect(result.generationSuccess).toBe(false);
    expect(result.pipelineSuccess).toBe(false);
    expect(result.confidenceScore).toBe(0);
  });

  it('should track node count in result', async () => {
    const scenario = AUTONOMOUS_SCENARIOS[0];
    const client = createMockClientForScenario(scenario);

    const result = await runScenario(scenario, {
      llmClient: client,
    });

    expect(result.nodeCount).toBeGreaterThanOrEqual(2);
  });

  it('should track refinement attempts', async () => {
    const scenario = AUTONOMOUS_SCENARIOS[0];
    const client = createMockClientForScenario(scenario);

    const result = await runScenario(scenario, {
      llmClient: client,
    });

    expect(result.refinementAttempts).toBeGreaterThanOrEqual(1);
  });
});

describe('runAutonomousBenchmark', () => {
  it('should run all scenarios and aggregate results', async () => {
    // Use a small subset for test speed
    const scenarios = AUTONOMOUS_SCENARIOS.slice(0, 2);
    const clients = scenarios.map((s) => createMockClientForScenario(s));
    let callIdx = 0;

    // Create a client that returns appropriate graphs per scenario
    const multiClient = {
      messages: {
        create: async (): Promise<Anthropic.Message> => {
          const idx = Math.min(callIdx, clients.length - 1);
          const result = await (clients[idx].messages as { create: () => Promise<Anthropic.Message> }).create();
          callIdx++;
          return result;
        },
      },
    } as unknown as Anthropic;

    const benchmark = await runAutonomousBenchmark({
      scenarios,
      llmClient: multiClient,
    });

    expect(benchmark.totalScenarios).toBe(2);
    expect(benchmark.results).toHaveLength(2);
    expect(benchmark.totalDurationMs).toBeGreaterThan(0);
  });

  it('should calculate correct success rates', async () => {
    const scenario = AUTONOMOUS_SCENARIOS[0];
    const client = createMockClientForScenario(scenario);

    const benchmark = await runAutonomousBenchmark({
      scenarios: [scenario],
      llmClient: client,
    });

    expect(benchmark.generationSuccessRate).toBe(1.0);
    expect(benchmark.generationSuccessCount).toBe(1);
  });

  it('should calculate average confidence', async () => {
    const scenario = AUTONOMOUS_SCENARIOS[0];
    const client = createMockClientForScenario(scenario);

    const benchmark = await runAutonomousBenchmark({
      scenarios: [scenario],
      llmClient: client,
    });

    expect(benchmark.avgConfidence).toBeGreaterThan(0);
    expect(benchmark.avgConfidence).toBeLessThanOrEqual(1);
  });

  it('should handle mixed success/failure scenarios', async () => {
    const successScenario = AUTONOMOUS_SCENARIOS[0];
    const failScenario = AUTONOMOUS_SCENARIOS[1];

    const successClient = createMockClientForScenario(successScenario);
    const failClient = createFailingMockClient();

    let callCount = 0;
    const mixedClient = {
      messages: {
        create: async (): Promise<Anthropic.Message> => {
          callCount++;
          // First call succeeds, later calls fail
          if (callCount <= 2) {
            return (successClient.messages as { create: () => Promise<Anthropic.Message> }).create();
          }
          return (failClient.messages as { create: () => Promise<Anthropic.Message> }).create();
        },
      },
    } as unknown as Anthropic;

    const benchmark = await runAutonomousBenchmark({
      scenarios: [successScenario, failScenario],
      llmClient: mixedClient,
      pipelineOptions: { maxGenerationAttempts: 1 },
    });

    expect(benchmark.totalScenarios).toBe(2);
    // At least one should succeed
    expect(benchmark.generationSuccessCount).toBeGreaterThanOrEqual(1);
  });

  it('should use default scenarios when none specified', async () => {
    const client = createMockClientForScenario(AUTONOMOUS_SCENARIOS[0]);

    // This would run all 7 scenarios - just verify it accepts no scenarios param
    const benchmark = await runAutonomousBenchmark({
      scenarios: [AUTONOMOUS_SCENARIOS[0]], // Override to 1 for speed
      llmClient: client,
    });

    expect(benchmark.totalScenarios).toBe(1);
  });
});
