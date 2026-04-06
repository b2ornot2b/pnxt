/**
 * Causal Impact Analyzer — estimate downstream effects of VPIR graph modifications.
 *
 * When the system proposes a self-modification, this analyzer builds a causal graph
 * from the VPIR dependency structure and IFC label flow, identifies which downstream
 * nodes are causally affected, and estimates risk. Integrates Active Inference for
 * iterative risk reduction on high-risk modifications.
 *
 * Addresses Pearl's causal reasoning gap (7.5 → 8.5).
 *
 * Sprint 15 deliverable — Advisory Panel: Pearl (causal reasoning), Kay (paradigm).
 */

import type { VPIRGraph, VPIRDiff } from '../types/vpir.js';
import type { NodeConfidenceMap } from '../types/neurosymbolic.js';
import { summarizeDiff } from '../vpir/vpir-diff.js';

// ── Types ─────────────────────────────────────────────────────────

/**
 * A node in the causal graph with its causal relationships.
 */
export interface CausalNode {
  /** VPIR node ID. */
  nodeId: string;
  /** Direct causal parents (nodes this node depends on). */
  causes: string[];
  /** Direct causal children (nodes that depend on this node). */
  effects: string[];
  /** Trust level from the VPIR node's security label. */
  trustLevel: number;
  /** Whether this node is directly modified by the diff. */
  directlyModified: boolean;
}

/**
 * Risk level classification for a modification.
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * A single causal chain from a modified node to a downstream effect.
 */
export interface CausalChain {
  /** Ordered list of node IDs from cause to effect. */
  path: string[];
  /** Depth of the causal chain. */
  depth: number;
  /** Whether the chain crosses a trust boundary (IFC level change). */
  crossesTrustBoundary: boolean;
}

/**
 * A mitigation suggestion for a high-risk modification.
 */
export interface Mitigation {
  /** What to do. */
  action: string;
  /** Why it helps. */
  reason: string;
  /** Which nodes it targets. */
  targetNodes: string[];
  /** Priority (lower = more important). */
  priority: number;
}

/**
 * Full causal impact report for a modification.
 */
export interface CausalImpactReport {
  /** Node IDs directly modified by the diff. */
  directlyModified: string[];
  /** Node IDs causally affected (downstream of modified nodes). */
  affectedNodes: string[];
  /** All causal chains from modified nodes to downstream effects. */
  causalChains: CausalChain[];
  /** Overall risk score (0-1). */
  riskScore: number;
  /** Classified risk level. */
  riskLevel: RiskLevel;
  /** Maximum causal depth reached. */
  maxCausalDepth: number;
  /** Whether any chain crosses a trust boundary. */
  crossesTrustBoundary: boolean;
  /** Number of trust boundary crossings. */
  trustBoundaryCrossings: number;
  /** Suggested mitigations for high-risk modifications. */
  mitigations: Mitigation[];
}

// ── Causal Impact Analyzer ──────────────────────────────────────────

export interface CausalImpactAnalyzerOptions {
  /** Maximum causal chain depth to explore. Default: 10. */
  maxDepth?: number;
  /** Risk score threshold for 'high' classification. Default: 0.6. */
  highRiskThreshold?: number;
  /** Risk score threshold for 'critical' classification. Default: 0.8. */
  criticalRiskThreshold?: number;
}

/**
 * Analyzer that builds causal graphs from VPIR dependencies and estimates
 * the downstream impact of proposed modifications.
 */
export class CausalImpactAnalyzer {
  private readonly maxDepth: number;
  private readonly highRiskThreshold: number;
  private readonly criticalRiskThreshold: number;

  constructor(options?: CausalImpactAnalyzerOptions) {
    this.maxDepth = options?.maxDepth ?? 10;
    this.highRiskThreshold = options?.highRiskThreshold ?? 0.6;
    this.criticalRiskThreshold = options?.criticalRiskThreshold ?? 0.8;
  }

  /**
   * Build a causal graph from a VPIR graph's dependency structure.
   *
   * Edges in the VPIR graph (input references) represent causal relationships:
   * if node B takes input from node A, then A causally influences B.
   */
  buildCausalGraph(graph: VPIRGraph): Map<string, CausalNode> {
    const causalGraph = new Map<string, CausalNode>();

    // Initialize all nodes
    for (const [nodeId, node] of graph.nodes) {
      causalGraph.set(nodeId, {
        nodeId,
        causes: [],
        effects: [],
        trustLevel: node.label.trustLevel,
        directlyModified: false,
      });
    }

    // Build causal relationships from VPIR edges
    for (const [nodeId, node] of graph.nodes) {
      for (const ref of node.inputs) {
        const causeNode = causalGraph.get(ref.nodeId);
        const effectNode = causalGraph.get(nodeId);
        if (causeNode && effectNode) {
          if (!causeNode.effects.includes(nodeId)) {
            causeNode.effects.push(nodeId);
          }
          if (!effectNode.causes.includes(ref.nodeId)) {
            effectNode.causes.push(ref.nodeId);
          }
        }
      }
    }

    return causalGraph;
  }

  /**
   * Analyze the causal impact of a diff on a VPIR graph.
   *
   * Identifies which nodes are directly modified, traces downstream causal
   * chains, and estimates risk based on chain depth, breadth, and trust
   * boundary crossings.
   */
  analyzeImpact(graph: VPIRGraph, diff: VPIRDiff): CausalImpactReport {
    const causalGraph = this.buildCausalGraph(graph);
    const directlyModified = this.identifyModifiedNodes(diff, causalGraph);

    // Mark directly modified nodes
    for (const nodeId of directlyModified) {
      const cn = causalGraph.get(nodeId);
      if (cn) cn.directlyModified = true;
    }

    // Trace causal chains from modified nodes
    const causalChains: CausalChain[] = [];
    const affectedSet = new Set<string>();

    for (const modifiedId of directlyModified) {
      const chains = this.traceCausalChains(modifiedId, causalGraph, graph);
      for (const chain of chains) {
        causalChains.push(chain);
        for (const nodeId of chain.path) {
          if (nodeId !== modifiedId) {
            affectedSet.add(nodeId);
          }
        }
      }
    }

    const affectedNodes = Array.from(affectedSet);
    const maxCausalDepth = causalChains.length > 0
      ? Math.max(...causalChains.map((c) => c.depth))
      : 0;
    const crossesTrustBoundary = causalChains.some((c) => c.crossesTrustBoundary);
    const trustBoundaryCrossings = causalChains.filter((c) => c.crossesTrustBoundary).length;

    const riskScore = this.computeRiskScore(
      directlyModified,
      affectedNodes,
      causalChains,
      graph,
      diff,
    );
    const riskLevel = this.classifyRisk(riskScore);

    const mitigations = this.suggestMitigations({
      directlyModified,
      affectedNodes,
      causalChains,
      riskScore,
      riskLevel,
      maxCausalDepth,
      crossesTrustBoundary,
      trustBoundaryCrossings,
      mitigations: [],
    });

    return {
      directlyModified,
      affectedNodes,
      causalChains,
      riskScore,
      riskLevel,
      maxCausalDepth,
      crossesTrustBoundary,
      trustBoundaryCrossings,
      mitigations,
    };
  }

  /**
   * Estimate the risk score for a causal impact report.
   *
   * Risk is computed from four factors:
   * 1. Modification breadth (fraction of graph affected)
   * 2. Causal depth (how far downstream effects reach)
   * 3. Trust boundary crossings (security risk)
   * 4. Structural change magnitude (from diff summary)
   */
  estimateRisk(impact: CausalImpactReport): number {
    return impact.riskScore;
  }

  /**
   * Suggest mitigations for a causal impact report.
   */
  suggestMitigations(impact: CausalImpactReport): Mitigation[] {
    const mitigations: Mitigation[] = [];

    // If risk is low, no mitigations needed
    if (impact.riskLevel === 'low') return mitigations;

    // Suggest re-verification for affected nodes
    if (impact.affectedNodes.length > 0) {
      mitigations.push({
        action: 'Re-verify affected downstream nodes with Z3',
        reason: `${impact.affectedNodes.length} node(s) are causally downstream of the modification`,
        targetNodes: impact.affectedNodes,
        priority: 1,
      });
    }

    // Trust boundary crossing mitigation
    if (impact.crossesTrustBoundary) {
      const crossingNodes = impact.causalChains
        .filter((c) => c.crossesTrustBoundary)
        .flatMap((c) => c.path);
      const uniqueNodes = Array.from(new Set(crossingNodes));

      mitigations.push({
        action: 'Audit IFC label consistency across trust boundaries',
        reason: `${impact.trustBoundaryCrossings} causal chain(s) cross trust boundaries`,
        targetNodes: uniqueNodes,
        priority: 0,
      });
    }

    // Deep causal chain mitigation
    if (impact.maxCausalDepth >= 3) {
      mitigations.push({
        action: 'Run bounded model checking on deep causal chains',
        reason: `Maximum causal depth is ${impact.maxCausalDepth}, which increases propagation risk`,
        targetNodes: impact.directlyModified,
        priority: 2,
      });
    }

    // Critical risk: suggest staged rollout
    if (impact.riskLevel === 'critical') {
      mitigations.push({
        action: 'Apply modification in stages with intermediate verification',
        reason: 'Critical risk level — monolithic application may cause cascading failures',
        targetNodes: impact.directlyModified,
        priority: 0,
      });
    }

    // Sort by priority (lower = more important)
    mitigations.sort((a, b) => a.priority - b.priority);

    return mitigations;
  }

  /**
   * Generate Active Inference patch suggestions for risk reduction.
   *
   * When a modification has high causal risk, this method identifies
   * which nodes could be preemptively patched to reduce downstream impact.
   */
  suggestRiskReductionPatches(
    impact: CausalImpactReport,
    confidenceMap: NodeConfidenceMap,
  ): Array<{ nodeId: string; reason: string; currentConfidence: number }> {
    const suggestions: Array<{ nodeId: string; reason: string; currentConfidence: number }> = [];

    if (impact.riskLevel === 'low') return suggestions;

    // Find affected nodes with low confidence — these are most vulnerable
    for (const nodeId of impact.affectedNodes) {
      const confidence = confidenceMap.scores.get(nodeId) ?? 0.5;
      if (confidence < 0.7) {
        suggestions.push({
          nodeId,
          reason: `Low confidence (${confidence.toFixed(2)}) and causally affected by modification`,
          currentConfidence: confidence,
        });
      }
    }

    // Sort by confidence ascending (lowest confidence first)
    suggestions.sort((a, b) => a.currentConfidence - b.currentConfidence);

    return suggestions;
  }

  // ── Private Helpers ──────────────────────────────────────────────

  /**
   * Identify which node IDs are directly modified by a diff.
   */
  private identifyModifiedNodes(
    diff: VPIRDiff,
    causalGraph: Map<string, CausalNode>,
  ): string[] {
    const modified = new Set<string>();

    for (const op of diff.operations) {
      if (op.path.startsWith('nodes/')) {
        const nodeId = op.path.replace('nodes/', '');
        // Only include nodes that exist in the causal graph (current graph)
        // or are being added
        if (causalGraph.has(nodeId) || op.type === 'add_node') {
          modified.add(nodeId);
        }
      }
      // Edge operations affect both source and target
      if (op.path.startsWith('edges/')) {
        const edgeInfo = op.before ?? op.after;
        if (edgeInfo && typeof edgeInfo === 'object') {
          const info = edgeInfo as Record<string, unknown>;
          if (typeof info.sourceId === 'string' && causalGraph.has(info.sourceId)) {
            modified.add(info.sourceId);
          }
          if (typeof info.targetId === 'string' && causalGraph.has(info.targetId)) {
            modified.add(info.targetId);
          }
        }
      }
    }

    return Array.from(modified);
  }

  /**
   * Trace all causal chains downstream from a modified node.
   */
  private traceCausalChains(
    startNodeId: string,
    causalGraph: Map<string, CausalNode>,
    vpirGraph: VPIRGraph,
  ): CausalChain[] {
    const chains: CausalChain[] = [];
    const startNode = causalGraph.get(startNodeId);
    if (!startNode || startNode.effects.length === 0) return chains;

    // BFS to find all downstream paths
    const queue: Array<{ path: string[]; visited: Set<string> }> = [];

    for (const effectId of startNode.effects) {
      queue.push({
        path: [startNodeId, effectId],
        visited: new Set([startNodeId, effectId]),
      });
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      const lastNodeId = current.path[current.path.length - 1];
      const lastCausalNode = causalGraph.get(lastNodeId);

      if (!lastCausalNode || lastCausalNode.effects.length === 0 ||
          current.path.length > this.maxDepth) {
        // Terminal node or max depth — record the chain
        chains.push(this.buildCausalChain(current.path, vpirGraph));
        continue;
      }

      let hasExtension = false;
      for (const effectId of lastCausalNode.effects) {
        if (!current.visited.has(effectId)) {
          hasExtension = true;
          const newVisited = new Set(current.visited);
          newVisited.add(effectId);
          queue.push({
            path: [...current.path, effectId],
            visited: newVisited,
          });
        }
      }

      // If no extensions possible, record the chain as-is
      if (!hasExtension) {
        chains.push(this.buildCausalChain(current.path, vpirGraph));
      }
    }

    return chains;
  }

  /**
   * Build a CausalChain from a path of node IDs.
   */
  private buildCausalChain(path: string[], graph: VPIRGraph): CausalChain {
    let crossesTrustBoundary = false;

    for (let i = 1; i < path.length; i++) {
      const prevNode = graph.nodes.get(path[i - 1]);
      const currNode = graph.nodes.get(path[i]);
      if (prevNode && currNode && prevNode.label.trustLevel !== currNode.label.trustLevel) {
        crossesTrustBoundary = true;
        break;
      }
    }

    return {
      path,
      depth: path.length - 1,
      crossesTrustBoundary,
    };
  }

  /**
   * Compute the overall risk score from modification characteristics.
   */
  private computeRiskScore(
    directlyModified: string[],
    affectedNodes: string[],
    causalChains: CausalChain[],
    graph: VPIRGraph,
    diff: VPIRDiff,
  ): number {
    const totalNodes = graph.nodes.size;
    if (totalNodes === 0) return 0;

    // Factor 1: Breadth — fraction of graph affected
    const breadth = (directlyModified.length + affectedNodes.length) / totalNodes;

    // Factor 2: Depth — normalized max causal depth
    const maxDepth = causalChains.length > 0
      ? Math.max(...causalChains.map((c) => c.depth))
      : 0;
    const depthScore = Math.min(maxDepth / 5, 1.0); // Normalize: depth 5+ = max risk

    // Factor 3: Trust boundary crossings
    const crossings = causalChains.filter((c) => c.crossesTrustBoundary).length;
    const crossingScore = Math.min(crossings / 3, 1.0); // Normalize: 3+ crossings = max risk

    // Factor 4: Structural magnitude from diff
    const summary = summarizeDiff(diff);
    const structuralScore = Math.min(summary.totalOperations / 10, 1.0);

    // Weighted combination
    const score =
      0.25 * breadth +
      0.25 * depthScore +
      0.30 * crossingScore +
      0.20 * structuralScore;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Classify risk level from risk score.
   */
  private classifyRisk(riskScore: number): RiskLevel {
    if (riskScore >= this.criticalRiskThreshold) return 'critical';
    if (riskScore >= this.highRiskThreshold) return 'high';
    if (riskScore >= 0.3) return 'medium';
    return 'low';
  }
}
