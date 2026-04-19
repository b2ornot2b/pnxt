import {
  createWeatherToolRegistration,
  createWeatherToolHandler,
  createWeatherVPIRGraph,
  createWeatherVPIRGraphWithApproval,
  createWeatherExecutionContext,
  createWeatherBenchmarkDefinition,
  runWeatherPipeline,
  addApprovalGateHandler,
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
});
