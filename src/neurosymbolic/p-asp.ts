/**
 * Probabilistic Answer Set Programming (P-ASP) Engine.
 *
 * Assigns confidence scores to VPIR nodes based on weighted combination of:
 * - Structural validity (schema conformance)
 * - Semantic coherence (type/evidence consistency)
 * - Historical accuracy (pattern-based Bayesian prior)
 * - Constraint satisfaction (Z3 property pass rate)
 *
 * This is a heuristic approximation of P-ASP weighted rules, not a full
 * ASP solver. Keeps within decidable Z3 boundaries per de Moura's guidance.
 *
 * Based on:
 * - docs/sprints/sprint-8-neurosymbolic-bridge.md (Deliverable 3.1)
 * - Advisory: Judea Pearl — probabilistic-to-deterministic bridge
 */

import type {
  VPIRGraph,
  VPIRNode,
  VPIRNodeType,
  EvidenceType,
} from '../types/vpir.js';
import type {
  PipelineContext,
  NodeConfidenceMap,
  WeightedInterpretation,
} from '../types/neurosymbolic.js';

// ── Scoring Weights ──────────────────────────────────────────────────

const WEIGHT_STRUCTURAL = 0.25;
const WEIGHT_SEMANTIC = 0.25;
const WEIGHT_HISTORICAL = 0.20;
const WEIGHT_CONSTRAINT = 0.30;

/** Default threshold below which a node is considered low-confidence. */
const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.6;

/** Maximum number of alternative interpretations to generate. */
const MAX_INTERPRETATIONS = 3;

// ── Expected Evidence Types ──────────────────────────────────────────

const EXPECTED_EVIDENCE_TYPES: Record<VPIRNodeType, EvidenceType[]> = {
  observation: ['data'],
  inference: ['model_output', 'rule'],
  action: ['data', 'rule'],
  assertion: ['rule'],
  composition: ['data', 'model_output', 'rule'],
};

// ── P-ASP Engine ─────────────────────────────────────────────────────

export interface PASPEngineOptions {
  /** Confidence threshold below which nodes are flagged. Default: 0.6. */
  lowConfidenceThreshold?: number;
}

/**
 * Probabilistic Answer Set Programming engine for VPIR node scoring.
 */
export class PASPEngine {
  private readonly threshold: number;

  constructor(options?: PASPEngineOptions) {
    this.threshold = options?.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE_THRESHOLD;
  }

  /**
   * Score all nodes in a VPIR graph with confidence values.
   *
   * Each node receives a weighted score from four dimensions:
   * structural validity, semantic coherence, historical accuracy,
   * and constraint satisfaction (Z3 results).
   */
  scoreNodes(graph: VPIRGraph, context: PipelineContext): NodeConfidenceMap {
    const scores = new Map<string, number>();

    for (const [nodeId, node] of graph.nodes) {
      const structural = this.scoreStructural(node, graph);
      const semantic = this.scoreSemantic(node, graph);
      const historical = this.scoreHistorical(node, context);
      const constraint = this.scoreConstraint(nodeId, context);

      const score =
        WEIGHT_STRUCTURAL * structural +
        WEIGHT_SEMANTIC * semantic +
        WEIGHT_HISTORICAL * historical +
        WEIGHT_CONSTRAINT * constraint;

      scores.set(nodeId, Math.max(0, Math.min(1, score)));
    }

    const allScores = Array.from(scores.values());
    const graphConfidence =
      allScores.length > 0
        ? allScores.reduce((sum, s) => sum + s, 0) / allScores.length
        : 0;

    const lowConfidenceNodes = Array.from(scores.entries())
      .filter(([, score]) => score < this.threshold)
      .map(([nodeId]) => nodeId);

    return { scores, graphConfidence, lowConfidenceNodes };
  }

  /**
   * Generate alternative interpretations for a low-confidence node.
   *
   * Uses local structural repair heuristics (no LLM calls):
   * - Vary node type
   * - Fix broken input references
   * - Adjust evidence types to match node type
   *
   * Returns top interpretations sorted by confidence.
   */
  generateInterpretations(
    node: VPIRNode,
    context: PipelineContext,
  ): WeightedInterpretation[] {
    const graph = context.graph;
    const interpretations: WeightedInterpretation[] = [];

    // Strategy 1: Try alternative node types
    const alternativeTypes: VPIRNodeType[] = [
      'observation', 'inference', 'action', 'assertion', 'composition',
    ];

    for (const altType of alternativeTypes) {
      if (altType === node.type) continue;

      const altNode = this.createAlternativeNode(node, altType, graph);
      const altGraph = this.cloneGraphWithReplacement(graph, altNode);
      const altContext: PipelineContext = { ...context, graph: altGraph };
      const altScores = this.scoreNodes(altGraph, altContext);
      const confidence = altScores.scores.get(altNode.id) ?? 0;

      interpretations.push({ interpretation: altNode, confidence });
    }

    // Strategy 2: Fix broken input references
    const fixedNode = this.fixBrokenReferences(node, graph);
    if (fixedNode) {
      const fixedGraph = this.cloneGraphWithReplacement(graph, fixedNode);
      const fixedContext: PipelineContext = { ...context, graph: fixedGraph };
      const fixedScores = this.scoreNodes(fixedGraph, fixedContext);
      const confidence = fixedScores.scores.get(fixedNode.id) ?? 0;

      interpretations.push({ interpretation: fixedNode, confidence });
    }

    // Sort by confidence descending, return top N
    interpretations.sort((a, b) => b.confidence - a.confidence);
    return interpretations.slice(0, MAX_INTERPRETATIONS);
  }

  // ── Scoring Dimensions ───────────────────────────────────────────

  /**
   * Structural validity: inputs reference existing nodes, non-empty outputs/evidence.
   */
  private scoreStructural(node: VPIRNode, graph: VPIRGraph): number {
    let checks = 0;
    let passed = 0;

    // Check inputs reference existing nodes
    for (const ref of node.inputs) {
      checks++;
      if (graph.nodes.has(ref.nodeId)) {
        passed++;
      }
    }

    // Check non-empty outputs
    checks++;
    if (node.outputs.length > 0) {
      passed++;
    }

    // Check non-empty evidence
    checks++;
    if (node.evidence.length > 0) {
      passed++;
    }

    // Check outputs have non-empty dataType
    for (const output of node.outputs) {
      checks++;
      if (output.dataType && output.dataType.length > 0) {
        passed++;
      }
    }

    // Check evidence confidence is in valid range
    for (const ev of node.evidence) {
      checks++;
      if (ev.confidence >= 0 && ev.confidence <= 1) {
        passed++;
      }
    }

    return checks > 0 ? passed / checks : 0;
  }

  /**
   * Semantic coherence: node type matches evidence type, input/output type consistency.
   */
  private scoreSemantic(node: VPIRNode, graph: VPIRGraph): number {
    let checks = 0;
    let passed = 0;

    // Check evidence types match expected types for node type
    const expectedTypes = EXPECTED_EVIDENCE_TYPES[node.type];
    for (const ev of node.evidence) {
      checks++;
      if (expectedTypes.includes(ev.type)) {
        passed++;
      }
    }

    // Check input dataType consistency across edges
    for (const ref of node.inputs) {
      const sourceNode = graph.nodes.get(ref.nodeId);
      if (!sourceNode) continue;

      checks++;
      const matchingOutput = sourceNode.outputs.find(
        (o) => o.port === ref.port && o.dataType === ref.dataType,
      );
      if (matchingOutput) {
        passed++;
      }
    }

    // Root nodes should be observations or compositions
    if (node.inputs.length === 0) {
      checks++;
      if (node.type === 'observation' || node.type === 'composition') {
        passed++;
      }
    }

    return checks > 0 ? passed / checks : 1.0;
  }

  /**
   * Historical accuracy: Bayesian prior from past pattern performance.
   */
  private scoreHistorical(node: VPIRNode, context: PipelineContext): number {
    if (!context.patternHistory) return 0.5;

    const fingerprint = `${node.type}:${node.operation}`;
    const history = context.patternHistory.get(fingerprint);

    if (!history || history.length === 0) return 0.5;

    return history.reduce((sum, v) => sum + v, 0) / history.length;
  }

  /**
   * Constraint satisfaction: fraction of Z3 properties that pass for this node.
   */
  private scoreConstraint(nodeId: string, context: PipelineContext): number {
    if (!context.verificationResults || context.verificationResults.length === 0) {
      return 0.5;
    }

    // Filter to properties that target this node
    const relevant = context.verificationResults.filter(
      (r) => r.programProperty.targetNodes.includes(nodeId),
    );

    if (relevant.length === 0) return 0.5;

    const passed = relevant.filter((r) => r.verified).length;
    return passed / relevant.length;
  }

  // ── Interpretation Helpers ────────────────────────────────────────

  /**
   * Create an alternative node with a different type and matching evidence.
   */
  private createAlternativeNode(
    original: VPIRNode,
    newType: VPIRNodeType,
    _graph: VPIRGraph,
  ): VPIRNode {
    const expectedTypes = EXPECTED_EVIDENCE_TYPES[newType];
    const adjustedEvidence = original.evidence.map((ev) => ({
      ...ev,
      type: expectedTypes.includes(ev.type) ? ev.type : expectedTypes[0],
    }));

    return {
      ...original,
      type: newType,
      evidence: adjustedEvidence,
    };
  }

  /**
   * Try to fix broken input references by finding compatible outputs in the graph.
   */
  private fixBrokenReferences(
    node: VPIRNode,
    graph: VPIRGraph,
  ): VPIRNode | null {
    let hasBroken = false;
    const fixedInputs = node.inputs.map((ref) => {
      if (graph.nodes.has(ref.nodeId)) return ref;

      hasBroken = true;

      // Find a node with a matching output port and dataType
      for (const [candidateId, candidate] of graph.nodes) {
        if (candidateId === node.id) continue;
        const matchingOutput = candidate.outputs.find(
          (o) => o.dataType === ref.dataType,
        );
        if (matchingOutput) {
          return {
            nodeId: candidateId,
            port: matchingOutput.port,
            dataType: ref.dataType,
          };
        }
      }
      return ref;
    });

    if (!hasBroken) return null;

    return { ...node, inputs: fixedInputs };
  }

  /**
   * Clone a graph with one node replaced.
   */
  private cloneGraphWithReplacement(
    graph: VPIRGraph,
    replacement: VPIRNode,
  ): VPIRGraph {
    const nodes = new Map(graph.nodes);
    nodes.set(replacement.id, replacement);
    return { ...graph, nodes };
  }
}
