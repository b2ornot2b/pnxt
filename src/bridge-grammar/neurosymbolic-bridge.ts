/**
 * Neurosymbolic Pipeline Integration — connects P-ASP and Active Inference
 * into the Bridge Grammar generation pipeline.
 *
 * After iterative generation produces a VPIR graph, this module applies
 * neurosymbolic refinement for targeted node-level improvements using
 * confidence scoring and free energy minimization.
 *
 * Sprint 13 deliverable — Advisory Panel: Pearl, Sutskever, Kay.
 */

import type { VPIRGraph, VPIRNode } from '../types/vpir.js';
import type {
  PipelineContext,
  NodeConfidenceMap,
} from '../types/neurosymbolic.js';
import type { ProgramVerificationResult } from '../types/verification.js';
import { PASPEngine } from '../neurosymbolic/p-asp.js';
import {
  ActiveInferenceEngine,
  type OscillationReport,
} from '../neurosymbolic/active-inference.js';
import type { GraphVerificationResult } from '../verification/z3-graph-verifier.js';
import type { Z3Context } from '../verification/z3-invariants.js';
import type { ToolRegistry } from '../aci/tool-registry.js';

// ── Types ───────────────────────────────────────────────────────────

/**
 * Record of a single patch applied during neurosymbolic refinement.
 */
export interface NeurosymbolicPatchRecord {
  /** ID of the patched node. */
  nodeId: string;
  /** Why this node was targeted. */
  reason: string;
  /** Confidence before the patch. */
  beforeConfidence: number;
  /** Confidence after the patch. */
  afterConfidence: number;
  /** Strategy used for the patch. */
  strategy: 'type_swap' | 'reference_fix' | 'interpretation';
}

/**
 * Options for neurosymbolic refinement.
 */
export interface NeurosymbolicOptions {
  /** Maximum nodes to patch per iteration. Default: 3. */
  patchBudget?: number;
  /** Minimum graph confidence to accept. Default: 0.85. */
  convergenceThreshold?: number;
  /** Maximum refinement iterations. Default: 5. */
  maxIterations?: number;
  /** Tool registry for handler coverage scoring. */
  toolRegistry?: ToolRegistry;
  /** Z3 context for formal verification. */
  z3Context?: Z3Context;
}

/**
 * Result of neurosymbolic refinement.
 */
export interface NeurosymbolicResult {
  /** The refined VPIR graph. */
  graph: VPIRGraph;
  /** Graph confidence before refinement. */
  initialConfidence: number;
  /** Graph confidence after refinement. */
  finalConfidence: number;
  /** Patches applied during refinement. */
  patchesApplied: NeurosymbolicPatchRecord[];
  /** Oscillation report from Active Inference. */
  oscillationReport: OscillationReport;
  /** Whether refinement converged above threshold. */
  converged: boolean;
  /** Number of iterations performed. */
  iterations: number;
  /** Z3 verification result (if available). */
  verification?: GraphVerificationResult;
}

// ── Neurosymbolic Refinement ───────────────────────────────────────

/**
 * Apply neurosymbolic refinement to a VPIR graph.
 *
 * Uses P-ASP for confidence scoring and Active Inference for targeted
 * node patching. The refinement loop:
 *
 * 1. Score graph via P-ASP (structural, semantic, historical, constraint)
 * 2. If below threshold → Active Inference identifies patch targets
 * 3. Generate patches (alternative node types, fixed references)
 * 4. Apply patches, re-score, check convergence
 * 5. Oscillation detection prevents infinite loops
 *
 * This is a local refinement (no LLM calls) — patches are generated
 * using P-ASP's heuristic interpretation engine.
 */
export async function applyNeurosymbolicRefinement(
  graph: VPIRGraph,
  options?: NeurosymbolicOptions,
): Promise<NeurosymbolicResult> {
  const patchBudget = options?.patchBudget ?? 3;
  const convergenceThreshold = options?.convergenceThreshold ?? 0.85;
  const maxIterations = options?.maxIterations ?? 5;

  const paspEngine = new PASPEngine({
    lowConfidenceThreshold: convergenceThreshold * 0.8,
  });
  const activeInference = new ActiveInferenceEngine({
    defaultPatchBudget: patchBudget,
  });

  // Initial scoring
  const initialContext: PipelineContext = { graph };
  const initialScores = paspEngine.scoreNodes(graph, initialContext);
  const initialConfidence = initialScores.graphConfidence;

  // If already above threshold, return immediately
  if (initialConfidence >= convergenceThreshold) {
    const verification = await runVerification(graph, options);
    return {
      graph,
      initialConfidence,
      finalConfidence: initialConfidence,
      patchesApplied: [],
      oscillationReport: activeInference.getOscillationReport(),
      converged: true,
      iterations: 0,
      verification,
    };
  }

  let currentGraph = graph;
  const patchesApplied: NeurosymbolicPatchRecord[] = [];
  let currentConfidence = initialConfidence;

  // Build mock verification results for Active Inference targeting
  const mockVerificationResults = buildMockVerificationResults(
    currentGraph,
    initialScores,
  );

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    // Record confidence for oscillation detection
    const context: PipelineContext = {
      graph: currentGraph,
      verificationResults: mockVerificationResults,
    };
    const scores = paspEngine.scoreNodes(currentGraph, context);
    activeInference.recordConfidence(scores);

    // Identify patch targets
    const targets = activeInference.identifyPatchTargets(
      currentGraph,
      mockVerificationResults,
      scores,
      patchBudget,
    );

    // No targets → accept current graph
    if (targets.length === 0) {
      break;
    }

    // Apply patches using P-ASP interpretations
    for (const target of targets) {
      const node = currentGraph.nodes.get(target.nodeId);
      if (!node) continue;

      const interpretations = paspEngine.generateInterpretations(node, context);
      if (interpretations.length === 0) continue;

      // Pick the best interpretation
      const best = interpretations[0];
      if (best.confidence <= (scores.scores.get(target.nodeId) ?? 0)) {
        continue; // No improvement possible
      }

      // Apply the patch
      const patched = activeInference.applyPatch(
        currentGraph,
        target,
        best.interpretation,
      );
      currentGraph = patched.graph;

      // Re-score after patch
      const newContext: PipelineContext = { graph: currentGraph };
      const newScores = paspEngine.scoreNodes(currentGraph, newContext);
      const newNodeConfidence = newScores.scores.get(target.nodeId) ?? 0;

      patchesApplied.push({
        nodeId: target.nodeId,
        reason: target.reason,
        beforeConfidence: target.confidence,
        afterConfidence: newNodeConfidence,
        strategy: determineStrategy(node, best.interpretation),
      });

      currentConfidence = newScores.graphConfidence;
    }

    // Check convergence
    const postContext: PipelineContext = { graph: currentGraph };
    const postScores = paspEngine.scoreNodes(currentGraph, postContext);
    currentConfidence = postScores.graphConfidence;

    if (currentConfidence >= convergenceThreshold) {
      const verification = await runVerification(currentGraph, options);
      return {
        graph: currentGraph,
        initialConfidence,
        finalConfidence: currentConfidence,
        patchesApplied,
        oscillationReport: activeInference.getOscillationReport(),
        converged: true,
        iterations: iteration,
        verification,
      };
    }
  }

  // Max iterations exhausted
  const verification = await runVerification(currentGraph, options);
  return {
    graph: currentGraph,
    initialConfidence,
    finalConfidence: currentConfidence,
    patchesApplied,
    oscillationReport: activeInference.getOscillationReport(),
    converged: false,
    iterations: maxIterations,
    verification,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Determine the patch strategy based on what changed.
 */
function determineStrategy(
  original: VPIRNode,
  replacement: VPIRNode,
): NeurosymbolicPatchRecord['strategy'] {
  if (original.type !== replacement.type) return 'type_swap';

  const origInputIds = original.inputs.map((i) => i.nodeId).sort().join(',');
  const replInputIds = replacement.inputs.map((i) => i.nodeId).sort().join(',');
  if (origInputIds !== replInputIds) return 'reference_fix';

  return 'interpretation';
}

/**
 * Build mock ProgramVerificationResult objects from P-ASP scores.
 *
 * Maps low-confidence nodes to "failed" verification properties so that
 * Active Inference can target them via free energy minimization.
 */
function buildMockVerificationResults(
  graph: VPIRGraph,
  scores: NodeConfidenceMap,
): ProgramVerificationResult[] {
  const results: ProgramVerificationResult[] = [];

  for (const nodeId of scores.lowConfidenceNodes) {
    if (!graph.nodes.has(nodeId)) continue;

    results.push({
      programProperty: {
        id: `confidence_${nodeId}`,
        kind: 'invariant',
        description: `Node ${nodeId} has low P-ASP confidence`,
        formula: '',
        targetNodes: [nodeId],
      },
      verified: false,
      counterexample: { confidence: scores.scores.get(nodeId) ?? 0 },
      solver: 'z3',
      duration: 0,
      property: 'capability_grant_consistency',
      boundVariables: {},
    });
  }

  return results;
}

/**
 * Run Z3 graph verification if context is available.
 */
async function runVerification(
  graph: VPIRGraph,
  options?: NeurosymbolicOptions,
): Promise<GraphVerificationResult | undefined> {
  if (!options?.z3Context) return undefined;

  const { verifyGraphProperties } = await import('../verification/z3-graph-verifier.js');
  return verifyGraphProperties(graph, options.z3Context, options.toolRegistry);
}
