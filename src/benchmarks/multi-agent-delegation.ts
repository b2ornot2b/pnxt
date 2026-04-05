/**
 * Multi-Agent Task Delegation Benchmark.
 *
 * Three agents with different trust levels coordinate on a research task:
 * - Researcher (trust 3, confidential): produces analysis
 * - Assistant (trust 2, internal): formats and summarizes
 * - Reviewer (trust 4, restricted): approves final output
 *
 * Exercises: IFC across trust boundaries, DPN inter-agent channels,
 * capability negotiation, and user-defined postcondition verification.
 *
 * Sprint 7 deliverable — Advisory Panel: Barbara Liskov (practical clarity).
 */

import type { SecurityLabel } from '../types/ifc.js';
import type { VPIRGraph, VPIRNode, Evidence, VPIROutput, VPIRRef } from '../types/vpir.js';
import { createLabel, canFlowTo } from '../types/ifc.js';
import { validateGraph } from '../vpir/vpir-validator.js';
import { vpirGraphToCategory } from '../hott/vpir-bridge.js';
import type { BenchmarkDefinition } from './benchmark-runner.js';

// ── Agent Labels ───────────────────────────────────────────────────

export const RESEARCHER_LABEL: SecurityLabel = createLabel('researcher', 3, 'confidential');
export const ASSISTANT_LABEL: SecurityLabel = createLabel('assistant', 2, 'internal');
export const REVIEWER_LABEL: SecurityLabel = createLabel('reviewer', 4, 'restricted');

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
 * Build the multi-agent delegation VPIR graph.
 *
 * Stages:
 * 1. research_query (observation) — initial NL query
 * 2. task_decomposition (inference) — researcher breaks into sub-tasks
 * 3. research_analysis (action) — researcher produces confidential analysis
 * 4. format_summary (inference) — assistant formats (IFC check: must be internal)
 * 5. review_gate (assertion) — reviewer approves final output
 * 6. final_output (inference) — assembly
 */
export function createDelegationVPIRGraph(task: string): VPIRGraph {
  const now = new Date().toISOString();
  const nodes = new Map<string, VPIRNode>();

  // 1. Research query (observation — root)
  nodes.set('research_query', {
    id: 'research_query',
    type: 'observation',
    operation: `Observe research query: "${task}"`,
    inputs: [],
    outputs: [makeOutput('query', 'string', task)],
    evidence: [makeEvidence('user_input', 1.0)],
    label: createLabel('system', 1, 'public'),
    verifiable: true,
    createdAt: now,
  });

  // 2. Task decomposition (inference — researcher)
  nodes.set('task_decomposition', {
    id: 'task_decomposition',
    type: 'inference',
    operation: 'Decompose research query into sub-tasks',
    inputs: [makeRef('research_query', 'query', 'string')],
    outputs: [
      makeOutput('analysis_task', 'string', 'Analyze data'),
      makeOutput('format_task', 'string', 'Format results'),
    ],
    evidence: [makeEvidence('researcher_agent', 0.9)],
    label: RESEARCHER_LABEL,
    verifiable: true,
    createdAt: now,
    agentId: 'researcher',
  });

  // 3. Research analysis (action — researcher, confidential)
  nodes.set('research_analysis', {
    id: 'research_analysis',
    type: 'action',
    operation: 'Perform deep research analysis',
    inputs: [makeRef('task_decomposition', 'analysis_task', 'string')],
    outputs: [makeOutput('analysis_result', 'object', { findings: 'Research findings', pii: false })],
    evidence: [makeEvidence('research_db', 0.85)],
    label: RESEARCHER_LABEL,
    verifiable: true,
    createdAt: now,
    agentId: 'researcher',
  });

  // 4. Format summary (inference — assistant, internal level)
  // The assistant works on the original query (public label, which
  // can flow to internal), NOT the researcher's confidential output.
  // This demonstrates proper IFC: confidential data stays with the
  // researcher; the assistant only sees public-level input.
  nodes.set('format_summary', {
    id: 'format_summary',
    type: 'inference',
    operation: 'Format research summary for presentation',
    inputs: [makeRef('research_query', 'query', 'string')],
    outputs: [makeOutput('formatted', 'string', 'Formatted summary')],
    evidence: [makeEvidence('assistant_agent', 0.95)],
    label: ASSISTANT_LABEL,
    verifiable: true,
    createdAt: now,
    agentId: 'assistant',
  });

  // 5. Review gate (assertion — reviewer)
  nodes.set('review_gate', {
    id: 'review_gate',
    type: 'assertion',
    operation: 'Reviewer approves combined output',
    inputs: [
      makeRef('research_analysis', 'analysis_result', 'object'),
      makeRef('format_summary', 'formatted', 'string'),
    ],
    outputs: [makeOutput('approved', 'boolean', true)],
    evidence: [makeEvidence('reviewer_agent', 1.0)],
    label: REVIEWER_LABEL,
    verifiable: true,
    createdAt: now,
    agentId: 'reviewer',
  });

  // 6. Final output (inference — assembles everything)
  nodes.set('final_output', {
    id: 'final_output',
    type: 'inference',
    operation: 'Assemble verified research output',
    inputs: [makeRef('review_gate', 'approved', 'boolean')],
    outputs: [makeOutput('result', 'object', { status: 'approved', task })],
    evidence: [makeEvidence('system', 1.0)],
    label: REVIEWER_LABEL,
    verifiable: true,
    createdAt: now,
  });

  return {
    id: 'multi-agent-delegation',
    name: 'Multi-Agent Task Delegation',
    nodes,
    roots: ['research_query'],
    terminals: ['final_output'],
    createdAt: now,
  };
}

// ── IFC Flow Checking ──────────────────────────────────────────────

/**
 * Check IFC flow consistency across the delegation graph.
 * Returns violations where data flows from higher to lower classification.
 */
export function checkDelegationIFCFlows(graph: VPIRGraph): Array<{
  sourceId: string;
  targetId: string;
  reason: string;
}> {
  const violations: Array<{ sourceId: string; targetId: string; reason: string }> = [];

  for (const [, node] of graph.nodes) {
    for (const ref of node.inputs) {
      const source = graph.nodes.get(ref.nodeId);
      if (!source) continue;

      if (!canFlowTo(source.label, node.label)) {
        violations.push({
          sourceId: source.id,
          targetId: node.id,
          reason: `${source.label.classification}(trust:${source.label.trustLevel}) cannot flow to ${node.label.classification}(trust:${node.label.trustLevel})`,
        });
      }
    }
  }

  return violations;
}

// ── Benchmark Definition ───────────────────────────────────────────

/**
 * Create the multi-agent delegation benchmark definition.
 */
export function createDelegationBenchmark(): BenchmarkDefinition {
  return {
    id: 'multi-agent-delegation',
    name: 'Multi-Agent Task Delegation',
    task: 'Research the impact of quantum computing on cryptography',
    stages: [
      {
        name: 'Graph Construction',
        execute: async (data) => {
          const graph = createDelegationVPIRGraph(data.task as string ?? 'Research quantum computing');
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
        name: 'IFC Flow Check',
        execute: async (data) => {
          const graph = data.graph as VPIRGraph;
          const violations = checkDelegationIFCFlows(graph);
          // The graph is designed so that the valid flow path has no violations.
          // Researcher → Reviewer is valid (confidential → restricted, trust 3 → 4).
          // Task_decomposition → Format_summary flows format_task (internal), which is valid.
          return { ...data, ifcViolations: violations, ifcPassed: violations.length === 0 };
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
      {
        name: 'Trust Boundary Verification',
        execute: async (data) => {
          const graph = data.graph as VPIRGraph;
          // Verify that researcher nodes have trust >= 3
          // and reviewer nodes have trust >= 4
          const researcherNodes = [...graph.nodes.values()].filter(n => n.agentId === 'researcher');
          const reviewerNodes = [...graph.nodes.values()].filter(n => n.agentId === 'reviewer');

          const researcherTrustOk = researcherNodes.every(n => n.label.trustLevel >= 3);
          const reviewerTrustOk = reviewerNodes.every(n => n.label.trustLevel >= 4);

          return {
            ...data,
            trustVerification: {
              researcherTrustOk,
              reviewerTrustOk,
              researcherCount: researcherNodes.length,
              reviewerCount: reviewerNodes.length,
            },
          };
        },
      },
    ],
    passCriteria: (result) => {
      const lastStage = result.stages[result.stages.length - 1];
      const trustData = lastStage.data?.trustVerification as {
        researcherTrustOk: boolean;
        reviewerTrustOk: boolean;
      } | undefined;
      const ifcPassed = result.stages[2]?.data?.ifcPassed as boolean | undefined;
      return (
        result.stages.every(s => s.status === 'passed') &&
        ifcPassed === true &&
        trustData?.researcherTrustOk === true &&
        trustData?.reviewerTrustOk === true
      );
    },
  };
}
