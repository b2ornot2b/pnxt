import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { SecurityLabel } from '../types/ifc.js';
import type { VPIRGraph, VPIRNode } from '../types/vpir.js';
import type {
  InferenceHandler,
  VPIRExecutionContext,
} from '../types/vpir-execution.js';
import {
  JournalGraphHashError,
  JournalSchemaVersionError,
} from '../errors/vpir-errors.js';
import { executeGraph, resumeFromCheckpoint } from './vpir-interpreter.js';
import {
  FileBackedJournal,
  InMemoryJournal,
  JOURNAL_SCHEMA_VERSION,
  assertCheckpointMatchesGraph,
  graphContentHash,
} from './vpir-journal.js';
import type { JournalCheckpoint } from './vpir-journal.js';

// ── Test Helpers ──────────────────────────────────────────────────

function makeLabel(trustLevel: 0 | 1 | 2 | 3 | 4 = 2): SecurityLabel {
  return {
    owner: 'test',
    trustLevel,
    classification: 'internal',
    createdAt: '2026-04-19T00:00:00.000Z',
  };
}

function makeNode(id: string, overrides: Partial<VPIRNode> = {}): VPIRNode {
  return {
    id,
    type: 'inference',
    operation: `op-${id}`,
    inputs: [],
    outputs: [{ port: 'result', dataType: 'string' }],
    evidence: [{ type: 'rule', source: 'test', confidence: 1.0 }],
    label: makeLabel(),
    verifiable: true,
    createdAt: '2026-04-19T00:00:00.000Z',
    ...overrides,
  };
}

function makeGraph(id: string, nodes: VPIRNode[]): VPIRGraph {
  const map = new Map<string, VPIRNode>();
  for (const n of nodes) map.set(n.id, n);
  return {
    id,
    name: `graph-${id}`,
    nodes: map,
    roots: nodes.filter((n) => n.inputs.length === 0).map((n) => n.id),
    terminals: nodes.map((n) => n.id),
    createdAt: '2026-04-19T00:00:00.000Z',
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('graphContentHash', () => {
  it('is deterministic for the same graph', () => {
    const g = makeGraph('g', [makeNode('a'), makeNode('b')]);
    expect(graphContentHash(g)).toBe(graphContentHash(g));
  });

  it('is stable across Map insertion order', () => {
    const g1 = makeGraph('g', [makeNode('a'), makeNode('b')]);
    const g2 = makeGraph('g', [makeNode('b'), makeNode('a')]);
    expect(graphContentHash(g1)).toBe(graphContentHash(g2));
  });

  it('changes when a node is added', () => {
    const g1 = makeGraph('g', [makeNode('a')]);
    const g2 = makeGraph('g', [makeNode('a'), makeNode('b')]);
    expect(graphContentHash(g1)).not.toBe(graphContentHash(g2));
  });

  it('changes when an edge is rerouted', () => {
    const g1 = makeGraph('g', [
      makeNode('a'),
      makeNode('b', { inputs: [{ nodeId: 'a', port: 'result', dataType: 'string' }] }),
    ]);
    const g2 = makeGraph('g', [
      makeNode('a'),
      makeNode('b', { inputs: [{ nodeId: 'a', port: 'other', dataType: 'string' }] }),
    ]);
    expect(graphContentHash(g1)).not.toBe(graphContentHash(g2));
  });
});

describe('InMemoryJournal', () => {
  it('appends entries and returns null for empty checkpoint lookup', async () => {
    const journal = new InMemoryJournal();
    expect(await journal.latestCheckpoint('g1')).toBeNull();

    await journal.append({
      graphId: 'g1',
      nodeId: 'a',
      inputs: {},
      outputs: { result: 42 },
      label: makeLabel(),
      timestamp: 1,
    });

    // Still no checkpoint.
    expect(await journal.latestCheckpoint('g1')).toBeNull();
  });

  it('round-trips append then replay via checkpoint', async () => {
    const journal = new InMemoryJournal();
    await journal.append({
      graphId: 'g1',
      nodeId: 'a',
      inputs: {},
      outputs: { result: 'alpha' },
      label: makeLabel(),
      timestamp: 1,
    });
    await journal.append({
      graphId: 'g1',
      nodeId: 'b',
      inputs: { 'a:result': 'alpha' },
      outputs: { result: 'beta' },
      label: makeLabel(),
      timestamp: 2,
    });
    await journal.recordCheckpoint({
      checkpointId: 'cp-1',
      graphId: 'g1',
      graphHash: 'hash-abc',
      completedNodeIds: ['a', 'b'],
      timestamp: 3,
    });

    const state = await journal.replay('cp-1');
    expect(state.checkpointId).toBe('cp-1');
    expect([...state.completedNodes]).toEqual(['a', 'b']);
    expect(state.nodeOutputs.get('a')?.get('result')).toBe('alpha');
    expect(state.nodeOutputs.get('b')?.get('result')).toBe('beta');
  });

  it('latestCheckpoint returns the most recent checkpoint for a graph', async () => {
    const journal = new InMemoryJournal();
    await journal.recordCheckpoint({
      checkpointId: 'cp-1',
      graphId: 'g1',
      graphHash: 'h1',
      completedNodeIds: ['a'],
      timestamp: 1,
    });
    await journal.recordCheckpoint({
      checkpointId: 'cp-2',
      graphId: 'g1',
      graphHash: 'h2',
      completedNodeIds: ['a', 'b'],
      timestamp: 2,
    });
    await journal.recordCheckpoint({
      checkpointId: 'cp-other',
      graphId: 'g2',
      graphHash: 'hx',
      completedNodeIds: ['z'],
      timestamp: 3,
    });

    const latest = await journal.latestCheckpoint('g1');
    expect(latest?.checkpointId).toBe('cp-2');
  });

  it('replay preserves the exact SecurityLabel stored with each entry', async () => {
    const journal = new InMemoryJournal();
    const confidentialLabel: SecurityLabel = {
      owner: 'labeled-agent',
      trustLevel: 3,
      classification: 'confidential',
      createdAt: '2026-04-19T00:00:00.000Z',
    };
    await journal.append({
      graphId: 'g1',
      nodeId: 'a',
      inputs: {},
      outputs: { result: 'secret' },
      label: confidentialLabel,
      timestamp: 1,
    });
    await journal.recordCheckpoint({
      checkpointId: 'cp-1',
      graphId: 'g1',
      graphHash: 'h',
      completedNodeIds: ['a'],
      timestamp: 2,
    });

    const snapshot = journal.snapshot();
    const entry = snapshot.find((r) => r.kind === 'entry');
    expect(entry).toBeDefined();
    if (entry && entry.kind === 'entry') {
      expect(entry.label).toEqual(confidentialLabel);
    }
  });

  it('throws JournalSchemaVersionError when a record is from a different schema', async () => {
    const journal = new InMemoryJournal();
    await journal.append({
      graphId: 'g1',
      nodeId: 'a',
      inputs: {},
      outputs: { result: 1 },
      label: makeLabel(),
      timestamp: 1,
    });
    await journal.recordCheckpoint({
      checkpointId: 'cp-1',
      graphId: 'g1',
      graphHash: 'h',
      completedNodeIds: ['a'],
      timestamp: 2,
    });

    // Tamper in-memory to simulate a stale record from a previous build.
    const snap = journal.snapshot();
    const cp = snap.find((r) => r.kind === 'checkpoint')!;
    (cp as JournalCheckpoint).schemaVersion = JOURNAL_SCHEMA_VERSION + 1;

    await expect(journal.replay('cp-1')).rejects.toBeInstanceOf(JournalSchemaVersionError);
  });

  it('skips pre-checkpoint entries whose node is not in completedNodeIds', async () => {
    // Simulates a crash after entry was written but before the checkpoint
    // included the node. Replay must not treat the node as settled.
    const journal = new InMemoryJournal();
    await journal.append({
      graphId: 'g1',
      nodeId: 'a',
      inputs: {},
      outputs: { result: 1 },
      label: makeLabel(),
      timestamp: 1,
    });
    await journal.append({
      graphId: 'g1',
      nodeId: 'b', // Crashed mid-write, never made it into a checkpoint.
      inputs: {},
      outputs: { result: 2 },
      label: makeLabel(),
      timestamp: 2,
    });
    await journal.recordCheckpoint({
      checkpointId: 'cp-1',
      graphId: 'g1',
      graphHash: 'h',
      completedNodeIds: ['a'], // Only 'a' was definitively settled.
      timestamp: 3,
    });

    const state = await journal.replay('cp-1');
    expect(state.nodeOutputs.has('a')).toBe(true);
    expect(state.nodeOutputs.has('b')).toBe(false);
    expect(state.completedNodes.has('b')).toBe(false);
  });
});

describe('FileBackedJournal', () => {
  let tempDir: string;
  let journalPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pnxt-journal-test-'));
    journalPath = join(tempDir, 'journal.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null from latestCheckpoint when the file does not exist', async () => {
    const journal = new FileBackedJournal(journalPath);
    expect(await journal.latestCheckpoint('g1')).toBeNull();
  });

  it('persists entries and checkpoints across instances', async () => {
    const writer = new FileBackedJournal(journalPath);
    await writer.append({
      graphId: 'g1',
      nodeId: 'a',
      inputs: {},
      outputs: { result: 'alpha' },
      label: makeLabel(),
      timestamp: 1,
    });
    await writer.recordCheckpoint({
      checkpointId: 'cp-1',
      graphId: 'g1',
      graphHash: 'hash-abc',
      completedNodeIds: ['a'],
      timestamp: 2,
    });

    // Fresh reader instance — simulates a process restart.
    const reader = new FileBackedJournal(journalPath);
    const cp = await reader.latestCheckpoint('g1');
    expect(cp?.checkpointId).toBe('cp-1');
    const state = await reader.replay('cp-1');
    expect(state.nodeOutputs.get('a')?.get('result')).toBe('alpha');
  });

  it('assigns monotonic sequence numbers across restarts', async () => {
    const w1 = new FileBackedJournal(journalPath);
    await w1.append({
      graphId: 'g1',
      nodeId: 'a',
      inputs: {},
      outputs: { result: 1 },
      label: makeLabel(),
      timestamp: 1,
    });

    // Second instance reads existing file and continues the sequence.
    const w2 = new FileBackedJournal(journalPath);
    await w2.append({
      graphId: 'g1',
      nodeId: 'b',
      inputs: {},
      outputs: { result: 2 },
      label: makeLabel(),
      timestamp: 2,
    });
    await w2.recordCheckpoint({
      checkpointId: 'cp-1',
      graphId: 'g1',
      graphHash: 'h',
      completedNodeIds: ['a', 'b'],
      timestamp: 3,
    });

    const state = await w2.replay('cp-1');
    // Both entries must be present in the replayed state.
    expect(state.nodeOutputs.get('a')?.get('result')).toBe(1);
    expect(state.nodeOutputs.get('b')?.get('result')).toBe(2);
  });
});

// ── executeGraph + journal integration ───────────────────────────

function makeTestContext(handlers: Map<string, InferenceHandler>): VPIRExecutionContext {
  return {
    agentId: 'test-agent',
    label: makeLabel(),
    handlers,
  };
}

function makeChainGraph(): VPIRGraph {
  // a -> b -> c — three sequential inference nodes.
  const a = makeNode('a');
  const b = makeNode('b', {
    inputs: [{ nodeId: 'a', port: 'result', dataType: 'string' }],
  });
  const c = makeNode('c', {
    inputs: [{ nodeId: 'b', port: 'result', dataType: 'string' }],
  });
  return makeGraph('chain', [a, b, c]);
}

function makeChainHandlers(): Map<string, InferenceHandler> {
  const h = new Map<string, InferenceHandler>();
  h.set('op-a', async () => 'A');
  h.set('op-b', async (inputs) => `${[...inputs.values()][0]}->B`);
  h.set('op-c', async (inputs) => `${[...inputs.values()][0]}->C`);
  return h;
}

describe('executeGraph with journal', () => {
  it('behaves identically to the non-journal path when no journal is provided', async () => {
    const graph = makeChainGraph();
    const ctx = makeTestContext(makeChainHandlers());
    const result = await executeGraph(graph, ctx);
    expect(result.status).toBe('completed');
    expect(result.outputs['c:result']).toBe('A->B->C');
  });

  it('appends one entry and one checkpoint per settled node on the sequential path', async () => {
    const graph = makeChainGraph();
    const ctx = makeTestContext(makeChainHandlers());
    const journal = new InMemoryJournal();

    const result = await executeGraph(graph, ctx, { journal });
    expect(result.status).toBe('completed');

    const records = journal.snapshot();
    const entries = records.filter((r) => r.kind === 'entry');
    const checkpoints = records.filter((r) => r.kind === 'checkpoint');
    expect(entries).toHaveLength(3);
    expect(checkpoints).toHaveLength(3);

    // Each checkpoint's completedNodeIds grows monotonically.
    const sorted = checkpoints
      .slice()
      .sort((a, b) => a.sequence - b.sequence) as JournalCheckpoint[];
    expect(sorted[0].completedNodeIds).toEqual(['a']);
    expect(sorted[1].completedNodeIds).toEqual(['a', 'b']);
    expect(sorted[2].completedNodeIds).toEqual(['a', 'b', 'c']);
  });

  it('appends entries for every settled node on the parallel path', async () => {
    // Diamond: a -> b, a -> c, b+c -> d. b and c run in the same wave.
    const a = makeNode('a');
    const b = makeNode('b', { inputs: [{ nodeId: 'a', port: 'result', dataType: 'string' }] });
    const c = makeNode('c', { inputs: [{ nodeId: 'a', port: 'result', dataType: 'string' }] });
    const d = makeNode('d', {
      inputs: [
        { nodeId: 'b', port: 'result', dataType: 'string' },
        { nodeId: 'c', port: 'result', dataType: 'string' },
      ],
    });
    const graph = makeGraph('diamond', [a, b, c, d]);

    const handlers = new Map<string, InferenceHandler>();
    handlers.set('op-a', async () => 'A');
    handlers.set('op-b', async () => 'B');
    handlers.set('op-c', async () => 'C');
    handlers.set('op-d', async () => 'D');

    const journal = new InMemoryJournal();
    const result = await executeGraph(graph, makeTestContext(handlers), {
      journal,
      parallel: true,
    });
    expect(result.status).toBe('completed');

    const entries = journal.snapshot().filter((r) => r.kind === 'entry');
    const settled = new Set(entries.map((e) => (e as { nodeId: string }).nodeId));
    expect(settled).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  it('resumes from a prior checkpoint and skips already-settled nodes', async () => {
    const graph = makeChainGraph();
    const journal = new InMemoryJournal();

    // First run — track which handlers actually get invoked.
    const handlers1 = makeChainHandlers();
    const run1 = await executeGraph(graph, makeTestContext(handlers1), { journal });
    expect(run1.status).toBe('completed');

    // Reconstruct via resumeFromCheckpoint, then hand it back to executeGraph
    // with handlers that THROW if called — proving no re-execution.
    const state = await resumeFromCheckpoint(graph, journal);
    expect(state).not.toBeNull();
    expect(state!.completedNodes.size).toBe(3);

    const throwingHandlers = new Map<string, InferenceHandler>();
    throwingHandlers.set('op-a', async () => {
      throw new Error('op-a must not re-run');
    });
    throwingHandlers.set('op-b', async () => {
      throw new Error('op-b must not re-run');
    });
    throwingHandlers.set('op-c', async () => {
      throw new Error('op-c must not re-run');
    });

    const run2 = await executeGraph(graph, makeTestContext(throwingHandlers), {
      journal,
      resumeFrom: state ?? undefined,
    });
    expect(run2.status).toBe('completed');
    expect(run2.outputs['c:result']).toBe('A->B->C');
  });

  it('resume after a partial crash re-runs only the unsettled tail', async () => {
    const graph = makeChainGraph();
    const journal = new InMemoryJournal();

    // Run 1 — fail node 'b' so only 'a' makes it into the journal.
    const partial = makeChainHandlers();
    partial.set('op-b', async () => {
      throw new Error('simulated crash');
    });
    const run1 = await executeGraph(graph, makeTestContext(partial), { journal });
    expect(run1.status).toBe('failed');

    // Journal holds exactly one entry + one checkpoint for node 'a'.
    const checkpoints = journal.snapshot().filter((r) => r.kind === 'checkpoint');
    expect(checkpoints).toHaveLength(1);
    expect((checkpoints[0] as JournalCheckpoint).completedNodeIds).toEqual(['a']);

    // Run 2 — fix the handler and resume. Only 'b' and 'c' execute.
    const calls = new Set<string>();
    const fixed = new Map<string, InferenceHandler>();
    fixed.set('op-a', async () => {
      calls.add('a');
      return 'A';
    });
    fixed.set('op-b', async (inputs) => {
      calls.add('b');
      return `${[...inputs.values()][0]}->B`;
    });
    fixed.set('op-c', async (inputs) => {
      calls.add('c');
      return `${[...inputs.values()][0]}->C`;
    });

    const state = await resumeFromCheckpoint(graph, journal);
    const run2 = await executeGraph(graph, makeTestContext(fixed), {
      journal,
      resumeFrom: state ?? undefined,
    });
    expect(run2.status).toBe('completed');
    expect(run2.outputs['c:result']).toBe('A->B->C');
    expect(calls.has('a')).toBe(false); // 'a' was recovered from journal
    expect(calls.has('b')).toBe(true);
    expect(calls.has('c')).toBe(true);
  });

  it('resumeFromCheckpoint returns null when the journal has no checkpoint for the graph', async () => {
    const graph = makeChainGraph();
    const journal = new InMemoryJournal();
    expect(await resumeFromCheckpoint(graph, journal)).toBeNull();
  });

  it('resumeFromCheckpoint rejects a structurally-changed graph', async () => {
    const original = makeChainGraph();
    const journal = new InMemoryJournal();
    await executeGraph(original, makeTestContext(makeChainHandlers()), { journal });

    // Mutate the graph: add a fourth node.
    const mutated = makeGraph('chain', [
      ...original.nodes.values(),
      makeNode('d', { inputs: [{ nodeId: 'c', port: 'result', dataType: 'string' }] }),
    ]);

    await expect(resumeFromCheckpoint(mutated, journal)).rejects.toBeInstanceOf(
      JournalGraphHashError,
    );
  });

  it('preserves the exact SecurityLabel in the journal entry', async () => {
    const label: SecurityLabel = {
      owner: 'confidential-owner',
      trustLevel: 3,
      classification: 'confidential',
      createdAt: '2026-04-19T01:00:00.000Z',
    };
    const a = makeNode('a', { label });
    const graph = makeGraph('g', [a]);
    const journal = new InMemoryJournal();

    const handlers = new Map<string, InferenceHandler>();
    handlers.set('op-a', async () => 'secret');
    await executeGraph(graph, makeTestContext(handlers), { journal });

    const entry = journal
      .snapshot()
      .find((r) => r.kind === 'entry' && (r as { nodeId: string }).nodeId === 'a');
    expect(entry).toBeDefined();
    if (entry && entry.kind === 'entry') {
      expect(entry.label).toEqual(label);
    }
  });
});

describe('assertCheckpointMatchesGraph', () => {
  it('accepts a matching hash', () => {
    const graph = makeGraph('g1', [makeNode('a')]);
    const cp: JournalCheckpoint = {
      kind: 'checkpoint',
      checkpointId: 'cp-1',
      graphId: 'g1',
      graphHash: graphContentHash(graph),
      schemaVersion: JOURNAL_SCHEMA_VERSION,
      completedNodeIds: ['a'],
      timestamp: 1,
      sequence: 0,
    };
    expect(() => assertCheckpointMatchesGraph(cp, graph)).not.toThrow();
  });

  it('throws JournalGraphHashError on mismatch', () => {
    const graph = makeGraph('g1', [makeNode('a')]);
    const cp: JournalCheckpoint = {
      kind: 'checkpoint',
      checkpointId: 'cp-1',
      graphId: 'g1',
      graphHash: 'bogus-hash',
      schemaVersion: JOURNAL_SCHEMA_VERSION,
      completedNodeIds: ['a'],
      timestamp: 1,
      sequence: 0,
    };
    expect(() => assertCheckpointMatchesGraph(cp, graph)).toThrow(JournalGraphHashError);
  });
});
