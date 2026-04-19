/**
 * VPIR Journal types — public contract for crash-safe durable execution.
 *
 * The implementation lives in `src/vpir/vpir-journal.ts`. Types are
 * extracted here so `VPIRExecutionOptions` can reference the journal
 * without creating a cycle between `src/types/` and `src/vpir/`.
 *
 * Sprint 16 — Phase 8, M5 (Crash-Safe Execution).
 */

import type { SecurityLabel } from './ifc.js';

/**
 * Current journal schema version. Bump when JournalEntry or
 * JournalCheckpoint shape changes in a way that invalidates old entries.
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
 * A checkpoint bundling the graph content hash and the set of completed
 * node IDs so that resume can validate structural integrity before replay.
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

export type JournalRecord = JournalEntry | JournalCheckpoint;

/**
 * Reconstructed state produced by `replay()` — consumed by `executeGraph`
 * via its `resumeFrom` option.
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
  append(entry: Omit<JournalEntry, 'kind' | 'schemaVersion' | 'sequence'>): Promise<void>;
  recordCheckpoint(
    cp: Omit<JournalCheckpoint, 'kind' | 'schemaVersion' | 'sequence'>,
  ): Promise<void>;
  replay(checkpointId: string): Promise<ExecutionState>;
  latestCheckpoint(graphId: string): Promise<JournalCheckpoint | null>;
}
