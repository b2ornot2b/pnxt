/**
 * VPIR Diff Engine — structured comparison of VPIR graphs.
 *
 * Compares two VPIR graphs and produces a serializable diff describing
 * the minimal set of operations to transform the source graph into the
 * target graph. Supports diff inversion (for rollback) and composition
 * (for sequential modifications).
 *
 * Sprint 14 deliverable — Advisory Panel: Voevodsky, Kay, de Moura.
 */

import type {
  VPIRGraph,
  VPIRNode,
  VPIRDiff,
  DiffOperation,
  DiffOperationType,
} from '../types/vpir.js';

// ── Edge Key Helpers ──────────────────────────────────────────────

/** Canonical edge key: "sourceId:port→targetId" */
function edgeKey(sourceId: string, port: string, targetId: string): string {
  return `${sourceId}:${port}→${targetId}`;
}

/** Parse an edge key back to its components. */
function parseEdgeKey(key: string): { sourceId: string; port: string; targetId: string } | null {
  const arrowIdx = key.indexOf('→');
  if (arrowIdx === -1) return null;
  const left = key.substring(0, arrowIdx);
  const targetId = key.substring(arrowIdx + '→'.length);
  const colonIdx = left.indexOf(':');
  if (colonIdx === -1) return null;
  return {
    sourceId: left.substring(0, colonIdx),
    port: left.substring(colonIdx + 1),
    targetId,
  };
}

// ── Node Serialization ────────────────────────────────────────────

/** Serialize a VPIRNode to a plain object for comparison. */
function serializeNode(node: VPIRNode): Record<string, unknown> {
  return {
    id: node.id,
    type: node.type,
    operation: node.operation,
    inputs: node.inputs.map((i) => ({ nodeId: i.nodeId, port: i.port, dataType: i.dataType })),
    outputs: node.outputs.map((o) => {
      const out: Record<string, unknown> = { port: o.port, dataType: o.dataType };
      if (o.value !== undefined) out.value = o.value;
      return out;
    }),
    evidence: node.evidence.map((e) => {
      const ev: Record<string, unknown> = {
        type: e.type,
        source: e.source,
        confidence: e.confidence,
      };
      if (e.description) ev.description = e.description;
      return ev;
    }),
    label: {
      owner: node.label.owner,
      trustLevel: node.label.trustLevel,
      classification: node.label.classification,
    },
    verifiable: node.verifiable,
  };
}

/** Deep equality check for serialized values. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (Array.isArray(a) || Array.isArray(b)) return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj).sort();
  const bKeys = Object.keys(bObj).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, i) => key === bKeys[i] && deepEqual(aObj[key], bObj[key]));
}

// ── Edge Collection ───────────────────────────────────────────────

interface EdgeInfo {
  sourceId: string;
  port: string;
  dataType: string;
  targetId: string;
}

/** Collect all edges from a graph as a map of edge key → EdgeInfo. */
function collectEdges(graph: VPIRGraph): Map<string, EdgeInfo> {
  const edges = new Map<string, EdgeInfo>();
  for (const node of graph.nodes.values()) {
    for (const ref of node.inputs) {
      const key = edgeKey(ref.nodeId, ref.port, node.id);
      edges.set(key, {
        sourceId: ref.nodeId,
        port: ref.port,
        dataType: ref.dataType,
        targetId: node.id,
      });
    }
  }
  return edges;
}

// ── Diff Computation ──────────────────────────────────────────────

/**
 * Compute a structured diff between two VPIR graphs.
 *
 * The diff captures:
 * - Nodes added, removed, or modified
 * - Edges added, removed, or rerouted
 *
 * Operations are ordered: removals before additions, edges after nodes.
 */
export function diffGraphs(before: VPIRGraph, after: VPIRGraph): VPIRDiff {
  const operations: DiffOperation[] = [];

  // ── Node-level diff ──
  const beforeIds = new Set(before.nodes.keys());
  const afterIds = new Set(after.nodes.keys());

  // Removed nodes
  for (const id of beforeIds) {
    if (!afterIds.has(id)) {
      operations.push({
        type: 'remove_node',
        path: `nodes/${id}`,
        before: serializeNode(before.nodes.get(id)!),
      });
    }
  }

  // Added nodes
  for (const id of afterIds) {
    if (!beforeIds.has(id)) {
      operations.push({
        type: 'add_node',
        path: `nodes/${id}`,
        after: serializeNode(after.nodes.get(id)!),
      });
    }
  }

  // Modified nodes (present in both)
  for (const id of beforeIds) {
    if (!afterIds.has(id)) continue;
    const beforeNode = serializeNode(before.nodes.get(id)!);
    const afterNode = serializeNode(after.nodes.get(id)!);
    if (!deepEqual(beforeNode, afterNode)) {
      operations.push({
        type: 'modify_node',
        path: `nodes/${id}`,
        before: beforeNode,
        after: afterNode,
      });
    }
  }

  // ── Edge-level diff ──
  // Collect nodes that are added, removed, or modified — edge changes
  // involving these nodes are already captured by node-level operations.
  const modifiedNodeIds = new Set<string>();
  for (const op of operations) {
    const nodeId = op.path.replace('nodes/', '');
    modifiedNodeIds.add(nodeId);
  }

  const beforeEdges = collectEdges(before);
  const afterEdges = collectEdges(after);

  // Removed edges (skip if source or target is a modified/removed node)
  for (const [key, info] of beforeEdges) {
    if (modifiedNodeIds.has(info.sourceId) || modifiedNodeIds.has(info.targetId)) continue;
    if (!afterEdges.has(key)) {
      // Check if this is a reroute (same source:port, different target)
      const prefix = `${info.sourceId}:${info.port}→`;
      let isReroute = false;
      for (const [afterKey, afterInfo] of afterEdges) {
        if (afterKey.startsWith(prefix.slice(0, prefix.indexOf('→'))) &&
            afterInfo.sourceId === info.sourceId &&
            afterInfo.port === info.port &&
            afterInfo.targetId !== info.targetId &&
            !beforeEdges.has(afterKey)) {
          // This is a reroute: same source:port, different target
          operations.push({
            type: 'reroute_edge',
            path: `edges/${key}`,
            before: { ...info },
            after: { ...afterInfo },
          });
          afterEdges.delete(afterKey); // Mark as consumed
          isReroute = true;
          break;
        }
      }
      if (!isReroute) {
        operations.push({
          type: 'remove_edge',
          path: `edges/${key}`,
          before: { ...info },
        });
      }
    }
  }

  // Added edges (not already consumed by reroutes, skip if covered by node ops)
  for (const [key, info] of afterEdges) {
    if (modifiedNodeIds.has(info.sourceId) || modifiedNodeIds.has(info.targetId)) continue;
    if (!beforeEdges.has(key)) {
      operations.push({
        type: 'add_edge',
        path: `edges/${key}`,
        after: { ...info },
      });
    }
  }

  // ── Metadata diff ──
  if (before.name !== after.name) {
    operations.push({
      type: 'modify_metadata',
      path: 'metadata/name',
      before: before.name,
      after: after.name,
    });
  }

  return {
    id: `diff-${Date.now()}`,
    sourceGraphId: before.id,
    targetGraphId: after.id,
    operations,
    metadata: {
      createdAt: new Date().toISOString(),
    },
  };
}

// ── Diff Inversion ────────────────────────────────────────────────

/**
 * Generate the inverse of a diff (for rollback).
 *
 * Applying `invertDiff(d)` to the target graph should produce
 * the source graph.
 */
export function invertDiff(diff: VPIRDiff): VPIRDiff {
  const invertedOps: DiffOperation[] = diff.operations.map((op) => {
    switch (op.type) {
      case 'add_node':
        return { type: 'remove_node' as DiffOperationType, path: op.path, before: op.after };
      case 'remove_node':
        return { type: 'add_node' as DiffOperationType, path: op.path, after: op.before };
      case 'modify_node':
        return { type: 'modify_node' as DiffOperationType, path: op.path, before: op.after, after: op.before };
      case 'add_edge':
        return { type: 'remove_edge' as DiffOperationType, path: op.path, before: op.after };
      case 'remove_edge':
        return { type: 'add_edge' as DiffOperationType, path: op.path, after: op.before };
      case 'reroute_edge':
        return { type: 'reroute_edge' as DiffOperationType, path: op.path, before: op.after, after: op.before };
      case 'modify_metadata':
        return { type: 'modify_metadata' as DiffOperationType, path: op.path, before: op.after, after: op.before };
    }
  }).reverse(); // Reverse order for correct rollback

  return {
    id: `inv-${diff.id}`,
    sourceGraphId: diff.targetGraphId,
    targetGraphId: diff.sourceGraphId,
    operations: invertedOps,
    metadata: {
      createdAt: new Date().toISOString(),
      description: `Inverse of ${diff.id}`,
    },
  };
}

// ── Diff Composition ──────────────────────────────────────────────

/**
 * Compose two sequential diffs into a single diff.
 *
 * The first diff transforms A→B, the second transforms B→C.
 * The composed diff transforms A→C.
 *
 * @throws Error if the diffs are not composable (first.targetGraphId !== second.sourceGraphId)
 */
export function composeDiffs(first: VPIRDiff, second: VPIRDiff): VPIRDiff {
  if (first.targetGraphId !== second.sourceGraphId) {
    throw new Error(
      `Cannot compose diffs: first target "${first.targetGraphId}" !== second source "${second.sourceGraphId}"`,
    );
  }

  return {
    id: `comp-${Date.now()}`,
    sourceGraphId: first.sourceGraphId,
    targetGraphId: second.targetGraphId,
    operations: [...first.operations, ...second.operations],
    metadata: {
      createdAt: new Date().toISOString(),
      description: `Composition of ${first.id} and ${second.id}`,
    },
  };
}

// ── Diff Summary ──────────────────────────────────────────────────

export interface DiffSummary {
  nodesAdded: number;
  nodesRemoved: number;
  nodesModified: number;
  edgesAdded: number;
  edgesRemoved: number;
  edgesRerouted: number;
  metadataChanged: number;
  totalOperations: number;
}

/**
 * Summarize a diff for display or logging.
 */
export function summarizeDiff(diff: VPIRDiff): DiffSummary {
  const summary: DiffSummary = {
    nodesAdded: 0,
    nodesRemoved: 0,
    nodesModified: 0,
    edgesAdded: 0,
    edgesRemoved: 0,
    edgesRerouted: 0,
    metadataChanged: 0,
    totalOperations: diff.operations.length,
  };

  for (const op of diff.operations) {
    switch (op.type) {
      case 'add_node': summary.nodesAdded++; break;
      case 'remove_node': summary.nodesRemoved++; break;
      case 'modify_node': summary.nodesModified++; break;
      case 'add_edge': summary.edgesAdded++; break;
      case 'remove_edge': summary.edgesRemoved++; break;
      case 'reroute_edge': summary.edgesRerouted++; break;
      case 'modify_metadata': summary.metadataChanged++; break;
    }
  }

  return summary;
}

// Re-export for use by other modules
export { serializeNode, deepEqual, collectEdges, edgeKey, parseEdgeKey };
export type { EdgeInfo };
