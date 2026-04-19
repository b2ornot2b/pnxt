/**
 * Bridge Grammar Confidence Scorer — P-ASP-inspired scoring for generated VPIR graphs.
 *
 * Evaluates generated graphs across four dimensions: structural validity,
 * semantic coherence, handler coverage, and topological soundness. Produces
 * a composite confidence score and flags low-confidence nodes.
 *
 * Inspired by src/neurosymbolic/p-asp.ts scoring pattern.
 *
 * Sprint 12 deliverable — Advisory Panel: Pearl (causal reasoning depth).
 */

import type { VPIRGraph, VPIRNode, VPIRNodeType, EvidenceType } from '../types/vpir.js';
import type { ToolRegistry } from '../aci/tool-registry.js';

// ── Scoring Weights ─────────────────────────────────────────────────

const WEIGHT_STRUCTURAL = 0.30;
const WEIGHT_SEMANTIC = 0.25;
const WEIGHT_HANDLER_COVERAGE = 0.25;
const WEIGHT_TOPOLOGICAL = 0.20;

// ── Expected Evidence Types (mirrors p-asp.ts) ──────────────────────

const EXPECTED_EVIDENCE_TYPES: Record<VPIRNodeType, EvidenceType[]> = {
  observation: ['data'],
  inference: ['model_output', 'rule'],
  action: ['data', 'rule'],
  assertion: ['rule'],
  composition: ['data', 'model_output', 'rule'],
  human: ['data'],
};

// ── Types ───────────────────────────────────────────────────────────

/**
 * Per-node confidence breakdown.
 */
export interface NodeConfidence {
  nodeId: string;
  structural: number;
  semantic: number;
  overall: number;
}

/**
 * Composite confidence score for a generated VPIR graph.
 */
export interface GraphConfidenceScore {
  /** Weighted composite score (0-1). */
  overall: number;
  /** Structural validity dimension (0-1). */
  structural: number;
  /** Semantic coherence dimension (0-1). */
  semantic: number;
  /** Handler coverage dimension (0-1). */
  handlerCoverage: number;
  /** Topological soundness dimension (0-1). */
  topological: number;
  /** Node IDs with overall score below threshold. */
  lowConfidenceNodes: string[];
  /** Per-node confidence breakdown. */
  nodeScores: NodeConfidence[];
}

export interface ConfidenceScorerOptions {
  /** Threshold below which a node is flagged as low-confidence. Default: 0.7. */
  threshold?: number;
}

// ── Structural Scoring ──────────────────────────────────────────────

/**
 * Score a node's structural validity (required fields, types, ranges).
 */
function scoreNodeStructural(node: VPIRNode): number {
  let score = 1.0;
  const penalties: number[] = [];

  // Required string fields present and non-empty
  if (!node.id || node.id.length === 0) penalties.push(0.2);
  if (!node.operation || node.operation.length === 0) penalties.push(0.15);
  if (!node.createdAt || node.createdAt.length === 0) penalties.push(0.1);

  // Outputs should be present
  if (!node.outputs || node.outputs.length === 0) penalties.push(0.15);

  // Evidence should be present and have valid confidence values
  if (!node.evidence || node.evidence.length === 0) {
    penalties.push(0.2);
  } else {
    for (const ev of node.evidence) {
      if (ev.confidence < 0 || ev.confidence > 1) penalties.push(0.05);
      if (!ev.source || ev.source.length === 0) penalties.push(0.05);
    }
  }

  // Label should be present and valid
  if (!node.label) {
    penalties.push(0.15);
  } else {
    if (!node.label.owner) penalties.push(0.05);
    if (node.label.trustLevel < 0 || node.label.trustLevel > 4) penalties.push(0.05);
  }

  for (const p of penalties) {
    score -= p;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Score graph-level structural validity.
 */
function scoreGraphStructural(graph: VPIRGraph): number {
  if (graph.nodes.size === 0) return 0;

  let totalNodeScore = 0;
  for (const node of graph.nodes.values()) {
    totalNodeScore += scoreNodeStructural(node);
  }

  const avgNodeScore = totalNodeScore / graph.nodes.size;

  // Graph-level checks
  let graphPenalty = 0;
  if (graph.roots.length === 0) graphPenalty += 0.15;
  if (graph.terminals.length === 0) graphPenalty += 0.15;
  if (!graph.id) graphPenalty += 0.1;
  if (!graph.name) graphPenalty += 0.05;

  // Check that roots actually exist in the graph
  for (const root of graph.roots) {
    if (!graph.nodes.has(root)) graphPenalty += 0.1;
  }
  for (const terminal of graph.terminals) {
    if (!graph.nodes.has(terminal)) graphPenalty += 0.1;
  }

  return Math.max(0, Math.min(1, avgNodeScore - graphPenalty));
}

// ── Semantic Scoring ────────────────────────────────────────────────

/**
 * Score a node's semantic coherence (type-evidence alignment, node semantics).
 */
function scoreNodeSemantic(node: VPIRNode): number {
  let score = 1.0;

  // Evidence type should match expected types for the node type
  const expected = EXPECTED_EVIDENCE_TYPES[node.type] ?? [];
  if (node.evidence.length > 0 && expected.length > 0) {
    const hasExpected = node.evidence.some((ev) => expected.includes(ev.type));
    if (!hasExpected) score -= 0.2;
  }

  // Observation nodes should have no inputs (they gather raw data)
  if (node.type === 'observation' && node.inputs.length > 0) {
    score -= 0.15;
  }

  // Assertion nodes should be verifiable
  if (node.type === 'assertion' && !node.verifiable) {
    score -= 0.1;
  }

  // Average evidence confidence as a quality signal
  if (node.evidence.length > 0) {
    const avgConfidence = node.evidence.reduce((sum, ev) => sum + ev.confidence, 0) / node.evidence.length;
    if (avgConfidence < 0.5) score -= 0.15;
    else if (avgConfidence < 0.7) score -= 0.05;
  }

  // Operation name should be descriptive (at least 3 chars)
  if (node.operation.length < 3) score -= 0.1;

  return Math.max(0, Math.min(1, score));
}

/**
 * Score graph-level semantic coherence.
 */
function scoreGraphSemantic(graph: VPIRGraph): number {
  if (graph.nodes.size === 0) return 0;

  let totalScore = 0;
  for (const node of graph.nodes.values()) {
    totalScore += scoreNodeSemantic(node);
  }

  return totalScore / graph.nodes.size;
}

// ── Handler Coverage Scoring ────────────────────────────────────────

/**
 * Score how well action operations map to available handlers.
 */
function scoreHandlerCoverage(graph: VPIRGraph, registry?: ToolRegistry): number {
  if (!registry) return 1.0; // No registry → skip this dimension

  const actionNodes = Array.from(graph.nodes.values()).filter((n) => n.type === 'action');
  if (actionNodes.length === 0) return 1.0; // No actions → perfect score

  let resolved = 0;
  for (const node of actionNodes) {
    if (registry.has(node.operation)) {
      resolved++;
    }
  }

  return resolved / actionNodes.length;
}

// ── Topological Scoring ─────────────────────────────────────────────

/**
 * Score graph topological soundness (DAG properties, connectivity).
 */
function scoreTopological(graph: VPIRGraph): number {
  if (graph.nodes.size === 0) return 0;
  if (graph.nodes.size === 1) return 1.0;

  let score = 1.0;

  // Check for dangling references
  let danglingCount = 0;
  for (const node of graph.nodes.values()) {
    for (const input of node.inputs) {
      if (!graph.nodes.has(input.nodeId)) {
        danglingCount++;
      }
    }
  }
  if (danglingCount > 0) {
    score -= Math.min(0.4, danglingCount * 0.1);
  }

  // Check root nodes actually have no inputs
  for (const rootId of graph.roots) {
    const root = graph.nodes.get(rootId);
    if (root && root.inputs.length > 0) {
      score -= 0.1;
    }
  }

  // Check graph connectivity — all non-root nodes should be reachable from roots
  const reachable = new Set<string>();
  const queue = [...graph.roots];
  const successors = new Map<string, string[]>();

  // Build successor map
  for (const node of graph.nodes.values()) {
    for (const input of node.inputs) {
      const list = successors.get(input.nodeId) ?? [];
      list.push(node.id);
      successors.set(input.nodeId, list);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    const next = successors.get(current) ?? [];
    queue.push(...next);
  }

  const unreachable = graph.nodes.size - reachable.size;
  if (unreachable > 0) {
    score -= Math.min(0.3, unreachable * 0.1);
  }

  // Depth/breadth ratio sanity check
  // Very deep narrow graphs (depth > 10x breadth) may be suspicious
  const depth = computeMaxDepth(graph);
  const breadth = graph.nodes.size;
  if (depth > 0 && breadth > 0 && depth > breadth * 2) {
    score -= 0.05;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Compute the maximum depth of the graph (longest path from any root).
 */
function computeMaxDepth(graph: VPIRGraph): number {
  const depths = new Map<string, number>();

  function getDepth(nodeId: string, visited: Set<string>): number {
    if (depths.has(nodeId)) return depths.get(nodeId)!;
    if (visited.has(nodeId)) return 0; // cycle guard

    const node = graph.nodes.get(nodeId);
    if (!node || node.inputs.length === 0) {
      depths.set(nodeId, 0);
      return 0;
    }

    visited.add(nodeId);
    let maxInputDepth = 0;
    for (const input of node.inputs) {
      if (graph.nodes.has(input.nodeId)) {
        maxInputDepth = Math.max(maxInputDepth, getDepth(input.nodeId, visited));
      }
    }
    visited.delete(nodeId);

    const d = maxInputDepth + 1;
    depths.set(nodeId, d);
    return d;
  }

  let maxDepth = 0;
  for (const nodeId of graph.nodes.keys()) {
    maxDepth = Math.max(maxDepth, getDepth(nodeId, new Set()));
  }

  return maxDepth;
}

// ── Main Scorer ─────────────────────────────────────────────────────

/**
 * Score the confidence of a generated VPIR graph across four dimensions.
 *
 * @param graph - The VPIR graph to score
 * @param registry - Optional tool registry for handler coverage scoring
 * @param options - Scoring options (threshold for flagging low-confidence nodes)
 * @returns Composite confidence score with per-dimension breakdown
 */
export function scoreGraphConfidence(
  graph: VPIRGraph,
  registry?: ToolRegistry,
  options?: ConfidenceScorerOptions,
): GraphConfidenceScore {
  const threshold = options?.threshold ?? 0.7;

  const structural = scoreGraphStructural(graph);
  const semantic = scoreGraphSemantic(graph);
  const handlerCoverage = scoreHandlerCoverage(graph, registry);
  const topological = scoreTopological(graph);

  const overall =
    WEIGHT_STRUCTURAL * structural +
    WEIGHT_SEMANTIC * semantic +
    WEIGHT_HANDLER_COVERAGE * handlerCoverage +
    WEIGHT_TOPOLOGICAL * topological;

  // Per-node scores
  const nodeScores: NodeConfidence[] = [];
  const lowConfidenceNodes: string[] = [];

  for (const node of graph.nodes.values()) {
    const nodeStructural = scoreNodeStructural(node);
    const nodeSemantic = scoreNodeSemantic(node);
    const nodeOverall = 0.5 * nodeStructural + 0.5 * nodeSemantic;

    nodeScores.push({
      nodeId: node.id,
      structural: nodeStructural,
      semantic: nodeSemantic,
      overall: nodeOverall,
    });

    if (nodeOverall < threshold) {
      lowConfidenceNodes.push(node.id);
    }
  }

  return {
    overall,
    structural,
    semantic,
    handlerCoverage,
    topological,
    lowConfidenceNodes,
    nodeScores,
  };
}
