/**
 * Weather API Shim MVP — the paradigm's "Hello World."
 *
 * Demonstrates the full pnxt pipeline end-to-end on a real task:
 *   NL Query → Bridge Grammar → VPIR Graph → HoTT Category
 *   → Z3 Verification → DPN Execution → Verified Result
 *
 * The Weather API is a mock tool registered with the ACI Gateway.
 * The benchmark proves that natural language input can be transformed
 * into a verified, formally-checked, actor-executed reasoning chain.
 *
 * Sprint 4 deliverable — Advisory Panel: Kay, Liskov, Milner.
 */

import type { ToolRegistration } from '../types/aci.js';
import type { SecurityLabel } from '../types/ifc.js';
import type { VPIRGraph, VPIRNode, Evidence, VPIROutput, VPIRRef } from '../types/vpir.js';
import type { VPIRExecutionContext, InferenceHandler } from '../types/vpir-execution.js';
import type { Category } from '../types/hott.js';
import type { VerificationResult } from '../types/verification.js';
import { createLabel } from '../types/ifc.js';
import { DPNRuntime } from '../channel/dpn-runtime.js';
import type { DPNExecutionResult } from '../channel/dpn-runtime.js';
import { vpirGraphToCategory } from '../hott/vpir-bridge.js';
import { validateGraph } from '../vpir/vpir-validator.js';
import type {
  BenchmarkDefinition,
  BenchmarkRunResult,
} from './benchmark-runner.js';

// ── Mock Weather Data ───────────────────────────────────────────────

interface WeatherData {
  location: string;
  temperature: number;
  conditions: string;
  humidity: number;
  windSpeed: number;
  units: string;
}

const MOCK_WEATHER: Record<string, WeatherData> = {
  tokyo: {
    location: 'Tokyo, Japan',
    temperature: 22,
    conditions: 'partly cloudy',
    humidity: 65,
    windSpeed: 12,
    units: 'metric',
  },
  london: {
    location: 'London, UK',
    temperature: 14,
    conditions: 'overcast',
    humidity: 80,
    windSpeed: 18,
    units: 'metric',
  },
  'new york': {
    location: 'New York, USA',
    temperature: 72,
    conditions: 'sunny',
    humidity: 45,
    windSpeed: 8,
    units: 'imperial',
  },
};

// ── Tool Registration ───────────────────────────────────────────────

/**
 * Create the ACI tool registration for the weather API.
 */
export function createWeatherToolRegistration(): ToolRegistration {
  return {
    name: 'getWeather',
    description: 'Fetch current weather data for a location',
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string' },
        units: { type: 'string', enum: ['metric', 'imperial'] },
      },
      required: ['location'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string' },
        temperature: { type: 'number' },
        conditions: { type: 'string' },
        humidity: { type: 'number' },
        windSpeed: { type: 'number' },
        units: { type: 'string' },
      },
    },
    sideEffects: ['network'],
    ops: {
      timeout: 5000,
      retryable: true,
      idempotent: true,
      costCategory: 'cheap',
    },
    requiredTrustLevel: 2,
  };
}

/**
 * Create the mock weather tool handler.
 */
export function createWeatherToolHandler(): (input: unknown) => Promise<unknown> {
  return async (input: unknown): Promise<WeatherData> => {
    const params = input as { location: string; units?: string };
    const key = params.location.toLowerCase().trim();
    const data = MOCK_WEATHER[key];

    if (!data) {
      return {
        location: params.location,
        temperature: 20,
        conditions: 'clear',
        humidity: 50,
        windSpeed: 10,
        units: params.units ?? 'metric',
      };
    }

    return { ...data, units: params.units ?? data.units };
  };
}

// ── VPIR Graph Factory ──────────────────────────────────────────────

/**
 * Build the deterministic VPIR graph for a weather query.
 *
 * Graph structure (6 nodes):
 *   observe-query → infer-location → infer-params
 *     → action-fetch → infer-format → assert-valid
 */
export function createWeatherVPIRGraph(
  query: string,
  label: SecurityLabel,
): VPIRGraph {
  const now = new Date().toISOString();

  function makeEvidence(source: string): Evidence[] {
    return [{ type: 'data', source, confidence: 1.0 }];
  }

  function makeRef(nodeId: string, port: string, dataType: string): VPIRRef {
    return { nodeId, port, dataType };
  }

  function makeOutput(port: string, dataType: string, value?: unknown): VPIROutput {
    return { port, dataType, value };
  }

  const nodes: VPIRNode[] = [
    {
      id: 'observe-query',
      type: 'observation',
      operation: 'capture-user-query',
      inputs: [],
      outputs: [makeOutput('query', 'string', query)],
      evidence: makeEvidence('user-input'),
      label,
      verifiable: true,
      createdAt: now,
    },
    {
      id: 'infer-location',
      type: 'inference',
      operation: 'extract-location',
      inputs: [makeRef('observe-query', 'query', 'string')],
      outputs: [makeOutput('location', 'string')],
      evidence: makeEvidence('nlp-extraction'),
      label,
      verifiable: true,
      createdAt: now,
    },
    {
      id: 'infer-params',
      type: 'inference',
      operation: 'determine-parameters',
      inputs: [makeRef('observe-query', 'query', 'string')],
      outputs: [makeOutput('params', 'object')],
      evidence: makeEvidence('parameter-inference'),
      label,
      verifiable: true,
      createdAt: now,
    },
    {
      id: 'prepare-request',
      type: 'inference',
      operation: 'build-api-request',
      inputs: [
        makeRef('infer-location', 'location', 'string'),
        makeRef('infer-params', 'params', 'object'),
      ],
      outputs: [makeOutput('request', 'object')],
      evidence: makeEvidence('request-assembly'),
      label,
      verifiable: true,
      createdAt: now,
    },
    {
      id: 'action-fetch',
      type: 'action',
      operation: 'getWeather',
      inputs: [makeRef('prepare-request', 'request', 'object')],
      outputs: [makeOutput('weather', 'object')],
      evidence: makeEvidence('api-response'),
      label,
      verifiable: true,
      createdAt: now,
    },
    {
      id: 'infer-format',
      type: 'inference',
      operation: 'format-response',
      inputs: [makeRef('action-fetch', 'weather', 'object')],
      outputs: [makeOutput('response', 'string')],
      evidence: makeEvidence('formatting'),
      label,
      verifiable: true,
      createdAt: now,
    },
    {
      id: 'assert-valid',
      type: 'assertion',
      operation: 'validate-response',
      inputs: [makeRef('infer-format', 'response', 'string')],
      outputs: [makeOutput('result', 'boolean')],
      evidence: makeEvidence('validation-check'),
      label,
      verifiable: true,
      createdAt: now,
    },
  ];

  const nodeMap = new Map<string, VPIRNode>();
  for (const node of nodes) nodeMap.set(node.id, node);

  return {
    id: 'weather-pipeline',
    name: 'Weather API Query Pipeline',
    nodes: nodeMap,
    roots: ['observe-query'],
    terminals: ['assert-valid'],
    createdAt: now,
  };
}

/**
 * Variant of the weather pipeline that interposes a human approval gate
 * before the outbound `getWeather` action — the "commit" step. Sprint 17
 * (M6) uses this benchmark to prove the HITL primitive is wired end-to-
 * end through validator, interpreter, and ACI gateway.
 *
 * The graph is identical to `createWeatherVPIRGraph` except that:
 *   - A `'human'` node `approve-fetch` sits between `prepare-request`
 *     and `action-fetch`.
 *   - `action-fetch` consumes the human's decision on a new port.
 *
 * In CI, swap in a `NoopHumanGateway({ response: 'approved' })`. For
 * interactive development, swap in a `CLIHumanGateway()` — no other
 * changes are required.
 */
export function createWeatherVPIRGraphWithApproval(
  query: string,
  label: SecurityLabel,
): VPIRGraph {
  const base = createWeatherVPIRGraph(query, label);
  const now = new Date().toISOString();

  // Human node reads the prepared request, emits a decision string.
  const human: VPIRNode = {
    id: 'approve-fetch',
    type: 'human',
    operation: 'operator-approves-weather-fetch',
    inputs: [{ nodeId: 'prepare-request', port: 'request', dataType: 'object' }],
    outputs: [{ port: 'decision', dataType: 'string' }],
    evidence: [{ type: 'data', source: 'operator', confidence: 1.0 }],
    label,
    verifiable: false,
    createdAt: now,
    humanPromptSpec: {
      message: 'Approve outbound weather API fetch?',
      requiresExplicitProvenance: true,
    },
  };

  // Gate inference: forwards `prepare-request.request` only if the decision
  // is an approval. Any other decision throws, failing the pipeline before
  // the outbound action runs. This is the machine-side enforcement of the
  // operator's answer and keeps `action-fetch`'s handler unchanged.
  const gateInference: VPIRNode = {
    id: 'verify-approval',
    type: 'inference',
    operation: 'verify-approval',
    inputs: [
      { nodeId: 'prepare-request', port: 'request', dataType: 'object' },
      { nodeId: 'approve-fetch', port: 'decision', dataType: 'string' },
    ],
    outputs: [{ port: 'request', dataType: 'object' }],
    evidence: [{ type: 'rule', source: 'approval-gate', confidence: 1.0 }],
    label,
    verifiable: true,
    createdAt: now,
  };

  // Rewire action-fetch to consume the gate's output instead of the raw
  // prepare-request. Handler semantics at action-fetch are unchanged.
  const actionFetch = base.nodes.get('action-fetch')!;
  const gatedActionFetch: VPIRNode = {
    ...actionFetch,
    inputs: [{ nodeId: 'verify-approval', port: 'request', dataType: 'object' }],
  };

  const nodes = new Map<string, VPIRNode>(base.nodes);
  nodes.set(human.id, human);
  nodes.set(gateInference.id, gateInference);
  nodes.set(gatedActionFetch.id, gatedActionFetch);

  return {
    ...base,
    id: 'weather-pipeline-gated',
    name: 'Weather API Query Pipeline (operator-approved)',
    nodes,
  };
}

/**
 * Install the approval-gate inference handler onto an execution context.
 * Returns a new context — the original is unchanged. Sprint 17 / M6.
 */
export function addApprovalGateHandler(
  context: VPIRExecutionContext,
): VPIRExecutionContext {
  const handlers = new Map(context.handlers);
  handlers.set('verify-approval', async (inputs) => {
    let request: unknown;
    let decision: unknown;
    for (const [key, value] of inputs) {
      if (key.includes('request')) request = value;
      if (key.includes('decision')) decision = value;
    }
    if (decision !== 'approved') {
      throw new Error(`Operator did not approve weather fetch (decision=${String(decision)})`);
    }
    return request;
  });
  return { ...context, handlers };
}

// ── Execution Context ───────────────────────────────────────────────

/**
 * Create the VPIR execution context with all handlers for the weather pipeline.
 */
export function createWeatherExecutionContext(
  gateway: VPIRExecutionContext['aciGateway'],
  agentId = 'weather-benchmark-agent',
  label?: SecurityLabel,
): VPIRExecutionContext {
  const handlers = new Map<string, InferenceHandler>();

  handlers.set('extract-location', async (inputs) => {
    const query = inputs.values().next().value as string;
    // Simple extraction: find known locations in query.
    const lower = query.toLowerCase();
    for (const key of Object.keys(MOCK_WEATHER)) {
      if (lower.includes(key)) return key;
    }
    // Fallback: return first capitalized word sequence after "in"
    const match = query.match(/in\s+([A-Z][a-zA-Z\s]+)/);
    return match ? match[1].trim().toLowerCase() : 'unknown';
  });

  handlers.set('determine-parameters', async (inputs) => {
    const query = inputs.values().next().value as string;
    const lower = query.toLowerCase();
    const units = lower.includes('fahrenheit') || lower.includes('imperial')
      ? 'imperial'
      : 'metric';
    return { units };
  });

  handlers.set('build-api-request', async (inputs) => {
    let location = 'unknown';
    let params: Record<string, unknown> = {};
    for (const [key, value] of inputs) {
      if (key.includes('location')) location = value as string;
      if (key.includes('params')) params = value as Record<string, unknown>;
    }
    return { location, ...params };
  });

  handlers.set('format-response', async (inputs) => {
    const weather = inputs.values().next().value as WeatherData;
    if (!weather) return 'No weather data available';
    const unit = weather.units === 'metric' ? '°C' : '°F';
    return `Weather in ${weather.location}: ${weather.temperature}${unit}, ${weather.conditions}. ` +
      `Humidity: ${weather.humidity}%, Wind: ${weather.windSpeed} ${weather.units === 'metric' ? 'km/h' : 'mph'}`;
  });

  const assertionHandlers = new Map<string, (inputs: Map<string, unknown>) => Promise<boolean>>();
  assertionHandlers.set('validate-response', async (inputs) => {
    const response = inputs.values().next().value;
    return typeof response === 'string' && response.length > 0;
  });

  return {
    agentId,
    label: label ?? createLabel(agentId, 2, 'internal'),
    handlers,
    assertionHandlers,
    aciGateway: gateway,
  };
}

// ── Pipeline ────────────────────────────────────────────────────────

export interface WeatherPipelineOptions {
  /** Skip Z3 verification (faster tests). Default: false. */
  skipVerification?: boolean;

  /** Custom security label. */
  label?: SecurityLabel;

  /** DPN execution timeout. */
  timeout?: number;

  /** Z3 context for verification (optional, created if needed). */
  z3Context?: {
    verifyIFCFlowConsistency(graph: VPIRGraph): Promise<VerificationResult>;
  };

  /** ACI gateway (required for action nodes). */
  gateway: VPIRExecutionContext['aciGateway'];
}

export interface WeatherPipelineResult {
  success: boolean;
  query: string;
  stages: {
    bridge: { durationMs: number; graph: VPIRGraph };
    validate: { durationMs: number; valid: boolean };
    categorize: { durationMs: number; category: Category };
    verify?: { durationMs: number; verified: boolean };
    compile: { durationMs: number; processCount: number; channelCount: number };
    execute: { durationMs: number; result: DPNExecutionResult };
  };
  totalDurationMs: number;
  error?: string;
}

/**
 * Run the full weather pipeline: NL → VPIR → HoTT → Z3 → DPN → Result.
 */
export async function runWeatherPipeline(
  query: string,
  options: WeatherPipelineOptions,
): Promise<WeatherPipelineResult> {
  const startTime = Date.now();
  const label = options.label ?? createLabel('weather-benchmark', 2, 'internal');

  // Stage 1: Bridge — NL → VPIR
  const bridgeStart = Date.now();
  const graph = createWeatherVPIRGraph(query, label);
  const bridgeDuration = Date.now() - bridgeStart;

  // Stage 2: Validate — structural check
  const validateStart = Date.now();
  const validation = validateGraph(graph);
  const validateDuration = Date.now() - validateStart;
  if (!validation.valid) {
    return {
      success: false,
      query,
      stages: {
        bridge: { durationMs: bridgeDuration, graph },
        validate: { durationMs: validateDuration, valid: false },
        categorize: { durationMs: 0, category: { id: '', name: '', objects: new Map(), morphisms: new Map(), paths: new Map() } },
        compile: { durationMs: 0, processCount: 0, channelCount: 0 },
        execute: { durationMs: 0, result: { graphId: '', status: 'failed', outputs: {}, trace: { processStates: {}, channelEntries: [], channelStats: {} }, durationMs: 0, errors: [] } },
      },
      totalDurationMs: Date.now() - startTime,
      error: validation.errors.map((e) => e.message).join('; '),
    };
  }

  // Stage 3: Categorize — VPIR → HoTT
  const catStart = Date.now();
  const category = vpirGraphToCategory(graph);
  const catDuration = Date.now() - catStart;

  // Stage 4: Verify — Z3 IFC consistency (optional)
  let verifyStage: { durationMs: number; verified: boolean } | undefined;
  if (!options.skipVerification && options.z3Context) {
    const verifyStart = Date.now();
    const verifyResult = await options.z3Context.verifyIFCFlowConsistency(graph);
    verifyStage = {
      durationMs: Date.now() - verifyStart,
      verified: verifyResult.verified,
    };
  }

  // Stage 5: Compile — VPIR → DPN
  const compileStart = Date.now();
  const context = createWeatherExecutionContext(options.gateway, 'weather-benchmark-agent', label);
  const runtime = new DPNRuntime({
    context,
    timeout: options.timeout ?? 10_000,
  });
  runtime.compile(graph);
  const compileDuration = Date.now() - compileStart;

  // Stage 6: Execute — DPN actor-based execution
  const executeStart = Date.now();
  const execResult = await runtime.execute();
  const executeDuration = Date.now() - executeStart;

  return {
    success: execResult.status === 'completed',
    query,
    stages: {
      bridge: { durationMs: bridgeDuration, graph },
      validate: { durationMs: validateDuration, valid: true },
      categorize: { durationMs: catDuration, category },
      verify: verifyStage,
      compile: {
        durationMs: compileDuration,
        processCount: runtime.processCount,
        channelCount: runtime.channelCount,
      },
      execute: { durationMs: executeDuration, result: execResult },
    },
    totalDurationMs: Date.now() - startTime,
  };
}

// ── Benchmark Definition ────────────────────────────────────────────

/**
 * Create a BenchmarkDefinition for the weather API pipeline.
 * Usable with BenchmarkRunner.
 */
export function createWeatherBenchmarkDefinition(
  options: WeatherPipelineOptions,
): BenchmarkDefinition {
  const label = options.label ?? createLabel('weather-benchmark', 2, 'internal');

  const stages: BenchmarkDefinition['stages'] = [
    {
      name: 'bridge',
      execute: async (data) => {
        const graph = createWeatherVPIRGraph(data.task as string, label);
        return { graph };
      },
    },
    {
      name: 'validate',
      execute: async (data) => {
        const graph = data.graph as VPIRGraph;
        const result = validateGraph(graph);
        if (!result.valid) {
          throw new Error(`Validation failed: ${result.errors.map((e) => e.message).join('; ')}`);
        }
        return { validationResult: result };
      },
    },
    {
      name: 'categorize',
      execute: async (data) => {
        const graph = data.graph as VPIRGraph;
        const category = vpirGraphToCategory(graph);
        return { category };
      },
    },
    {
      name: 'compile',
      execute: async (data) => {
        const graph = data.graph as VPIRGraph;
        const context = createWeatherExecutionContext(options.gateway, 'weather-benchmark-agent', label);
        const runtime = new DPNRuntime({ context, timeout: options.timeout ?? 10_000 });
        runtime.compile(graph);
        return { runtime, processCount: runtime.processCount, channelCount: runtime.channelCount };
      },
    },
    {
      name: 'execute',
      execute: async (data) => {
        const runtime = data.runtime as DPNRuntime;
        const result = await runtime.execute();
        if (result.status !== 'completed') {
          throw new Error(`DPN execution ${result.status}: ${result.errors.map((e) => e.message).join('; ')}`);
        }
        return { execResult: result, outputs: result.outputs, trace: result.trace };
      },
    },
  ];

  return {
    id: 'weather-api-shim',
    name: 'Weather API Shim MVP',
    task: "What's the weather in Tokyo?",
    stages,
    passCriteria: (result: BenchmarkRunResult) => {
      return result.stages.every((s) => s.status === 'passed');
    },
    timeout: 30_000,
  };
}
