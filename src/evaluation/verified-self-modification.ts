/**
 * Verified Self-Modification Scenarios — production-quality scenarios exercising
 * the full self-modification orchestrator pipeline.
 *
 * Each scenario demonstrates a real pipeline modification through:
 * NL description → orchestrator → confidence scoring → causal impact → Z3 → commit/rollback
 *
 * These go beyond Sprint 14's toy benchmarks to demonstrate real pipeline modifications
 * that the system applies to itself.
 *
 * Sprint 15 deliverable — Advisory Panel: Kay (paradigm), Voevodsky (HoTT),
 * de Moura (SMT), Pearl (causal).
 */

import type { VPIRGraph, VPIRNode } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import { createLabel } from '../types/ifc.js';
import {
  SelfModificationOrchestrator,
} from '../vpir/self-modification-orchestrator.js';
import type { OrchestrationResult } from '../vpir/self-modification-orchestrator.js';
import { cloneGraph } from '../vpir/vpir-patch.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeLabel(
  trust: 0 | 1 | 2 | 3 | 4,
  classification: SecurityLabel['classification'] = 'internal',
): SecurityLabel {
  return createLabel('pnxt-pipeline', trust, classification);
}

function makePipelineNode(
  id: string,
  type: VPIRNode['type'],
  operation: string,
  trust: 0 | 1 | 2 | 3 | 4,
  classification: SecurityLabel['classification'],
  inputs: Array<{ nodeId: string; port: string; dataType: string }> = [],
  outputDataType: string = 'object',
): VPIRNode {
  return {
    id,
    type,
    operation,
    inputs,
    outputs: [{ port: 'output', dataType: outputDataType }],
    evidence: [{
      type: 'rule',
      source: 'pnxt-architecture',
      confidence: 1.0,
      description: `Pipeline stage: ${operation}`,
    }],
    label: makeLabel(trust, classification),
    verifiable: true,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Create the standard pnxt pipeline graph (6 stages).
 * Mirrors the self-hosting PoC from Sprint 9.
 */
function createStandardPipeline(): VPIRGraph {
  const nodes = new Map<string, VPIRNode>();

  const stages: VPIRNode[] = [
    makePipelineNode('nl-input', 'observation', 'capture-natural-language', 1, 'public', [], 'string'),
    makePipelineNode('bridge-grammar', 'inference', 'constrained-decoding', 2, 'internal',
      [{ nodeId: 'nl-input', port: 'output', dataType: 'string' }]),
    makePipelineNode('vpir-generation', 'action', 'generate-vpir-graph', 2, 'internal',
      [{ nodeId: 'bridge-grammar', port: 'output', dataType: 'object' }]),
    makePipelineNode('hott-categorization', 'inference', 'categorize-vpir', 3, 'confidential',
      [{ nodeId: 'vpir-generation', port: 'output', dataType: 'object' }]),
    makePipelineNode('z3-verification', 'assertion', 'verify-properties', 3, 'confidential',
      [{ nodeId: 'hott-categorization', port: 'output', dataType: 'object' }], 'boolean'),
    makePipelineNode('dpn-execution', 'action', 'execute-via-dpn', 4, 'restricted',
      [{ nodeId: 'z3-verification', port: 'output', dataType: 'boolean' }]),
  ];

  for (const stage of stages) nodes.set(stage.id, stage);

  return {
    id: 'pnxt-pipeline',
    name: 'pnxt Integration Pipeline',
    nodes,
    roots: ['nl-input'],
    terminals: ['dpn-execution'],
    createdAt: new Date().toISOString(),
  };
}

// ── Scenario Types ──────────────────────────────────────────────────

/**
 * A verified self-modification scenario.
 */
export interface SelfModificationScenario {
  /** Scenario identifier. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Natural language description of the modification. */
  description: string;
  /** Whether the modification should commit or rollback. */
  expectedOutcome: 'commit' | 'rollback';
  /** Function that builds the modified pipeline graph. */
  buildTarget: (source: VPIRGraph) => VPIRGraph;
}

/**
 * Result of running a self-modification scenario.
 */
export interface ScenarioResult {
  /** Scenario that was run. */
  scenario: SelfModificationScenario;
  /** Orchestration result. */
  orchestration: OrchestrationResult;
  /** Whether the outcome matched expectations. */
  matchedExpectation: boolean;
  /** Duration in milliseconds. */
  durationMs: number;
}

/**
 * Results from running all self-modification scenarios.
 */
export interface VerifiedSelfModificationResults {
  /** Per-scenario results. */
  scenarios: ScenarioResult[];
  /** Number of scenarios that matched expectations. */
  passed: number;
  /** Number of scenarios that did not match expectations. */
  failed: number;
  /** Total execution time in milliseconds. */
  totalTimeMs: number;
}

// ── Scenarios ───────────────────────────────────────────────────────

/**
 * Scenario 1: Add result caching stage to the VPIR interpreter.
 *
 * Inserts a cache-check stage between VPIR generation and HoTT categorization.
 * Should commit — the modification preserves all properties.
 */
const addCachingScenario: SelfModificationScenario = {
  id: 'add-caching',
  name: 'Add Result Caching to VPIR Interpreter',
  description: 'Insert a cache-check stage between VPIR generation and HoTT categorization to avoid redundant categorization of identical graphs',
  expectedOutcome: 'commit',
  buildTarget: (source) => {
    const target = cloneGraph(source);

    // Insert cache-check node between vpir-generation and hott-categorization
    const cacheNode = makePipelineNode(
      'cache-check',
      'inference',
      'check-result-cache',
      2,
      'internal',
      [{ nodeId: 'vpir-generation', port: 'output', dataType: 'object' }],
    );
    target.nodes.set('cache-check', cacheNode);

    // Reroute hott-categorization to consume from cache-check
    const hottNode = target.nodes.get('hott-categorization')!;
    hottNode.inputs = [{ nodeId: 'cache-check', port: 'output', dataType: 'object' }];

    // Update roots/terminals
    target.terminals = ['dpn-execution'];
    target.id = `${source.id}-cached`;

    return target;
  },
};

/**
 * Scenario 2: Add confidence gate to Bridge Grammar.
 *
 * Inserts a confidence threshold check after bridge grammar decoding.
 * Should commit — the modification preserves correctness.
 */
const addConfidenceGateScenario: SelfModificationScenario = {
  id: 'add-confidence-gate',
  name: 'Add Confidence Gate to Bridge Grammar',
  description: 'Insert a confidence threshold check after bridge grammar decoding that rejects low-confidence VPIR generations before they reach the full pipeline',
  expectedOutcome: 'commit',
  buildTarget: (source) => {
    const target = cloneGraph(source);

    const gateNode = makePipelineNode(
      'confidence-gate',
      'assertion',
      'check-confidence-threshold',
      2,
      'internal',
      [{ nodeId: 'bridge-grammar', port: 'output', dataType: 'object' }],
      'object',
    );
    target.nodes.set('confidence-gate', gateNode);

    // Reroute vpir-generation to consume from confidence-gate
    const vpirNode = target.nodes.get('vpir-generation')!;
    vpirNode.inputs = [{ nodeId: 'confidence-gate', port: 'output', dataType: 'object' }];

    target.id = `${source.id}-gated`;

    return target;
  },
};

/**
 * Scenario 3: Modify handler trust levels (IFC violation).
 *
 * Raises the NL input trust level above the bridge grammar trust level,
 * violating IFC monotonicity. Should rollback.
 */
const modifyTrustLevelsScenario: SelfModificationScenario = {
  id: 'modify-trust-levels',
  name: 'Modify Handler Trust Levels (IFC Violation)',
  description: 'Raise the NL input trust level to 3, above the bridge grammar trust level of 2, violating IFC monotonicity',
  expectedOutcome: 'rollback',
  buildTarget: (source) => {
    const target = cloneGraph(source);

    // Raise nl-input trust above bridge-grammar → IFC violation
    const nlNode = target.nodes.get('nl-input')!;
    nlNode.label = makeLabel(3, 'confidential');

    target.id = `${source.id}-trust-violated`;

    return target;
  },
};

/**
 * Scenario 4: Add parallel verification branch.
 *
 * Adds a parallel HoTT + Z3 verification path that runs alongside the main
 * pipeline. Should commit — fan-out preserves properties.
 */
const addParallelVerificationScenario: SelfModificationScenario = {
  id: 'add-parallel-verification',
  name: 'Add Parallel Verification Branch',
  description: 'Add a parallel verification branch from VPIR generation that runs HoTT categorical checking alongside the main pipeline',
  expectedOutcome: 'commit',
  buildTarget: (source) => {
    const target = cloneGraph(source);

    const parallelNode = makePipelineNode(
      'parallel-hott-check',
      'assertion',
      'parallel-categorical-validation',
      3,
      'confidential',
      [{ nodeId: 'vpir-generation', port: 'output', dataType: 'object' }],
      'boolean',
    );
    target.nodes.set('parallel-hott-check', parallelNode);

    // Update terminals to include the parallel branch
    target.terminals = ['dpn-execution', 'parallel-hott-check'];
    target.id = `${source.id}-parallel`;

    return target;
  },
};

/**
 * Scenario 5: Remove redundant validation stage.
 *
 * Removes the HoTT categorization stage and connects Z3 directly to VPIR generation.
 * Should commit — HoTT transport proves no properties are lost.
 */
const removeRedundantStageScenario: SelfModificationScenario = {
  id: 'remove-redundant-stage',
  name: 'Remove Redundant Validation Stage',
  description: 'Remove the HoTT categorization stage and connect Z3 verification directly to VPIR generation, relying on HoTT transport to prove no properties are lost',
  expectedOutcome: 'commit',
  buildTarget: (source) => {
    const target = cloneGraph(source);

    // Remove hott-categorization
    target.nodes.delete('hott-categorization');

    // Connect z3-verification directly to vpir-generation
    const z3Node = target.nodes.get('z3-verification')!;
    z3Node.inputs = [{ nodeId: 'vpir-generation', port: 'output', dataType: 'object' }];

    // Recompute roots
    target.roots = ['nl-input'];
    target.terminals = ['dpn-execution'];
    target.id = `${source.id}-streamlined`;

    return target;
  },
};

/**
 * All verified self-modification scenarios.
 */
export const SELF_MODIFICATION_SCENARIOS: SelfModificationScenario[] = [
  addCachingScenario,
  addConfidenceGateScenario,
  modifyTrustLevelsScenario,
  addParallelVerificationScenario,
  removeRedundantStageScenario,
];

// ── Runner ──────────────────────────────────────────────────────────

/**
 * Run a single verified self-modification scenario.
 */
export async function runSelfModificationScenario(
  scenario: SelfModificationScenario,
): Promise<ScenarioResult> {
  const start = performance.now();
  const orchestrator = new SelfModificationOrchestrator({
    autoApproveThreshold: 0.7,
    minimumConfidence: 0.2,
  });

  const source = createStandardPipeline();
  const target = scenario.buildTarget(source);

  const orchestration = await orchestrator.proposeAndApply(
    scenario.description,
    source,
    target,
  );

  const actualOutcome = orchestration.applied ? 'commit' : 'rollback';
  const matchedExpectation = actualOutcome === scenario.expectedOutcome;

  return {
    scenario,
    orchestration,
    matchedExpectation,
    durationMs: performance.now() - start,
  };
}

/**
 * Run all verified self-modification scenarios.
 */
export async function runAllSelfModificationScenarios(): Promise<VerifiedSelfModificationResults> {
  const start = performance.now();
  const results: ScenarioResult[] = [];

  for (const scenario of SELF_MODIFICATION_SCENARIOS) {
    const result = await runSelfModificationScenario(scenario);
    results.push(result);
  }

  const passed = results.filter((r) => r.matchedExpectation).length;
  const failed = results.filter((r) => !r.matchedExpectation).length;

  return {
    scenarios: results,
    passed,
    failed,
    totalTimeMs: performance.now() - start,
  };
}

// Re-export for convenience
export { createStandardPipeline };
