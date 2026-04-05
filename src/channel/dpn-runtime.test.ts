import { DPNRuntime } from './dpn-runtime.js';
import type { VPIRGraph, VPIRNode, VPIROutput, Evidence } from '../types/vpir.js';
import type { VPIRExecutionContext } from '../types/vpir-execution.js';
import type { SecurityLabel } from '../types/ifc.js';

// ── Helpers ─────────────────────────────────────────────────────────

function makeLabel(trustLevel: 0 | 1 | 2 | 3 | 4 = 1): SecurityLabel {
  return {
    owner: 'test-agent',
    trustLevel,
    classification: 'internal',
    createdAt: new Date().toISOString(),
  };
}

function makeNode(
  id: string,
  type: VPIRNode['type'],
  operation: string,
  opts?: {
    inputs?: VPIRNode['inputs'];
    outputs?: VPIROutput[];
    evidence?: Evidence[];
    label?: SecurityLabel;
  },
): VPIRNode {
  return {
    id,
    type,
    operation,
    inputs: opts?.inputs ?? [],
    outputs: opts?.outputs ?? [{ port: 'result', dataType: 'unknown' }],
    evidence: opts?.evidence ?? [{ type: 'data', source: 'test', confidence: 1.0 }],
    label: opts?.label ?? makeLabel(),
    verifiable: true,
    createdAt: new Date().toISOString(),
  };
}

function makeGraph(nodes: VPIRNode[], name = 'test-graph'): VPIRGraph {
  const nodeMap = new Map<string, VPIRNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  // Roots: nodes with no inputs
  const roots = nodes.filter((n) => n.inputs.length === 0).map((n) => n.id);

  // Terminals: nodes whose outputs are not consumed by any other node
  const consumed = new Set<string>();
  for (const n of nodes) {
    for (const ref of n.inputs) consumed.add(ref.nodeId);
  }
  const terminals = nodes.filter((n) => !consumed.has(n.id)).map((n) => n.id);

  return {
    id: `graph-${name}`,
    name,
    nodes: nodeMap,
    roots,
    terminals,
    createdAt: new Date().toISOString(),
  };
}

function makeContext(
  handlers?: Map<string, (inputs: Map<string, unknown>) => Promise<unknown>>,
  assertionHandlers?: Map<string, (inputs: Map<string, unknown>) => Promise<boolean>>,
  aciGateway?: VPIRExecutionContext['aciGateway'],
): VPIRExecutionContext {
  return {
    agentId: 'test-agent',
    label: makeLabel(),
    handlers: handlers ?? new Map(),
    assertionHandlers,
    aciGateway,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('DPNRuntime', () => {
  describe('compile', () => {
    it('should compile a single observation node', () => {
      const node = makeNode('obs1', 'observation', 'observe data', {
        outputs: [{ port: 'result', dataType: 'string', value: 'hello' }],
      });
      const graph = makeGraph([node]);
      const runtime = new DPNRuntime({ context: makeContext() });

      runtime.compile(graph);

      expect(runtime.processCount).toBe(1);
    });

    it('should compile a linear graph with correct channel count', () => {
      const obs = makeNode('obs', 'observation', 'observe', {
        outputs: [{ port: 'data', dataType: 'string', value: 'test' }],
      });
      const infer = makeNode('infer', 'inference', 'process-data', {
        inputs: [{ nodeId: 'obs', port: 'data', dataType: 'string' }],
        outputs: [{ port: 'result', dataType: 'string' }],
      });
      const graph = makeGraph([obs, infer]);
      const runtime = new DPNRuntime({ context: makeContext() });

      runtime.compile(graph);

      expect(runtime.processCount).toBe(2);
      // 1 edge channel + 1 output collector for terminal node
      expect(runtime.channelCount).toBe(2);
    });

    it('should reject invalid VPIR graphs', () => {
      // Create a graph with a reference to a non-existent node.
      const node = makeNode('n1', 'inference', 'op', {
        inputs: [{ nodeId: 'nonexistent', port: 'out', dataType: 'unknown' }],
      });
      const graph = makeGraph([node]);

      const runtime = new DPNRuntime({ context: makeContext() });
      expect(() => runtime.compile(graph)).toThrow('VPIR graph validation failed');
    });

    it('should handle graphs with parallel branches', () => {
      const obs = makeNode('obs', 'observation', 'observe', {
        outputs: [{ port: 'data', dataType: 'string', value: 'input' }],
      });
      const branch1 = makeNode('b1', 'inference', 'branch1', {
        inputs: [{ nodeId: 'obs', port: 'data', dataType: 'string' }],
        outputs: [{ port: 'result', dataType: 'string' }],
      });
      const branch2 = makeNode('b2', 'inference', 'branch2', {
        inputs: [{ nodeId: 'obs', port: 'data', dataType: 'string' }],
        outputs: [{ port: 'result', dataType: 'string' }],
      });
      const graph = makeGraph([obs, branch1, branch2]);
      const runtime = new DPNRuntime({ context: makeContext() });

      runtime.compile(graph);

      expect(runtime.processCount).toBe(3);
      // 2 edge channels + 2 output collectors (both branches are terminals)
      // But obs port 'data' is consumed by 2 nodes, so 2 edge channels + 2 collectors = 4
      // Actually obs has 1 output port 'data' which is consumed, so no collector for obs.
      // b1 and b2 each have 'result' port not consumed → 2 collectors.
      expect(runtime.channelCount).toBe(4);
    });
  });

  describe('execute', () => {
    it('should throw if not compiled', async () => {
      const runtime = new DPNRuntime({ context: makeContext() });
      await expect(runtime.execute()).rejects.toThrow('must call compile()');
    });

    it('should execute a single observation node', async () => {
      const obs = makeNode('obs', 'observation', 'observe', {
        outputs: [{ port: 'result', dataType: 'string', value: 'hello world' }],
      });
      const graph = makeGraph([obs]);
      const runtime = new DPNRuntime({ context: makeContext() });

      runtime.compile(graph);
      const result = await runtime.execute();

      expect(result.status).toBe('completed');
      expect(result.outputs['obs:result']).toBe('hello world');
      expect(result.errors).toHaveLength(0);
    });

    it('should execute a linear observe → infer chain', async () => {
      const obs = makeNode('obs', 'observation', 'observe', {
        outputs: [{ port: 'data', dataType: 'string', value: 'raw input' }],
      });
      const infer = makeNode('infer', 'inference', 'transform', {
        inputs: [{ nodeId: 'obs', port: 'data', dataType: 'string' }],
        outputs: [{ port: 'result', dataType: 'string' }],
      });
      const graph = makeGraph([obs, infer]);

      const handlers = new Map<string, (inputs: Map<string, unknown>) => Promise<unknown>>();
      handlers.set('transform', async (inputs) => {
        const val = inputs.values().next().value as string;
        return val.toUpperCase();
      });

      const runtime = new DPNRuntime({ context: makeContext(handlers) });
      runtime.compile(graph);
      const result = await runtime.execute();

      expect(result.status).toBe('completed');
      expect(result.outputs['infer:result']).toBe('RAW INPUT');
    });

    it('should execute observe → infer → assert chain', async () => {
      const obs = makeNode('obs', 'observation', 'observe', {
        outputs: [{ port: 'data', dataType: 'number', value: 42 }],
      });
      const infer = makeNode('infer', 'inference', 'double', {
        inputs: [{ nodeId: 'obs', port: 'data', dataType: 'number' }],
        outputs: [{ port: 'result', dataType: 'number' }],
      });
      const assert = makeNode('check', 'assertion', 'is-positive', {
        inputs: [{ nodeId: 'infer', port: 'result', dataType: 'number' }],
        outputs: [{ port: 'result', dataType: 'boolean' }],
      });
      const graph = makeGraph([obs, infer, assert]);

      const handlers = new Map<string, (inputs: Map<string, unknown>) => Promise<unknown>>();
      handlers.set('double', async (inputs) => {
        const val = inputs.values().next().value as number;
        return val * 2;
      });

      const assertionHandlers = new Map<string, (inputs: Map<string, unknown>) => Promise<boolean>>();
      assertionHandlers.set('is-positive', async (inputs) => {
        const val = inputs.values().next().value as number;
        return val > 0;
      });

      const runtime = new DPNRuntime({
        context: makeContext(handlers, assertionHandlers),
      });
      runtime.compile(graph);
      const result = await runtime.execute();

      expect(result.status).toBe('completed');
      expect(result.errors).toHaveLength(0);
    });

    it('should handle action nodes with ACI gateway', async () => {
      const obs = makeNode('obs', 'observation', 'observe', {
        outputs: [{ port: 'query', dataType: 'string', value: 'Tokyo' }],
      });
      const action = makeNode('act', 'action', 'getWeather', {
        inputs: [{ nodeId: 'obs', port: 'query', dataType: 'string' }],
        outputs: [{ port: 'result', dataType: 'object' }],
      });
      const graph = makeGraph([obs, action]);

      const gateway: VPIRExecutionContext['aciGateway'] = {
        invoke: async (inv) => ({
          requestId: inv.requestId,
          success: true,
          output: { temperature: 20, conditions: 'sunny' },
          duration: 10,
        }),
      };

      const runtime = new DPNRuntime({
        context: makeContext(new Map(), undefined, gateway),
      });
      runtime.compile(graph);
      const result = await runtime.execute();

      expect(result.status).toBe('completed');
      expect(result.outputs['act:result']).toEqual({
        temperature: 20,
        conditions: 'sunny',
      });
    });

    it('should fail when assertion fails', async () => {
      const obs = makeNode('obs', 'observation', 'observe', {
        outputs: [{ port: 'data', dataType: 'number', value: -5 }],
      });
      const assert = makeNode('check', 'assertion', 'is-positive', {
        inputs: [{ nodeId: 'obs', port: 'data', dataType: 'number' }],
        outputs: [{ port: 'result', dataType: 'boolean' }],
      });
      const graph = makeGraph([obs, assert]);

      const assertionHandlers = new Map<string, (inputs: Map<string, unknown>) => Promise<boolean>>();
      assertionHandlers.set('is-positive', async (inputs) => {
        const val = inputs.values().next().value as number;
        return val > 0;
      });

      const runtime = new DPNRuntime({
        context: makeContext(new Map(), assertionHandlers),
      });
      runtime.compile(graph);
      const result = await runtime.execute();

      expect(result.status).toBe('failed');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should propagate failure via poison pill (close output channels)', async () => {
      const obs = makeNode('obs', 'observation', 'observe', {
        outputs: [{ port: 'data', dataType: 'string', value: 'input' }],
      });
      const failNode = makeNode('fail', 'inference', 'will-fail', {
        inputs: [{ nodeId: 'obs', port: 'data', dataType: 'string' }],
        outputs: [{ port: 'result', dataType: 'string' }],
      });
      const downstream = makeNode('down', 'inference', 'downstream', {
        inputs: [{ nodeId: 'fail', port: 'result', dataType: 'string' }],
        outputs: [{ port: 'result', dataType: 'string' }],
      });
      const graph = makeGraph([obs, failNode, downstream]);

      const handlers = new Map<string, (inputs: Map<string, unknown>) => Promise<unknown>>();
      handlers.set('will-fail', async () => {
        throw new Error('deliberate failure');
      });
      handlers.set('downstream', async (inputs) => inputs.values().next().value);

      const runtime = new DPNRuntime({ context: makeContext(handlers) });
      runtime.compile(graph);
      const result = await runtime.execute();

      expect(result.status).toBe('failed');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should timeout on slow execution', async () => {
      const obs = makeNode('obs', 'observation', 'observe', {
        outputs: [{ port: 'data', dataType: 'string', value: 'input' }],
      });
      const slow = makeNode('slow', 'inference', 'slow-op', {
        inputs: [{ nodeId: 'obs', port: 'data', dataType: 'string' }],
        outputs: [{ port: 'result', dataType: 'string' }],
      });
      const graph = makeGraph([obs, slow]);

      const handlers = new Map<string, (inputs: Map<string, unknown>) => Promise<unknown>>();
      handlers.set('slow-op', () => new Promise((resolve) => setTimeout(resolve, 5000)));

      const runtime = new DPNRuntime({
        context: makeContext(handlers),
        timeout: 200,
      });
      runtime.compile(graph);
      const result = await runtime.execute();

      expect(result.status).toBe('timeout');
      expect(result.errors.some((e) => e.code === 'TIMEOUT')).toBe(true);
    }, 10_000);

    it('should execute parallel branches concurrently', async () => {
      const obs = makeNode('obs', 'observation', 'observe', {
        outputs: [{ port: 'data', dataType: 'number', value: 10 }],
      });
      const b1 = makeNode('b1', 'inference', 'add-one', {
        inputs: [{ nodeId: 'obs', port: 'data', dataType: 'number' }],
        outputs: [{ port: 'result', dataType: 'number' }],
      });
      const b2 = makeNode('b2', 'inference', 'add-two', {
        inputs: [{ nodeId: 'obs', port: 'data', dataType: 'number' }],
        outputs: [{ port: 'result', dataType: 'number' }],
      });
      const graph = makeGraph([obs, b1, b2]);

      const handlers = new Map<string, (inputs: Map<string, unknown>) => Promise<unknown>>();
      handlers.set('add-one', async (inputs) => (inputs.values().next().value as number) + 1);
      handlers.set('add-two', async (inputs) => (inputs.values().next().value as number) + 2);

      const runtime = new DPNRuntime({ context: makeContext(handlers) });
      runtime.compile(graph);
      const result = await runtime.execute();

      expect(result.status).toBe('completed');
      expect(result.outputs['b1:result']).toBe(11);
      expect(result.outputs['b2:result']).toBe(12);
    });
  });

  describe('tracing', () => {
    it('should record channel events in trace', async () => {
      const obs = makeNode('obs', 'observation', 'observe', {
        outputs: [{ port: 'data', dataType: 'string', value: 'traced' }],
      });
      const infer = makeNode('infer', 'inference', 'echo', {
        inputs: [{ nodeId: 'obs', port: 'data', dataType: 'string' }],
        outputs: [{ port: 'result', dataType: 'string' }],
      });
      const graph = makeGraph([obs, infer]);

      const handlers = new Map<string, (inputs: Map<string, unknown>) => Promise<unknown>>();
      handlers.set('echo', async (inputs) => inputs.values().next().value);

      const runtime = new DPNRuntime({ context: makeContext(handlers) });
      runtime.compile(graph);
      await runtime.execute();

      const trace = runtime.getTrace();
      expect(trace.channelEntries.length).toBeGreaterThan(0);
      expect(trace.channelEntries.some((e) => e.direction === 'send')).toBe(true);
      expect(trace.channelEntries.some((e) => e.direction === 'receive')).toBe(true);
    });

    it('should record process states after execution', async () => {
      const obs = makeNode('obs', 'observation', 'observe', {
        outputs: [{ port: 'result', dataType: 'string', value: 'done' }],
      });
      const graph = makeGraph([obs]);

      const runtime = new DPNRuntime({ context: makeContext() });
      runtime.compile(graph);
      await runtime.execute();

      const trace = runtime.getTrace();
      expect(trace.processStates['obs']).toBe('completed');
    });

    it('should include timestamps on trace entries', async () => {
      const obs = makeNode('obs', 'observation', 'observe', {
        outputs: [{ port: 'data', dataType: 'string', value: 'ts-check' }],
      });
      const infer = makeNode('infer', 'inference', 'echo', {
        inputs: [{ nodeId: 'obs', port: 'data', dataType: 'string' }],
        outputs: [{ port: 'result', dataType: 'string' }],
      });
      const graph = makeGraph([obs, infer]);

      const handlers = new Map<string, (inputs: Map<string, unknown>) => Promise<unknown>>();
      handlers.set('echo', async (inputs) => inputs.values().next().value);

      const runtime = new DPNRuntime({ context: makeContext(handlers) });
      runtime.compile(graph);
      await runtime.execute();

      const trace = runtime.getTrace();
      for (const entry of trace.channelEntries) {
        expect(entry.timestamp).toBeDefined();
        expect(new Date(entry.timestamp).getTime()).not.toBeNaN();
      }
    });

    it('should disable tracing when enableTracing is false', async () => {
      const obs = makeNode('obs', 'observation', 'observe', {
        outputs: [{ port: 'data', dataType: 'string', value: 'no-trace' }],
      });
      const infer = makeNode('infer', 'inference', 'echo', {
        inputs: [{ nodeId: 'obs', port: 'data', dataType: 'string' }],
        outputs: [{ port: 'result', dataType: 'string' }],
      });
      const graph = makeGraph([obs, infer]);

      const handlers = new Map<string, (inputs: Map<string, unknown>) => Promise<unknown>>();
      handlers.set('echo', async (inputs) => inputs.values().next().value);

      const runtime = new DPNRuntime({
        context: makeContext(handlers),
        enableTracing: false,
      });
      runtime.compile(graph);
      await runtime.execute();

      const trace = runtime.getTrace();
      expect(trace.channelEntries).toHaveLength(0);
    });
  });
});
