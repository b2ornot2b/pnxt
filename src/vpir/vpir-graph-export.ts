/**
 * VPIR Graph Export — structured JSON export for web-based visualization.
 *
 * Converts VPIR graphs, HoTT categories, pipeline results, and execution
 * traces into structured JSON formats suitable for consumption by web
 * visualization libraries (D3.js, Cytoscape.js, etc.).
 *
 * Preserves the existing text renderer while providing a richer data format
 * for interactive graphical oversight.
 *
 * Based on:
 * - status.md (Phase 6 Sprint 2: Enhanced visualization)
 * - Advisory Review 2026-04-05 (Kay/Liskov: move beyond ASCII)
 */

import type { VPIRGraph } from '../types/vpir.js';
import type { VPIRExecutionResult } from '../types/vpir-execution.js';
import type { Category } from '../types/hott.js';
import type {
  VPIRGraphJSON,
  GraphNode,
  GraphEdge,
  GraphMetadata,
  CategoryGraphJSON,
  CatObject,
  CatMorphism,
  CatPath,
  CatHigherPath,
  TraceJSON,
  TraceStep,
  TimelineEntry,
  TraceSummary,
  PipelineGraphJSON,
  StageGraph,
  StageConnection,
} from '../types/visualization.js';
import type { PipelineReport } from '../evaluation/integration-pipeline.js';

/**
 * Export a VPIR graph as structured JSON with layout hints.
 *
 * Nodes are assigned position hints based on topological layer ordering.
 * Edges carry port and data type information.
 */
export function exportGraphToJSON(graph: VPIRGraph): VPIRGraphJSON {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Compute topological layers via BFS from roots
  const layers = computeLayers(graph);

  // Build nodes with position hints
  const layerIndices = new Map<number, number>();
  for (const [nodeId, node] of graph.nodes) {
    const layer = layers.get(nodeId) ?? 0;
    const index = layerIndices.get(layer) ?? 0;
    layerIndices.set(layer, index + 1);

    nodes.push({
      id: nodeId,
      type: node.type,
      label: node.operation,
      position: { layer, index },
      securityLabel: node.label,
      verifiable: node.verifiable,
    });
  }

  // Build edges from node inputs
  let edgeIdx = 0;
  for (const [nodeId, node] of graph.nodes) {
    for (const ref of node.inputs) {
      if (graph.nodes.has(ref.nodeId)) {
        edges.push({
          id: `e_${edgeIdx++}`,
          source: ref.nodeId,
          target: nodeId,
          label: ref.port,
          dataType: ref.dataType,
        });
      }
    }
  }

  const metadata: GraphMetadata = {
    id: graph.id,
    name: graph.name,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    roots: graph.roots,
    terminals: graph.terminals,
  };

  return { nodes, edges, metadata };
}

/**
 * Export a HoTT category as structured JSON.
 *
 * Includes objects, morphisms, 1-paths, and 2-paths (higher paths).
 */
export function exportCategoryToJSON(category: Category): CategoryGraphJSON {
  const objects: CatObject[] = [];
  const morphisms: CatMorphism[] = [];
  const paths: CatPath[] = [];
  const higherPaths: CatHigherPath[] = [];

  for (const obj of category.objects.values()) {
    objects.push({
      id: obj.id,
      kind: obj.kind,
      label: obj.label,
      securityLabel: obj.securityLabel,
    });
  }

  for (const m of category.morphisms.values()) {
    morphisms.push({
      id: m.id,
      source: m.sourceId,
      target: m.targetId,
      label: m.label,
      properties: [...m.properties],
    });
  }

  for (const p of category.paths.values()) {
    paths.push({
      id: p.id,
      leftId: p.leftId,
      rightId: p.rightId,
      witness: p.witness,
    });
  }

  if (category.higherPaths) {
    for (const hp of category.higherPaths.values()) {
      higherPaths.push({
        id: hp.id,
        leftPathId: hp.leftPathId,
        rightPathId: hp.rightPathId,
        witness: hp.witness,
      });
    }
  }

  return {
    id: category.id,
    name: category.name,
    objects,
    morphisms,
    paths,
    higherPaths,
  };
}

/**
 * Export a pipeline report as structured JSON for stage-flow visualization.
 */
export function exportPipelineToJSON(report: PipelineReport): PipelineGraphJSON {
  const stages: StageGraph[] = report.stages.map((s) => ({
    stage: s.stage,
    completed: s.completed,
    durationMs: s.durationMs,
    itemCount: extractItemCount(s.stage, report.summary),
    data: s.data,
  }));

  // Standard pipeline stage connections
  const connections: StageConnection[] = [
    { from: 'parse', to: 'graph', label: 'AST nodes' },
    { from: 'graph', to: 'reason', label: 'KG entities' },
    { from: 'reason', to: 'formalize', label: 'VPIR nodes' },
    { from: 'formalize', to: 'verify', label: 'HoTT objects' },
  ];

  return {
    success: report.success,
    stages,
    connections,
    summary: {
      totalDurationMs: report.summary.totalDurationMs,
      stagesCompleted: report.summary.stagesCompleted,
      categoricallyValid: report.summary.categoricallyValid,
      ifcConsistent: report.summary.ifcConsistent,
    },
  };
}

/**
 * Export a VPIR execution trace as structured JSON.
 *
 * Includes step-by-step data, a timeline for visualization,
 * and summary statistics.
 */
export function exportTraceToJSON(result: VPIRExecutionResult): TraceJSON {
  const steps: TraceStep[] = result.trace.map((step, index) => ({
    index,
    nodeId: step.nodeId,
    operation: step.operation,
    success: step.success,
    inputs: step.inputs,
    output: step.output,
    error: step.error,
    timestamp: step.timestamp,
    securityLabel: step.label,
  }));

  // Build timeline entries from trace timestamps
  const timeline: TimelineEntry[] = [];
  if (result.trace.length > 0) {
    const baseTime = new Date(result.trace[0].timestamp).getTime();
    for (let i = 0; i < result.trace.length; i++) {
      const step = result.trace[i];
      const stepTime = new Date(step.timestamp).getTime();
      const nextTime = i < result.trace.length - 1
        ? new Date(result.trace[i + 1].timestamp).getTime()
        : stepTime + 1;

      timeline.push({
        nodeId: step.nodeId,
        startMs: stepTime - baseTime,
        durationMs: Math.max(nextTime - stepTime, 0),
        status: step.success ? 'completed' : 'failed',
      });
    }
  }

  const successfulSteps = result.trace.filter((s) => s.success).length;
  const failedSteps = result.trace.filter((s) => !s.success).length;

  const summary: TraceSummary = {
    graphId: result.graphId,
    status: result.status,
    totalDurationMs: result.durationMs,
    totalSteps: result.trace.length,
    successfulSteps,
    failedSteps,
    outputKeys: Object.keys(result.outputs),
  };

  return { steps, timeline, summary };
}

// --- Internal helpers ---

/**
 * Compute topological layers via BFS from roots.
 */
function computeLayers(graph: VPIRGraph): Map<string, number> {
  const layers = new Map<string, number>();
  const inDegree = new Map<string, number>();

  for (const nodeId of graph.nodes.keys()) {
    inDegree.set(nodeId, 0);
  }

  for (const node of graph.nodes.values()) {
    for (const ref of node.inputs) {
      if (graph.nodes.has(ref.nodeId)) {
        inDegree.set(node.id, (inDegree.get(node.id) ?? 0) + 1);
      }
    }
  }

  // Start with roots (in-degree 0)
  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
      layers.set(nodeId, 0);
    }
  }

  // BFS layer assignment
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const currentLayer = layers.get(nodeId) ?? 0;

    // Find successors
    for (const [targetId, targetNode] of graph.nodes) {
      for (const ref of targetNode.inputs) {
        if (ref.nodeId === nodeId) {
          const newDegree = (inDegree.get(targetId) ?? 1) - 1;
          inDegree.set(targetId, newDegree);

          // Assign max layer (ensures DAG layering is correct)
          const existingLayer = layers.get(targetId) ?? 0;
          layers.set(targetId, Math.max(existingLayer, currentLayer + 1));

          if (newDegree === 0) {
            queue.push(targetId);
          }
        }
      }
    }
  }

  return layers;
}

/**
 * Extract item count for a pipeline stage from summary.
 */
function extractItemCount(
  stage: string,
  summary: PipelineReport['summary'],
): number {
  switch (stage) {
    case 'parse':
      return summary.kgNodeCount;
    case 'graph':
      return summary.kgEdgeCount;
    case 'reason':
      return summary.vpirNodeCount;
    case 'formalize':
      return summary.hottObjectCount;
    case 'verify':
      return summary.hottMorphismCount;
    default:
      return 0;
  }
}
