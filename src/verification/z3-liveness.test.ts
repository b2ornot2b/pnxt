import {
  buildDependencyGraph,
} from './z3-liveness.js';
import { createZ3Context } from './z3-invariants.js';
import type { DataflowGraphDefinition, ProcessDefinition, Connection } from '../types/channel.js';

// ── Helpers ─────────────────────────────────────────────────────────

function makeProcess(id: string, inputs: string[] = [], outputs: string[] = []): ProcessDefinition {
  return {
    id,
    name: `Process ${id}`,
    inputs: inputs.map((name) => ({ name, direction: 'input' as const, dataType: 'unknown' })),
    outputs: outputs.map((name) => ({ name, direction: 'output' as const, dataType: 'unknown' })),
  };
}

function makeConnection(
  channelId: string,
  sourceId: string,
  sourcePort: string,
  targetId: string,
  targetPort: string,
): Connection {
  return {
    channelId,
    source: { processId: sourceId, port: sourcePort },
    target: { processId: targetId, port: targetPort },
  };
}

function makePipelineGraph(): DataflowGraphDefinition {
  // A → B → C (linear pipeline, no cycles)
  return {
    id: 'pipeline',
    name: 'Test Pipeline',
    processes: [
      makeProcess('A', [], ['out']),
      makeProcess('B', ['in'], ['out']),
      makeProcess('C', ['in'], []),
    ],
    connections: [
      makeConnection('ch-ab', 'A', 'out', 'B', 'in'),
      makeConnection('ch-bc', 'B', 'out', 'C', 'in'),
    ],
  };
}

function makeDiamondGraph(): DataflowGraphDefinition {
  // A → B, A → C, B → D, C → D (diamond, no cycles)
  return {
    id: 'diamond',
    name: 'Diamond Graph',
    processes: [
      makeProcess('A', [], ['out1', 'out2']),
      makeProcess('B', ['in'], ['out']),
      makeProcess('C', ['in'], ['out']),
      makeProcess('D', ['in1', 'in2'], []),
    ],
    connections: [
      makeConnection('ch-ab', 'A', 'out1', 'B', 'in'),
      makeConnection('ch-ac', 'A', 'out2', 'C', 'in'),
      makeConnection('ch-bd', 'B', 'out', 'D', 'in1'),
      makeConnection('ch-cd', 'C', 'out', 'D', 'in2'),
    ],
  };
}

function makeCyclicGraph(): DataflowGraphDefinition {
  // A → B → C → A (cycle!)
  return {
    id: 'cyclic',
    name: 'Cyclic Graph',
    processes: [
      makeProcess('A', ['in'], ['out']),
      makeProcess('B', ['in'], ['out']),
      makeProcess('C', ['in'], ['out']),
    ],
    connections: [
      makeConnection('ch-ab', 'A', 'out', 'B', 'in'),
      makeConnection('ch-bc', 'B', 'out', 'C', 'in'),
      makeConnection('ch-ca', 'C', 'out', 'A', 'in'),
    ],
  };
}

function makeEmptyGraph(): DataflowGraphDefinition {
  return { id: 'empty', name: 'Empty', processes: [], connections: [] };
}

// ── Dependency Graph Tests ──────────────────────────────────────────

describe('Dependency Graph Builder', () => {
  it('should build dependency graph for pipeline', () => {
    const graph = buildDependencyGraph(makePipelineGraph());

    expect(graph.get('A')!.size).toBe(0); // A has no deps
    expect(graph.get('B')!.has('A')).toBe(true); // B depends on A
    expect(graph.get('C')!.has('B')).toBe(true); // C depends on B
  });

  it('should build dependency graph for diamond', () => {
    const graph = buildDependencyGraph(makeDiamondGraph());

    expect(graph.get('A')!.size).toBe(0);
    expect(graph.get('B')!.has('A')).toBe(true);
    expect(graph.get('C')!.has('A')).toBe(true);
    expect(graph.get('D')!.has('B')).toBe(true);
    expect(graph.get('D')!.has('C')).toBe(true);
  });

  it('should detect cyclic dependencies', () => {
    const graph = buildDependencyGraph(makeCyclicGraph());

    expect(graph.get('A')!.has('C')).toBe(true); // A depends on C
    expect(graph.get('B')!.has('A')).toBe(true); // B depends on A
    expect(graph.get('C')!.has('B')).toBe(true); // C depends on B
  });

  it('should handle empty graph', () => {
    const graph = buildDependencyGraph(makeEmptyGraph());
    expect(graph.size).toBe(0);
  });
});

// ── Z3 Progress Tests ───────────────────────────────────────────────

describe('DPN Progress (Z3)', () => {
  let z3ctx: Awaited<ReturnType<typeof createZ3Context>>;

  beforeAll(async () => {
    z3ctx = await createZ3Context();
  }, 30_000);

  it('should verify progress for pipeline graph', async () => {
    const result = await z3ctx.verifyDPNProgress(makePipelineGraph());
    expect(result.verified).toBe(true);
    expect(result.property).toBe('dpn_progress');
  });

  it('should verify progress for diamond graph', async () => {
    const result = await z3ctx.verifyDPNProgress(makeDiamondGraph());
    expect(result.verified).toBe(true);
  });

  it('should verify progress for empty graph', async () => {
    const result = await z3ctx.verifyDPNProgress(makeEmptyGraph());
    expect(result.verified).toBe(true);
  });

  it('should return z3 solver info', async () => {
    const result = await z3ctx.verifyDPNProgress(makePipelineGraph());
    expect(result.solver).toBe('z3');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});

// ── Z3 Deadlock Freedom Tests ───────────────────────────────────────

describe('DPN Deadlock Freedom (Z3)', () => {
  let z3ctx: Awaited<ReturnType<typeof createZ3Context>>;

  beforeAll(async () => {
    z3ctx = await createZ3Context();
  }, 30_000);

  it('should verify deadlock freedom for pipeline (DAG)', async () => {
    const result = await z3ctx.verifyDPNDeadlockFreedom(makePipelineGraph());
    expect(result.verified).toBe(true);
    expect(result.property).toBe('dpn_deadlock_freedom');
  });

  it('should verify deadlock freedom for diamond (DAG)', async () => {
    const result = await z3ctx.verifyDPNDeadlockFreedom(makeDiamondGraph());
    expect(result.verified).toBe(true);
  });

  it('should detect deadlock in cyclic graph', async () => {
    const result = await z3ctx.verifyDPNDeadlockFreedom(makeCyclicGraph());
    expect(result.verified).toBe(false);
    expect(result.counterexample).toBeDefined();
    expect(result.counterexample!.cycle).toBeDefined();
  });

  it('should verify deadlock freedom for empty graph', async () => {
    const result = await z3ctx.verifyDPNDeadlockFreedom(makeEmptyGraph());
    expect(result.verified).toBe(true);
  });

  it('should verify single-process graph (no cycles possible)', async () => {
    const graph: DataflowGraphDefinition = {
      id: 'single',
      name: 'Single Process',
      processes: [makeProcess('A', [], ['out'])],
      connections: [],
    };
    const result = await z3ctx.verifyDPNDeadlockFreedom(graph);
    expect(result.verified).toBe(true);
  });
});

// ── Z3 Fairness Tests ───────────────────────────────────────────────

describe('DPN Fairness (Z3)', () => {
  let z3ctx: Awaited<ReturnType<typeof createZ3Context>>;

  beforeAll(async () => {
    z3ctx = await createZ3Context();
  }, 30_000);

  it('should verify fairness for pipeline graph', async () => {
    const result = await z3ctx.verifyDPNFairness(makePipelineGraph());
    expect(result.verified).toBe(true);
    expect(result.property).toBe('dpn_fairness');
  });

  it('should verify fairness for diamond graph', async () => {
    const result = await z3ctx.verifyDPNFairness(makeDiamondGraph());
    expect(result.verified).toBe(true);
  });

  it('should verify fairness for empty graph', async () => {
    const result = await z3ctx.verifyDPNFairness(makeEmptyGraph());
    expect(result.verified).toBe(true);
  });

  it('should return z3 solver info', async () => {
    const result = await z3ctx.verifyDPNFairness(makePipelineGraph());
    expect(result.solver).toBe('z3');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});
