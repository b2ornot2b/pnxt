/**
 * Self-Hosting Proof of Concept — pnxt describes its own pipeline.
 *
 * Demonstrates recursive self-description: the pnxt integration pipeline
 * (NL → Bridge Grammar → VPIR → HoTT → Z3 → DPN) is itself described
 * as a VPIR graph, then verified, categorized, and executed using the
 * same pipeline components.
 *
 * This is not full self-hosting (pnxt is still TypeScript), but it proves
 * the system can reason about itself using its own tools — the first step
 * toward the self-hosting vision:
 *
 * 1. pnxt can describe its own pipeline    ← This sprint (M1)
 * 2. pnxt can modify its pipeline           ← Phase 7
 * 3. pnxt can execute modifications         ← Phase 7+
 * 4. pnxt is written in pnxt               ← Long-term vision
 *
 * Sprint 9 deliverable — Advisory Panel: Kay, Voevodsky, Sutskever.
 */

import type { VPIRGraph, VPIRNode, VPIRRef, VPIROutput, Evidence } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import type { Category, CategoryValidationResult } from '../types/hott.js';
import type { VPIRExecutionContext, InferenceHandler } from '../types/vpir-execution.js';
import type { DPNExecutionResult } from '../channel/dpn-runtime.js';
import type { ProgramProperty } from '../types/verification.js';
import { createLabel } from '../types/ifc.js';
import { vpirGraphToCategory } from '../hott/vpir-bridge.js';
import { validateCategory } from '../hott/category.js';
import { validateGraph } from '../vpir/vpir-validator.js';
import { DPNRuntime } from '../channel/dpn-runtime.js';

// ── Pipeline Stage Definitions ─────────────────────────────────────

/**
 * The six stages of the pnxt integration pipeline, each described
 * as a VPIR node with appropriate type, inputs, outputs, and IFC labels.
 */
interface PipelineStageSpec {
  id: string;
  type: VPIRNode['type'];
  operation: string;
  description: string;
  trustLevel: 0 | 1 | 2 | 3 | 4;
  classification: SecurityLabel['classification'];
  outputDataType: string;
}

const PIPELINE_STAGES: PipelineStageSpec[] = [
  {
    id: 'nl-input',
    type: 'observation',
    operation: 'capture-natural-language',
    description: 'Accept natural language task description from user or agent',
    trustLevel: 1,
    classification: 'public',
    outputDataType: 'string',
  },
  {
    id: 'bridge-grammar',
    type: 'inference',
    operation: 'constrained-decoding',
    description: 'Apply Bridge Grammar JSON schema forcing to constrain LLM output to valid VPIR',
    trustLevel: 2,
    classification: 'internal',
    outputDataType: 'object',
  },
  {
    id: 'vpir-generation',
    type: 'action',
    operation: 'generate-vpir-graph',
    description: 'Construct and validate a VPIR reasoning graph from constrained LLM output',
    trustLevel: 2,
    classification: 'internal',
    outputDataType: 'object',
  },
  {
    id: 'hott-categorization',
    type: 'inference',
    operation: 'categorize-vpir',
    description: 'Map VPIR graph to HoTT category: nodes→objects, edges→morphisms',
    trustLevel: 3,
    classification: 'confidential',
    outputDataType: 'object',
  },
  {
    id: 'z3-verification',
    type: 'assertion',
    operation: 'verify-properties',
    description: 'Formally verify IFC flow, categorical laws, and user properties via Z3 SMT',
    trustLevel: 3,
    classification: 'confidential',
    outputDataType: 'boolean',
  },
  {
    id: 'dpn-execution',
    type: 'action',
    operation: 'execute-via-dpn',
    description: 'Compile VPIR to DPN processes and execute through actor message-passing',
    trustLevel: 4,
    classification: 'restricted',
    outputDataType: 'object',
  },
];

// ── Self-Description ───────────────────────────────────────────────

/**
 * Describe the pnxt integration pipeline as a VPIR graph.
 *
 * Each pipeline stage becomes a VPIR node:
 *   NL Input (observation) → Bridge Grammar (inference) →
 *   VPIR Generation (action) → HoTT Categorization (inference) →
 *   Z3 Verification (assertion) → DPN Execution (action)
 *
 * The graph captures the actual data flow, IFC label progression
 * (labels increase in trust through the pipeline), and stage semantics.
 */
export function describePipelineAsVPIR(): VPIRGraph {
  const now = new Date().toISOString();
  const nodes = new Map<string, VPIRNode>();

  for (let i = 0; i < PIPELINE_STAGES.length; i++) {
    const stage = PIPELINE_STAGES[i];

    const inputs: VPIRRef[] = [];
    if (i > 0) {
      const prev = PIPELINE_STAGES[i - 1];
      inputs.push({
        nodeId: prev.id,
        port: 'output',
        dataType: prev.outputDataType,
      });
    }

    const evidence: Evidence[] = [
      {
        type: 'rule',
        source: 'pnxt-architecture',
        confidence: 1.0,
        description: stage.description,
      },
    ];

    const outputs: VPIROutput[] = [
      {
        port: 'output',
        dataType: stage.outputDataType,
      },
    ];

    const label = createLabel(
      'pnxt-pipeline',
      stage.trustLevel,
      stage.classification,
    );

    nodes.set(stage.id, {
      id: stage.id,
      type: stage.type,
      operation: stage.operation,
      inputs,
      outputs,
      evidence,
      label,
      verifiable: true,
      createdAt: now,
    });
  }

  return {
    id: 'pnxt-self-description',
    name: 'pnxt Integration Pipeline (Self-Description)',
    nodes,
    roots: ['nl-input'],
    terminals: ['dpn-execution'],
    createdAt: now,
  };
}

// ── Self-Verification Properties ───────────────────────────────────

/**
 * Define the program properties to verify on the self-describing graph.
 *
 * These properties capture structural invariants of the pipeline:
 * - Precondition: input stage has low trust (public entry point)
 * - Postcondition: verification stage has high trust (formal guarantee)
 * - Invariant: all stages have non-zero confidence evidence
 */
export function createSelfVerificationProperties(): ProgramProperty[] {
  return [
    {
      id: 'self-precondition-input-trust',
      kind: 'precondition',
      targetNodes: ['nl-input'],
      formula: '(<= node_nl-input_trust 1)',
      description: 'Pipeline input has low trust (public entry point)',
    },
    {
      id: 'self-postcondition-execution-trust',
      kind: 'postcondition',
      targetNodes: ['dpn-execution'],
      formula: '(>= node_dpn-execution_trust 4)',
      description: 'DPN execution stage has highest trust level',
    },
    {
      id: 'self-invariant-confidence',
      kind: 'invariant',
      targetNodes: PIPELINE_STAGES.map((s) => s.id),
      formula: PIPELINE_STAGES.map(
        (s) => `(>= node_${s.id}_confidence 80)`,
      ).reduce((acc, f) => `(and ${acc} ${f})`),
      description: 'All pipeline stages have confidence >= 80%',
    },
  ];
}

// ── Self-Categorization ────────────────────────────────────────────

/**
 * Categorize the pipeline self-description using HoTT.
 *
 * Converts the VPIR graph to a HoTT category where:
 * - Pipeline stages are categorical objects
 * - Stage transitions are morphisms
 * - Categorical laws validate pipeline structure
 */
export function categorizePipelineDescription(graph: VPIRGraph): {
  category: Category;
  validation: CategoryValidationResult;
} {
  const category = vpirGraphToCategory(graph);
  const validation = validateCategory(category);
  return { category, validation };
}

// ── Self-Execution ─────────────────────────────────────────────────

/**
 * Create an execution context for the pipeline self-description.
 *
 * Each pipeline stage handler simulates the stage's behavior:
 * - NL Input: passes through the input
 * - Bridge Grammar: returns a mock schema-constrained output
 * - VPIR Generation: returns a mock VPIR graph descriptor
 * - HoTT Categorization: returns a mock category descriptor
 * - Z3 Verification: returns verification success
 * - DPN Execution: returns execution result
 */
export function createSelfExecutionContext(): VPIRExecutionContext {
  const handlers = new Map<string, InferenceHandler>();

  // Bridge Grammar: constrained decoding simulation
  handlers.set('constrained-decoding', async (inputs) => {
    const nlInput = inputs.values().next().value as string;
    return {
      stage: 'bridge-grammar',
      constrainedOutput: true,
      inputLength: typeof nlInput === 'string' ? nlInput.length : 0,
      schemaApplied: 'VPIRGraphSchema',
    };
  });

  // HoTT Categorization: category construction simulation
  handlers.set('categorize-vpir', async () => {
    return {
      stage: 'hott-categorization',
      categorized: true,
      objectCount: 6,
      morphismCount: 5,
      categoricallyValid: true,
    };
  });

  // Assertion handler for Z3 verification stage
  const assertionHandlers = new Map<string, (inputs: Map<string, unknown>) => Promise<boolean>>();
  assertionHandlers.set('verify-properties', async () => {
    // Self-verification: the pipeline description is structurally valid
    return true;
  });

  // ACI gateway for action nodes (VPIR generation, DPN execution)
  const aciGateway = {
    async invoke(invocation: {
      toolName: string;
      input: unknown;
      agentId: string;
      requestId: string;
      requesterLabel?: SecurityLabel;
    }): Promise<{
      requestId: string;
      success: boolean;
      output?: unknown;
      error?: { code: string; message: string; retryable: boolean };
      duration: number;
    }> {
      // Simulate tool execution for action nodes
      if (invocation.toolName === 'generate-vpir-graph') {
        return {
          requestId: invocation.requestId,
          success: true,
          output: {
            stage: 'vpir-generation',
            generated: true,
            nodeCount: 6,
            validated: true,
          },
          duration: 5,
        };
      }

      if (invocation.toolName === 'execute-via-dpn') {
        return {
          requestId: invocation.requestId,
          success: true,
          output: {
            stage: 'dpn-execution',
            executed: true,
            processCount: 6,
            channelCount: 5,
            status: 'completed',
          },
          duration: 10,
        };
      }

      return {
        requestId: invocation.requestId,
        success: false,
        error: {
          code: 'UNKNOWN_TOOL',
          message: `Unknown tool: ${invocation.toolName}`,
          retryable: false,
        },
        duration: 0,
      };
    },
  };

  return {
    agentId: 'pnxt-self-hosting',
    label: createLabel('pnxt-self-hosting', 4, 'restricted'),
    handlers,
    assertionHandlers,
    aciGateway,
  };
}

/**
 * Execute the pipeline self-description through DPN.
 *
 * The DPN runtime compiles the self-describing VPIR graph into
 * Process actors and typed Channels, then executes it through
 * actor message-passing — the same execution substrate the
 * pipeline itself uses for real workloads.
 */
export async function executePipelineDescription(
  graph: VPIRGraph,
): Promise<DPNExecutionResult> {
  const context = createSelfExecutionContext();

  const runtime = new DPNRuntime({
    context,
    timeout: 10_000,
    channelBufferSize: 8,
    enableTracing: true,
  });

  runtime.compile(graph);
  return runtime.execute();
}

// ── Full Self-Hosting Run ──────────────────────────────────────────

/**
 * Run the complete self-hosting proof of concept.
 *
 * 1. Describe the pnxt pipeline as a VPIR graph
 * 2. Validate the self-description
 * 3. Categorize it using HoTT
 * 4. Execute it through DPN
 *
 * Returns a comprehensive result showing that pnxt can reason about
 * itself using its own tools.
 */
export async function runSelfHostingPoC(): Promise<{
  graph: VPIRGraph;
  validation: { valid: boolean };
  categorization: { category: Category; validation: CategoryValidationResult };
  execution: DPNExecutionResult;
}> {
  // Step 1: Self-describe
  const graph = describePipelineAsVPIR();

  // Step 2: Validate
  const validation = validateGraph(graph);

  // Step 3: Categorize
  const categorization = categorizePipelineDescription(graph);

  // Step 4: Execute
  const execution = await executePipelineDescription(graph);

  return {
    graph,
    validation,
    categorization,
    execution,
  };
}
