import {
  createWeatherToolRegistration,
  createWeatherToolHandler,
  createWeatherVPIRGraph,
  createWeatherVPIRGraphWithApproval,
  createWeatherVPIRGraphWithLLMSummary,
  createWeatherExecutionContext,
  createWeatherBenchmarkDefinition,
  runWeatherPipeline,
  addApprovalGateHandler,
  addLLMSummaryPromptHandler,
} from './weather-api-shim.js';
import { executeGraph } from '../vpir/vpir-interpreter.js';
import { NoopHumanGateway } from '../vpir/human-gateway.js';
import { DPNRuntime } from '../channel/dpn-runtime.js';
import { BenchmarkRunner } from './benchmark-runner.js';
import { validateGraph } from '../vpir/vpir-validator.js';
import { vpirGraphToCategory } from '../hott/vpir-bridge.js';
import { createLabel, canFlowTo } from '../types/ifc.js';
import type { SecurityLabel } from '../types/ifc.js';
import type { VPIRExecutionContext } from '../types/vpir-execution.js';
import { InMemoryACIGateway } from '../aci/aci-gateway.js';
import { llmInferenceRegistration } from '../aci/handler-library.js';

// ── Helpers ─────────────────────────────────────────────────────────

function makeLabel(): SecurityLabel {
  return createLabel('weather-test', 2, 'internal');
}

function makeGateway(): VPIRExecutionContext['aciGateway'] {
  const handler = createWeatherToolHandler();
  return {
    invoke: async (inv) => ({
      requestId: inv.requestId,
      success: true,
      output: await handler(inv.input),
      duration: 1,
    }),
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Weather API Shim', () => {
  describe('Tool Registration', () => {
    it('should create valid ToolRegistration', () => {
      const reg = createWeatherToolRegistration();
      expect(reg.name).toBe('getWeather');
      expect(reg.description).toBeDefined();
    });

    it('should have network side effect', () => {
      const reg = createWeatherToolRegistration();
      expect(reg.sideEffects).toContain('network');
    });

    it('should require trust level 2 for weather data access', () => {
      const reg = createWeatherToolRegistration();
      expect(reg.requiredTrustLevel).toBe(2);
    });

    it('should have correct input/output schemas', () => {
      const reg = createWeatherToolRegistration();
      expect(reg.inputSchema.properties).toHaveProperty('location');
      expect(reg.outputSchema.properties).toHaveProperty('temperature');
      expect(reg.outputSchema.properties).toHaveProperty('conditions');
    });

    it('should be retryable and idempotent', () => {
      const reg = createWeatherToolRegistration();
      expect(reg.ops.retryable).toBe(true);
      expect(reg.ops.idempotent).toBe(true);
    });
  });

  describe('Weather Tool Handler', () => {
    it('should return weather data for known location', async () => {
      const handler = createWeatherToolHandler();
      const result = await handler({ location: 'Tokyo' }) as Record<string, unknown>;
      expect(result.location).toBe('Tokyo, Japan');
      expect(result.temperature).toBe(22);
      expect(result.conditions).toBe('partly cloudy');
    });

    it('should handle case-insensitive locations', async () => {
      const handler = createWeatherToolHandler();
      const result = await handler({ location: 'LONDON' }) as Record<string, unknown>;
      expect(result.location).toBe('London, UK');
    });

    it('should return default data for unknown locations', async () => {
      const handler = createWeatherToolHandler();
      const result = await handler({ location: 'Mars' }) as Record<string, unknown>;
      expect(result.temperature).toBe(20);
      expect(result.conditions).toBe('clear');
    });

    it('should respect units parameter', async () => {
      const handler = createWeatherToolHandler();
      const result = await handler({ location: 'Tokyo', units: 'imperial' }) as Record<string, unknown>;
      expect(result.units).toBe('imperial');
    });
  });

  describe('Weather VPIR Graph', () => {
    it('should create valid VPIR graph', () => {
      const graph = createWeatherVPIRGraph("What's the weather in Tokyo?", makeLabel());
      const validation = validateGraph(graph);
      expect(validation.valid).toBe(true);
    });

    it('should have observation root node', () => {
      const graph = createWeatherVPIRGraph('Weather in London', makeLabel());
      expect(graph.roots).toContain('observe-query');
      const root = graph.nodes.get('observe-query')!;
      expect(root.type).toBe('observation');
    });

    it('should have action node referencing getWeather tool', () => {
      const graph = createWeatherVPIRGraph('Weather?', makeLabel());
      const action = graph.nodes.get('action-fetch')!;
      expect(action.type).toBe('action');
      expect(action.operation).toBe('getWeather');
    });

    it('should have assertion terminal node', () => {
      const graph = createWeatherVPIRGraph('Weather?', makeLabel());
      expect(graph.terminals).toContain('assert-valid');
      const terminal = graph.nodes.get('assert-valid')!;
      expect(terminal.type).toBe('assertion');
    });

    it('should have 6 nodes in correct progression', () => {
      const graph = createWeatherVPIRGraph('Weather?', makeLabel());
      expect(graph.nodes.size).toBe(7);

      const types = Array.from(graph.nodes.values()).map((n) => n.type);
      expect(types).toContain('observation');
      expect(types).toContain('inference');
      expect(types).toContain('action');
      expect(types).toContain('assertion');
    });

    it('should have consistent IFC labels across all nodes', () => {
      const label = makeLabel();
      const graph = createWeatherVPIRGraph('Weather?', label);

      for (const node of graph.nodes.values()) {
        expect(node.label.trustLevel).toBe(label.trustLevel);
        expect(node.label.classification).toBe(label.classification);

        // All nodes should be able to flow to each other (same label).
        for (const other of graph.nodes.values()) {
          expect(canFlowTo(node.label, other.label)).toBe(true);
        }
      }
    });

    it('should store query as observation output value', () => {
      const query = "What's the weather in Tokyo?";
      const graph = createWeatherVPIRGraph(query, makeLabel());
      const obs = graph.nodes.get('observe-query')!;
      expect(obs.outputs[0].value).toBe(query);
    });
  });

  describe('Weather Execution Context', () => {
    it('should register all required inference handlers', () => {
      const ctx = createWeatherExecutionContext(makeGateway());
      expect(ctx.handlers.has('extract-location')).toBe(true);
      expect(ctx.handlers.has('determine-parameters')).toBe(true);
      expect(ctx.handlers.has('format-response')).toBe(true);
    });

    it('should register assertion handler for validation', () => {
      const ctx = createWeatherExecutionContext(makeGateway());
      expect(ctx.assertionHandlers?.has('validate-response')).toBe(true);
    });

    it('should include ACI gateway reference', () => {
      const gateway = makeGateway();
      const ctx = createWeatherExecutionContext(gateway);
      expect(ctx.aciGateway).toBe(gateway);
    });

    it('should use provided agent ID', () => {
      const ctx = createWeatherExecutionContext(makeGateway(), 'custom-agent');
      expect(ctx.agentId).toBe('custom-agent');
    });
  });

  describe('DPN Compilation', () => {
    it('should compile weather VPIR graph to DPN', () => {
      const graph = createWeatherVPIRGraph('Weather in Tokyo', makeLabel());
      const ctx = createWeatherExecutionContext(makeGateway());
      const runtime = new DPNRuntime({ context: ctx });

      runtime.compile(graph);
      expect(runtime.processCount).toBe(7);
    });

    it('should create channels for all edges plus terminal collector', () => {
      const graph = createWeatherVPIRGraph('Weather in Tokyo', makeLabel());
      const ctx = createWeatherExecutionContext(makeGateway());
      const runtime = new DPNRuntime({ context: ctx });

      runtime.compile(graph);
      // 7 edges + 1 terminal collector = 8
      // observe-query→infer-location, observe-query→infer-params (fan-out: 2 edges)
      // infer-location→prepare-request, infer-params→prepare-request (2 edges)
      // prepare-request→action-fetch (1 edge)
      // action-fetch→infer-format (1 edge), infer-format→assert-valid (1 edge)
      // + 1 collector for assert-valid terminal
      expect(runtime.channelCount).toBe(8);
    });
  });

  describe('DPN Execution', () => {
    it('should execute weather pipeline end-to-end (mock)', async () => {
      const graph = createWeatherVPIRGraph("What's the weather in Tokyo?", makeLabel());
      const ctx = createWeatherExecutionContext(makeGateway());
      const runtime = new DPNRuntime({ context: ctx });

      runtime.compile(graph);
      const result = await runtime.execute();

      expect(result.status).toBe('completed');
      expect(result.errors).toHaveLength(0);
    });

    it('should produce output at terminal node', async () => {
      const graph = createWeatherVPIRGraph("What's the weather in Tokyo?", makeLabel());
      const ctx = createWeatherExecutionContext(makeGateway());
      const runtime = new DPNRuntime({ context: ctx });

      runtime.compile(graph);
      const result = await runtime.execute();

      expect(result.outputs).toBeDefined();
      // Terminal node 'assert-valid' produces boolean 'true'
      expect(result.outputs['assert-valid:result']).toBe(true);
    });

    it('should complete all processes', async () => {
      const graph = createWeatherVPIRGraph("What's the weather in Tokyo?", makeLabel());
      const ctx = createWeatherExecutionContext(makeGateway());
      const runtime = new DPNRuntime({ context: ctx });

      runtime.compile(graph);
      await runtime.execute();

      const trace = runtime.getTrace();
      for (const state of Object.values(trace.processStates)) {
        expect(state).toBe('completed');
      }
    });

    it('should produce channel traces', async () => {
      const graph = createWeatherVPIRGraph("What's the weather in Tokyo?", makeLabel());
      const ctx = createWeatherExecutionContext(makeGateway());
      const runtime = new DPNRuntime({ context: ctx });

      runtime.compile(graph);
      await runtime.execute();

      const trace = runtime.getTrace();
      expect(trace.channelEntries.length).toBeGreaterThan(0);
      expect(trace.channelEntries.some((e) => e.direction === 'send')).toBe(true);
      expect(trace.channelEntries.some((e) => e.direction === 'receive')).toBe(true);
    });

    it('should handle London query', async () => {
      const graph = createWeatherVPIRGraph("What's the weather in London?", makeLabel());
      const ctx = createWeatherExecutionContext(makeGateway());
      const runtime = new DPNRuntime({ context: ctx });

      runtime.compile(graph);
      const result = await runtime.execute();

      expect(result.status).toBe('completed');
    });
  });

  describe('HoTT Categorization', () => {
    it('should convert VPIR graph to HoTT category', () => {
      const graph = createWeatherVPIRGraph('Weather?', makeLabel());
      const category = vpirGraphToCategory(graph);

      expect(category.objects.size).toBe(7);
      expect(category.morphisms.size).toBeGreaterThan(0);
    });

    it('should preserve security labels in HoTT objects', () => {
      const label = makeLabel();
      const graph = createWeatherVPIRGraph('Weather?', label);
      const category = vpirGraphToCategory(graph);

      for (const obj of category.objects.values()) {
        expect(obj.securityLabel).toBeDefined();
        expect(obj.securityLabel?.trustLevel).toBe(label.trustLevel);
      }
    });
  });

  describe('Full Pipeline (runWeatherPipeline)', () => {
    it('should run NL → VPIR → HoTT → DPN → Result', async () => {
      const result = await runWeatherPipeline(
        "What's the weather in Tokyo?",
        { gateway: makeGateway(), skipVerification: true },
      );

      expect(result.success).toBe(true);
      expect(result.query).toBe("What's the weather in Tokyo?");
    });

    it('should produce structured stage results', async () => {
      const result = await runWeatherPipeline(
        "What's the weather in Tokyo?",
        { gateway: makeGateway(), skipVerification: true },
      );

      expect(result.stages.bridge.graph).toBeDefined();
      expect(result.stages.validate.valid).toBe(true);
      expect(result.stages.categorize.category).toBeDefined();
      expect(result.stages.compile.processCount).toBe(7);
      expect(result.stages.execute.result.status).toBe('completed');
    });

    it('should track timing per stage', async () => {
      const result = await runWeatherPipeline(
        "What's the weather in Tokyo?",
        { gateway: makeGateway(), skipVerification: true },
      );

      expect(result.stages.bridge.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.stages.validate.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.stages.categorize.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.stages.compile.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.stages.execute.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should complete in under 5 seconds (mock)', async () => {
      const result = await runWeatherPipeline(
        "What's the weather in Tokyo?",
        { gateway: makeGateway(), skipVerification: true },
      );

      expect(result.totalDurationMs).toBeLessThan(5000);
    });

    it('should produce HoTT category with correct object count', async () => {
      const result = await runWeatherPipeline(
        "What's the weather in Tokyo?",
        { gateway: makeGateway(), skipVerification: true },
      );

      expect(result.stages.categorize.category.objects.size).toBe(7);
    });
  });

  describe('Benchmark Runner Integration', () => {
    it('should run weather benchmark through BenchmarkRunner', async () => {
      const runner = new BenchmarkRunner();
      const def = createWeatherBenchmarkDefinition({ gateway: makeGateway() });
      runner.register(def);

      const result = await runner.runOne('weather-api-shim');
      expect(result.passed).toBe(true);
      expect(result.stages.every((s) => s.status === 'passed')).toBe(true);
    });

    it('should produce per-stage timing in benchmark report', async () => {
      const runner = new BenchmarkRunner();
      const def = createWeatherBenchmarkDefinition({ gateway: makeGateway() });
      runner.register(def);

      const result = await runner.runOne('weather-api-shim');
      for (const stage of result.stages) {
        expect(stage.durationMs).toBeGreaterThanOrEqual(0);
        expect(stage.name).toBeDefined();
      }
    });

    it('should include pipeline stage names', async () => {
      const runner = new BenchmarkRunner();
      const def = createWeatherBenchmarkDefinition({ gateway: makeGateway() });
      runner.register(def);

      const result = await runner.runOne('weather-api-shim');
      const stageNames = result.stages.map((s) => s.name);
      expect(stageNames).toEqual(['bridge', 'validate', 'categorize', 'compile', 'execute']);
    });
  });

  // Sprint 17 / M6 — operator-approval gate.
  describe('operator-approval gate', () => {
    it('runs the gated pipeline end-to-end with NoopHumanGateway', async () => {
      const label = makeLabel();
      const graph = createWeatherVPIRGraphWithApproval('Weather in Tokyo', label);
      const baseCtx = createWeatherExecutionContext(
        makeGateway(),
        'weather-benchmark-agent',
        label,
      );
      const ctx = addApprovalGateHandler(baseCtx);

      const gateway = new NoopHumanGateway({ response: 'approved', humanId: 'ci-operator' });
      const result = await executeGraph(graph, { ...ctx, humanGateway: gateway });

      expect(result.status).toBe('completed');
      expect(gateway.calls).toBe(1);
    });

    it('fails the pipeline when the operator rejects the fetch', async () => {
      const label = makeLabel();
      const graph = createWeatherVPIRGraphWithApproval('Weather in Tokyo', label);
      const ctx = addApprovalGateHandler(
        createWeatherExecutionContext(makeGateway(), 'weather-benchmark-agent', label),
      );

      const gateway = new NoopHumanGateway({ response: 'denied', humanId: 'ci-operator' });
      const result = await executeGraph(graph, { ...ctx, humanGateway: gateway });

      expect(result.status).toBe('failed');
      expect(result.errors.some((e) => /did not approve/.test(e.message))).toBe(true);
    });

    it('includes the human approve-fetch node routed through the gate', () => {
      const label = makeLabel();
      const graph = createWeatherVPIRGraphWithApproval('Weather in Tokyo', label);

      const human = graph.nodes.get('approve-fetch')!;
      expect(human.type).toBe('human');
      expect(human.verifiable).toBe(false);
      expect(human.humanPromptSpec?.requiresExplicitProvenance).toBe(true);

      // action-fetch now consumes the gate's output, not prepare-request directly.
      const action = graph.nodes.get('action-fetch')!;
      expect(action.inputs).toHaveLength(1);
      expect(action.inputs[0].nodeId).toBe('verify-approval');
    });
  });

  describe('LLM Summary Pipeline (Sprint 18 / M7)', () => {
    /** Mock llm-inference handler — deterministic, no SDK calls. */
    const mockLLMHandler = async (input: unknown): Promise<unknown> => {
      const { prompt } = input as { prompt: string };
      return {
        response: `[summary] ${prompt.slice(0, 40)}`,
        tokensUsed: 42,
        model: 'mock-llm',
      };
    };

    function makeGatewayWithLLM(): {
      gateway: InMemoryACIGateway;
      lastResultLabel: () => import('../types/ifc.js').SecurityLabel | undefined;
    } {
      const weatherHandler = createWeatherToolHandler();
      const gateway = new InMemoryACIGateway({
        trustResolver: () => 2,
      });
      gateway.registerTool(createWeatherToolRegistration(), weatherHandler);
      gateway.registerTool(llmInferenceRegistration, mockLLMHandler);

      let capturedLabel: import('../types/ifc.js').SecurityLabel | undefined;
      const originalInvoke = gateway.invoke.bind(gateway);
      gateway.invoke = async (inv) => {
        const result = await originalInvoke(inv);
        if (inv.toolName === 'llm-inference') capturedLabel = result.resultLabel;
        return result;
      };
      return { gateway, lastResultLabel: () => capturedLabel };
    }

    it('validates structurally', () => {
      const graph = createWeatherVPIRGraphWithLLMSummary('Weather in Tokyo', makeLabel());
      expect(validateGraph(graph).valid).toBe(true);
    });

    it('inserts summarize-weather as an action invoking llm-inference', () => {
      const graph = createWeatherVPIRGraphWithLLMSummary('Weather in Tokyo', makeLabel());
      const node = graph.nodes.get('summarize-weather')!;
      expect(node.type).toBe('action');
      expect(node.operation).toBe('llm-inference');
    });

    it('routes assert-valid off the LLM summary response port', () => {
      const graph = createWeatherVPIRGraphWithLLMSummary('Weather in Tokyo', makeLabel());
      const assert = graph.nodes.get('assert-valid')!;
      expect(assert.inputs).toHaveLength(1);
      expect(assert.inputs[0].nodeId).toBe('summarize-weather');
      expect(assert.inputs[0].port).toBe('response');
    });

    it('inserts build-summary-prompt feeding the LLM action', () => {
      const graph = createWeatherVPIRGraphWithLLMSummary('Weather in Tokyo', makeLabel());
      const promptNode = graph.nodes.get('build-summary-prompt')!;
      expect(promptNode.type).toBe('inference');
      expect(promptNode.operation).toBe('build-summary-prompt');
      const llmNode = graph.nodes.get('summarize-weather')!;
      expect(llmNode.inputs[0].nodeId).toBe('build-summary-prompt');
    });

    it('executes end-to-end through VPIR interpreter with mocked LLM', async () => {
      const label = makeLabel();
      const { gateway, lastResultLabel } = makeGatewayWithLLM();
      const baseCtx = createWeatherExecutionContext(gateway, 'weather-benchmark-agent', label);
      const ctx = addLLMSummaryPromptHandler(baseCtx);

      const graph = createWeatherVPIRGraphWithLLMSummary('Weather in Tokyo', label);
      const result = await executeGraph(graph, ctx);

      expect(result.errors).toEqual([]);
      expect(result.status).toBe('completed');
      // LLM result label must be forced to {trustLevel:1, classification:'external'}.
      const llmLabel = lastResultLabel();
      expect(llmLabel?.classification).toBe('external');
      expect(llmLabel?.trustLevel).toBe(1);
    });

    it('propagates the external label so a public sink cannot receive the summary directly', async () => {
      const { gateway } = makeGatewayWithLLM();
      // A hypothetical public sink tool — unlabeled input fine, labeled input should be blocked.
      gateway.registerTool(
        {
          name: 'log-summary',
          description: 'Log to public audit sink',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          sideEffects: ['none'],
          ops: { timeout: 1000, retryable: false, idempotent: true, costCategory: 'cheap' },
          requiredTrustLevel: 0,
        },
        async () => 'ok',
      );
      const llmResult = await gateway.invoke({
        toolName: 'llm-inference',
        input: { prompt: 'Summarise the weather' },
        agentId: 'weather-benchmark-agent',
        requestId: 'req-llm',
      });
      const sinkResult = await gateway.invoke({
        toolName: 'log-summary',
        input: { summary: 'x' },
        agentId: 'weather-benchmark-agent',
        requestId: 'req-sink',
        requesterLabel: llmResult.resultLabel!,
      });
      expect(llmResult.resultLabel?.classification).toBe('external');
      expect(sinkResult.success).toBe(false);
      expect(sinkResult.error?.code).toBe('IFC_VIOLATION');
      // Sanity: confirm canFlowTo reports the block too.
      expect(
        canFlowTo(llmResult.resultLabel!, createLabel('weather-benchmark-agent', 0, 'public')),
      ).toBe(false);
    });

    it('leaves the base (non-LLM) pipeline unaffected', async () => {
      const label = makeLabel();
      const result = await runWeatherPipeline("What's the weather in Tokyo?", {
        gateway: makeGateway(),
        label,
        skipVerification: true,
      });
      expect(result.success).toBe(true);
    });
  });
});
