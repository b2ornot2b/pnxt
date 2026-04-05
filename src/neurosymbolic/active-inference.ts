/**
 * Active Inference Engine for VPIR Graph Patching.
 *
 * When a VPIR graph partially fails verification, Active Inference identifies
 * and patches specific nodes using free energy minimization. Targets the
 * lowest-confidence nodes that block the most verification properties.
 *
 * Key design decision: this engine generates LLMQuery objects but does NOT
 * execute LLM calls. The RefinementPipeline orchestrates execution, keeping
 * Active Inference unit-testable without mocking HTTP calls.
 *
 * Based on:
 * - docs/sprints/sprint-8-neurosymbolic-bridge.md (Deliverable 3.2)
 * - Advisory: Judea Pearl — Active Inference for automated graph patching
 */

import type { VPIRGraph, VPIRNode } from '../types/vpir.js';
import type { ProgramVerificationResult } from '../types/verification.js';
import type {
  NodeConfidenceMap,
  PatchTarget,
  PatchedGraph,
  LLMQuery,
} from '../types/neurosymbolic.js';

// ── Oscillation Detection ────────────────────────────────────────────

/** Minimum history length before oscillation detection activates. */
const OSCILLATION_WINDOW = 3;

export interface OscillationReport {
  /** Node IDs detected as oscillating. */
  oscillatingNodes: string[];

  /** Per-node confidence history. */
  history: Map<string, number[]>;
}

// ── Active Inference Engine ──────────────────────────────────────────

export interface ActiveInferenceOptions {
  /** Default patch budget per iteration. Default: 3. */
  defaultPatchBudget?: number;
}

/**
 * Active Inference engine for targeted VPIR graph patching.
 *
 * Uses free energy minimization to identify which nodes to regenerate
 * to maximize verification success.
 */
export class ActiveInferenceEngine {
  private readonly defaultPatchBudget: number;
  private readonly confidenceHistory: Map<string, number[]> = new Map();

  constructor(options?: ActiveInferenceOptions) {
    this.defaultPatchBudget = options?.defaultPatchBudget ?? 3;
  }

  /**
   * Identify which nodes to patch based on free energy minimization.
   *
   * Free energy = (1 - confidence) * number of properties blocked.
   * Higher free energy = more impactful patch target.
   *
   * Skips nodes detected as oscillating (patched repeatedly without improvement).
   */
  identifyPatchTargets(
    graph: VPIRGraph,
    failedProperties: ProgramVerificationResult[],
    confidenceMap: NodeConfidenceMap,
    patchBudget?: number,
  ): PatchTarget[] {
    const budget = patchBudget ?? this.defaultPatchBudget;

    // Build map: nodeId → Set<failed property IDs>
    const nodeFailures = new Map<string, Set<string>>();
    for (const result of failedProperties) {
      if (result.verified) continue;
      for (const nodeId of result.programProperty.targetNodes) {
        if (!nodeFailures.has(nodeId)) {
          nodeFailures.set(nodeId, new Set());
        }
        nodeFailures.get(nodeId)!.add(result.programProperty.id);
      }
    }

    // Compute free energy for each failing node
    const oscillating = this.getOscillatingNodeIds();
    const candidates: Array<{ nodeId: string; freeEnergy: number; failedProps: Set<string> }> = [];

    for (const [nodeId, failedProps] of nodeFailures) {
      // Skip oscillating nodes
      if (oscillating.has(nodeId)) continue;

      // Skip nodes not in graph
      if (!graph.nodes.has(nodeId)) continue;

      const confidence = confidenceMap.scores.get(nodeId) ?? 0.5;
      const freeEnergy = (1 - confidence) * failedProps.size;

      candidates.push({ nodeId, freeEnergy, failedProps });
    }

    // Sort by free energy descending
    candidates.sort((a, b) => b.freeEnergy - a.freeEnergy);

    // Return top N patch targets
    return candidates.slice(0, budget).map(({ nodeId, failedProps }) => {
      const confidence = confidenceMap.scores.get(nodeId) ?? 0.5;
      const contextNodes = this.getContextNodes(nodeId, graph);

      return {
        nodeId,
        reason: `Low confidence (${confidence.toFixed(2)}) blocking ${failedProps.size} properties`,
        confidence,
        failedProperties: Array.from(failedProps),
        contextNodes,
      };
    });
  }

  /**
   * Generate a focused LLM query to regenerate a specific node.
   *
   * The query includes surrounding context, what failed, and constraints
   * the new node must satisfy.
   */
  generatePatchQuery(target: PatchTarget, graph: VPIRGraph): LLMQuery {
    const targetNode = graph.nodes.get(target.nodeId);
    const contextNodes: VPIRNode[] = [];

    for (const ctxId of target.contextNodes) {
      const node = graph.nodes.get(ctxId);
      if (node) contextNodes.push(node);
    }

    const constraints = target.failedProperties.map(
      (propId) => `Must satisfy property: ${propId}`,
    );

    const nodeDescription = targetNode
      ? `Node "${target.nodeId}" (type: ${targetNode.type}, operation: "${targetNode.operation}")`
      : `Node "${target.nodeId}"`;

    const contextDescription = contextNodes.length > 0
      ? `\n\nContext nodes:\n${contextNodes.map((n) => `- ${n.id} (${n.type}): ${n.operation}`).join('\n')}`
      : '';

    const prompt = `The following VPIR node failed verification and needs regeneration.

${nodeDescription}
Reason: ${target.reason}

Failed properties:
${target.failedProperties.map((p) => `- ${p}`).join('\n')}
${contextDescription}

Regenerate ONLY this node to satisfy the above constraints. Preserve the node ID "${target.nodeId}" and ensure inputs/outputs are compatible with the surrounding graph.`;

    return {
      prompt,
      contextNodes,
      constraints,
      targetNodeId: target.nodeId,
    };
  }

  /**
   * Apply a patch to the graph, replacing a target node with a replacement.
   *
   * Validates that the replacement's inputs reference existing nodes.
   */
  applyPatch(
    graph: VPIRGraph,
    target: PatchTarget,
    replacement: VPIRNode,
  ): PatchedGraph {
    // Ensure replacement has the correct ID
    const patchedNode: VPIRNode = { ...replacement, id: target.nodeId };

    // Clone the graph with the replacement
    const newNodes = new Map(graph.nodes);
    newNodes.set(target.nodeId, patchedNode);

    const newGraph: VPIRGraph = { ...graph, nodes: newNodes };

    // Determine affected nodes (target + its direct consumers)
    const affectedNodes = [target.nodeId];
    for (const [nodeId, node] of newGraph.nodes) {
      if (node.inputs.some((ref) => ref.nodeId === target.nodeId)) {
        affectedNodes.push(nodeId);
      }
    }

    return {
      graph: newGraph,
      affectedNodes,
      previousConfidence: target.confidence,
      newConfidence: 0, // Will be re-scored by P-ASP after patching
    };
  }

  /**
   * Record confidence scores for the current iteration.
   * Used for oscillation detection.
   */
  recordConfidence(confidenceMap: NodeConfidenceMap): void {
    for (const [nodeId, score] of confidenceMap.scores) {
      if (!this.confidenceHistory.has(nodeId)) {
        this.confidenceHistory.set(nodeId, []);
      }
      this.confidenceHistory.get(nodeId)!.push(score);
    }
  }

  /**
   * Get the oscillation report for diagnostics.
   */
  getOscillationReport(): OscillationReport {
    return {
      oscillatingNodes: Array.from(this.getOscillatingNodeIds()),
      history: new Map(this.confidenceHistory),
    };
  }

  /**
   * Reset internal state (for reuse across refinement runs).
   */
  reset(): void {
    this.confidenceHistory.clear();
  }

  // ── Private Helpers ──────────────────────────────────────────────

  /**
   * Get IDs of nodes detected as oscillating.
   *
   * A node oscillates if its confidence goes up-down-up or down-up-down
   * over the last 3 recorded values.
   */
  private getOscillatingNodeIds(): Set<string> {
    const oscillating = new Set<string>();

    for (const [nodeId, history] of this.confidenceHistory) {
      if (history.length < OSCILLATION_WINDOW) continue;

      const recent = history.slice(-OSCILLATION_WINDOW);
      const d1 = recent[1] - recent[0];
      const d2 = recent[2] - recent[1];

      // Oscillation: direction changed (positive then negative, or vice versa)
      if ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) {
        oscillating.add(nodeId);
      }
    }

    return oscillating;
  }

  /**
   * Get 1-hop neighbor node IDs for context.
   */
  private getContextNodes(nodeId: string, graph: VPIRGraph): string[] {
    const context = new Set<string>();
    const targetNode = graph.nodes.get(nodeId);

    if (targetNode) {
      // Input providers
      for (const ref of targetNode.inputs) {
        if (graph.nodes.has(ref.nodeId)) {
          context.add(ref.nodeId);
        }
      }
    }

    // Output consumers
    for (const [otherId, otherNode] of graph.nodes) {
      if (otherId === nodeId) continue;
      if (otherNode.inputs.some((ref) => ref.nodeId === nodeId)) {
        context.add(otherId);
      }
    }

    return Array.from(context);
  }
}
