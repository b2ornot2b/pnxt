/**
 * Probabilistic Refinement Pipeline.
 *
 * Replaces binary accept/reject with an iterative refinement loop:
 *   LLM → VPIR → P-ASP scores → Z3 verify → Active Inference patches → repeat
 *
 * The pipeline is opt-in and additive — the existing generateVPIRGraph
 * function is used as-is, wrapped by this pipeline for iterative improvement.
 *
 * Based on:
 * - docs/sprints/sprint-8-neurosymbolic-bridge.md (Deliverable 3.3)
 * - Advisory: Judea Pearl — probabilistic refinement loop
 */

import type { VPIRGraph, VPIRNode } from '../types/vpir.js';
import type { ProgramProperty, ProgramVerificationResult } from '../types/verification.js';
import type {
  NaturalLanguageTask,
  RefinementConfig,
  RefinementResult,
  PipelineContext,
  PatchRecord,
  LLMQuery,
} from '../types/neurosymbolic.js';
import type { VPIRGenerationResult } from '../bridge-grammar/llm-vpir-generator.js';
import type { PASPEngine } from './p-asp.js';
import type { ActiveInferenceEngine } from './active-inference.js';

// ── Default Configuration ────────────────────────────────────────────

const DEFAULT_CONFIG: RefinementConfig = {
  maxIterations: 5,
  convergenceThreshold: 0.85,
  patchBudget: 3,
  timeout: 30000,
};

// ── Verifier Interface ───────────────────────────────────────────────

/**
 * Minimal interface for program property verification.
 * Matches ProgramVerifier API without importing Z3 dependencies.
 */
export interface PropertyVerifier {
  verifyProgramProperty(
    property: ProgramProperty,
  ): Promise<ProgramVerificationResult>;
}

// ── LLM Function Types ──────────────────────────────────────────────

/** Function that generates a VPIR graph from a task description. */
export type LLMGenerator = (
  taskDescription: string,
) => Promise<VPIRGenerationResult>;

/** Function that patches a VPIR graph from a targeted query. */
export type LLMPatcher = (
  query: LLMQuery,
) => Promise<VPIRGenerationResult>;

// ── Refinement Pipeline ──────────────────────────────────────────────

export interface RefinementPipelineOptions {
  /** P-ASP confidence scoring engine. */
  paspEngine: PASPEngine;

  /** Active Inference patch targeting engine. */
  activeInference: ActiveInferenceEngine;

  /** Program property verifier (null if Z3 not available). */
  verifier: PropertyVerifier | null;

  /** Function to generate initial VPIR graph from task description. */
  llmGenerator: LLMGenerator;

  /** Function to patch a specific node via LLM. */
  llmPatcher: LLMPatcher;

  /** Default properties to verify on every graph. */
  defaultProperties?: ProgramProperty[];
}

/**
 * Probabilistic refinement pipeline for VPIR graph generation.
 *
 * Iteratively improves LLM-generated VPIR graphs via:
 * 1. P-ASP confidence scoring
 * 2. Z3 formal verification
 * 3. Active Inference targeted patching
 */
export class RefinementPipeline {
  private readonly paspEngine: PASPEngine;
  private readonly activeInference: ActiveInferenceEngine;
  private readonly verifier: PropertyVerifier | null;
  private readonly llmGenerator: LLMGenerator;
  private readonly llmPatcher: LLMPatcher;
  private readonly defaultProperties: ProgramProperty[];

  constructor(options: RefinementPipelineOptions) {
    this.paspEngine = options.paspEngine;
    this.activeInference = options.activeInference;
    this.verifier = options.verifier;
    this.llmGenerator = options.llmGenerator;
    this.llmPatcher = options.llmPatcher;
    this.defaultProperties = options.defaultProperties ?? [];
  }

  /**
   * Run the full refinement loop on a natural language task.
   *
   * 1. LLM generates initial VPIR graph
   * 2. P-ASP assigns confidence scores per node
   * 3. Z3 attempts verification (if verifier available)
   * 4. If failed: Active Inference patches low-confidence nodes
   * 5. Repeat until convergence or max iterations
   */
  async refine(
    task: NaturalLanguageTask,
    config?: Partial<RefinementConfig>,
  ): Promise<RefinementResult> {
    const cfg: RefinementConfig = { ...DEFAULT_CONFIG, ...config };
    const startTime = Date.now();

    // Reset Active Inference state for this run
    this.activeInference.reset();

    // Step 1: Generate initial VPIR graph
    const genResult = await this.llmGenerator(task.description);

    if (!genResult.success || !genResult.graph) {
      return this.emptyResult(cfg);
    }

    let graph = genResult.graph;
    const properties = task.constraints ?? this.defaultProperties;
    const patchHistory: PatchRecord[] = [];
    let finalVerificationResults: ProgramVerificationResult[] = [];

    // Step 2-5: Iterative refinement loop
    for (let iteration = 1; iteration <= cfg.maxIterations; iteration++) {
      // Check timeout
      if (Date.now() - startTime > cfg.timeout) {
        return this.buildResult(
          graph, patchHistory, finalVerificationResults, iteration - 1, false,
        );
      }

      // Score via P-ASP
      const context: PipelineContext = {
        graph,
        verificationResults: finalVerificationResults.length > 0
          ? finalVerificationResults
          : undefined,
      };
      const confidenceMap = this.paspEngine.scoreNodes(graph, context);

      // Record for oscillation detection
      this.activeInference.recordConfidence(confidenceMap);

      // Check convergence on confidence
      if (confidenceMap.graphConfidence >= cfg.convergenceThreshold) {
        // Verify with Z3 if available
        finalVerificationResults = await this.verifyAll(graph, properties);
        const allPassed = finalVerificationResults.every((r) => r.verified);

        if (allPassed || finalVerificationResults.length === 0) {
          return this.buildResult(
            graph, patchHistory, finalVerificationResults, iteration, true,
          );
        }
      }

      // Verify with Z3 to get failed properties
      if (finalVerificationResults.length === 0 && properties.length > 0) {
        finalVerificationResults = await this.verifyAll(graph, properties);
      }

      const failedProperties = finalVerificationResults.filter((r) => !r.verified);

      // If all pass, we're converged
      if (failedProperties.length === 0 && confidenceMap.graphConfidence >= cfg.convergenceThreshold) {
        return this.buildResult(
          graph, patchHistory, finalVerificationResults, iteration, true,
        );
      }

      // Active Inference: identify patch targets
      const targets = this.activeInference.identifyPatchTargets(
        graph, failedProperties, confidenceMap, cfg.patchBudget,
      );

      // If no targets (oscillation or no failing nodes in graph), accept best-so-far
      if (targets.length === 0) {
        return this.buildResult(
          graph, patchHistory, finalVerificationResults, iteration, false,
        );
      }

      // Patch each target
      for (const target of targets) {
        // Check timeout before each patch
        if (Date.now() - startTime > cfg.timeout) {
          return this.buildResult(
            graph, patchHistory, finalVerificationResults, iteration, false,
          );
        }

        const query = this.activeInference.generatePatchQuery(target, graph);
        const patchResult = await this.llmPatcher(query);

        if (patchResult.success && patchResult.graph) {
          // Extract the replacement node from the patch result
          const replacement = this.extractReplacementNode(
            patchResult.graph, target.nodeId,
          );

          if (replacement) {
            const previousConfidence = confidenceMap.graphConfidence;
            const patched = this.activeInference.applyPatch(graph, target, replacement);
            graph = patched.graph;

            // Re-score to get new confidence
            const newContext: PipelineContext = { graph };
            const newMap = this.paspEngine.scoreNodes(graph, newContext);

            patchHistory.push({
              target,
              replacement,
              iteration,
              confidenceDelta: newMap.graphConfidence - previousConfidence,
            });
          }
        }
      }

      // Clear verification results so they're recomputed next iteration
      finalVerificationResults = [];
    }

    // Max iterations exhausted
    finalVerificationResults = await this.verifyAll(graph, properties);
    const finalContext: PipelineContext = { graph, verificationResults: finalVerificationResults };
    const finalMap = this.paspEngine.scoreNodes(graph, finalContext);
    const converged = finalMap.graphConfidence >= cfg.convergenceThreshold
      && finalVerificationResults.every((r) => r.verified);

    return this.buildResult(
      graph, patchHistory, finalVerificationResults, cfg.maxIterations, converged,
    );
  }

  // ── Private Helpers ──────────────────────────────────────────────

  private async verifyAll(
    _graph: VPIRGraph,
    properties: ProgramProperty[],
  ): Promise<ProgramVerificationResult[]> {
    if (!this.verifier || properties.length === 0) return [];

    const results: ProgramVerificationResult[] = [];
    for (const prop of properties) {
      results.push(await this.verifier.verifyProgramProperty(prop));
    }
    return results;
  }

  private extractReplacementNode(
    patchGraph: VPIRGraph,
    targetNodeId: string,
  ): VPIRNode | null {
    // Try to find a node with the target ID
    const exact = patchGraph.nodes.get(targetNodeId);
    if (exact) return exact;

    // Fall back to first node in the patch graph
    const first = patchGraph.nodes.values().next();
    if (!first.done) return first.value;

    return null;
  }

  private buildResult(
    graph: VPIRGraph,
    patchHistory: PatchRecord[],
    verificationResults: ProgramVerificationResult[],
    iterations: number,
    converged: boolean,
  ): RefinementResult {
    const context: PipelineContext = { graph, verificationResults };
    const finalMap = this.paspEngine.scoreNodes(graph, context);

    return {
      graph,
      finalConfidence: finalMap.graphConfidence,
      iterations,
      patchHistory,
      verificationResults,
      converged,
    };
  }

  private emptyResult(_cfg: RefinementConfig): RefinementResult {
    const emptyGraph: VPIRGraph = {
      id: 'empty',
      name: 'Empty (generation failed)',
      nodes: new Map(),
      roots: [],
      terminals: [],
      createdAt: new Date().toISOString(),
    };

    return {
      graph: emptyGraph,
      finalConfidence: 0,
      iterations: 0,
      patchHistory: [],
      verificationResults: [],
      converged: false,
    };
  }
}
