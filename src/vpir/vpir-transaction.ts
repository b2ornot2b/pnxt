/**
 * VPIR Graph Transaction Manager — transactional semantics for graph modifications.
 *
 * Provides begin → patch → verify → commit/rollback semantics for VPIR
 * graph modifications. Snapshots the graph before modification, applies
 * the diff, verifies property preservation, and either commits or rolls
 * back based on verification results.
 *
 * Sprint 14 deliverable — Advisory Panel: Voevodsky, Kay, de Moura.
 */

import type {
  VPIRGraph,
  VPIRDiff,
} from '../types/vpir.js';
import type { GraphVerificationResult } from '../verification/z3-graph-verifier.js';
import { applyPatch, cloneGraph } from './vpir-patch.js';
import { invertDiff } from './vpir-diff.js';
import { validateGraph } from './vpir-validator.js';

// ── Types ─────────────────────────────────────────────────────────

/**
 * Transaction lifecycle status.
 */
export type TransactionStatus =
  | 'pending'       // Created, not yet executed
  | 'patched'       // Patch applied, not yet verified
  | 'verified'      // Verification passed
  | 'committed'     // Final state: changes accepted
  | 'rolled_back'   // Final state: changes reverted
  | 'failed';       // Final state: patch or verification failed

/**
 * A trace entry recording a transaction stage execution.
 */
export interface TransactionTrace {
  /** Which stage was executed. */
  stage: 'patch' | 'validate' | 'verify' | 'categorize' | 'commit' | 'rollback';
  /** Whether the stage succeeded. */
  status: 'success' | 'failure';
  /** Optional details about the stage result. */
  details?: string;
  /** Duration in milliseconds. */
  durationMs: number;
}

/**
 * A graph modification transaction.
 */
export interface GraphTransaction {
  /** Unique transaction identifier. */
  id: string;

  /** Snapshot of the graph before modification. */
  sourceGraph: VPIRGraph;

  /** The diff being applied. */
  diff: VPIRDiff;

  /** The graph after patch application (if patch succeeded). */
  patchedGraph?: VPIRGraph;

  /** Current transaction status. */
  status: TransactionStatus;

  /** Verification results (if verification ran). */
  verificationResult?: GraphVerificationResult;

  /** Inverse diff for rollback. */
  rollbackDiff: VPIRDiff;

  /** Execution trace for auditing. */
  trace: TransactionTrace[];
}

/**
 * Options for transaction execution.
 */
export interface TransactionOptions {
  /** Whether to run structural validation after patching. Default: true. */
  validate?: boolean;

  /** Custom verification function. If not provided, structural validation only. */
  verify?: (before: VPIRGraph, after: VPIRGraph) => Promise<GraphVerificationResult>;

  /** Whether to auto-rollback on verification failure. Default: true. */
  autoRollback?: boolean;
}

// ── Transaction Lifecycle ─────────────────────────────────────────

/**
 * Begin a new graph modification transaction.
 *
 * Snapshots the current graph state and prepares the inverse diff
 * for potential rollback. Does not apply any changes yet.
 */
export function beginTransaction(graph: VPIRGraph, diff: VPIRDiff): GraphTransaction {
  return {
    id: `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourceGraph: cloneGraph(graph),
    diff,
    status: 'pending',
    rollbackDiff: invertDiff(diff),
    trace: [],
  };
}

/**
 * Execute a transaction: patch → validate → verify → commit/rollback.
 *
 * The execution pipeline is:
 * 1. Apply the diff to produce a patched graph
 * 2. Validate structural integrity of the patched graph
 * 3. Run verification (if provided) to check property preservation
 * 4. Commit if all checks pass, rollback otherwise
 *
 * @returns The updated transaction with final status and trace
 */
export async function executeTransaction(
  txn: GraphTransaction,
  options: TransactionOptions = {},
): Promise<GraphTransaction> {
  const opts = {
    validate: options.validate ?? true,
    autoRollback: options.autoRollback ?? true,
    verify: options.verify,
  };

  // ── Stage 1: Patch ──
  const patchStart = performance.now();
  const patchResult = applyPatch(txn.sourceGraph, txn.diff);

  if (!patchResult.success) {
    txn.status = 'failed';
    txn.trace.push({
      stage: 'patch',
      status: 'failure',
      details: patchResult.conflicts.map((c) => c.reason).join('; '),
      durationMs: performance.now() - patchStart,
    });
    return txn;
  }

  txn.patchedGraph = patchResult.graph;
  txn.status = 'patched';
  txn.trace.push({
    stage: 'patch',
    status: 'success',
    details: `Applied ${txn.diff.operations.length} operations`,
    durationMs: performance.now() - patchStart,
  });

  // ── Stage 2: Validate ──
  if (opts.validate) {
    const validateStart = performance.now();
    const validation = validateGraph(txn.patchedGraph!);

    if (!validation.valid) {
      txn.trace.push({
        stage: 'validate',
        status: 'failure',
        details: validation.errors.map((e) => e.message).join('; '),
        durationMs: performance.now() - validateStart,
      });

      if (opts.autoRollback) {
        return rollbackTransaction(txn);
      }
      txn.status = 'failed';
      return txn;
    }

    txn.trace.push({
      stage: 'validate',
      status: 'success',
      details: `${validation.warnings.length} warnings`,
      durationMs: performance.now() - validateStart,
    });
  }

  // ── Stage 3: Verify ──
  if (opts.verify) {
    const verifyStart = performance.now();

    try {
      const verificationResult = await opts.verify(txn.sourceGraph, txn.patchedGraph!);
      txn.verificationResult = verificationResult;

      if (!verificationResult.verified) {
        txn.trace.push({
          stage: 'verify',
          status: 'failure',
          details: verificationResult.properties
            .filter((p) => p.status !== 'verified')
            .map((p) => `${p.name}: ${p.status}`)
            .join('; '),
          durationMs: performance.now() - verifyStart,
        });

        if (opts.autoRollback) {
          return rollbackTransaction(txn);
        }
        txn.status = 'failed';
        return txn;
      }

      txn.status = 'verified';
      txn.trace.push({
        stage: 'verify',
        status: 'success',
        details: `${verificationResult.properties.length} properties verified`,
        durationMs: performance.now() - verifyStart,
      });
    } catch (error) {
      txn.trace.push({
        stage: 'verify',
        status: 'failure',
        details: error instanceof Error ? error.message : String(error),
        durationMs: performance.now() - verifyStart,
      });

      if (opts.autoRollback) {
        return rollbackTransaction(txn);
      }
      txn.status = 'failed';
      return txn;
    }
  }

  // ── Stage 4: Commit ──
  return commitTransaction(txn);
}

/**
 * Commit a transaction, finalizing the graph modification.
 */
export function commitTransaction(txn: GraphTransaction): GraphTransaction {
  const commitStart = performance.now();

  if (!txn.patchedGraph) {
    txn.status = 'failed';
    txn.trace.push({
      stage: 'commit',
      status: 'failure',
      details: 'No patched graph available',
      durationMs: performance.now() - commitStart,
    });
    return txn;
  }

  txn.status = 'committed';
  txn.trace.push({
    stage: 'commit',
    status: 'success',
    durationMs: performance.now() - commitStart,
  });

  return txn;
}

/**
 * Rollback a transaction, restoring the original graph state.
 *
 * @returns The transaction with status 'rolled_back' and the
 *          sourceGraph restored as the canonical state.
 */
export function rollbackTransaction(txn: GraphTransaction): GraphTransaction {
  const rollbackStart = performance.now();

  txn.patchedGraph = undefined;
  txn.status = 'rolled_back';
  txn.trace.push({
    stage: 'rollback',
    status: 'success',
    details: 'Restored to source graph snapshot',
    durationMs: performance.now() - rollbackStart,
  });

  return txn;
}

/**
 * Get the current graph from a transaction (patched if committed, source otherwise).
 */
export function getTransactionGraph(txn: GraphTransaction): VPIRGraph {
  if (txn.status === 'committed' && txn.patchedGraph) {
    return txn.patchedGraph;
  }
  return txn.sourceGraph;
}
