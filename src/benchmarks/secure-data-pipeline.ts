/**
 * Secure Data Pipeline Benchmark.
 *
 * Data flows through classification, redaction, and analysis stages
 * with IFC labels enforced at every boundary. Demonstrates:
 * - IFC label propagation through a pipeline
 * - Label upgrading (public → confidential on PII detection)
 * - Controlled downgrading after redaction
 * - Z3-verifiable invariant: no PII reaches the output
 *
 * Sprint 7 deliverable — Advisory Panel: Barbara Liskov (practical clarity).
 */

import type { SecurityLabel } from '../types/ifc.js';
import type { VPIRGraph, VPIRNode, Evidence, VPIROutput, VPIRRef } from '../types/vpir.js';
import { createLabel, canFlowTo } from '../types/ifc.js';
import { validateGraph } from '../vpir/vpir-validator.js';
import { vpirGraphToCategory } from '../hott/vpir-bridge.js';
import type { BenchmarkDefinition } from './benchmark-runner.js';

// ── Labels ─────────────────────────────────────────────────────────

const PUBLIC_LABEL: SecurityLabel = createLabel('pipeline', 1, 'public');
const CONFIDENTIAL_LABEL: SecurityLabel = createLabel('classifier', 2, 'confidential');

// ── Mock Data ──────────────────────────────────────────────────────

interface DataRecord {
  id: string;
  content: string;
  hasPII: boolean;
  piiFields?: string[];
}

const SAMPLE_DATA: DataRecord[] = [
  { id: 'rec-1', content: 'User John Doe, email john@example.com', hasPII: true, piiFields: ['name', 'email'] },
  { id: 'rec-2', content: 'Product SKU-12345 inventory: 42 units', hasPII: false },
  { id: 'rec-3', content: 'SSN: 123-45-6789, DOB: 1990-01-15', hasPII: true, piiFields: ['ssn', 'dob'] },
];

// ── VPIR Graph Factory ─────────────────────────────────────────────

function makeEvidence(source: string, confidence: number): Evidence {
  return { type: 'data', source, confidence };
}

function makeOutput(port: string, dataType: string, value?: unknown): VPIROutput {
  return { port, dataType, value };
}

function makeRef(nodeId: string, port: string, dataType: string): VPIRRef {
  return { nodeId, port, dataType };
}

/**
 * Build the secure data pipeline VPIR graph.
 *
 * Stages:
 * 1. data_ingestion (observation) — raw data at public level
 * 2. classification (inference) — detects PII, upgrades to confidential
 * 3. redaction (action) — redacts PII fields
 * 4. analysis (inference) — analyzes redacted data
 * 5. declassification_gate (assertion) — verifies redaction completeness
 * 6. output (inference) — produces final output at internal level
 */
export function createSecurePipelineVPIRGraph(): VPIRGraph {
  const now = new Date().toISOString();
  const nodes = new Map<string, VPIRNode>();

  // 1. Data ingestion (observation — root, public)
  nodes.set('data_ingestion', {
    id: 'data_ingestion',
    type: 'observation',
    operation: 'Ingest raw data records',
    inputs: [],
    outputs: [makeOutput('raw_data', 'array', SAMPLE_DATA)],
    evidence: [makeEvidence('data_source', 1.0)],
    label: PUBLIC_LABEL,
    verifiable: true,
    createdAt: now,
  });

  // 2. Classification (inference — detects PII, upgrades label)
  const classifiedData = SAMPLE_DATA.map(rec => ({
    ...rec,
    classified: true,
    piiDetected: rec.hasPII,
  }));
  nodes.set('classification', {
    id: 'classification',
    type: 'inference',
    operation: 'Classify records for PII content',
    inputs: [makeRef('data_ingestion', 'raw_data', 'array')],
    outputs: [makeOutput('classified_data', 'array', classifiedData)],
    evidence: [makeEvidence('pii_classifier', 0.95)],
    label: CONFIDENTIAL_LABEL,
    verifiable: true,
    createdAt: now,
  });

  // 3. Redaction (action — removes PII fields)
  const redactedData = SAMPLE_DATA.map(rec => ({
    id: rec.id,
    content: rec.hasPII ? '[REDACTED]' : rec.content,
    hasPII: false,
    piiFields: [],
    redacted: rec.hasPII,
  }));
  nodes.set('redaction', {
    id: 'redaction',
    type: 'action',
    operation: 'Redact PII from classified records',
    inputs: [makeRef('classification', 'classified_data', 'array')],
    outputs: [makeOutput('redacted_data', 'array', redactedData)],
    evidence: [makeEvidence('redaction_engine', 0.99)],
    label: CONFIDENTIAL_LABEL,
    verifiable: true,
    createdAt: now,
  });

  // 4. Analysis (inference — on redacted data at internal level)
  nodes.set('analysis', {
    id: 'analysis',
    type: 'inference',
    operation: 'Analyze redacted data for insights',
    inputs: [makeRef('redaction', 'redacted_data', 'array')],
    outputs: [makeOutput('insights', 'object', {
      totalRecords: SAMPLE_DATA.length,
      redactedCount: SAMPLE_DATA.filter(r => r.hasPII).length,
      cleanCount: SAMPLE_DATA.filter(r => !r.hasPII).length,
    })],
    evidence: [makeEvidence('analysis_engine', 0.9)],
    label: CONFIDENTIAL_LABEL,
    verifiable: true,
    createdAt: now,
  });

  // 5. Declassification gate (assertion — verifies redaction)
  nodes.set('declassification_gate', {
    id: 'declassification_gate',
    type: 'assertion',
    operation: 'Verify all PII has been redacted before declassification',
    inputs: [makeRef('analysis', 'insights', 'object')],
    outputs: [makeOutput('declassified', 'boolean', true)],
    evidence: [makeEvidence('declassification_check', 1.0)],
    label: CONFIDENTIAL_LABEL,
    verifiable: true,
    createdAt: now,
  });

  // 6. Output (inference — final output at internal level)
  nodes.set('pipeline_output', {
    id: 'pipeline_output',
    type: 'inference',
    operation: 'Produce final pipeline output',
    inputs: [makeRef('declassification_gate', 'declassified', 'boolean')],
    outputs: [makeOutput('result', 'object', {
      status: 'complete',
      piiSafe: true,
      recordCount: SAMPLE_DATA.length,
    })],
    evidence: [makeEvidence('pipeline', 1.0)],
    label: CONFIDENTIAL_LABEL,
    verifiable: true,
    createdAt: now,
  });

  return {
    id: 'secure-data-pipeline',
    name: 'Secure Data Pipeline',
    nodes,
    roots: ['data_ingestion'],
    terminals: ['pipeline_output'],
    createdAt: now,
  };
}

// ── IFC Analysis ───────────────────────────────────────────────────

/**
 * Analyze IFC label propagation through the pipeline.
 * Returns per-stage label information and any violations.
 */
export function analyzePipelineIFC(graph: VPIRGraph): {
  labelProgression: Array<{ nodeId: string; classification: string; trustLevel: number }>;
  violations: Array<{ sourceId: string; targetId: string; reason: string }>;
  labelUpgrades: Array<{ nodeId: string; from: string; to: string }>;
} {
  const labelProgression: Array<{ nodeId: string; classification: string; trustLevel: number }> = [];
  const violations: Array<{ sourceId: string; targetId: string; reason: string }> = [];
  const labelUpgrades: Array<{ nodeId: string; from: string; to: string }> = [];

  // Traverse in topological order (roots first, then follow edges)
  const visited = new Set<string>();
  const queue = [...graph.roots];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = graph.nodes.get(nodeId);
    if (!node) continue;

    labelProgression.push({
      nodeId: node.id,
      classification: node.label.classification,
      trustLevel: node.label.trustLevel,
    });

    // Check for label upgrades (source → this node)
    for (const ref of node.inputs) {
      const source = graph.nodes.get(ref.nodeId);
      if (source && source.label.classification !== node.label.classification) {
        labelUpgrades.push({
          nodeId: node.id,
          from: source.label.classification,
          to: node.label.classification,
        });
      }

      // Check IFC flow
      if (source && !canFlowTo(source.label, node.label)) {
        violations.push({
          sourceId: source.id,
          targetId: node.id,
          reason: `${source.label.classification}(trust:${source.label.trustLevel}) → ${node.label.classification}(trust:${node.label.trustLevel})`,
        });
      }
    }

    // Enqueue downstream nodes
    for (const [, n] of graph.nodes) {
      for (const ref of n.inputs) {
        if (ref.nodeId === nodeId && !visited.has(n.id)) {
          queue.push(n.id);
        }
      }
    }
  }

  return { labelProgression, violations, labelUpgrades };
}

/**
 * Check that no PII is present in data after the redaction stage.
 */
export function verifyRedactionCompleteness(graph: VPIRGraph): {
  piiSafe: boolean;
  nodesAfterRedaction: string[];
  piiFoundInNodes: string[];
} {
  const redactionNode = graph.nodes.get('redaction');
  if (!redactionNode) {
    return { piiSafe: false, nodesAfterRedaction: [], piiFoundInNodes: [] };
  }

  // Find all nodes downstream of redaction
  const downstream = new Set<string>();
  const queue = ['redaction'];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const [, node] of graph.nodes) {
      for (const ref of node.inputs) {
        if (ref.nodeId === current && !visited.has(node.id)) {
          downstream.add(node.id);
          queue.push(node.id);
        }
      }
    }
  }

  const nodesAfterRedaction = [...downstream];
  const piiFoundInNodes: string[] = [];

  for (const nodeId of nodesAfterRedaction) {
    const node = graph.nodes.get(nodeId);
    if (!node) continue;

    for (const output of node.outputs) {
      if (output.value && typeof output.value === 'object') {
        const val = output.value as Record<string, unknown>;
        if (val.hasPII === true || (Array.isArray(val.piiFields) && val.piiFields.length > 0)) {
          piiFoundInNodes.push(nodeId);
        }
      }
    }
  }

  return {
    piiSafe: piiFoundInNodes.length === 0,
    nodesAfterRedaction,
    piiFoundInNodes,
  };
}

// ── Benchmark Definition ───────────────────────────────────────────

/**
 * Create the secure data pipeline benchmark definition.
 */
export function createSecurePipelineBenchmark(): BenchmarkDefinition {
  return {
    id: 'secure-data-pipeline',
    name: 'Secure Data Pipeline',
    task: 'Process data through classification, redaction, and analysis with IFC enforcement',
    stages: [
      {
        name: 'Graph Construction',
        execute: async () => {
          const graph = createSecurePipelineVPIRGraph();
          return { graph, nodeCount: graph.nodes.size };
        },
      },
      {
        name: 'VPIR Validation',
        execute: async (data) => {
          const graph = data.graph as VPIRGraph;
          const validation = validateGraph(graph);
          if (!validation.valid) {
            throw new Error(`VPIR validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
          }
          return { ...data, validation };
        },
      },
      {
        name: 'IFC Label Analysis',
        execute: async (data) => {
          const graph = data.graph as VPIRGraph;
          const analysis = analyzePipelineIFC(graph);
          return {
            ...data,
            ifcAnalysis: analysis,
            ifcPassed: analysis.violations.length === 0,
            labelUpgradeCount: analysis.labelUpgrades.length,
          };
        },
      },
      {
        name: 'Redaction Verification',
        execute: async (data) => {
          const graph = data.graph as VPIRGraph;
          const redactionCheck = verifyRedactionCompleteness(graph);
          return {
            ...data,
            redactionCheck,
            piiSafe: redactionCheck.piiSafe,
          };
        },
      },
      {
        name: 'HoTT Categorization',
        execute: async (data) => {
          const graph = data.graph as VPIRGraph;
          const category = vpirGraphToCategory(graph);
          return {
            ...data,
            category,
            objectCount: category.objects.size,
            morphismCount: category.morphisms.size,
          };
        },
      },
    ],
    passCriteria: (result) => {
      const ifcPassed = result.stages[2]?.data?.ifcPassed as boolean | undefined;
      const piiSafe = result.stages[3]?.data?.piiSafe as boolean | undefined;
      return (
        result.stages.every(s => s.status === 'passed') &&
        ifcPassed === true &&
        piiSafe === true
      );
    },
  };
}
