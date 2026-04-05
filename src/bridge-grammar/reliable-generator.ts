/**
 * Reliable VPIR Generation Pipeline — orchestrates error recovery, repair, and verification.
 *
 * Replaces the simple retry loop with a multi-stage pipeline:
 * NL → LLM → diagnose → auto-repair → re-validate → confidence score → Z3 verify → result
 *
 * Each stage is traced with timing, enabling observability and debugging
 * of the generation pipeline for the autonomous M3 milestone.
 *
 * Sprint 12 deliverable — Advisory Panel: Sutskever, Pearl, de Moura.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { VPIRGraph } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import { parseVPIRGraph } from './schema-validator.js';
import { ToolRegistry, createStandardRegistry } from '../aci/tool-registry.js';
import { buildTaskAwareSystemPrompt, buildTaskAwareVPIRTool } from './task-vpir-generator.js';
import {
  type BridgeDiagnosis,
  diagnose,
  formatDiagnosisForLLM,
} from './bridge-errors.js';
import { type RepairAction, repairBridgeOutput } from './bridge-repair.js';
import { type GraphConfidenceScore, scoreGraphConfidence } from './bridge-confidence.js';
import type { GraphVerificationResult } from '../verification/z3-graph-verifier.js';
import type { Z3Context } from '../verification/z3-invariants.js';

// ── Types ───────────────────────────────────────────────────────────

/**
 * A single pipeline stage trace.
 */
export interface GenerationStage {
  /** Stage name. */
  stage: string;
  /** Duration in milliseconds. */
  durationMs: number;
  /** Whether the stage passed. */
  passed: boolean;
  /** Optional details about the stage outcome. */
  details?: string;
}

/**
 * Enhanced generation result with full pipeline telemetry.
 */
export interface ReliableGenerationResult {
  /** Whether generation ultimately succeeded. */
  success: boolean;
  /** The generated VPIR graph (if successful). */
  graph?: VPIRGraph;
  /** Number of LLM generation attempts. */
  attempts: number;
  /** All errors from failed attempts. */
  errors: string[];
  /** Raw LLM response (last attempt, for debugging). */
  rawResponse?: string;
  /** Diagnosis from the last attempt. */
  diagnosis?: BridgeDiagnosis;
  /** Repairs applied in the last attempt. */
  repairs?: RepairAction[];
  /** Confidence score of the final graph. */
  confidence?: GraphConfidenceScore;
  /** Z3 verification result (if Z3 context was provided). */
  verification?: GraphVerificationResult;
  /** Detailed pipeline stage traces. */
  pipelineStages: GenerationStage[];
}

/**
 * Options for the reliable generator.
 */
export interface ReliableGeneratorOptions {
  /** Claude model to use. Default: 'claude-sonnet-4-20250514'. */
  model?: string;
  /** Maximum retry attempts. Default: 3. */
  maxRetries?: number;
  /** IFC security label for generated nodes. */
  securityLabel?: SecurityLabel;
  /** Temperature for generation. Default: 0.0. */
  temperature?: number;
  /** Maximum tokens. Default: 4096. */
  maxTokens?: number;
  /** Custom Anthropic client (for testing/DI). */
  client?: Anthropic;
  /** Tool registry for handler awareness. Uses standard if not provided. */
  toolRegistry?: ToolRegistry;
  /** Z3 context for formal verification. Skip Z3 if not provided. */
  z3Context?: Z3Context;
  /** Minimum confidence score to accept. Default: 0.6. */
  minConfidence?: number;
  /** Whether to attempt auto-repair on failures. Default: true. */
  enableRepair?: boolean;
}

// ── Pipeline Implementation ─────────────────────────────────────────

/**
 * Generate a reliable VPIR graph with full error recovery pipeline.
 *
 * Pipeline per attempt:
 * 1. LLM generation via Bridge Grammar
 * 2. Schema validation + diagnosis
 * 3. Auto-repair (if validation fails and repair is enabled)
 * 4. Re-validation after repair
 * 5. Handler coverage check
 * 6. Confidence scoring
 * 7. Z3 pre-verification (if context provided)
 *
 * On failure: structured feedback → retry with enriched error context.
 */
export async function generateReliableVPIRGraph(
  taskDescription: string,
  options?: ReliableGeneratorOptions,
): Promise<ReliableGenerationResult> {
  const model = options?.model ?? 'claude-sonnet-4-20250514';
  const maxRetries = options?.maxRetries ?? 3;
  const temperature = options?.temperature ?? 0.0;
  const maxTokens = options?.maxTokens ?? 4096;
  const minConfidence = options?.minConfidence ?? 0.6;
  const enableRepair = options?.enableRepair ?? true;

  const client = options?.client ?? new Anthropic();
  const registry = options?.toolRegistry ?? createStandardRegistry();

  const registrations = registry.listRegistrations();
  const systemPrompt = buildTaskAwareSystemPrompt(registrations);
  const tool = buildTaskAwareVPIRTool(registry, options?.securityLabel);

  const allErrors: string[] = [];
  const allStages: GenerationStage[] = [];
  let lastDiagnosis: BridgeDiagnosis | undefined;
  let lastRepairs: RepairAction[] | undefined;
  let rawResponse: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // ── Stage 1: LLM Generation ──
    const genStart = performance.now();
    let toolInput: unknown;
    try {
      const messages = buildMessages(taskDescription, attempt > 0 ? allErrors : undefined);
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'emit_vpir_graph' },
        messages,
      });

      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );

      if (!toolUse) {
        const textBlock = response.content.find(
          (block): block is Anthropic.TextBlock => block.type === 'text',
        );
        rawResponse = textBlock?.text;

        allStages.push({
          stage: 'llm_generation',
          durationMs: performance.now() - genStart,
          passed: false,
          details: 'No tool_use block in response',
        });
        allErrors.push(`Attempt ${attempt + 1}: No tool_use block in response`);
        continue;
      }

      toolInput = toolUse.input;
      rawResponse = JSON.stringify(toolInput);

      allStages.push({
        stage: 'llm_generation',
        durationMs: performance.now() - genStart,
        passed: true,
      });
    } catch (error) {
      allStages.push({
        stage: 'llm_generation',
        durationMs: performance.now() - genStart,
        passed: false,
        details: String(error),
      });
      allErrors.push(`Attempt ${attempt + 1}: LLM API error — ${String(error)}`);
      continue;
    }

    // Apply security label override
    if (options?.securityLabel) {
      toolInput = applySecurityLabel(toolInput, options.securityLabel);
    }

    // ── Stage 2: Schema Validation + Diagnosis ──
    const valStart = performance.now();
    let validationResult = parseVPIRGraph(toolInput);

    if (!validationResult.valid) {
      const currentDiagnosis = diagnose(validationResult.errors, {
        rawOutput: rawResponse,
      });
      lastDiagnosis = currentDiagnosis;

      allStages.push({
        stage: 'schema_validation',
        durationMs: performance.now() - valStart,
        passed: false,
        details: currentDiagnosis.summary,
      });

      // ── Stage 3: Auto-Repair ──
      if (enableRepair && currentDiagnosis.repairable) {
        const repairStart = performance.now();
        const repairResult = repairBridgeOutput(toolInput, currentDiagnosis);
        lastRepairs = repairResult.appliedRepairs;

        allStages.push({
          stage: 'auto_repair',
          durationMs: performance.now() - repairStart,
          passed: repairResult.appliedRepairs.length > 0,
          details: `${repairResult.appliedRepairs.length} repair(s) applied`,
        });

        // ── Stage 4: Re-validation after repair ──
        const revalStart = performance.now();
        validationResult = parseVPIRGraph(repairResult.repaired);

        if (!validationResult.valid) {
          const revalDiagnosis = diagnose(validationResult.errors);
          allStages.push({
            stage: 'revalidation',
            durationMs: performance.now() - revalStart,
            passed: false,
            details: revalDiagnosis.summary,
          });

          // Use enhanced feedback for retry
          const feedback = formatDiagnosisForLLM(revalDiagnosis);
          allErrors.push(`Attempt ${attempt + 1}: Post-repair validation failed — ${feedback}`);
          continue;
        }

        allStages.push({
          stage: 'revalidation',
          durationMs: performance.now() - revalStart,
          passed: true,
        });
      } else {
        // No repair possible — use diagnosis for retry feedback
        const feedback = formatDiagnosisForLLM(currentDiagnosis);
        allErrors.push(`Attempt ${attempt + 1}: Validation failed — ${feedback}`);
        continue;
      }
    } else {
      allStages.push({
        stage: 'schema_validation',
        durationMs: performance.now() - valStart,
        passed: true,
      });
    }

    const graph = validationResult.graph!;

    // ── Stage 5: Handler Coverage Check ──
    const handlerStart = performance.now();
    const discovery = registry.discoverTools(graph);
    if (!discovery.allAvailable) {
      lastDiagnosis = diagnose([], {
        missingHandlers: discovery.missing,
        availableHandlers: registrations.map((r) => r.name),
      });

      allStages.push({
        stage: 'handler_check',
        durationMs: performance.now() - handlerStart,
        passed: false,
        details: `Missing handlers: ${discovery.missing.join(', ')}`,
      });
      allErrors.push(
        `Attempt ${attempt + 1}: Missing handlers — ${discovery.missing.join(', ')}. Available: ${registrations.map((r) => r.name).join(', ')}`,
      );
      continue;
    }

    allStages.push({
      stage: 'handler_check',
      durationMs: performance.now() - handlerStart,
      passed: true,
    });

    // ── Stage 6: Confidence Scoring ──
    const confStart = performance.now();
    const confidence = scoreGraphConfidence(graph, registry);

    allStages.push({
      stage: 'confidence_scoring',
      durationMs: performance.now() - confStart,
      passed: confidence.overall >= minConfidence,
      details: `Score: ${confidence.overall.toFixed(3)} (min: ${minConfidence})`,
    });

    if (confidence.overall < minConfidence) {
      allErrors.push(
        `Attempt ${attempt + 1}: Confidence too low (${confidence.overall.toFixed(3)} < ${minConfidence}). Low-confidence nodes: ${confidence.lowConfidenceNodes.join(', ')}`,
      );
      continue;
    }

    // ── Stage 7: Z3 Pre-Verification ──
    let verification: GraphVerificationResult | undefined;
    if (options?.z3Context) {
      const z3Start = performance.now();
      const { verifyGraphProperties } = await import('../verification/z3-graph-verifier.js');
      verification = await verifyGraphProperties(graph, options.z3Context, registry);

      allStages.push({
        stage: 'z3_verification',
        durationMs: performance.now() - z3Start,
        passed: verification.verified,
        details: verification.verified
          ? 'All properties verified'
          : `Violations: ${verification.properties.filter((p) => p.status === 'violated').map((p) => p.name).join(', ')}`,
      });

      if (!verification.verified) {
        const violatedProps = verification.properties
          .filter((p) => p.status === 'violated')
          .map((p) => `${p.name}: ${p.details}`)
          .join('; ');
        allErrors.push(`Attempt ${attempt + 1}: Z3 verification failed — ${violatedProps}`);
        continue;
      }
    }

    // ── All stages passed ──
    return {
      success: true,
      graph,
      attempts: attempt + 1,
      errors: [],
      rawResponse,
      diagnosis: lastDiagnosis,
      repairs: lastRepairs,
      confidence,
      verification,
      pipelineStages: allStages,
    };
  }

  // All attempts exhausted
  return {
    success: false,
    attempts: maxRetries + 1,
    errors: allErrors,
    rawResponse,
    diagnosis: lastDiagnosis,
    repairs: lastRepairs,
    pipelineStages: allStages,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function buildMessages(
  taskDescription: string,
  previousErrors?: string[],
): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];

  if (previousErrors && previousErrors.length > 0) {
    messages.push({
      role: 'user',
      content: `Create a VPIR task graph for:\n\n${taskDescription}`,
    });
    messages.push({
      role: 'assistant',
      content: 'I\'ll generate the VPIR task graph. Let me try again with corrections.',
    });
    messages.push({
      role: 'user',
      content: `The previous attempt had errors:\n${previousErrors.join('\n')}\n\nPlease fix these issues and regenerate the VPIR graph.`,
    });
  } else {
    messages.push({
      role: 'user',
      content: `Create a VPIR task graph for:\n\n${taskDescription}`,
    });
  }

  return messages;
}

function applySecurityLabel(
  input: unknown,
  securityLabel: SecurityLabel,
): unknown {
  if (typeof input !== 'object' || input === null) return input;

  const obj = input as Record<string, unknown>;
  if (Array.isArray(obj.nodes)) {
    obj.nodes = (obj.nodes as Record<string, unknown>[]).map((node) => ({
      ...node,
      label: {
        owner: securityLabel.owner,
        trustLevel: securityLabel.trustLevel,
        classification: securityLabel.classification,
        createdAt: securityLabel.createdAt,
      },
    }));
  }
  return obj;
}
