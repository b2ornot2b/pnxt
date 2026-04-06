/**
 * Iterative Refinement Generator — multi-attempt VPIR generation with structured feedback.
 *
 * Wraps the reliable generator with a refinement loop that feeds diagnosis
 * feedback back to the LLM on each retry. Tracks per-attempt metrics and
 * selects the best result across all attempts.
 *
 * Sprint 13 deliverable — Advisory Panel: Sutskever, Pearl, Kay.
 */

import type { VPIRGraph } from '../types/vpir.js';
import type { BridgeDiagnosis } from './bridge-errors.js';
import type { RepairAction } from './bridge-repair.js';
import type { GraphConfidenceScore } from './bridge-confidence.js';
import type { GraphVerificationResult } from '../verification/z3-graph-verifier.js';
import {
  generateReliableVPIRGraph,
  type ReliableGeneratorOptions,
  type ReliableGenerationResult,
  type GenerationStage,
} from './reliable-generator.js';
import { formatDiagnosisForLLM } from './bridge-errors.js';

// ── Types ───────────────────────────────────────────────────────────

/**
 * Feedback strategy for refinement retries.
 * - 'structured': Uses formatDiagnosisForLLM for machine-parseable feedback
 * - 'contextual': Adds contextual explanation with specific fix instructions
 */
export type FeedbackStrategy = 'structured' | 'contextual';

/**
 * Record of a single generation attempt within the refinement loop.
 */
export interface AttemptRecord {
  /** Attempt number (1-indexed). */
  attempt: number;
  /** Whether this attempt produced a valid graph. */
  success: boolean;
  /** Diagnosis from this attempt (if validation failed). */
  diagnosis?: BridgeDiagnosis;
  /** Confidence score (if graph was produced). */
  confidence?: GraphConfidenceScore;
  /** Repairs applied during this attempt. */
  repairs?: RepairAction[];
  /** Z3 verification result (if available). */
  verification?: GraphVerificationResult;
  /** Duration of this attempt in milliseconds. */
  durationMs: number;
  /** Errors from this attempt. */
  errors: string[];
}

/**
 * Options for the iterative refinement generator.
 */
export interface IterativeGenerationOptions extends ReliableGeneratorOptions {
  /** Maximum refinement attempts. Default: 3. */
  maxAttempts?: number;
  /** Feedback strategy for retries. Default: 'structured'. */
  feedbackStrategy?: FeedbackStrategy;
  /** Total timeout for all attempts in milliseconds. Default: 60000. */
  refinementTimeout?: number;
}

/**
 * Result of iterative refinement generation.
 */
export interface IterativeGenerationResult {
  /** Whether generation ultimately succeeded. */
  success: boolean;
  /** The best generated VPIR graph (if any attempt succeeded). */
  graph?: VPIRGraph;
  /** Total number of attempts made. */
  totalAttempts: number;
  /** Per-attempt records for observability. */
  attempts: AttemptRecord[];
  /** Refinement feedback messages sent to the LLM. */
  refinementHistory: string[];
  /** Whether the refinement converged (met confidence threshold). */
  converged: boolean;
  /** Confidence score of the final graph. */
  confidence?: GraphConfidenceScore;
  /** Z3 verification of the final graph. */
  verification?: GraphVerificationResult;
  /** All pipeline stages across all attempts. */
  pipelineStages: GenerationStage[];
  /** Total duration of all attempts. */
  totalDurationMs: number;
}

// ── Feedback Construction ──────────────────────────────────────────

/**
 * Build a refinement prompt from a diagnosis using the structured strategy.
 *
 * Produces a concise, actionable error report for the LLM to use on retry.
 */
export function buildRefinementPrompt(
  diagnosis: BridgeDiagnosis,
  previousErrors: string[],
  strategy: FeedbackStrategy = 'structured',
): string {
  if (strategy === 'contextual') {
    return buildContextualFeedback(diagnosis, previousErrors);
  }
  return buildStructuredFeedback(diagnosis, previousErrors);
}

function buildStructuredFeedback(
  diagnosis: BridgeDiagnosis,
  previousErrors: string[],
): string {
  const diagFeedback = formatDiagnosisForLLM(diagnosis);
  const lines = [
    'Previous generation failed. Here is the structured diagnosis:',
    '',
    diagFeedback,
  ];

  if (previousErrors.length > 0) {
    lines.push('Additional error context:');
    for (const err of previousErrors.slice(-3)) {
      lines.push(`- ${err}`);
    }
  }

  lines.push('');
  lines.push('Please regenerate the VPIR graph addressing all issues above.');

  return lines.join('\n');
}

function buildContextualFeedback(
  diagnosis: BridgeDiagnosis,
  previousErrors: string[],
): string {
  const lines = [
    `Previous attempt had ${diagnosis.errors.length} error(s) and ${diagnosis.warnings.length} warning(s).`,
    '',
  ];

  // Provide specific fix instructions per error
  for (const err of diagnosis.errors) {
    lines.push(`Problem: [${err.code}] ${err.message}`);
    if (err.repairHint) {
      lines.push(`  How to fix: ${err.repairHint}`);
    }
  }

  if (previousErrors.length > 0) {
    lines.push('');
    lines.push('Historical errors from earlier attempts:');
    for (const err of previousErrors.slice(-2)) {
      lines.push(`- ${err}`);
    }
  }

  lines.push('');
  lines.push('Regenerate the complete VPIR graph with these fixes applied.');

  return lines.join('\n');
}

// ── Iterative Generator ────────────────────────────────────────────

/**
 * Generate a VPIR graph with iterative refinement.
 *
 * Wraps generateReliableVPIRGraph in a multi-attempt loop. On each failure,
 * constructs structured feedback from the diagnosis and retries with
 * enriched error context.
 *
 * The best successful result is returned. If no attempt succeeds, the
 * result from the attempt with the highest confidence is returned.
 */
export async function generateWithRefinement(
  taskDescription: string,
  options?: IterativeGenerationOptions,
): Promise<IterativeGenerationResult> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const feedbackStrategy = options?.feedbackStrategy ?? 'structured';
  const refinementTimeout = options?.refinementTimeout ?? 60_000;
  const startTime = performance.now();

  const attemptRecords: AttemptRecord[] = [];
  const refinementHistory: string[] = [];
  const allStages: GenerationStage[] = [];
  let accumulatedErrors: string[] = [];

  let bestResult: ReliableGenerationResult | undefined;
  let bestConfidence = -1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Check timeout
    const elapsed = performance.now() - startTime;
    if (elapsed >= refinementTimeout) {
      break;
    }

    const attemptStart = performance.now();

    // Build the task description with refinement feedback
    let enrichedTask = taskDescription;
    if (attempt > 1 && refinementHistory.length > 0) {
      const feedback = refinementHistory[refinementHistory.length - 1];
      enrichedTask = `${taskDescription}\n\n--- REFINEMENT FEEDBACK ---\n${feedback}`;
    }

    // Run the reliable generator (which has its own internal retry loop)
    // For refinement attempts, use maxRetries=0 to get single-pass results
    // so we can control the feedback loop ourselves
    const reliableOptions: ReliableGeneratorOptions = {
      ...options,
      maxRetries: attempt === 1 ? (options?.maxRetries ?? 1) : 0,
    };

    const result = await generateReliableVPIRGraph(enrichedTask, reliableOptions);
    const attemptDuration = performance.now() - attemptStart;

    // Record this attempt
    const record: AttemptRecord = {
      attempt,
      success: result.success,
      diagnosis: result.diagnosis,
      confidence: result.confidence,
      repairs: result.repairs,
      verification: result.verification,
      durationMs: attemptDuration,
      errors: result.errors,
    };
    attemptRecords.push(record);
    allStages.push(...result.pipelineStages);

    // Track accumulated errors for feedback
    accumulatedErrors = [...accumulatedErrors, ...result.errors];

    if (result.success && result.graph) {
      const confidence = result.confidence?.overall ?? 0;

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestResult = result;
      }

      // Check if we've met the minimum confidence threshold
      const minConfidence = options?.minConfidence ?? 0.6;
      if (confidence >= minConfidence) {
        return {
          success: true,
          graph: result.graph,
          totalAttempts: attempt,
          attempts: attemptRecords,
          refinementHistory,
          converged: true,
          confidence: result.confidence,
          verification: result.verification,
          pipelineStages: allStages,
          totalDurationMs: performance.now() - startTime,
        };
      }
    }

    // Build refinement feedback for next attempt
    if (attempt < maxAttempts) {
      if (result.diagnosis && result.diagnosis.errors.length > 0) {
        const feedback = buildRefinementPrompt(
          result.diagnosis,
          accumulatedErrors,
          feedbackStrategy,
        );
        refinementHistory.push(feedback);
      } else if (result.errors.length > 0) {
        // No structured diagnosis, but we have error strings
        const feedback = [
          'Previous attempt failed with the following errors:',
          ...result.errors.map((e) => `- ${e}`),
          '',
          'Please regenerate the VPIR graph addressing these issues.',
        ].join('\n');
        refinementHistory.push(feedback);
      }
    }
  }

  // All attempts exhausted — return best result or failure
  const totalDuration = performance.now() - startTime;

  if (bestResult?.graph) {
    return {
      success: true,
      graph: bestResult.graph,
      totalAttempts: attemptRecords.length,
      attempts: attemptRecords,
      refinementHistory,
      converged: false,
      confidence: bestResult.confidence,
      verification: bestResult.verification,
      pipelineStages: allStages,
      totalDurationMs: totalDuration,
    };
  }

  return {
    success: false,
    totalAttempts: attemptRecords.length,
    attempts: attemptRecords,
    refinementHistory,
    converged: false,
    pipelineStages: allStages,
    totalDurationMs: totalDuration,
  };
}
