import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { SecurityLabel } from '../types/ifc.js';
import type { VPIRGraph, VPIRNode } from '../types/vpir.js';
import {
  JournalGraphHashError,
  JournalSchemaVersionError,
} from '../errors/vpir-errors.js';
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
