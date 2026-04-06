/**
 * Self-Modification Orchestrator — production-grade pipeline for verified
 * self-modification of VPIR graphs.
 *
 * Connects the autonomous pipeline (Sprint 13) with the diff/patch/transaction
 * system (Sprint 14) so the system can propose, evaluate, and apply modifications
 * to its own pipeline graph. Integrates causal impact analysis and confidence
 * scoring for safety.
 *
 * This promotes self-modification from `src/experiments/` to production,
 * completing M4 (Self-Modification).
 *
 * Sprint 15 deliverable — Advisory Panel: Kay (paradigm), Pearl (causal),
 * de Moura (SMT), Sutskever (LLM).
 */

import type { VPIRGraph, VPIRDiff } from '../types/vpir.js';
import type { GraphTransaction, TransactionOptions } from './vpir-transaction.js';
import type { PreservationResult } from '../verification/z3-diff-verifier.js';
import type { ModificationConfidence, ConfidenceInput } from '../verification/modification-confidence.js';
import type { CausalImpactReport } from '../neurosymbolic/causal-impact.js';

import { diffGraphs } from './vpir-diff.js';
import { cloneGraph } from './vpir-patch.js';
import { beginTransaction, executeTransaction, getTransactionGraph } from './vpir-transaction.js';
import { verifyPropertyPreservation, toGraphVerificationResult } from '../verification/z3-diff-verifier.js';
import { scoreModificationConfidence } from '../verification/modification-confidence.js';
import { CausalImpactAnalyzer } from '../neurosymbolic/causal-impact.js';

// ── Types ─────────────────────────────────────────────────────────

/**
 * Status of a modification proposal through the orchestrator pipeline.
 */
export type ProposalStatus =
  | 'proposed'    // Created, not yet evaluated
  | 'evaluated'   // Confidence scored and causal impact analyzed
  | 'applying'    // Transaction in progress
  | 'applied'     // Successfully committed
  | 'rejected'    // Confidence too low or verification failed
  | 'rolled_back'; // Applied but rolled back

/**
 * A modification proposal managed by the orchestrator.
 */
export interface ModificationProposal {
  /** Unique proposal identifier. */
  id: string;

  /** Natural language description of the modification. */
  description: string;

  /** Current status. */
  status: ProposalStatus;

  /** The graph before modification. */
  sourceGraph: VPIRGraph;

  /** The proposed modified graph. */
  targetGraph: VPIRGraph;

  /** The diff between source and target. */
  diff: VPIRDiff;

  /** Confidence scoring result (after evaluation). */
  confidence?: ModificationConfidence;

  /** Causal impact analysis result (after evaluation). */
  causalImpact?: CausalImpactReport;

  /** Z3 property preservation result (after evaluation). */
  preservation?: PreservationResult;

  /** Transaction (after application attempt). */
  transaction?: GraphTransaction;

  /** Timestamps for each stage. */
  timeline: {
    proposedAt: string;
    evaluatedAt?: string;
    appliedAt?: string;
    rejectedAt?: string;
    rolledBackAt?: string;
  };

  /** Human-readable reason for rejection or rollback. */
  rejectionReason?: string;
}

/**
 * Summary of orchestrator pipeline execution.
 */
export interface OrchestrationResult {
  /** The final proposal state. */
  proposal: ModificationProposal;

  /** Whether the modification was successfully applied. */
  applied: boolean;

  /** The resulting graph (modified if applied, original if rejected/rolled back). */
  resultGraph: VPIRGraph;

  /** Total pipeline duration in milliseconds. */
  totalTimeMs: number;
}

/**
 * Options for the self-modification orchestrator.
 */
export interface OrchestratorOptions {
  /** Minimum confidence composite score to auto-approve. Default: 0.7. */
  autoApproveThreshold?: number;

  /** Minimum confidence composite score to proceed (below = reject). Default: 0.3. */
  minimumConfidence?: number;

  /** Whether to skip causal impact analysis. Default: false. */
  skipCausalAnalysis?: boolean;

  /** Custom transaction options. */
  transactionOptions?: TransactionOptions;

  /** Causal impact analyzer options. */
  causalAnalyzerOptions?: {
    maxDepth?: number;
    highRiskThreshold?: number;
    criticalRiskThreshold?: number;
  };
}

// ── Self-Modification Orchestrator ──────────────────────────────────

/**
 * Orchestrates verified self-modification of VPIR graphs.
 *
 * Pipeline: propose → evaluate (confidence + causal) → apply (transaction) → result
 */
export class SelfModificationOrchestrator {
  private readonly autoApproveThreshold: number;
  private readonly minimumConfidence: number;
  private readonly skipCausalAnalysis: boolean;
  private readonly transactionOptions: TransactionOptions;
  private readonly causalAnalyzer: CausalImpactAnalyzer;

  /** History of all proposals processed by this orchestrator. */
  readonly proposalHistory: ModificationProposal[] = [];

  constructor(options?: OrchestratorOptions) {
    this.autoApproveThreshold = options?.autoApproveThreshold ?? 0.7;
    this.minimumConfidence = options?.minimumConfidence ?? 0.3;
    this.skipCausalAnalysis = options?.skipCausalAnalysis ?? false;
    this.transactionOptions = options?.transactionOptions ?? {};
    this.causalAnalyzer = new CausalImpactAnalyzer(options?.causalAnalyzerOptions);
  }

  /**
   * Propose a modification by providing the source graph and target graph.
   *
   * This is the lowest-level API: the caller provides both graphs directly.
   * Higher-level APIs (NL description → graph) can be built on top.
   */
  proposeModification(
    description: string,
    sourceGraph: VPIRGraph,
    targetGraph: VPIRGraph,
  ): ModificationProposal {
    const diff = diffGraphs(sourceGraph, targetGraph);

    const proposal: ModificationProposal = {
      id: `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      description,
      status: 'proposed',
      sourceGraph: cloneGraph(sourceGraph),
      targetGraph: cloneGraph(targetGraph),
      diff,
      timeline: {
        proposedAt: new Date().toISOString(),
      },
    };

    this.proposalHistory.push(proposal);
    return proposal;
  }

  /**
   * Evaluate a proposal: run confidence scoring and causal impact analysis.
   *
   * Does NOT apply the modification — only assesses its safety.
   */
  async evaluateProposal(proposal: ModificationProposal): Promise<ModificationProposal> {
    if (proposal.status !== 'proposed') {
      throw new Error(`Cannot evaluate proposal in status "${proposal.status}"`);
    }

    // Run Z3 property preservation
    const preservation = await verifyPropertyPreservation(
      proposal.sourceGraph,
      proposal.targetGraph,
      proposal.diff,
    );
    proposal.preservation = preservation;

    // Run causal impact analysis
    let causalImpact: CausalImpactReport | undefined;
    if (!this.skipCausalAnalysis) {
      causalImpact = this.causalAnalyzer.analyzeImpact(
        proposal.sourceGraph,
        proposal.diff,
      );
      proposal.causalImpact = causalImpact;
    }

    // Score confidence
    const confidenceInput: ConfidenceInput = {
      beforeGraph: proposal.sourceGraph,
      afterGraph: proposal.targetGraph,
      diff: proposal.diff,
      preservation,
      causalImpact,
    };

    const confidence = scoreModificationConfidence(confidenceInput, {
      thresholds: {
        autoApprove: this.autoApproveThreshold,
        requireReview: this.minimumConfidence,
      },
    });
    proposal.confidence = confidence;

    proposal.status = 'evaluated';
    proposal.timeline.evaluatedAt = new Date().toISOString();

    return proposal;
  }

  /**
   * Apply a modification proposal via transaction.
   *
   * If the confidence is below the minimum threshold, the proposal is rejected.
   * If the transaction fails verification, it's rolled back.
   */
  async applyModification(proposal: ModificationProposal): Promise<OrchestrationResult> {
    const start = performance.now();

    // Ensure proposal has been evaluated
    if (proposal.status === 'proposed') {
      await this.evaluateProposal(proposal);
    }

    if (proposal.status !== 'evaluated') {
      throw new Error(`Cannot apply proposal in status "${proposal.status}"`);
    }

    // Check confidence threshold
    if (proposal.confidence && proposal.confidence.composite < this.minimumConfidence) {
      proposal.status = 'rejected';
      proposal.timeline.rejectedAt = new Date().toISOString();
      proposal.rejectionReason =
        `Confidence score ${proposal.confidence.composite.toFixed(3)} below minimum threshold ${this.minimumConfidence}`;

      return {
        proposal,
        applied: false,
        resultGraph: proposal.sourceGraph,
        totalTimeMs: performance.now() - start,
      };
    }

    // Execute transaction
    proposal.status = 'applying';
    const txn = beginTransaction(proposal.sourceGraph, proposal.diff);

    const txnOptions: TransactionOptions = {
      validate: true,
      autoRollback: true,
      ...this.transactionOptions,
      verify: this.transactionOptions.verify ?? (async (before, after) => {
        const diff = diffGraphs(before, after);
        const pres = await verifyPropertyPreservation(before, after, diff);
        return toGraphVerificationResult(pres);
      }),
    };

    const result = await executeTransaction(txn, txnOptions);
    proposal.transaction = result;

    if (result.status === 'committed') {
      proposal.status = 'applied';
      proposal.timeline.appliedAt = new Date().toISOString();

      return {
        proposal,
        applied: true,
        resultGraph: getTransactionGraph(result),
        totalTimeMs: performance.now() - start,
      };
    }

    // Transaction failed or was rolled back
    if (result.status === 'rolled_back') {
      proposal.status = 'rolled_back';
      proposal.timeline.rolledBackAt = new Date().toISOString();
      proposal.rejectionReason = 'Transaction rolled back due to verification failure';
    } else {
      proposal.status = 'rejected';
      proposal.timeline.rejectedAt = new Date().toISOString();
      proposal.rejectionReason = `Transaction failed: ${result.trace.map((t) => `${t.stage}:${t.status}`).join(', ')}`;
    }

    return {
      proposal,
      applied: false,
      resultGraph: proposal.sourceGraph,
      totalTimeMs: performance.now() - start,
    };
  }

  /**
   * Full pipeline: propose → evaluate → apply in one call.
   */
  async proposeAndApply(
    description: string,
    sourceGraph: VPIRGraph,
    targetGraph: VPIRGraph,
  ): Promise<OrchestrationResult> {
    const proposal = this.proposeModification(description, sourceGraph, targetGraph);
    return this.applyModification(proposal);
  }

  /**
   * Get summary statistics for all proposals processed.
   */
  getStats(): {
    total: number;
    applied: number;
    rejected: number;
    rolledBack: number;
    averageConfidence: number;
  } {
    const applied = this.proposalHistory.filter((p) => p.status === 'applied').length;
    const rejected = this.proposalHistory.filter((p) => p.status === 'rejected').length;
    const rolledBack = this.proposalHistory.filter((p) => p.status === 'rolled_back').length;

    const confidences = this.proposalHistory
      .map((p) => p.confidence?.composite)
      .filter((c): c is number => c !== undefined);
    const averageConfidence = confidences.length > 0
      ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
      : 0;

    return {
      total: this.proposalHistory.length,
      applied,
      rejected,
      rolledBack,
      averageConfidence,
    };
  }
}
