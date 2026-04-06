/**
 * VPIR Patch Engine — apply diffs to VPIR graphs with conflict detection.
 *
 * Provides atomic patch application (all-or-nothing), dry-run conflict
 * detection, and structural validation of the patched result. The patch
 * engine is the write-side counterpart to the diff engine's read-side.
 *
 * Sprint 14 deliverable — Advisory Panel: Voevodsky, Kay, de Moura.
 */

import type {
  VPIRGraph,
  VPIRNode,
  VPIRRef,
  VPIROutput,
  VPIRDiff,
  DiffOperation,
  PatchConflict,
  PatchResult,
  VPIRValidationResult,
} from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import type { Evidence } from '../types/vpir.js';
import { validateGraph } from './vpir-validator.js';

// ── Node Deserialization ──────────────────────────────────────────

/** Reconstruct a VPIRNode from its serialized plain-object form. */
function deserializeNode(data: Record<string, unknown>): VPIRNode {
  const labelData = data.label as Record<string, unknown>;
  const label: SecurityLabel = {
    owner: labelData.owner as string,
    trustLevel: labelData.trustLevel as 0 | 1 | 2 | 3 | 4,
    classification: labelData.classification as SecurityLabel['classification'],
    createdAt: (labelData.createdAt as string) ?? new Date().toISOString(),
  };

  const inputs: VPIRRef[] = ((data.inputs as unknown[]) ?? []).map((i: unknown) => {
    const ref = i as Record<string, string>;
    return { nodeId: ref.nodeId, port: ref.port, dataType: ref.dataType };
  });

  const outputs: VPIROutput[] = ((data.outputs as unknown[]) ?? []).map((o: unknown) => {
    const out = o as Record<string, unknown>;
    const result: VPIROutput = { port: out.port as string, dataType: out.dataType as string };
    if (out.value !== undefined) result.value = out.value;
    return result;
  });

  const evidence: Evidence[] = ((data.evidence as unknown[]) ?? []).map((e: unknown) => {
    const ev = e as Record<string, unknown>;
    const result: Evidence = {
      type: ev.type as Evidence['type'],
      source: ev.source as string,
      confidence: ev.confidence as number,
    };
    if (ev.description) result.description = ev.description as string;
    return result;
  });

  const node: VPIRNode = {
    id: data.id as string,
    type: data.type as VPIRNode['type'],
    operation: data.operation as string,
    inputs,
    outputs,
    evidence,
    label,
    verifiable: (data.verifiable as boolean) ?? true,
    createdAt: new Date().toISOString(),
  };

  if (data.agentId) node.agentId = data.agentId as string;

  return node;
}

// ── Deep Clone ────────────────────────────────────────────────────

/** Deep clone a VPIR graph (to avoid mutating the original). */
function cloneGraph(graph: VPIRGraph): VPIRGraph {
  const nodes = new Map<string, VPIRNode>();
  for (const [id, node] of graph.nodes) {
    nodes.set(id, {
      ...node,
      inputs: node.inputs.map((i) => ({ ...i })),
      outputs: node.outputs.map((o) => ({ ...o })),
      evidence: node.evidence.map((e) => ({ ...e })),
      label: { ...node.label },
    });
  }

  return {
    id: graph.id,
    name: graph.name,
    nodes,
    roots: [...graph.roots],
    terminals: [...graph.terminals],
    createdAt: graph.createdAt,
  };
}

// ── Conflict Detection ────────────────────────────────────────────

/**
 * Detect conflicts that would prevent a diff from being applied.
 */
function detectConflict(
  graph: VPIRGraph,
  op: DiffOperation,
): PatchConflict | null {
  switch (op.type) {
    case 'add_node': {
      const nodeId = op.path.replace('nodes/', '');
      if (graph.nodes.has(nodeId)) {
        return { operation: op, reason: `Node "${nodeId}" already exists` };
      }
      return null;
    }

    case 'remove_node': {
      const nodeId = op.path.replace('nodes/', '');
      if (!graph.nodes.has(nodeId)) {
        return { operation: op, reason: `Node "${nodeId}" not found` };
      }
      return null;
    }

    case 'modify_node': {
      const nodeId = op.path.replace('nodes/', '');
      if (!graph.nodes.has(nodeId)) {
        return { operation: op, reason: `Node "${nodeId}" not found for modification` };
      }
      return null;
    }

    case 'add_edge': {
      const edgeInfo = op.after as Record<string, string>;
      if (!graph.nodes.has(edgeInfo.sourceId)) {
        return { operation: op, reason: `Edge source node "${edgeInfo.sourceId}" not found` };
      }
      if (!graph.nodes.has(edgeInfo.targetId)) {
        return { operation: op, reason: `Edge target node "${edgeInfo.targetId}" not found` };
      }
      // Check if edge already exists
      const target = graph.nodes.get(edgeInfo.targetId)!;
      const exists = target.inputs.some(
        (i) => i.nodeId === edgeInfo.sourceId && i.port === edgeInfo.port,
      );
      if (exists) {
        return { operation: op, reason: `Edge already exists from "${edgeInfo.sourceId}:${edgeInfo.port}" to "${edgeInfo.targetId}"` };
      }
      return null;
    }

    case 'remove_edge': {
      const edgeInfo = op.before as Record<string, string>;
      if (!graph.nodes.has(edgeInfo.targetId)) {
        return { operation: op, reason: `Edge target node "${edgeInfo.targetId}" not found` };
      }
      const target = graph.nodes.get(edgeInfo.targetId)!;
      const exists = target.inputs.some(
        (i) => i.nodeId === edgeInfo.sourceId && i.port === edgeInfo.port,
      );
      if (!exists) {
        return { operation: op, reason: `Edge not found from "${edgeInfo.sourceId}:${edgeInfo.port}" to "${edgeInfo.targetId}"` };
      }
      return null;
    }

    case 'reroute_edge': {
      const beforeInfo = op.before as Record<string, string>;
      const afterInfo = op.after as Record<string, string>;
      if (!graph.nodes.has(beforeInfo.targetId)) {
        return { operation: op, reason: `Reroute source target node "${beforeInfo.targetId}" not found` };
      }
      if (!graph.nodes.has(afterInfo.targetId)) {
        return { operation: op, reason: `Reroute destination target node "${afterInfo.targetId}" not found` };
      }
      return null;
    }

    case 'modify_metadata':
      return null; // Metadata modifications always succeed
  }
}

// ── Patch Application ─────────────────────────────────────────────

/** Apply a single operation to a mutable graph. */
function applyOperation(graph: VPIRGraph, op: DiffOperation): void {
  switch (op.type) {
    case 'add_node': {
      const nodeData = op.after as Record<string, unknown>;
      const node = deserializeNode(nodeData);
      graph.nodes.set(node.id, node);
      break;
    }

    case 'remove_node': {
      const nodeId = op.path.replace('nodes/', '');
      graph.nodes.delete(nodeId);
      // Remove any edges referencing this node
      for (const node of graph.nodes.values()) {
        node.inputs = node.inputs.filter((i) => i.nodeId !== nodeId);
      }
      break;
    }

    case 'modify_node': {
      const nodeData = op.after as Record<string, unknown>;
      const node = deserializeNode(nodeData);
      graph.nodes.set(node.id, node);
      break;
    }

    case 'add_edge': {
      const edgeInfo = op.after as Record<string, string>;
      const target = graph.nodes.get(edgeInfo.targetId);
      if (target) {
        target.inputs.push({
          nodeId: edgeInfo.sourceId,
          port: edgeInfo.port,
          dataType: edgeInfo.dataType,
        });
      }
      break;
    }

    case 'remove_edge': {
      const edgeInfo = op.before as Record<string, string>;
      const target = graph.nodes.get(edgeInfo.targetId);
      if (target) {
        target.inputs = target.inputs.filter(
          (i) => !(i.nodeId === edgeInfo.sourceId && i.port === edgeInfo.port),
        );
      }
      break;
    }

    case 'reroute_edge': {
      const beforeInfo = op.before as Record<string, string>;
      const afterInfo = op.after as Record<string, string>;
      // Remove old edge
      const oldTarget = graph.nodes.get(beforeInfo.targetId);
      if (oldTarget) {
        oldTarget.inputs = oldTarget.inputs.filter(
          (i) => !(i.nodeId === beforeInfo.sourceId && i.port === beforeInfo.port),
        );
      }
      // Add new edge
      const newTarget = graph.nodes.get(afterInfo.targetId);
      if (newTarget) {
        newTarget.inputs.push({
          nodeId: afterInfo.sourceId,
          port: afterInfo.port,
          dataType: afterInfo.dataType,
        });
      }
      break;
    }

    case 'modify_metadata': {
      if (op.path === 'metadata/name') {
        graph.name = op.after as string;
      }
      break;
    }
  }
}

/** Recompute roots and terminals after patching. */
function recomputeRootsAndTerminals(graph: VPIRGraph): void {
  const roots: string[] = [];
  const consumedPorts = new Set<string>();

  for (const node of graph.nodes.values()) {
    if (node.inputs.length === 0) {
      roots.push(node.id);
    }
    for (const ref of node.inputs) {
      consumedPorts.add(`${ref.nodeId}:${ref.port}`);
    }
  }

  const terminals: string[] = [];
  for (const node of graph.nodes.values()) {
    const hasConsumedOutput = node.outputs.some(
      (o) => consumedPorts.has(`${node.id}:${o.port}`),
    );
    if (!hasConsumedOutput) {
      terminals.push(node.id);
    }
  }

  graph.roots = roots;
  graph.terminals = terminals;
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Apply a diff to a VPIR graph atomically (all-or-nothing).
 *
 * If any operation would cause a conflict, the entire patch is rejected
 * and the original graph is returned unchanged.
 */
export function applyPatch(graph: VPIRGraph, diff: VPIRDiff): PatchResult {
  // First, check for conflicts
  const conflicts = dryRunPatch(graph, diff);
  if (conflicts.length > 0) {
    return { success: false, conflicts };
  }

  // Clone the graph and apply all operations
  const patched = cloneGraph(graph);

  for (const op of diff.operations) {
    applyOperation(patched, op);
  }

  // Recompute roots and terminals
  recomputeRootsAndTerminals(patched);

  // Update graph ID to target
  patched.id = diff.targetGraphId;

  return { success: true, graph: patched, conflicts: [] };
}

/**
 * Detect conflicts without modifying the graph.
 *
 * Simulates the patch operation sequence and reports all conflicts
 * that would prevent successful application.
 */
export function dryRunPatch(graph: VPIRGraph, diff: VPIRDiff): PatchConflict[] {
  const conflicts: PatchConflict[] = [];

  // Simulate on a clone to catch cascading conflicts
  const simulated = cloneGraph(graph);

  for (const op of diff.operations) {
    const conflict = detectConflict(simulated, op);
    if (conflict) {
      conflicts.push(conflict);
    } else {
      // Apply to simulation to detect cascading effects
      applyOperation(simulated, op);
    }
  }

  return conflicts;
}

/**
 * Validate the structural integrity of a patched graph.
 */
export function validatePatchedGraph(result: PatchResult): VPIRValidationResult {
  if (!result.success || !result.graph) {
    return {
      valid: false,
      errors: [{ nodeId: '', code: 'PATCH_FAILED', message: 'Patch was not applied successfully' }],
      warnings: [],
    };
  }

  return validateGraph(result.graph);
}

// Re-exports for testing
export { cloneGraph, deserializeNode, recomputeRootsAndTerminals };
