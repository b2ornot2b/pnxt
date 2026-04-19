/**
 * VPIR Journal — crash-safe durable execution state for the VPIR interpreter.
 *
 * The journal records one JournalEntry per completed node and emits a
 * JournalCheckpoint after each successful assertion node. Replay reconstructs
 * the interpreter's `nodeOutputs` map from persisted entries without
 * re-executing settled nodes, preserving IFC labels exactly as recorded.
 *
 * Sprint 16 — Phase 8, M5 (Crash-Safe Execution).
 * See docs/decisions/ADR-001-durable-vpir-execution.md.
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

import type { SecurityLabel } from '../types/ifc.js';
import type { VPIRGraph, VPIRNode } from '../types/vpir.js';
import { JournalGraphHashError, JournalSchemaVersionError } from '../errors/vpir-errors.js';

/**
 * Current journal schema version. Bump when `JournalEntry` or
 * `JournalCheckpoint` shape changes in a way that invalidates old entries.
 */
export const JOURNAL_SCHEMA_VERSION = 1 as const;

/**
 * One node-completion record. Emitted by `executeGraph()` after each
 * successful node. The `label` field carries the `SecurityLabel` exactly as
 * it was seen during the original execution — replay uses this stored label
 * to call `checkIFCFlow`, not a re-derived one.
 */
export interface JournalEntry {
  kind: 'entry';
  graphId: string;
  nodeId: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  label: SecurityLabel;
  schemaVersion: number;
  timestamp: number;
  sequence: number;
}

/**
 * A checkpoint written after a successful assertion node. Bundles the
 * graph content hash and the set of completed node IDs so that
 * `resumeFromCheckpoint` can validate structural integrity before replay.
 */
export interface JournalCheckpoint {
  kind: 'checkpoint';
  checkpointId: string;
  graphId: string;
  graphHash: string;
  schemaVersion: number;
  completedNodeIds: string[];
  timestamp: number;
  sequence: number;
}

/** Either an entry or a checkpoint. The JSON file is a map of these. */
export type JournalRecord = JournalEntry | JournalCheckpoint;

/**
 * Reconstructed state produced by `replay()` — consumed by `executeGraph` via
 * its `resumeFrom` option.
 */
export interface ExecutionState {
  nodeOutputs: Map<string, Map<string, unknown>>;
  completedNodes: Set<string>;
  checkpointId: string;
}

/**
 * Persistence contract for the journal. A future Restate/Temporal adapter
 * can implement this without modifying `executeGraph()`.
 */
export interface VPIRJournal {
  /** Append a single node-completion record. */
  append(entry: Omit<JournalEntry, 'kind' | 'schemaVersion' | 'sequence'>): Promise<void>;

  /** Record a checkpoint after a successful assertion. */
  recordCheckpoint(
    cp: Omit<JournalCheckpoint, 'kind' | 'schemaVersion' | 'sequence'>,
  ): Promise<void>;

  /** Replay up to (and including) the named checkpoint. */
  replay(checkpointId: string): Promise<ExecutionState>;

  /** The most recent checkpoint for the given graph, or null if none exists. */
  latestCheckpoint(graphId: string): Promise<JournalCheckpoint | null>;
}

/**
 * Canonicalised SHA-256 hash of a VPIR graph's structure.
 *
 * The canonical form sorts nodes by id and edges lexicographically so that
 * two graphs with the same structure but different iteration order produce
 * the same hash. Node value fields (outputs[i].value) are included because
 * concrete observation outputs are structurally significant.
 */
export function graphContentHash(graph: VPIRGraph): string {
  const nodeIds = [...graph.nodes.keys()].sort();
  const canonicalNodes = nodeIds.map((id) => {
    const node = graph.nodes.get(id)!;
    return {
      id: node.id,
      type: node.type,
      operation: node.operation,
      inputs: [...node.inputs]
        .map((ref) => ({ nodeId: ref.nodeId, port: ref.port, dataType: ref.dataType }))
        .sort((a, b) => {
          const ak = `${a.nodeId}:${a.port}`;
          const bk = `${b.nodeId}:${b.port}`;
          return ak < bk ? -1 : ak > bk ? 1 : 0;
        }),
      outputs: [...node.outputs]
        .map((o) => ({ port: o.port, dataType: o.dataType, value: o.value }))
        .sort((a, b) => (a.port < b.port ? -1 : a.port > b.port ? 1 : 0)),
      verifiable: node.verifiable,
      label: {
        owner: node.label.owner,
        trustLevel: node.label.trustLevel,
        classification: node.label.classification,
      },
    };
  });

  const payload = {
    id: graph.id,
    name: graph.name,
    roots: [...graph.roots].sort(),
    terminals: [...graph.terminals].sort(),
    nodes: canonicalNodes,
  };

  const hash = createHash('sha256');
  hash.update(JSON.stringify(payload));
  return hash.digest('hex');
}

/**
 * Narrow a node to its assertion subtype for checkpoint emission logic.
 */
export function isAssertionNode(node: VPIRNode): boolean {
  return node.type === 'assertion';
}

// ── Internal storage helpers ─────────────────────────────────────────────

function entryKey(entry: JournalEntry): string {
  return `journal:${entry.graphId}:entry:${String(entry.sequence).padStart(10, '0')}`;
}

function checkpointKey(cp: JournalCheckpoint): string {
  return `journal:${cp.graphId}:checkpoint:${cp.checkpointId}`;
}

function deserializeRecord(raw: unknown): JournalRecord {
  // Maps<string, unknown> are serialized as objects; entries carry them as-is.
  return raw as JournalRecord;
}

// ── In-memory implementation (for tests and the interpreter in unit tests) ─

/**
 * In-memory journal — no persistence. Useful for unit tests and for the
 * interpreter's own test suite; behaviour is identical to `FileBackedJournal`
 * except that crashes lose the log.
 */
export class InMemoryJournal implements VPIRJournal {
  private records = new Map<string, JournalRecord>();
  private nextSequence = 0;

  async append(
    partial: Omit<JournalEntry, 'kind' | 'schemaVersion' | 'sequence'>,
  ): Promise<void> {
    const entry: JournalEntry = {
      ...partial,
      kind: 'entry',
      schemaVersion: JOURNAL_SCHEMA_VERSION,
      sequence: this.nextSequence++,
    };
    this.records.set(entryKey(entry), entry);
  }

  async recordCheckpoint(
    partial: Omit<JournalCheckpoint, 'kind' | 'schemaVersion' | 'sequence'>,
  ): Promise<void> {
    const cp: JournalCheckpoint = {
      ...partial,
      kind: 'checkpoint',
      schemaVersion: JOURNAL_SCHEMA_VERSION,
      sequence: this.nextSequence++,
    };
    this.records.set(checkpointKey(cp), cp);
  }

  async replay(checkpointId: string): Promise<ExecutionState> {
    return replayFromRecords([...this.records.values()], checkpointId);
  }

  async latestCheckpoint(graphId: string): Promise<JournalCheckpoint | null> {
    return latestCheckpointFromRecords([...this.records.values()], graphId);
  }

  /** Test-only inspection hook. */
  snapshot(): JournalRecord[] {
    return [...this.records.values()];
  }
}

// ── File-backed implementation ───────────────────────────────────────────

/**
 * File-backed journal using the same read-modify-write JSON pattern as
 * `FileStorageBackend`. Accepted known limitation (see ADR-001 §Consequences):
 * each append reads and rewrites the whole file. Acceptable at weather-benchmark
 * scale (~5 nodes). A follow-on sprint should replace with newline-delimited
 * JSON append-only writes.
 *
 * Not safe for concurrent access across processes — mirrors the constraint
 * documented on `FileStorageBackend`.
 */
export class FileBackedJournal implements VPIRJournal {
  private nextSequence: number | null = null;

  constructor(private readonly filePath: string) {}

  async append(
    partial: Omit<JournalEntry, 'kind' | 'schemaVersion' | 'sequence'>,
  ): Promise<void> {
    const records = await this.load();
    const seq = await this.consumeSequence(records);
    const entry: JournalEntry = {
      ...partial,
      kind: 'entry',
      schemaVersion: JOURNAL_SCHEMA_VERSION,
      sequence: seq,
    };
    records.set(entryKey(entry), entry);
    await this.save(records);
  }

  async recordCheckpoint(
    partial: Omit<JournalCheckpoint, 'kind' | 'schemaVersion' | 'sequence'>,
  ): Promise<void> {
    const records = await this.load();
    const seq = await this.consumeSequence(records);
    const cp: JournalCheckpoint = {
      ...partial,
      kind: 'checkpoint',
      schemaVersion: JOURNAL_SCHEMA_VERSION,
      sequence: seq,
    };
    records.set(checkpointKey(cp), cp);
    await this.save(records);
  }

  async replay(checkpointId: string): Promise<ExecutionState> {
    const records = await this.load();
    return replayFromRecords([...records.values()], checkpointId);
  }

  async latestCheckpoint(graphId: string): Promise<JournalCheckpoint | null> {
    const records = await this.load();
    return latestCheckpointFromRecords([...records.values()], graphId);
  }

  private async load(): Promise<Map<string, JournalRecord>> {
    try {
      const data = await readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data) as Record<string, JournalRecord>;
      const map = new Map<string, JournalRecord>();
      for (const [k, v] of Object.entries(parsed)) {
        map.set(k, deserializeRecord(v));
      }
      return map;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return new Map();
      }
      throw err;
    }
  }

  private async save(records: Map<string, JournalRecord>): Promise<void> {
    const obj = Object.fromEntries(records);
    await writeFile(this.filePath, JSON.stringify(obj, null, 2), 'utf-8');
  }

  private async consumeSequence(records: Map<string, JournalRecord>): Promise<number> {
    if (this.nextSequence === null) {
      let max = -1;
      for (const rec of records.values()) {
        if (rec.sequence > max) max = rec.sequence;
      }
      this.nextSequence = max + 1;
    }
    const seq = this.nextSequence;
    this.nextSequence += 1;
    return seq;
  }
}

// ── Replay core ──────────────────────────────────────────────────────────

function latestCheckpointFromRecords(
  records: JournalRecord[],
  graphId: string,
): JournalCheckpoint | null {
  let latest: JournalCheckpoint | null = null;
  for (const rec of records) {
    if (rec.kind !== 'checkpoint') continue;
    if (rec.graphId !== graphId) continue;
    if (latest === null || rec.sequence > latest.sequence) {
      latest = rec;
    }
  }
  return latest;
}

function replayFromRecords(
  records: JournalRecord[],
  checkpointId: string,
): ExecutionState {
  const checkpoint = records.find(
    (r): r is JournalCheckpoint => r.kind === 'checkpoint' && r.checkpointId === checkpointId,
  );
  if (!checkpoint) {
    throw new Error(`Checkpoint not found: ${checkpointId}`);
  }

  if (checkpoint.schemaVersion !== JOURNAL_SCHEMA_VERSION) {
    throw new JournalSchemaVersionError(
      `Checkpoint ${checkpointId} schemaVersion=${checkpoint.schemaVersion} does not match current ${JOURNAL_SCHEMA_VERSION}`,
    );
  }

  const completedNodes = new Set<string>(checkpoint.completedNodeIds);
  const nodeOutputs = new Map<string, Map<string, unknown>>();

  // Collect every entry for the same graph up to the checkpoint's sequence,
  // in sequence order, and replay into nodeOutputs.
  const entries = records
    .filter(
      (r): r is JournalEntry =>
        r.kind === 'entry' &&
        r.graphId === checkpoint.graphId &&
        r.sequence <= checkpoint.sequence,
    )
    .sort((a, b) => a.sequence - b.sequence);

  for (const entry of entries) {
    if (entry.schemaVersion !== JOURNAL_SCHEMA_VERSION) {
      throw new JournalSchemaVersionError(
        `Entry for node ${entry.nodeId} schemaVersion=${entry.schemaVersion} does not match current ${JOURNAL_SCHEMA_VERSION}`,
      );
    }
    if (!completedNodes.has(entry.nodeId)) {
      // Entry is before the checkpoint but not in its completed set. This can
      // happen if execution failed between entry write and checkpoint write.
      // Skip it — the interpreter will re-execute that node on resume.
      continue;
    }
    const portMap = new Map<string, unknown>(Object.entries(entry.outputs));
    nodeOutputs.set(entry.nodeId, portMap);
  }

  return { nodeOutputs, completedNodes, checkpointId };
}

/**
 * Validate that a checkpoint's graphHash matches the current graph.
 * Throws `JournalGraphHashError` on mismatch.
 */
export function assertCheckpointMatchesGraph(
  checkpoint: JournalCheckpoint,
  graph: VPIRGraph,
): void {
  const currentHash = graphContentHash(graph);
  if (checkpoint.graphHash !== currentHash) {
    throw new JournalGraphHashError(
      `Graph hash mismatch: checkpoint ${checkpoint.checkpointId} was written for hash ${checkpoint.graphHash}, current graph hashes to ${currentHash}`,
    );
  }
}
