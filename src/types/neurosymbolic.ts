/**
 * Neurosymbolic Bridge types.
 *
 * Types for the P-ASP confidence scoring, Active Inference graph patching,
 * and probabilistic refinement pipeline that replaces binary accept/reject
 * with iterative neurosymbolic refinement.
 *
 * Based on:
 * - docs/sprints/sprint-8-neurosymbolic-bridge.md
 * - Advisory Review: Judea Pearl — neurosymbolic bridge (largest gap)
 */

import type { SecurityLabel } from './ifc.js';
import type { VPIRGraph, VPIRNode } from './vpir.js';
import type {
  ProgramProperty,
  ProgramVerificationResult,
} from './verification.js';

// ── P-ASP Types ──────────────────────────────────────────────────────

/**
 * Context provided to the P-ASP engine for scoring VPIR nodes.
 * Holds the graph, optional verification history, and historical pattern accuracy.
 */
export interface PipelineContext {
  /** The VPIR graph being scored. */
  graph: VPIRGraph;

  /** Verification results from Z3/CVC5 (if available). */
  verificationResults?: ProgramVerificationResult[];

  /**
   * Historical accuracy for patterns, keyed by pattern fingerprint
   * (node type + operation). Values are arrays of past confidence scores.
   */
  patternHistory?: Map<string, number[]>;
}

/**
 * Per-node confidence scores assigned by the P-ASP engine.
 */
export interface NodeConfidenceMap {
  /** Per-node confidence scores (0.0 to 1.0), keyed by node ID. */
  scores: Map<string, number>;

  /** Overall graph confidence (weighted average of node scores). */
  graphConfidence: number;

  /** Node IDs with confidence below the threshold that need refinement. */
  lowConfidenceNodes: string[];
}

/**
 * An alternative interpretation of a VPIR node with a confidence score.
 */
export interface WeightedInterpretation {
  /** The alternative VPIR node. */
  interpretation: VPIRNode;

  /** Confidence score for this interpretation (0.0 to 1.0). */
  confidence: number;
}

// ── Active Inference Types ───────────────────────────────────────────

/**
 * A node identified for patching by the Active Inference engine.
 */
export interface PatchTarget {
  /** ID of the node to patch. */
  nodeId: string;

  /** Human-readable reason why this node needs patching. */
  reason: string;

  /** Current confidence score (low). */
  confidence: number;

  /** Property IDs that this node blocks. */
  failedProperties: string[];

  /** IDs of surrounding nodes for context. */
  contextNodes: string[];
}

/**
 * Result of applying a patch to a VPIR graph.
 */
export interface PatchedGraph {
  /** The updated VPIR graph with the patch applied. */
  graph: VPIRGraph;

  /** Node IDs affected by the patch. */
  affectedNodes: string[];

  /** Graph confidence before the patch. */
  previousConfidence: number;

  /** Graph confidence after the patch. */
  newConfidence: number;
}

/**
 * Record of a patch applied during refinement.
 */
export interface PatchRecord {
  /** The patch target that was addressed. */
  target: PatchTarget;

  /** The replacement node. */
  replacement: VPIRNode;

  /** Which iteration this patch was applied in. */
  iteration: number;

  /** Change in graph confidence from this patch. */
  confidenceDelta: number;
}

/**
 * A focused LLM query for regenerating a specific VPIR node.
 */
export interface LLMQuery {
  /** The prompt to send to the LLM. */
  prompt: string;

  /** Context nodes surrounding the target. */
  contextNodes: VPIRNode[];

  /** Constraints the regenerated node must satisfy. */
  constraints: string[];

  /** ID of the node being regenerated. */
  targetNodeId: string;
}

// ── Refinement Pipeline Types ────────────────────────────────────────

/**
 * Configuration for the probabilistic refinement loop.
 */
export interface RefinementConfig {
  /** Maximum refinement iterations. Default: 5. */
  maxIterations: number;

  /** Minimum graph confidence to accept (0.0 to 1.0). Default: 0.85. */
  convergenceThreshold: number;

  /** Maximum nodes to patch per iteration. Default: 3. */
  patchBudget: number;

  /** Total timeout in milliseconds. Default: 30000. */
  timeout: number;
}

/**
 * Result of the probabilistic refinement pipeline.
 */
export interface RefinementResult {
  /** The final VPIR graph (best achieved). */
  graph: VPIRGraph;

  /** Final graph confidence score. */
  finalConfidence: number;

  /** Number of refinement iterations performed. */
  iterations: number;

  /** History of patches applied during refinement. */
  patchHistory: PatchRecord[];

  /** Final verification results (if verifier available). */
  verificationResults: ProgramVerificationResult[];

  /** Whether the refinement loop converged above the threshold. */
  converged: boolean;
}

/**
 * A natural language task to be refined into a VPIR graph.
 */
export interface NaturalLanguageTask {
  /** Natural language description of the task. */
  description: string;

  /** Optional IFC security label to apply. */
  securityLabel?: SecurityLabel;

  /** Optional program properties the graph must satisfy. */
  constraints?: ProgramProperty[];
}
