/**
 * Mutable Self-Description — extend pnxt's self-describing pipeline
 * to support verified mutations via diff/patch.
 *
 * Builds on Sprint 9's `describePipelineAsVPIR()` to create a mutable
 * wrapper that supports proposing, verifying, and applying modifications
 * to the pipeline graph. This is the M4 foundation: the system can
 * modify its own pipeline structure through VPIR operations.
 *
 * Sprint 14 deliverable — Advisory Panel: Voevodsky, Kay, de Moura.
 */

import type {
  VPIRGraph,
  VPIRNode,
} from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import type { Category, CategoryValidationResult } from '../types/hott.js';
import { createLabel } from '../types/ifc.js';
import { describePipelineAsVPIR, categorizePipelineDescription } from './self-hosting-poc.js';
import { diffGraphs } from '../vpir/vpir-diff.js';
import { cloneGraph } from '../vpir/vpir-patch.js';
import {
  beginTransaction,
  executeTransaction,
} from '../vpir/vpir-transaction.js';
import type { GraphTransaction, TransactionOptions } from '../vpir/vpir-transaction.js';
import {
  verifyPropertyPreservation,
  toGraphVerificationResult,
} from '../verification/z3-diff-verifier.js';

// ── Types ─────────────────────────────────────────────────────────

/**
 * A modification to propose to the pipeline.
 */
export type PipelineModificationType =
  | 'add_stage'
  | 'remove_stage'
  | 'modify_stage'
  | 'reorder_stages'
  | 'add_branch';

/**
 * Specification for a pipeline modification.
 */
export interface PipelineModification {
  /** Type of modification. */
  type: PipelineModificationType;

  /** Human-readable description. */
  description: string;

  /** For add_stage: the new stage to insert. */
  newStage?: {
    id: string;
    type: VPIRNode['type'];
    operation: string;
    trustLevel: 0 | 1 | 2 | 3 | 4;
    classification: SecurityLabel['classification'];
    outputDataType: string;
  };

  /** For add_stage: insert after this stage ID. */
  afterStageId?: string;

  /** For remove_stage: the stage ID to remove. */
  removeStageId?: string;

  /** For modify_stage: the stage ID and new properties. */
  modifyStageId?: string;
  modifications?: Partial<{
    operation: string;
    trustLevel: 0 | 1 | 2 | 3 | 4;
    classification: SecurityLabel['classification'];
  }>;

  /** For reorder_stages: new ordering of stage IDs. */
  newOrder?: string[];
}

/**
 * A mutable pipeline description that wraps a VPIR graph.
 */
export interface MutablePipelineDescription {
  /** The current pipeline graph. */
  graph: VPIRGraph;

  /** History of applied transactions. */
  history: GraphTransaction[];

  /** Current version number. */
  version: number;

  /** HoTT categorization of the current graph. */
  categorization?: {
    category: Category;
    validation: CategoryValidationResult;
  };
}

// ── Mutable Pipeline Lifecycle ────────────────────────────────────

/**
 * Create a mutable pipeline description from the self-hosting PoC.
 */
export function createMutablePipelineDescription(): MutablePipelineDescription {
  const graph = describePipelineAsVPIR();
  const categorization = categorizePipelineDescription(graph);

  return {
    graph,
    history: [],
    version: 1,
    categorization,
  };
}

/**
 * Build a modified graph from a pipeline modification spec.
 */
function buildModifiedGraph(
  currentGraph: VPIRGraph,
  modification: PipelineModification,
): VPIRGraph {
  const modified = cloneGraph(currentGraph);
  const now = new Date().toISOString();

  switch (modification.type) {
    case 'add_stage': {
      if (!modification.newStage) {
        throw new Error('add_stage requires newStage specification');
      }
      const stage = modification.newStage;
      const label = createLabel('pnxt-pipeline', stage.trustLevel, stage.classification);

      // Find the insertion point
      const afterNode = modification.afterStageId
        ? modified.nodes.get(modification.afterStageId)
        : undefined;

      // Build the new node
      const inputs = afterNode
        ? [{ nodeId: afterNode.id, port: 'output', dataType: afterNode.outputs[0]?.dataType ?? 'object' }]
        : [];

      const newNode: VPIRNode = {
        id: stage.id,
        type: stage.type,
        operation: stage.operation,
        inputs,
        outputs: [{ port: 'output', dataType: stage.outputDataType }],
        evidence: [{
          type: 'rule',
          source: 'pnxt-mutation',
          confidence: 1.0,
          description: modification.description,
        }],
        label,
        verifiable: true,
        createdAt: now,
      };

      modified.nodes.set(stage.id, newNode);

      // Reroute downstream nodes: anything that consumed afterStageId now consumes the new stage
      if (afterNode) {
        for (const node of modified.nodes.values()) {
          if (node.id === stage.id) continue;
          for (let i = 0; i < node.inputs.length; i++) {
            if (node.inputs[i].nodeId === afterNode.id) {
              node.inputs[i] = {
                nodeId: stage.id,
                port: 'output',
                dataType: stage.outputDataType,
              };
            }
          }
        }
      }
      break;
    }

    case 'remove_stage': {
      if (!modification.removeStageId) {
        throw new Error('remove_stage requires removeStageId');
      }
      const stageId = modification.removeStageId;
      const removedNode = modified.nodes.get(stageId);
      if (!removedNode) {
        throw new Error(`Stage "${stageId}" not found`);
      }

      // Reroute: connect the removed node's input to its consumers
      const upstreamRef = removedNode.inputs[0]; // First input (or none)

      for (const node of modified.nodes.values()) {
        for (let i = 0; i < node.inputs.length; i++) {
          if (node.inputs[i].nodeId === stageId) {
            if (upstreamRef) {
              node.inputs[i] = { ...upstreamRef };
            } else {
              // No upstream — this consumer becomes a root
              node.inputs.splice(i, 1);
              i--;
            }
          }
        }
      }

      modified.nodes.delete(stageId);
      break;
    }

    case 'modify_stage': {
      if (!modification.modifyStageId || !modification.modifications) {
        throw new Error('modify_stage requires modifyStageId and modifications');
      }
      const node = modified.nodes.get(modification.modifyStageId);
      if (!node) {
        throw new Error(`Stage "${modification.modifyStageId}" not found`);
      }

      if (modification.modifications.operation) {
        node.operation = modification.modifications.operation;
      }
      if (modification.modifications.trustLevel !== undefined) {
        node.label = createLabel(
          node.label.owner,
          modification.modifications.trustLevel,
          modification.modifications.classification ?? node.label.classification,
        );
      }
      break;
    }

    case 'add_branch': {
      if (!modification.newStage || !modification.afterStageId) {
        throw new Error('add_branch requires newStage and afterStageId');
      }
      const stage = modification.newStage;
      const branchFrom = modified.nodes.get(modification.afterStageId);
      if (!branchFrom) {
        throw new Error(`Branch source "${modification.afterStageId}" not found`);
      }

      const label = createLabel('pnxt-pipeline', stage.trustLevel, stage.classification);
      const newNode: VPIRNode = {
        id: stage.id,
        type: stage.type,
        operation: stage.operation,
        inputs: [{ nodeId: branchFrom.id, port: 'output', dataType: branchFrom.outputs[0]?.dataType ?? 'object' }],
        outputs: [{ port: 'output', dataType: stage.outputDataType }],
        evidence: [{
          type: 'rule',
          source: 'pnxt-mutation',
          confidence: 1.0,
          description: modification.description,
        }],
        label,
        verifiable: true,
        createdAt: now,
      };

      modified.nodes.set(stage.id, newNode);
      break;
    }

    default:
      throw new Error(`Unsupported modification type: ${modification.type}`);
  }

  // Recompute roots and terminals
  const roots: string[] = [];
  const consumedPorts = new Set<string>();
  for (const node of modified.nodes.values()) {
    if (node.inputs.length === 0) roots.push(node.id);
    for (const ref of node.inputs) {
      consumedPorts.add(`${ref.nodeId}:${ref.port}`);
    }
  }
  const terminals: string[] = [];
  for (const node of modified.nodes.values()) {
    if (!node.outputs.some((o) => consumedPorts.has(`${node.id}:${o.port}`))) {
      terminals.push(node.id);
    }
  }

  modified.roots = roots;
  modified.terminals = terminals;
  modified.id = `${currentGraph.id}-v${Date.now()}`;

  return modified;
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Propose a pipeline modification and create a transaction.
 *
 * Builds the modified graph, computes the diff, and prepares a
 * transaction that can be executed with verification.
 */
export function proposePipelineModification(
  desc: MutablePipelineDescription,
  modification: PipelineModification,
): GraphTransaction {
  const modifiedGraph = buildModifiedGraph(desc.graph, modification);
  const diff = diffGraphs(desc.graph, modifiedGraph);
  return beginTransaction(desc.graph, diff);
}

/**
 * Execute and apply a pipeline modification transaction.
 *
 * Runs the transaction (patch → validate → verify → commit/rollback)
 * and, if committed, updates the mutable description.
 *
 * @returns The updated description (or unchanged if rolled back)
 */
export async function applyPipelineModification(
  desc: MutablePipelineDescription,
  txn: GraphTransaction,
  options?: TransactionOptions,
): Promise<MutablePipelineDescription> {
  const txnOptions: TransactionOptions = {
    validate: true,
    autoRollback: true,
    ...options,
    verify: options?.verify ?? (async (before, after) => {
      const diff = diffGraphs(before, after);
      const preservation = await verifyPropertyPreservation(before, after, diff);
      return toGraphVerificationResult(preservation);
    }),
  };

  const result = await executeTransaction(txn, txnOptions);

  if (result.status === 'committed' && result.patchedGraph) {
    const categorization = categorizePipelineDescription(result.patchedGraph);
    return {
      graph: result.patchedGraph,
      history: [...desc.history, result],
      version: desc.version + 1,
      categorization,
    };
  }

  // Transaction failed or was rolled back
  return {
    ...desc,
    history: [...desc.history, result],
  };
}

/**
 * Get the modification history for a mutable pipeline.
 */
export function getPipelineHistory(desc: MutablePipelineDescription): {
  version: number;
  totalTransactions: number;
  committedCount: number;
  rolledBackCount: number;
  failedCount: number;
} {
  const committed = desc.history.filter((t) => t.status === 'committed').length;
  const rolledBack = desc.history.filter((t) => t.status === 'rolled_back').length;
  const failed = desc.history.filter((t) => t.status === 'failed').length;

  return {
    version: desc.version,
    totalTransactions: desc.history.length,
    committedCount: committed,
    rolledBackCount: rolledBack,
    failedCount: failed,
  };
}
