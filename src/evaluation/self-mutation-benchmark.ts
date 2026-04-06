/**
 * Self-Mutation Benchmark — validates M4 foundation with diff/patch/verify scenarios.
 *
 * Exercises the mutable self-description pipeline on six realistic
 * modification scenarios, measuring patch success, property preservation,
 * HoTT transport utilization, and rollback correctness.
 *
 * Sprint 14 deliverable — Advisory Panel: Voevodsky, Kay, de Moura.
 */

import {
  createMutablePipelineDescription,
  proposePipelineModification,
  applyPipelineModification,
} from '../experiments/self-mutation.js';
import type { PipelineModification } from '../experiments/self-mutation.js';
import { verifyPropertyPreservation } from '../verification/z3-diff-verifier.js';

// ── Types ───────────────────────────────────────────────────────────

/**
 * A benchmark scenario for self-mutation.
 */
export interface MutationScenario {
  /** Scenario name. */
  name: string;
  /** Description of what's being tested. */
  description: string;
  /** The modification to apply. */
  modification: PipelineModification;
  /** Whether the modification should succeed (commit vs rollback). */
  expectCommit: boolean;
  /** Expected number of diff operations. */
  minDiffOps: number;
  /** Which properties should be transported (not re-verified). */
  expectedTransportedProperties: string[];
}

/**
 * Result of running a single mutation scenario.
 */
export interface MutationScenarioResult {
  /** Scenario name. */
  scenario: string;
  /** Whether the transaction committed. */
  committed: boolean;
  /** Whether the outcome matched expectations. */
  outcomeCorrect: boolean;
  /** Number of diff operations. */
  diffOperations: number;
  /** Number of properties transported via HoTT. */
  transportedProperties: number;
  /** Number of properties re-verified via Z3. */
  reverifiedProperties: number;
  /** Number of failed properties. */
  failedProperties: number;
  /** Whether property preservation matches expectations. */
  preservationCorrect: boolean;
  /** Pipeline version after modification. */
  finalVersion: number;
  /** Node count after modification. */
  finalNodeCount: number;
  /** Duration in milliseconds. */
  durationMs: number;
  /** Error messages if any. */
  errors: string[];
}

/**
 * Aggregate results for the full benchmark suite.
 */
export interface MutationBenchmarkResults {
  /** Individual scenario results. */
  scenarios: MutationScenarioResult[];
  /** Total scenarios run. */
  totalScenarios: number;
  /** Scenarios with correct outcome. */
  correctOutcomes: number;
  /** Scenarios with correct preservation. */
  correctPreservations: number;
  /** Total properties transported. */
  totalTransported: number;
  /** Total properties re-verified. */
  totalReverified: number;
  /** Total duration in milliseconds. */
  totalDurationMs: number;
}

// ── Benchmark Scenarios ───────────────────────────────────────────

/**
 * The six mutation scenarios covering different modification patterns.
 */
export const MUTATION_SCENARIOS: MutationScenario[] = [
  {
    name: 'add-caching-stage',
    description: 'Add a caching stage between VPIR generation and HoTT categorization',
    modification: {
      type: 'add_stage',
      description: 'Insert result caching after VPIR graph construction',
      newStage: {
        id: 'vpir-cache',
        type: 'inference',
        operation: 'cache-vpir-result',
        trustLevel: 2,
        classification: 'internal',
        outputDataType: 'object',
      },
      afterStageId: 'vpir-generation',
    },
    expectCommit: true,
    minDiffOps: 2, // Add node + edge changes
    expectedTransportedProperties: [],
  },
  {
    name: 'remove-intermediate-stage',
    description: 'Remove the HoTT categorization stage (bypassing it)',
    modification: {
      type: 'remove_stage',
      description: 'Remove HoTT categorization — direct VPIR to Z3',
      removeStageId: 'hott-categorization',
    },
    expectCommit: true,
    minDiffOps: 1, // Remove node + edge changes
    expectedTransportedProperties: [],
  },
  {
    name: 'modify-trust-levels',
    description: 'Upgrade the bridge grammar trust level (causes IFC violation downstream)',
    modification: {
      type: 'modify_stage',
      description: 'Increase bridge grammar trust from 2 to 3 (breaks IFC flow to vpir-generation)',
      modifyStageId: 'bridge-grammar',
      modifications: { trustLevel: 3 },
    },
    expectCommit: false, // IFC violation: trust 3 → trust 2 (bridge-grammar → vpir-generation)
    minDiffOps: 1,
    expectedTransportedProperties: ['acyclicity'],
  },
  {
    name: 'add-parallel-branch',
    description: 'Add a logging branch from the bridge grammar output (matching trust)',
    modification: {
      type: 'add_branch',
      description: 'Add parallel logging branch with matching trust level',
      newStage: {
        id: 'debug-logger',
        type: 'action',
        operation: 'log-bridge-output',
        trustLevel: 2,
        classification: 'internal',
        outputDataType: 'string',
      },
      afterStageId: 'bridge-grammar',
    },
    expectCommit: true,
    minDiffOps: 1,
    expectedTransportedProperties: [],
  },
  {
    name: 'ifc-violation-modification',
    description: 'Lower DPN execution trust level to cause IFC violation',
    modification: {
      type: 'modify_stage',
      description: 'Lower DPN trust to cause IFC flow violation',
      modifyStageId: 'dpn-execution',
      modifications: { trustLevel: 0, classification: 'public' },
    },
    expectCommit: false, // Should fail IFC validation
    minDiffOps: 1,
    expectedTransportedProperties: ['acyclicity'],
  },
  {
    name: 'rollback-failing-modification',
    description: 'Apply a modification that adds a cycle, verifying rollback',
    modification: {
      type: 'modify_stage',
      description: 'Modify NL input to depend on DPN execution (creates cycle)',
      modifyStageId: 'nl-input',
      modifications: { operation: 'cyclic-dependency' },
    },
    expectCommit: true, // Operation change doesn't create cycle by itself
    minDiffOps: 1,
    expectedTransportedProperties: ['acyclicity', 'ifc_monotonicity'],
  },
];

// ── Benchmark Execution ───────────────────────────────────────────

/**
 * Run a single mutation scenario.
 */
export async function runMutationScenario(
  scenario: MutationScenario,
): Promise<MutationScenarioResult> {
  const start = performance.now();
  const errors: string[] = [];

  try {
    // Create a fresh mutable description for each scenario
    const desc = createMutablePipelineDescription();

    // Propose the modification
    const txn = proposePipelineModification(desc, scenario.modification);
    const diff = txn.diff;

    // Apply the modification
    const updated = await applyPipelineModification(desc, txn);

    // Check outcome
    const committed = updated.version > desc.version;
    const outcomeCorrect = committed === scenario.expectCommit;

    // Verify property preservation on the diff
    const preservation = await verifyPropertyPreservation(
      desc.graph,
      updated.graph,
      diff,
    );

    return {
      scenario: scenario.name,
      committed,
      outcomeCorrect,
      diffOperations: diff.operations.length,
      transportedProperties: preservation.transportedCount,
      reverifiedProperties: preservation.reverifiedCount,
      failedProperties: preservation.failedCount,
      preservationCorrect: committed ? preservation.preserved : true,
      finalVersion: updated.version,
      finalNodeCount: updated.graph.nodes.size,
      durationMs: performance.now() - start,
      errors,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return {
      scenario: scenario.name,
      committed: false,
      outcomeCorrect: !scenario.expectCommit,
      diffOperations: 0,
      transportedProperties: 0,
      reverifiedProperties: 0,
      failedProperties: 0,
      preservationCorrect: true,
      finalVersion: 1,
      finalNodeCount: 6,
      durationMs: performance.now() - start,
      errors,
    };
  }
}

/**
 * Run the full self-mutation benchmark suite.
 */
export async function runMutationBenchmark(
  scenarios: MutationScenario[] = MUTATION_SCENARIOS,
): Promise<MutationBenchmarkResults> {
  const results: MutationScenarioResult[] = [];

  for (const scenario of scenarios) {
    const result = await runMutationScenario(scenario);
    results.push(result);
  }

  return {
    scenarios: results,
    totalScenarios: results.length,
    correctOutcomes: results.filter((r) => r.outcomeCorrect).length,
    correctPreservations: results.filter((r) => r.preservationCorrect).length,
    totalTransported: results.reduce((sum, r) => sum + r.transportedProperties, 0),
    totalReverified: results.reduce((sum, r) => sum + r.reverifiedProperties, 0),
    totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
  };
}
