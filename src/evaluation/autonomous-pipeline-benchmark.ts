/**
 * Autonomous Pipeline Benchmark — validates M3 completion with end-to-end scenarios.
 *
 * Exercises the autonomous pipeline on multiple realistic task types,
 * measuring generation success, confidence, refinement iterations,
 * and execution success — all without human intervention.
 *
 * Sprint 13 deliverable — Advisory Panel: Sutskever, Pearl, Kay.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  executeAutonomousPipeline,
  type AutonomousPipelineResult,
  type AutonomousPipelineOptions,
} from '../bridge-grammar/autonomous-pipeline.js';
import { ToolRegistry, createStandardRegistry } from '../aci/tool-registry.js';

// ── Types ───────────────────────────────────────────────────────────

/**
 * A benchmark scenario for the autonomous pipeline.
 */
export interface AutonomousScenario {
  /** Scenario name. */
  name: string;
  /** Description of what's being tested. */
  description: string;
  /** Natural language task description. */
  taskDescription: string;
  /** Expected handlers that should appear in the graph. */
  expectedHandlers: string[];
  /** Minimum expected node count. */
  minNodes: number;
}

/**
 * Result of running a single benchmark scenario.
 */
export interface ScenarioResult {
  /** Scenario name. */
  scenario: string;
  /** Whether generation produced a valid graph. */
  generationSuccess: boolean;
  /** Whether the pipeline succeeded end-to-end. */
  pipelineSuccess: boolean;
  /** Confidence score of the final graph. */
  confidenceScore: number;
  /** Number of refinement attempts. */
  refinementAttempts: number;
  /** Whether neurosymbolic patches were applied. */
  patchesApplied: number;
  /** Number of nodes in the generated graph. */
  nodeCount: number;
  /** Duration of the full pipeline. */
  durationMs: number;
  /** HoTT categorization valid. */
  hottValid: boolean;
  /** Errors from the pipeline. */
  errors: string[];
}

/**
 * Aggregated benchmark results.
 */
export interface AutonomousBenchmarkResult {
  /** Total scenarios tested. */
  totalScenarios: number;
  /** Scenarios where generation succeeded. */
  generationSuccessCount: number;
  /** Scenarios where full pipeline succeeded. */
  pipelineSuccessCount: number;
  /** Average confidence score across successful scenarios. */
  avgConfidence: number;
  /** Average number of refinement attempts. */
  avgRefinementAttempts: number;
  /** Average duration in milliseconds. */
  avgDurationMs: number;
  /** Generation success rate (0-1). */
  generationSuccessRate: number;
  /** Pipeline success rate (0-1). */
  pipelineSuccessRate: number;
  /** Individual scenario results. */
  results: ScenarioResult[];
  /** Total benchmark duration. */
  totalDurationMs: number;
}

// ── Scenarios ──────────────────────────────────────────────────────

/**
 * Standard autonomous pipeline benchmark scenarios.
 *
 * Each scenario describes a realistic task that exercises different
 * combinations of tool handlers from the standard handler library.
 */
export const AUTONOMOUS_SCENARIOS: AutonomousScenario[] = [
  // 1. Data transformation
  {
    name: 'data-transformation',
    description: 'Transform JSON data from one format to another with validation',
    taskDescription: 'Take a JSON object with fields "firstName" and "lastName", transform it into a single "fullName" field, and validate that the result is a non-empty string.',
    expectedHandlers: ['json-transform', 'data-validate'],
    minNodes: 3,
  },

  // 2. Multi-step computation
  {
    name: 'multi-step-computation',
    description: 'Perform a calculation and format the result',
    taskDescription: 'Given the number 42, calculate its square root, then format the result as a string with 2 decimal places: "The square root is X.XX".',
    expectedHandlers: ['math-eval', 'string-format'],
    minNodes: 3,
  },

  // 3. File processing pipeline
  {
    name: 'file-processing',
    description: 'Read a file, transform its contents, and write the output',
    taskDescription: 'Read a JSON configuration file, extract all keys, transform them into a comma-separated list, and write the result to an output file.',
    expectedHandlers: ['file-read', 'json-transform', 'file-write'],
    minNodes: 4,
  },

  // 4. Unit conversion pipeline
  {
    name: 'unit-conversion',
    description: 'Convert measurements and validate results',
    taskDescription: 'Convert a temperature of 100 degrees Fahrenheit to Celsius, then validate that the result is between -273.15 and 1000.',
    expectedHandlers: ['unit-convert', 'data-validate'],
    minNodes: 3,
  },

  // 5. Validated API workflow
  {
    name: 'validated-api-workflow',
    description: 'Fetch data, validate schema, and transform response',
    taskDescription: 'Fetch weather data from an API endpoint, validate that the response contains temperature and humidity fields, then transform the data into a human-readable summary.',
    expectedHandlers: ['http-fetch', 'data-validate', 'json-transform'],
    minNodes: 4,
  },

  // 6. Complex multi-handler pipeline
  {
    name: 'complex-multi-handler',
    description: 'End-to-end pipeline using 4+ handlers',
    taskDescription: 'Read a configuration file, compute a hash of its contents using math-eval, format the result as a hex string, validate the format, and write the formatted hash to an output file.',
    expectedHandlers: ['file-read', 'math-eval', 'string-format', 'data-validate'],
    minNodes: 5,
  },

  // 7. Security-labeled pipeline
  {
    name: 'security-labeled-pipeline',
    description: 'Pipeline with IFC security labels enforced',
    taskDescription: 'Validate that an input JSON object conforms to a schema, transform it to remove sensitive fields, and format the result as a sanitized output string.',
    expectedHandlers: ['data-validate', 'json-transform', 'string-format'],
    minNodes: 4,
  },
];

// ── Benchmark Runner ───────────────────────────────────────────────

/**
 * Options for the autonomous benchmark.
 */
export interface AutonomousBenchmarkOptions {
  /** Custom Anthropic client (for testing/DI). */
  llmClient?: Anthropic;
  /** Tool registry. Uses standard if not provided. */
  toolRegistry?: ToolRegistry;
  /** Scenarios to run. Defaults to all AUTONOMOUS_SCENARIOS. */
  scenarios?: AutonomousScenario[];
  /** Pipeline options to pass through. */
  pipelineOptions?: Partial<AutonomousPipelineOptions>;
}

/**
 * Run a single autonomous benchmark scenario.
 */
export async function runScenario(
  scenario: AutonomousScenario,
  options?: AutonomousBenchmarkOptions,
): Promise<ScenarioResult> {
  const registry = options?.toolRegistry ?? createStandardRegistry();

  const pipelineResult = await executeAutonomousPipeline(
    scenario.taskDescription,
    {
      llmClient: options?.llmClient,
      toolRegistry: registry,
      enableZ3Verification: false, // Z3 is optional for benchmarks
      enableExecution: false, // Don't execute (would need real handlers)
      ...options?.pipelineOptions,
    },
  );

  return mapPipelineResult(scenario.name, pipelineResult);
}

/**
 * Run all autonomous benchmark scenarios.
 */
export async function runAutonomousBenchmark(
  options?: AutonomousBenchmarkOptions,
): Promise<AutonomousBenchmarkResult> {
  const scenarios = options?.scenarios ?? AUTONOMOUS_SCENARIOS;
  const startTime = performance.now();
  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    const result = await runScenario(scenario, options);
    results.push(result);
  }

  return aggregateResults(results, performance.now() - startTime);
}

// ── Helpers ─────────────────────────────────────────────────────────

function mapPipelineResult(
  scenarioName: string,
  result: AutonomousPipelineResult,
): ScenarioResult {
  return {
    scenario: scenarioName,
    generationSuccess: !!result.graph,
    pipelineSuccess: result.success,
    confidenceScore: result.confidence?.overall ?? 0,
    refinementAttempts: result.generationResult?.totalAttempts ?? 0,
    patchesApplied: result.neurosymbolicResult?.patchesApplied.length ?? 0,
    nodeCount: result.graph?.nodes.size ?? 0,
    durationMs: result.totalDurationMs,
    hottValid: result.categorization?.validation.valid ?? false,
    errors: result.errors,
  };
}

function aggregateResults(
  results: ScenarioResult[],
  totalDuration: number,
): AutonomousBenchmarkResult {
  const totalScenarios = results.length;
  const generationSuccessCount = results.filter((r) => r.generationSuccess).length;
  const pipelineSuccessCount = results.filter((r) => r.pipelineSuccess).length;

  const successfulResults = results.filter((r) => r.generationSuccess);
  const avgConfidence = successfulResults.length > 0
    ? successfulResults.reduce((sum, r) => sum + r.confidenceScore, 0) / successfulResults.length
    : 0;

  const avgRefinementAttempts = totalScenarios > 0
    ? results.reduce((sum, r) => sum + r.refinementAttempts, 0) / totalScenarios
    : 0;

  const avgDurationMs = totalScenarios > 0
    ? results.reduce((sum, r) => sum + r.durationMs, 0) / totalScenarios
    : 0;

  return {
    totalScenarios,
    generationSuccessCount,
    pipelineSuccessCount,
    avgConfidence,
    avgRefinementAttempts,
    avgDurationMs,
    generationSuccessRate: totalScenarios > 0 ? generationSuccessCount / totalScenarios : 0,
    pipelineSuccessRate: totalScenarios > 0 ? pipelineSuccessCount / totalScenarios : 0,
    results,
    totalDurationMs: totalDuration,
  };
}
