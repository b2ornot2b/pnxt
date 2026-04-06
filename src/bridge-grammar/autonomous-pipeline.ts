/**
 * Autonomous Pipeline Orchestrator — end-to-end LLM-native programming.
 *
 * Takes a natural language task description and produces a verified,
 * categorized, executed result — fully autonomous. This completes M3
 * (LLM-Native Programming): NL → VPIR → Z3 → HoTT → DPN → Result.
 *
 * Sprint 13 deliverable — Advisory Panel: Sutskever, Pearl, Kay.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { VPIRGraph } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import type { GraphConfidenceScore } from './bridge-confidence.js';
import type { GraphVerificationResult } from '../verification/z3-graph-verifier.js';
import type { Z3Context } from '../verification/z3-invariants.js';
import type { CategoryValidationResult } from '../types/hott.js';
import { ToolRegistry, createStandardRegistry } from '../aci/tool-registry.js';
import { TaskRunner, type TaskExecutionResult } from '../aci/task-runner.js';
import {
  generateWithRefinement,
  type IterativeGenerationResult,
} from './iterative-generator.js';
import {
  applyNeurosymbolicRefinement,
  type NeurosymbolicResult,
} from './neurosymbolic-bridge.js';
import { vpirGraphToCategory, validateCategoricalStructure } from '../hott/vpir-bridge.js';

// ── Types ───────────────────────────────────────────────────────────

/**
 * Pipeline stage names for the autonomous pipeline.
 */
export type PipelineStageName =
  | 'generate'
  | 'refine'
  | 'verify'
  | 'categorize'
  | 'execute';

/**
 * Trace for a single pipeline stage.
 */
export interface PipelineStageTrace {
  /** Stage name. */
  stage: PipelineStageName;
  /** Duration in milliseconds. */
  durationMs: number;
  /** Whether the stage completed successfully. */
  status: 'success' | 'failed' | 'skipped';
  /** Details about the stage outcome. */
  details?: string;
}

/**
 * HoTT categorization result.
 */
export interface CategorizationResult {
  /** Category validation result. */
  validation: CategoryValidationResult;
  /** Number of objects in the category. */
  objectCount: number;
  /** Number of morphisms in the category. */
  morphismCount: number;
}

/**
 * Options for the autonomous pipeline.
 */
export interface AutonomousPipelineOptions {
  /** Custom Anthropic client (for testing/DI). */
  llmClient?: Anthropic;
  /** Tool registry for handler resolution. */
  toolRegistry?: ToolRegistry;
  /** Z3 context for formal verification. */
  z3Context?: Z3Context;
  /** IFC security label for generated nodes. */
  securityLabel?: SecurityLabel;
  /** Maximum generation attempts. Default: 3. */
  maxGenerationAttempts?: number;
  /** Minimum confidence score. Default: 0.6. */
  minConfidence?: number;
  /** Enable neurosymbolic refinement. Default: true. */
  enableNeurosymbolic?: boolean;
  /** Enable HoTT categorization. Default: true. */
  enableHoTTCategorization?: boolean;
  /** Enable Z3 verification. Default: true. */
  enableZ3Verification?: boolean;
  /** Enable DPN execution. Default: true. */
  enableExecution?: boolean;
  /** Total timeout in milliseconds. Default: 120000. */
  timeout?: number;
}

/**
 * Complete result from the autonomous pipeline.
 */
export interface AutonomousPipelineResult {
  /** The original task description. */
  task: string;
  /** Whether the pipeline succeeded end-to-end. */
  success: boolean;
  /** The generated VPIR graph (if generation succeeded). */
  graph?: VPIRGraph;
  /** Confidence score of the final graph. */
  confidence?: GraphConfidenceScore;
  /** Z3 verification result (if enabled). */
  verification?: GraphVerificationResult;
  /** HoTT categorization result (if enabled). */
  categorization?: CategorizationResult;
  /** DPN execution result (if enabled). */
  execution?: TaskExecutionResult;
  /** Detailed per-stage traces. */
  pipelineStages: PipelineStageTrace[];
  /** Total pipeline duration in milliseconds. */
  totalDurationMs: number;
  /** Errors from any stage. */
  errors: string[];
  /** Generation details (for observability). */
  generationResult?: IterativeGenerationResult;
  /** Neurosymbolic refinement details (for observability). */
  neurosymbolicResult?: NeurosymbolicResult;
}

// ── Autonomous Pipeline ────────────────────────────────────────────

/**
 * Execute the full autonomous pipeline: NL → VPIR → Z3 → HoTT → DPN → Result.
 *
 * This is the "one function" that completes M3 (LLM-Native Programming).
 * Given a natural language task description, it:
 *
 * 1. **Generates** a VPIR graph via iterative refinement (Bridge Grammar + LLM)
 * 2. **Refines** the graph via neurosymbolic analysis (P-ASP + Active Inference)
 * 3. **Verifies** formal properties via Z3 (acyclicity, IFC, handler trust)
 * 4. **Categorizes** the graph into HoTT categorical structure
 * 5. **Executes** the graph through the DPN runtime (actor message-passing)
 *
 * Each stage is optional, gated by configuration, and fully traced.
 */
export async function executeAutonomousPipeline(
  task: string,
  options?: AutonomousPipelineOptions,
): Promise<AutonomousPipelineResult> {
  const startTime = performance.now();
  const stages: PipelineStageTrace[] = [];
  const errors: string[] = [];

  const registry = options?.toolRegistry ?? createStandardRegistry();
  const enableNeurosymbolic = options?.enableNeurosymbolic ?? true;
  const enableHoTT = options?.enableHoTTCategorization ?? true;
  const enableZ3 = options?.enableZ3Verification ?? true;
  const enableExec = options?.enableExecution ?? true;
  const timeout = options?.timeout ?? 120_000;

  let graph: VPIRGraph | undefined;
  let confidence: GraphConfidenceScore | undefined;
  let verification: GraphVerificationResult | undefined;
  let categorization: CategorizationResult | undefined;
  let execution: TaskExecutionResult | undefined;
  let generationResult: IterativeGenerationResult | undefined;
  let neurosymbolicResult: NeurosymbolicResult | undefined;

  // ── Stage 1: Generate ──
  const genStart = performance.now();
  try {
    generationResult = await generateWithRefinement(task, {
      client: options?.llmClient,
      toolRegistry: registry,
      z3Context: enableZ3 ? options?.z3Context : undefined,
      securityLabel: options?.securityLabel,
      maxAttempts: options?.maxGenerationAttempts ?? 3,
      minConfidence: options?.minConfidence ?? 0.6,
      refinementTimeout: Math.min(timeout * 0.5, 60_000),
    });

    if (generationResult.success && generationResult.graph) {
      graph = generationResult.graph;
      confidence = generationResult.confidence;

      stages.push({
        stage: 'generate',
        durationMs: performance.now() - genStart,
        status: 'success',
        details: `Generated in ${generationResult.totalAttempts} attempt(s), confidence: ${confidence?.overall.toFixed(3) ?? 'N/A'}`,
      });
    } else {
      stages.push({
        stage: 'generate',
        durationMs: performance.now() - genStart,
        status: 'failed',
        details: `Failed after ${generationResult.totalAttempts} attempt(s)`,
      });
      errors.push(...(generationResult.attempts.flatMap((a) => a.errors)));

      return buildResult(task, false, stages, errors, startTime, {
        generationResult,
      });
    }
  } catch (err) {
    stages.push({
      stage: 'generate',
      durationMs: performance.now() - genStart,
      status: 'failed',
      details: String(err),
    });
    errors.push(`Generation error: ${String(err)}`);

    return buildResult(task, false, stages, errors, startTime, {});
  }

  // Check timeout
  if (performance.now() - startTime >= timeout) {
    return buildResult(task, false, stages, ['Pipeline timeout after generation'], startTime, {
      graph, confidence, generationResult,
    });
  }

  // ── Stage 2: Neurosymbolic Refine ──
  if (enableNeurosymbolic && graph) {
    const refineStart = performance.now();
    try {
      neurosymbolicResult = await applyNeurosymbolicRefinement(graph, {
        toolRegistry: registry,
        z3Context: enableZ3 ? options?.z3Context : undefined,
        convergenceThreshold: 0.85,
        maxIterations: 5,
      });

      graph = neurosymbolicResult.graph;

      stages.push({
        stage: 'refine',
        durationMs: performance.now() - refineStart,
        status: 'success',
        details: `${neurosymbolicResult.patchesApplied.length} patch(es), confidence: ${neurosymbolicResult.initialConfidence.toFixed(3)} → ${neurosymbolicResult.finalConfidence.toFixed(3)}`,
      });
    } catch (err) {
      stages.push({
        stage: 'refine',
        durationMs: performance.now() - refineStart,
        status: 'failed',
        details: String(err),
      });
      errors.push(`Refinement error: ${String(err)}`);
      // Continue with unrefined graph
    }
  } else {
    stages.push({
      stage: 'refine',
      durationMs: 0,
      status: 'skipped',
      details: enableNeurosymbolic ? 'No graph available' : 'Disabled',
    });
  }

  // Check timeout
  if (performance.now() - startTime >= timeout) {
    return buildResult(task, false, stages, ['Pipeline timeout after refinement'], startTime, {
      graph, confidence, generationResult, neurosymbolicResult,
    });
  }

  // ── Stage 3: Z3 Verify ──
  if (enableZ3 && options?.z3Context && graph) {
    const verifyStart = performance.now();
    try {
      const { verifyGraphProperties } = await import('../verification/z3-graph-verifier.js');
      verification = await verifyGraphProperties(graph, options.z3Context, registry);

      stages.push({
        stage: 'verify',
        durationMs: performance.now() - verifyStart,
        status: verification.verified ? 'success' : 'failed',
        details: verification.verified
          ? `All ${verification.properties.length} properties verified`
          : `Violations: ${verification.properties.filter((p) => p.status === 'violated').map((p) => p.name).join(', ')}`,
      });

      if (!verification.verified) {
        const violations = verification.properties
          .filter((p) => p.status === 'violated')
          .map((p) => `${p.name}: ${p.details}`);
        errors.push(...violations.map((v) => `Z3 violation: ${v}`));
      }
    } catch (err) {
      stages.push({
        stage: 'verify',
        durationMs: performance.now() - verifyStart,
        status: 'failed',
        details: String(err),
      });
      errors.push(`Verification error: ${String(err)}`);
    }
  } else {
    stages.push({
      stage: 'verify',
      durationMs: 0,
      status: 'skipped',
      details: !enableZ3 ? 'Disabled' : !options?.z3Context ? 'No Z3 context' : 'No graph',
    });
  }

  // ── Stage 4: HoTT Categorize ──
  if (enableHoTT && graph) {
    const catStart = performance.now();
    try {
      const category = vpirGraphToCategory(graph);
      const validation = validateCategoricalStructure(graph);

      categorization = {
        validation,
        objectCount: category.objects.size,
        morphismCount: category.morphisms.size,
      };

      stages.push({
        stage: 'categorize',
        durationMs: performance.now() - catStart,
        status: validation.valid ? 'success' : 'failed',
        details: `${category.objects.size} objects, ${category.morphisms.size} morphisms${validation.valid ? '' : ` — ${validation.violations.length} violation(s)`}`,
      });

      if (!validation.valid) {
        errors.push(
          ...validation.violations.map((v) => `HoTT violation [${v.law}]: ${v.message}`),
        );
      }
    } catch (err) {
      stages.push({
        stage: 'categorize',
        durationMs: performance.now() - catStart,
        status: 'failed',
        details: String(err),
      });
      errors.push(`Categorization error: ${String(err)}`);
    }
  } else {
    stages.push({
      stage: 'categorize',
      durationMs: 0,
      status: 'skipped',
      details: !enableHoTT ? 'Disabled' : 'No graph',
    });
  }

  // Check timeout before execution
  if (performance.now() - startTime >= timeout) {
    return buildResult(task, false, stages, ['Pipeline timeout before execution'], startTime, {
      graph, confidence, verification, categorization, generationResult, neurosymbolicResult,
    });
  }

  // ── Stage 5: DPN Execute ──
  if (enableExec && graph) {
    const execStart = performance.now();
    try {
      const runner = new TaskRunner({
        toolRegistry: registry,
        securityLabel: options?.securityLabel,
        timeout: Math.max(1000, timeout - (performance.now() - startTime)),
      });

      execution = await runner.run(graph);

      stages.push({
        stage: 'execute',
        durationMs: performance.now() - execStart,
        status: execution.success ? 'success' : 'failed',
        details: execution.success
          ? `Completed in ${execution.durationMs}ms`
          : `Failed: ${execution.errors.join('; ')}`,
      });

      if (!execution.success) {
        errors.push(...execution.errors.map((e) => `Execution: ${e}`));
      }
    } catch (err) {
      stages.push({
        stage: 'execute',
        durationMs: performance.now() - execStart,
        status: 'failed',
        details: String(err),
      });
      errors.push(`Execution error: ${String(err)}`);
    }
  } else {
    stages.push({
      stage: 'execute',
      durationMs: 0,
      status: 'skipped',
      details: !enableExec ? 'Disabled' : 'No graph',
    });
  }

  // ── Determine overall success ──
  const generationOk = !!graph;
  const verificationOk = !enableZ3 || !options?.z3Context || verification?.verified !== false;
  const categorizationOk = !enableHoTT || categorization?.validation.valid !== false;
  const executionOk = !enableExec || execution?.success !== false;
  const success = generationOk && verificationOk && categorizationOk && executionOk;

  return buildResult(task, success, stages, errors, startTime, {
    graph,
    confidence,
    verification,
    categorization,
    execution,
    generationResult,
    neurosymbolicResult,
  });
}

// ── Helpers ─────────────────────────────────────────────────────────

function buildResult(
  task: string,
  success: boolean,
  stages: PipelineStageTrace[],
  errors: string[],
  startTime: number,
  parts: {
    graph?: VPIRGraph;
    confidence?: GraphConfidenceScore;
    verification?: GraphVerificationResult;
    categorization?: CategorizationResult;
    execution?: TaskExecutionResult;
    generationResult?: IterativeGenerationResult;
    neurosymbolicResult?: NeurosymbolicResult;
  },
): AutonomousPipelineResult {
  return {
    task,
    success,
    graph: parts.graph,
    confidence: parts.confidence,
    verification: parts.verification,
    categorization: parts.categorization,
    execution: parts.execution,
    pipelineStages: stages,
    totalDurationMs: performance.now() - startTime,
    errors,
    generationResult: parts.generationResult,
    neurosymbolicResult: parts.neurosymbolicResult,
  };
}
