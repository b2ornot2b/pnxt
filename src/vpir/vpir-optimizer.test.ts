/**
 * VPIR Optimizer tests.
 *
 * Tests parallel execution planning (wave analysis), result caching,
 * input hashing, and parallel graph execution via the interpreter.
 */

import { executeGraph } from './vpir-interpreter.js';
import {
  analyzeParallelism,
  createInputHash,
  InMemoryResultCache,
  Semaphore,
} from './vpir-optimizer.js';
import type { VPIRNode, VPIRGraph } from '../types/vpir.js';
import type { VPIRExecutionContext } from '../types/vpir-execution.js';
import { createLabel } from '../types/ifc.js';

// --- Helpers ---

function makeNode(overrides: Partial<VPIRNode> = {}): VPIRNode {
  return {
    id: 'node-1',
    type: 'inference',
    operation: 'default-op',
    inputs: [],
    outputs: [{ port: 'result', dataType: 'string' }],
    evidence: [{ type: 'data', source: 'test', confidence: 0.9 }],
    label: createLabel('agent-a', 2, 'internal'),
    verifiable: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeGraph(nodes: VPIRNode[], roots: string[], terminals: string[]): VPIRGraph {
  const nodeMap = new Map<string, VPIRNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }
  return {
    id: 'graph-1',
    name: 'test-graph',
    nodes: nodeMap,
    roots,
    terminals,
    createdAt: new Date().toISOString(),
  };
}

function makeContext(overrides: Partial<VPIRExecutionContext> = {}): VPIRExecutionContext {
  return {
    agentId: 'agent-a',
    label: createLabel('agent-a', 2, 'internal'),
    handlers: new Map(),
    ...overrides,
  };
}

// --- Wave Analysis Tests ---

describe('analyzeParallelism', () => {
  it('should produce one node per wave for a linear chain', () => {
    // A → B → C (linear)
    const a = makeNode({ id: 'a', type: 'observation', inputs: [] });
    const b = makeNode({
      id: 'b',
      inputs: [{ nodeId: 'a', port: 'result', dataType: 'string' }],
    });
    const c = makeNode({
      id: 'c',
      inputs: [{ nodeId: 'b', port: 'result', dataType: 'string' }],
    });

    const graph = makeGraph([a, b, c], ['a'], ['c']);
    const plan = analyzeParallelism(graph);

    expect(plan.waves).toHaveLength(3);
    expect(plan.waves[0].nodeIds).toEqual(['a']);
    expect(plan.waves[1].nodeIds).toEqual(['b']);
    expect(plan.waves[2].nodeIds).toEqual(['c']);
    expect(plan.totalNodes).toBe(3);
    expect(plan.maxParallelism).toBe(1);
  });

  it('should parallelize independent roots in a diamond DAG', () => {
    // A   B
    //  \ /
    //   C
    const a = makeNode({ id: 'a', type: 'observation', inputs: [] });
    const b = makeNode({ id: 'b', type: 'observation', inputs: [] });
    const c = makeNode({
      id: 'c',
      inputs: [
        { nodeId: 'a', port: 'result', dataType: 'string' },
        { nodeId: 'b', port: 'result', dataType: 'string' },
      ],
    });

    const graph = makeGraph([a, b, c], ['a', 'b'], ['c']);
    const plan = analyzeParallelism(graph);

    expect(plan.waves).toHaveLength(2);
    expect(plan.waves[0].nodeIds).toHaveLength(2);
    expect(plan.waves[0].nodeIds).toContain('a');
    expect(plan.waves[0].nodeIds).toContain('b');
    expect(plan.waves[1].nodeIds).toEqual(['c']);
    expect(plan.maxParallelism).toBe(2);
  });

  it('should handle a full diamond (fork + join)', () => {
    //   A
    //  / \
    // B   C
    //  \ /
    //   D
    const a = makeNode({ id: 'a', type: 'observation', inputs: [] });
    const b = makeNode({
      id: 'b',
      inputs: [{ nodeId: 'a', port: 'result', dataType: 'string' }],
    });
    const c = makeNode({
      id: 'c',
      inputs: [{ nodeId: 'a', port: 'result', dataType: 'string' }],
    });
    const d = makeNode({
      id: 'd',
      inputs: [
        { nodeId: 'b', port: 'result', dataType: 'string' },
        { nodeId: 'c', port: 'result', dataType: 'string' },
      ],
    });

    const graph = makeGraph([a, b, c, d], ['a'], ['d']);
    const plan = analyzeParallelism(graph);

    expect(plan.waves).toHaveLength(3);
    expect(plan.waves[0].nodeIds).toEqual(['a']);
    expect(plan.waves[1].nodeIds).toHaveLength(2);
    expect(plan.waves[1].nodeIds).toContain('b');
    expect(plan.waves[1].nodeIds).toContain('c');
    expect(plan.waves[2].nodeIds).toEqual(['d']);
    expect(plan.maxParallelism).toBe(2);
  });

  it('should handle wide graphs with many independent roots', () => {
    // A B C D E (all independent)
    const nodes = ['a', 'b', 'c', 'd', 'e'].map((id) =>
      makeNode({ id, type: 'observation', inputs: [] }),
    );

    const graph = makeGraph(nodes, ['a', 'b', 'c', 'd', 'e'], ['a', 'b', 'c', 'd', 'e']);
    const plan = analyzeParallelism(graph);

    expect(plan.waves).toHaveLength(1);
    expect(plan.waves[0].nodeIds).toHaveLength(5);
    expect(plan.maxParallelism).toBe(5);
  });

  it('should handle a single node graph', () => {
    const a = makeNode({ id: 'a', type: 'observation', inputs: [] });
    const graph = makeGraph([a], ['a'], ['a']);
    const plan = analyzeParallelism(graph);

    expect(plan.waves).toHaveLength(1);
    expect(plan.waves[0].nodeIds).toEqual(['a']);
    expect(plan.totalNodes).toBe(1);
    expect(plan.maxParallelism).toBe(1);
  });
});

// --- Input Hashing Tests ---

describe('createInputHash', () => {
  it('should produce deterministic hashes for same inputs', () => {
    const inputs1 = new Map([['a', 1], ['b', 'hello']]);
    const inputs2 = new Map([['a', 1], ['b', 'hello']]);

    expect(createInputHash(inputs1)).toBe(createInputHash(inputs2));
  });

  it('should produce different hashes for different inputs', () => {
    const inputs1 = new Map([['a', 1]]);
    const inputs2 = new Map([['a', 2]]);

    expect(createInputHash(inputs1)).not.toBe(createInputHash(inputs2));
  });

  it('should be order-independent (sorts keys)', () => {
    const inputs1 = new Map([['b', 2], ['a', 1]]);
    const inputs2 = new Map([['a', 1], ['b', 2]]);

    expect(createInputHash(inputs1)).toBe(createInputHash(inputs2));
  });

  it('should handle empty inputs', () => {
    const hash = createInputHash(new Map());
    expect(hash).toBe('[]');
  });

  it('should handle nested objects', () => {
    const inputs = new Map<string, unknown>([['x', { nested: { deep: true } }]]);
    const hash = createInputHash(inputs);
    expect(hash).toBeTruthy();
    expect(createInputHash(inputs)).toBe(hash);
  });
});

// --- InMemoryResultCache Tests ---

describe('InMemoryResultCache', () => {
  it('should store and retrieve values', async () => {
    const cache = new InMemoryResultCache();

    await cache.set('node-1', 'hash-a', 42);
    const result = await cache.get('node-1', 'hash-a');

    expect(result).toBe(42);
  });

  it('should return undefined for cache miss', async () => {
    const cache = new InMemoryResultCache();
    const result = await cache.get('node-1', 'hash-a');

    expect(result).toBeUndefined();
  });

  it('should report presence correctly', async () => {
    const cache = new InMemoryResultCache();

    expect(await cache.has('node-1', 'hash-a')).toBe(false);
    await cache.set('node-1', 'hash-a', 'value');
    expect(await cache.has('node-1', 'hash-a')).toBe(true);
  });

  it('should track size correctly', async () => {
    const cache = new InMemoryResultCache();

    expect(cache.size).toBe(0);
    await cache.set('n1', 'h1', 'v1');
    expect(cache.size).toBe(1);
    await cache.set('n1', 'h2', 'v2');
    expect(cache.size).toBe(2);
    await cache.set('n2', 'h1', 'v3');
    expect(cache.size).toBe(3);
  });

  it('should clear all entries', async () => {
    const cache = new InMemoryResultCache();

    await cache.set('n1', 'h1', 'v1');
    await cache.set('n2', 'h2', 'v2');
    cache.clear();

    expect(cache.size).toBe(0);
    expect(await cache.get('n1', 'h1')).toBeUndefined();
  });
});

// --- Semaphore Tests ---

describe('Semaphore', () => {
  it('should limit concurrency', async () => {
    const semaphore = new Semaphore(2);
    let running = 0;
    let maxRunning = 0;

    const task = async () => {
      await semaphore.acquire();
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 10));
      running--;
      semaphore.release();
    };

    await Promise.all([task(), task(), task(), task()]);

    expect(maxRunning).toBeLessThanOrEqual(2);
  });

  it('should allow up to maxConcurrency immediate acquires', async () => {
    const semaphore = new Semaphore(3);

    // These should all resolve immediately.
    await semaphore.acquire();
    await semaphore.acquire();
    await semaphore.acquire();

    // This one should block.
    let acquired = false;
    const blocked = semaphore.acquire().then(() => { acquired = true; });

    // Give the microtask queue a tick.
    await new Promise((r) => setTimeout(r, 0));
    expect(acquired).toBe(false);

    // Release one — now it should unblock.
    semaphore.release();
    await blocked;
    expect(acquired).toBe(true);
  });
});

// --- Parallel Execution Tests ---

describe('executeGraph with parallel option', () => {
  it('should produce same results as sequential execution', async () => {
    //   A
    //  / \
    // B   C
    //  \ /
    //   D
    const a = makeNode({
      id: 'a',
      type: 'observation',
      inputs: [],
      outputs: [{ port: 'value', dataType: 'number', value: 10 }],
    });
    const b = makeNode({
      id: 'b',
      operation: 'double',
      inputs: [{ nodeId: 'a', port: 'value', dataType: 'number' }],
      outputs: [{ port: 'result', dataType: 'number' }],
    });
    const c = makeNode({
      id: 'c',
      operation: 'triple',
      inputs: [{ nodeId: 'a', port: 'value', dataType: 'number' }],
      outputs: [{ port: 'result', dataType: 'number' }],
    });
    const d = makeNode({
      id: 'd',
      operation: 'sum',
      inputs: [
        { nodeId: 'b', port: 'result', dataType: 'number' },
        { nodeId: 'c', port: 'result', dataType: 'number' },
      ],
      outputs: [{ port: 'result', dataType: 'number' }],
    });

    const graph = makeGraph([a, b, c, d], ['a'], ['d']);
    const handlers = new Map([
      ['double', async (inputs: Map<string, unknown>) => {
        const val = inputs.values().next().value as number;
        return val * 2;
      }],
      ['triple', async (inputs: Map<string, unknown>) => {
        const val = inputs.values().next().value as number;
        return val * 3;
      }],
      ['sum', async (inputs: Map<string, unknown>) => {
        let total = 0;
        for (const v of inputs.values()) total += v as number;
        return total;
      }],
    ]);

    const seqResult = await executeGraph(graph, makeContext({ handlers }));
    const parResult = await executeGraph(graph, makeContext({ handlers }), { parallel: true });

    expect(seqResult.status).toBe('completed');
    expect(parResult.status).toBe('completed');
    expect(parResult.outputs).toEqual(seqResult.outputs);
  });

  it('should respect maxConcurrency', async () => {
    // 4 independent observation nodes, maxConcurrency = 2.
    let maxRunning = 0;
    let running = 0;

    const nodes = ['a', 'b', 'c', 'd'].map((id) =>
      makeNode({
        id,
        type: 'inference',
        operation: 'slow',
        inputs: [],
        outputs: [{ port: 'result', dataType: 'number' }],
      }),
    );

    const graph = makeGraph(nodes, ['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd']);
    const handlers = new Map([
      ['slow', async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 20));
        running--;
        return 1;
      }],
    ]);

    const result = await executeGraph(
      graph,
      makeContext({ handlers }),
      { parallel: true, maxConcurrency: 2 },
    );

    expect(result.status).toBe('completed');
    expect(maxRunning).toBeLessThanOrEqual(2);
  });

  it('should handle errors in parallel execution', async () => {
    const a = makeNode({
      id: 'a',
      type: 'inference',
      operation: 'fail',
      inputs: [],
      outputs: [{ port: 'result', dataType: 'string' }],
    });
    const b = makeNode({
      id: 'b',
      type: 'observation',
      inputs: [],
      outputs: [{ port: 'result', dataType: 'string', value: 'ok' }],
    });

    const graph = makeGraph([a, b], ['a', 'b'], ['a', 'b']);
    const handlers = new Map([
      ['fail', async () => { throw new Error('Boom'); }],
    ]);

    const result = await executeGraph(
      graph,
      makeContext({ handlers }),
      { parallel: true },
    );

    expect(result.status).toBe('failed');
    expect(result.errors.some((e) => e.message === 'Boom')).toBe(true);
  });

  it('should enforce IFC in parallel mode', async () => {
    const highTrust = makeNode({
      id: 'high',
      type: 'observation',
      inputs: [],
      outputs: [{ port: 'data', dataType: 'string', value: 'secret' }],
      label: createLabel('agent-a', 4, 'restricted'),
    });
    const lowTrust = makeNode({
      id: 'low',
      operation: 'read-secret',
      inputs: [{ nodeId: 'high', port: 'data', dataType: 'string' }],
      outputs: [{ port: 'result', dataType: 'string' }],
      label: createLabel('agent-b', 1, 'public'),
    });

    const graph = makeGraph([highTrust, lowTrust], ['high'], ['low']);

    const result = await executeGraph(
      graph,
      makeContext(),
      { parallel: true },
    );

    expect(result.status).toBe('failed');
    // The graph validator catches IFC violations during structural validation,
    // so the error may be VALIDATION_ERROR or IFC_VIOLATION depending on check order.
    expect(
      result.errors[0].code === 'IFC_VIOLATION' || result.errors[0].code === 'VALIDATION_ERROR',
    ).toBe(true);
  });

  it('should handle timeout in parallel mode', async () => {
    // Use a two-wave graph so timeout triggers between waves.
    //   A (slow)
    //   |
    //   B
    const a = makeNode({
      id: 'a',
      type: 'inference',
      operation: 'slow',
      inputs: [],
      outputs: [{ port: 'result', dataType: 'number' }],
    });
    const b = makeNode({
      id: 'b',
      operation: 'fast',
      inputs: [{ nodeId: 'a', port: 'result', dataType: 'number' }],
      outputs: [{ port: 'result', dataType: 'number' }],
    });

    const graph = makeGraph([a, b], ['a'], ['b']);
    const handlers = new Map([
      ['slow', async () => {
        await new Promise((r) => setTimeout(r, 50));
        return 1;
      }],
      ['fast', async (inputs: Map<string, unknown>) => {
        return inputs.values().next().value;
      }],
    ]);

    // Timeout of 10ms should trigger after wave 1 (which takes 50ms).
    const result = await executeGraph(
      graph,
      makeContext({ handlers, timeout: 10 }),
      { parallel: true },
    );

    expect(result.status).toBe('timeout');
  });
});

// --- Cache Tests ---

describe('executeGraph with cache option', () => {
  it('should cache observation node results', async () => {
    const obs = makeNode({
      id: 'obs-1',
      type: 'observation',
      operation: 'fetch-data',
      inputs: [],
      outputs: [{ port: 'data', dataType: 'number', value: 42 }],
    });

    const graph = makeGraph([obs], ['obs-1'], ['obs-1']);
    const cache = new InMemoryResultCache();

    // First execution — populates cache.
    const result1 = await executeGraph(graph, makeContext(), { cache });
    expect(result1.status).toBe('completed');
    expect(cache.size).toBe(1);

    // Second execution — should use cached result.
    const result2 = await executeGraph(graph, makeContext(), { cache });
    expect(result2.status).toBe('completed');
    expect(result2.outputs).toEqual(result1.outputs);
  });

  it('should cache inference node results', async () => {
    let callCount = 0;
    const obs = makeNode({
      id: 'obs-1',
      type: 'observation',
      inputs: [],
      outputs: [{ port: 'value', dataType: 'number', value: 5 }],
    });
    const inf = makeNode({
      id: 'inf-1',
      operation: 'counted',
      inputs: [{ nodeId: 'obs-1', port: 'value', dataType: 'number' }],
      outputs: [{ port: 'result', dataType: 'number' }],
    });

    const graph = makeGraph([obs, inf], ['obs-1'], ['inf-1']);
    const handlers = new Map([
      ['counted', async (inputs: Map<string, unknown>) => {
        callCount++;
        const val = inputs.values().next().value as number;
        return val * 2;
      }],
    ]);
    const cache = new InMemoryResultCache();

    await executeGraph(graph, makeContext({ handlers }), { cache });
    expect(callCount).toBe(1);

    await executeGraph(graph, makeContext({ handlers }), { cache });
    // Inference handler should not be called again (cached).
    expect(callCount).toBe(1);
  });

  it('should not cache action nodes', async () => {
    let callCount = 0;
    const action = makeNode({
      id: 'act-1',
      type: 'action',
      operation: 'write-file',
      inputs: [],
      outputs: [{ port: 'result', dataType: 'string' }],
    });

    const graph = makeGraph([action], ['act-1'], ['act-1']);
    const mockGateway = {
      invoke: async () => {
        callCount++;
        return {
          requestId: 'req-1',
          success: true,
          output: 'written',
          duration: 10,
        };
      },
    };
    const cache = new InMemoryResultCache();

    await executeGraph(graph, makeContext({ aciGateway: mockGateway }), { cache });
    await executeGraph(graph, makeContext({ aciGateway: mockGateway }), { cache });

    // Action should be called twice (not cached).
    expect(callCount).toBe(2);
  });

  it('should work with parallel execution and caching together', async () => {
    let callCount = 0;
    const a = makeNode({
      id: 'a',
      type: 'observation',
      inputs: [],
      outputs: [{ port: 'value', dataType: 'number', value: 3 }],
    });
    const b = makeNode({
      id: 'b',
      type: 'observation',
      inputs: [],
      outputs: [{ port: 'value', dataType: 'number', value: 7 }],
    });
    const c = makeNode({
      id: 'c',
      operation: 'add',
      inputs: [
        { nodeId: 'a', port: 'value', dataType: 'number' },
        { nodeId: 'b', port: 'value', dataType: 'number' },
      ],
      outputs: [{ port: 'result', dataType: 'number' }],
    });

    const graph = makeGraph([a, b, c], ['a', 'b'], ['c']);
    const handlers = new Map([
      ['add', async (inputs: Map<string, unknown>) => {
        callCount++;
        let sum = 0;
        for (const v of inputs.values()) sum += v as number;
        return sum;
      }],
    ]);
    const cache = new InMemoryResultCache();

    const result1 = await executeGraph(
      graph,
      makeContext({ handlers }),
      { parallel: true, cache },
    );
    expect(result1.status).toBe('completed');
    expect(callCount).toBe(1);

    const result2 = await executeGraph(
      graph,
      makeContext({ handlers }),
      { parallel: true, cache },
    );
    expect(result2.status).toBe('completed');
    expect(callCount).toBe(1); // Cached.
    expect(result2.outputs).toEqual(result1.outputs);
  });
});

// --- Backward Compatibility ---

describe('executeGraph backward compatibility', () => {
  it('should work without options parameter', async () => {
    const obs = makeNode({
      id: 'obs-1',
      type: 'observation',
      inputs: [],
      outputs: [{ port: 'data', dataType: 'number', value: 99 }],
    });

    const graph = makeGraph([obs], ['obs-1'], ['obs-1']);
    const result = await executeGraph(graph, makeContext());

    expect(result.status).toBe('completed');
    expect(result.outputs['obs-1:data']).toBe(99);
  });
});
