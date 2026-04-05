/**
 * Error Recovery Benchmark — validates bridge grammar error handling pipeline.
 *
 * Tests the diagnose → repair → re-validate cycle with intentionally malformed
 * inputs covering all error categories: truncation, schema violations, semantic
 * errors, handler mismatches, topology issues, and low-confidence graphs.
 *
 * Each scenario measures: auto-repair success rate, diagnosis quality, and
 * recovery effectiveness.
 *
 * Sprint 12 deliverable — Advisory Panel: Sutskever, Pearl, de Moura.
 */

import { diagnose, BridgeErrorCategory } from '../bridge-grammar/bridge-errors.js';
import { repairBridgeOutput, repairTruncatedJSON } from '../bridge-grammar/bridge-repair.js';
import { scoreGraphConfidence } from '../bridge-grammar/bridge-confidence.js';
import { parseVPIRGraph } from '../bridge-grammar/schema-validator.js';
import { createStandardRegistry } from '../aci/tool-registry.js';

// ── Types ───────────────────────────────────────────────────────────

export interface ErrorRecoveryScenario {
  /** Scenario name. */
  name: string;
  /** Description of what's being tested. */
  description: string;
  /** The malformed input to test. */
  input: unknown;
  /** Expected error categories. */
  expectedCategories: BridgeErrorCategory[];
  /** Whether auto-repair should succeed. */
  expectedRepairable: boolean;
}

export interface ErrorRecoveryResult {
  /** Scenario name. */
  scenario: string;
  /** Whether the diagnosis correctly identified errors. */
  diagnosisCorrect: boolean;
  /** Whether auto-repair matched expectations. */
  repairCorrect: boolean;
  /** Whether the repaired output validates. */
  postRepairValid: boolean;
  /** Confidence score of repaired output (if valid). */
  confidenceScore?: number;
  /** Number of errors diagnosed. */
  errorCount: number;
  /** Number of repairs applied. */
  repairCount: number;
  /** Duration of the full recovery cycle. */
  durationMs: number;
}

export interface ErrorRecoveryReport {
  /** Total scenarios tested. */
  totalScenarios: number;
  /** Scenarios where diagnosis was correct. */
  correctDiagnoses: number;
  /** Scenarios where repair matched expectations. */
  correctRepairs: number;
  /** Scenarios where post-repair output validated. */
  postRepairValidCount: number;
  /** Individual scenario results. */
  results: ErrorRecoveryResult[];
  /** Total benchmark duration. */
  totalDurationMs: number;
}

// ── Standard Label ──────────────────────────────────────────────────

function makeLabel(): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    owner: 'benchmark',
    trustLevel: 2,
    classification: 'internal',
    createdAt: now,
  };
}

function makeValidNode(id: string, overrides?: Record<string, unknown>): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id,
    type: 'observation',
    operation: 'gather-data',
    inputs: [],
    outputs: [{ port: 'data', dataType: 'string' }],
    evidence: [{ type: 'data', source: 'test', confidence: 1.0 }],
    label: makeLabel(),
    verifiable: true,
    createdAt: now,
    ...overrides,
  };
}

// ── Benchmark Scenarios ─────────────────────────────────────────────

/**
 * All error recovery scenarios covering the six error categories.
 */
export function createErrorRecoveryScenarios(): ErrorRecoveryScenario[] {
  const now = new Date().toISOString();

  return [
    // 1. Truncated JSON
    {
      name: 'truncated-json',
      description: 'JSON output cut off mid-stream',
      input: '{"id": "test", "name": "Test", "nodes": [{"id": "node-1", "type": "observation"',
      expectedCategories: [BridgeErrorCategory.TRUNCATION],
      expectedRepairable: true,
    },

    // 2. Missing required fields
    {
      name: 'missing-fields',
      description: 'Graph with nodes missing id, type, evidence, label',
      input: {
        nodes: [
          {
            operation: 'test-operation',
            inputs: [],
            outputs: [{ port: 'data', dataType: 'string' }],
          },
        ],
      },
      expectedCategories: [BridgeErrorCategory.SCHEMA],
      expectedRepairable: true,
    },

    // 3. Invalid handler references
    {
      name: 'invalid-handlers',
      description: 'Action nodes referencing non-existent tool handlers',
      input: {
        id: 'handler-test',
        name: 'Handler Test',
        createdAt: now,
        nodes: [
          makeValidNode('obs'),
          {
            ...makeValidNode('act'),
            type: 'action',
            operation: 'nonexistent-mega-tool',
            inputs: [{ nodeId: 'obs', port: 'data', dataType: 'string' }],
          },
        ],
        roots: ['obs'],
        terminals: ['act'],
      },
      expectedCategories: [BridgeErrorCategory.HANDLER],
      expectedRepairable: false,
    },

    // 4. Cyclic graph
    {
      name: 'cyclic-graph',
      description: 'Nodes with circular dependencies',
      input: {
        id: 'cycle-test',
        name: 'Cycle Test',
        createdAt: now,
        nodes: [
          {
            ...makeValidNode('a'),
            type: 'inference',
            inputs: [{ nodeId: 'b', port: 'data', dataType: 'string' }],
            evidence: [{ type: 'rule', source: 'test', confidence: 0.9 }],
          },
          {
            ...makeValidNode('b'),
            type: 'inference',
            inputs: [{ nodeId: 'a', port: 'data', dataType: 'string' }],
            evidence: [{ type: 'rule', source: 'test', confidence: 0.9 }],
          },
        ],
        roots: ['a'],
        terminals: ['b'],
      },
      expectedCategories: [BridgeErrorCategory.TOPOLOGY, BridgeErrorCategory.SEMANTIC],
      expectedRepairable: false,
    },

    // 5. Wrong enum values
    {
      name: 'wrong-enums',
      description: 'Misspelled node types and evidence types',
      input: {
        id: 'enum-test',
        name: 'Enum Test',
        createdAt: now,
        nodes: [
          {
            ...makeValidNode('node-1'),
            type: 'observe',  // should be 'observation'
            evidence: [{ type: 'dat', source: 'test', confidence: 1.0 }],  // should be 'data'
          },
        ],
        roots: ['node-1'],
        terminals: ['node-1'],
      },
      expectedCategories: [BridgeErrorCategory.SCHEMA],
      expectedRepairable: true,
    },

    // 6. Mixed valid/invalid nodes
    {
      name: 'mixed-validity',
      description: 'Some nodes valid, some broken',
      input: {
        id: 'mixed-test',
        name: 'Mixed Test',
        createdAt: now,
        nodes: [
          makeValidNode('good-node'),
          {
            id: 'bad-node',
            // Missing type, evidence, label, etc.
            operation: 'broken',
            inputs: [{ nodeId: 'good-node', port: 'data', dataType: 'string' }],
            outputs: [{ port: 'result', dataType: 'string' }],
          },
        ],
        roots: ['good-node'],
        terminals: ['bad-node'],
      },
      expectedCategories: [BridgeErrorCategory.SCHEMA],
      expectedRepairable: true,
    },

    // 7. Duplicate node IDs
    {
      name: 'duplicate-ids',
      description: 'Multiple nodes with the same ID',
      input: {
        id: 'dup-test',
        name: 'Duplicate Test',
        createdAt: now,
        nodes: [
          makeValidNode('node-1'),
          {
            ...makeValidNode('node-1'),
            type: 'inference',
            inputs: [{ nodeId: 'node-1', port: 'data', dataType: 'string' }],
            evidence: [{ type: 'rule', source: 'test', confidence: 0.9 }],
          },
        ],
        roots: ['node-1'],
        terminals: ['node-1'],
      },
      expectedCategories: [BridgeErrorCategory.TOPOLOGY],
      expectedRepairable: true,
    },
  ];
}

// ── Benchmark Runner ────────────────────────────────────────────────

/**
 * Run a single error recovery scenario.
 */
export function runScenario(scenario: ErrorRecoveryScenario): ErrorRecoveryResult {
  const start = performance.now();
  const registry = createStandardRegistry();

  // Step 1: Validate (expect failure)
  let input = scenario.input;

  // Handle string input (truncated JSON)
  if (typeof input === 'string') {
    const { repaired } = repairTruncatedJSON(input);
    try {
      input = JSON.parse(repaired);
    } catch {
      // Can't even parse — diagnosis still works on the error
    }
  }

  const validation = parseVPIRGraph(input);

  // Step 2: Diagnose
  const rawOutput = typeof scenario.input === 'string' ? scenario.input : undefined;
  let handlerMissing: string[] = [];
  if (validation.valid && validation.graph) {
    const discovery = registry.discoverTools(validation.graph);
    handlerMissing = discovery.missing;
  }

  const diagnosis = diagnose(validation.errors, {
    rawOutput,
    missingHandlers: handlerMissing,
    availableHandlers: registry.listTools(),
  });

  // Check if diagnosis matched expected categories
  const diagnosedCategories = new Set(diagnosis.errors.map((e) => e.category));
  const diagnosisCorrect = scenario.expectedCategories.some((cat) => diagnosedCategories.has(cat));

  // Step 3: Attempt repair
  const repairResult = repairBridgeOutput(input, diagnosis);
  const repairCorrect = diagnosis.repairable === scenario.expectedRepairable ||
    (repairResult.appliedRepairs.length > 0) === scenario.expectedRepairable;

  // Step 4: Re-validate
  const revalidation = parseVPIRGraph(repairResult.repaired);
  const postRepairValid = revalidation.valid && revalidation.graph !== undefined;

  // Step 5: Score confidence (if valid)
  let confidenceScore: number | undefined;
  if (postRepairValid && revalidation.graph) {
    const score = scoreGraphConfidence(revalidation.graph, registry);
    confidenceScore = score.overall;
  }

  return {
    scenario: scenario.name,
    diagnosisCorrect,
    repairCorrect,
    postRepairValid,
    confidenceScore,
    errorCount: diagnosis.errors.length,
    repairCount: repairResult.appliedRepairs.length,
    durationMs: performance.now() - start,
  };
}

/**
 * Run all error recovery benchmark scenarios.
 */
export function runAllErrorRecoveryBenchmarks(): ErrorRecoveryReport {
  const start = performance.now();
  const scenarios = createErrorRecoveryScenarios();
  const results = scenarios.map(runScenario);

  return {
    totalScenarios: results.length,
    correctDiagnoses: results.filter((r) => r.diagnosisCorrect).length,
    correctRepairs: results.filter((r) => r.repairCorrect).length,
    postRepairValidCount: results.filter((r) => r.postRepairValid).length,
    results,
    totalDurationMs: performance.now() - start,
  };
}
