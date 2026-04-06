/**
 * Modification Confidence Scorer — multi-dimensional confidence scoring
 * for VPIR graph self-modifications.
 *
 * Extends the P-ASP confidence model to the self-modification domain,
 * evaluating proposed changes across five dimensions: structural safety,
 * property preservation, IFC compliance, causal impact, and rollback
 * feasibility. Produces configurable auto-approve / require-review / reject
 * thresholds.
 *
 * Sprint 15 deliverable — Advisory Panel: Pearl (causal), de Moura (SMT).
 */

import type { VPIRGraph, VPIRDiff } from '../types/vpir.js';
import type { PreservationResult } from './z3-diff-verifier.js';
import type { CausalImpactReport } from '../neurosymbolic/causal-impact.js';
import { summarizeDiff } from '../vpir/vpir-diff.js';
import { invertDiff } from '../vpir/vpir-diff.js';

// ── Types ─────────────────────────────────────────────────────────

/**
 * Per-dimension confidence scores for a proposed modification.
 */
export interface ModificationConfidence {
  /** Structural safety — how much of the graph topology changes (0-1, higher = safer). */
  structuralSafety: number;

  /** Property preservation — ratio of properties transported vs. re-verified (0-1). */
  propertyPreservation: number;

  /** IFC compliance — whether security labels remain monotonic (0-1). */
  ifcCompliance: number;

  /** Causal impact — inverse of causal risk score (0-1, higher = less impact). */
  causalImpact: number;

  /** Rollback feasibility — whether the inverse diff is valid (0-1). */
  rollbackFeasibility: number;

  /** Weighted composite score (0-1). */
  composite: number;

  /** Classification based on thresholds. */
  decision: ConfidenceDecision;
}

/**
 * Decision based on confidence scoring.
 */
export type ConfidenceDecision = 'auto-approve' | 'require-review' | 'reject';

/**
 * Configurable thresholds for confidence decisions.
 */
export interface ConfidenceThresholds {
  /** Minimum composite score for auto-approve. Default: 0.8. */
  autoApprove: number;
  /** Minimum composite score for require-review (below this → reject). Default: 0.4. */
  requireReview: number;
}

/**
 * Input data for computing modification confidence.
 */
export interface ConfidenceInput {
  /** The graph before modification. */
  beforeGraph: VPIRGraph;
  /** The graph after modification. */
  afterGraph: VPIRGraph;
  /** The diff describing the modification. */
  diff: VPIRDiff;
  /** Z3 property preservation result (if available). */
  preservation?: PreservationResult;
  /** Causal impact analysis result (if available). */
  causalImpact?: CausalImpactReport;
}

// ── Scoring Weights ──────────────────────────────────────────────

const WEIGHT_STRUCTURAL = 0.20;
const WEIGHT_PRESERVATION = 0.25;
const WEIGHT_IFC = 0.25;
const WEIGHT_CAUSAL = 0.15;
const WEIGHT_ROLLBACK = 0.15;

// ── Default Thresholds ──────────────────────────────────────────

const DEFAULT_THRESHOLDS: ConfidenceThresholds = {
  autoApprove: 0.8,
  requireReview: 0.4,
};

// ── Confidence Scorer ───────────────────────────────────────────

export interface ModificationConfidenceScorerOptions {
  /** Decision thresholds. */
  thresholds?: Partial<ConfidenceThresholds>;
}

/**
 * Score the confidence of a proposed VPIR graph modification.
 *
 * Evaluates the modification across five dimensions and produces
 * a composite score with an auto-approve/require-review/reject decision.
 */
export function scoreModificationConfidence(
  input: ConfidenceInput,
  options?: ModificationConfidenceScorerOptions,
): ModificationConfidence {
  const thresholds: ConfidenceThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...options?.thresholds,
  };

  const structuralSafety = scoreStructuralSafety(input.beforeGraph, input.diff);
  const propertyPreservation = scorePropertyPreservation(input.preservation);
  const ifcCompliance = scoreIFCCompliance(input.afterGraph);
  const causalImpact = scoreCausalImpact(input.causalImpact);
  const rollbackFeasibility = scoreRollbackFeasibility(input.beforeGraph, input.diff);

  const composite =
    WEIGHT_STRUCTURAL * structuralSafety +
    WEIGHT_PRESERVATION * propertyPreservation +
    WEIGHT_IFC * ifcCompliance +
    WEIGHT_CAUSAL * causalImpact +
    WEIGHT_ROLLBACK * rollbackFeasibility;

  const clampedComposite = Math.max(0, Math.min(1, composite));

  const decision = classifyDecision(clampedComposite, thresholds);

  return {
    structuralSafety,
    propertyPreservation,
    ifcCompliance,
    causalImpact,
    rollbackFeasibility,
    composite: clampedComposite,
    decision,
  };
}

// ── Dimension Scorers ───────────────────────────────────────────

/**
 * Structural safety: fewer changes relative to graph size = higher confidence.
 */
function scoreStructuralSafety(graph: VPIRGraph, diff: VPIRDiff): number {
  const summary = summarizeDiff(diff);
  const totalNodes = graph.nodes.size;

  if (totalNodes === 0) return 1.0;

  // Count total structural operations (weighted by severity)
  const severity =
    summary.nodesRemoved * 3 +  // Removals are most dangerous
    summary.nodesAdded * 1 +    // Additions are generally safe
    summary.nodesModified * 2 + // Modifications depend on what changed
    summary.edgesRerouted * 2 +
    summary.edgesAdded * 1 +
    summary.edgesRemoved * 2 +
    summary.metadataChanged * 0.5;

  // Normalize: severity relative to graph size
  const normalizedSeverity = severity / (totalNodes * 3);

  return Math.max(0, Math.min(1, 1 - normalizedSeverity));
}

/**
 * Property preservation: ratio of transported/verified properties.
 */
function scorePropertyPreservation(preservation?: PreservationResult): number {
  if (!preservation) return 0.5; // No data — neutral

  const total = preservation.properties.length;
  if (total === 0) return 1.0;

  // Transported properties are best (proven without re-verification)
  // Re-verified properties are good (proven with Z3)
  // Failed properties are bad
  const preserved = preservation.properties.filter(
    (p) => p.status === 'preserved',
  ).length;

  const score = preserved / total;

  // Bonus for high transport ratio (more HoTT transport = more confidence)
  const transportRatio = total > 0 ? preservation.transportedCount / total : 0;
  const bonus = transportRatio * 0.1;

  return Math.max(0, Math.min(1, score + bonus));
}

/**
 * IFC compliance: check that security labels flow monotonically.
 */
function scoreIFCCompliance(graph: VPIRGraph): number {
  let totalEdges = 0;
  let compliantEdges = 0;

  for (const node of graph.nodes.values()) {
    for (const ref of node.inputs) {
      const source = graph.nodes.get(ref.nodeId);
      if (!source) continue;

      totalEdges++;
      // IFC monotonicity: source trust <= destination trust
      if (source.label.trustLevel <= node.label.trustLevel) {
        compliantEdges++;
      }
    }
  }

  if (totalEdges === 0) return 1.0;

  return compliantEdges / totalEdges;
}

/**
 * Causal impact: inverse of risk score (lower risk = higher confidence).
 */
function scoreCausalImpact(impact?: CausalImpactReport): number {
  if (!impact) return 0.5; // No data — neutral

  return Math.max(0, Math.min(1, 1 - impact.riskScore));
}

/**
 * Rollback feasibility: check that the inverse diff can be applied.
 */
function scoreRollbackFeasibility(_graph: VPIRGraph, diff: VPIRDiff): number {
  try {
    // First check: inverse diff exists and is structurally valid
    const inverseDiff = invertDiff(diff);
    if (inverseDiff.operations.length === 0 && diff.operations.length > 0) {
      return 0.5;
    }

    // For metadata-only changes, rollback is trivially feasible
    const summary = summarizeDiff(diff);
    if (summary.totalOperations === summary.metadataChanged) {
      return 1.0;
    }

    // Check inverse diff validity — the inverse should have the same
    // number of operations as the original
    if (inverseDiff.operations.length === diff.operations.length) {
      return 1.0;
    }

    return 0.7;
  } catch {
    return 0.0;
  }
}

/**
 * Classify confidence into auto-approve, require-review, or reject.
 */
function classifyDecision(
  composite: number,
  thresholds: ConfidenceThresholds,
): ConfidenceDecision {
  if (composite >= thresholds.autoApprove) return 'auto-approve';
  if (composite >= thresholds.requireReview) return 'require-review';
  return 'reject';
}
