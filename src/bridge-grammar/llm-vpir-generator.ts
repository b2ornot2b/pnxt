/**
 * LLM-Driven VPIR Generation via Bridge Grammar.
 *
 * Uses the Claude API to generate VPIR graphs from natural language task
 * descriptions, validated through the Bridge Grammar JSON schema. This is
 * the first real LLM integration — empirically validating that constrained
 * decoding can produce valid VPIR reasoning chains.
 *
 * Based on:
 * - Advisory Review 2026-04-05 (Sutskever: "Bridge Grammar is the hardest problem")
 * - src/bridge-grammar/vpir-schema.ts (JSON Schema definitions)
 * - src/bridge-grammar/schema-validator.ts (validation pipeline)
 */

import Anthropic from '@anthropic-ai/sdk';
import type { VPIRGraph } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import { VPIRGraphSchema } from './vpir-schema.js';
import { parseVPIRGraph } from './schema-validator.js';

/**
 * Options for VPIR generation.
 */
export interface VPIRGeneratorOptions {
  /** Claude model to use. Default: 'claude-sonnet-4-20250514'. */
  model?: string;

  /** Maximum retry attempts for invalid output. Default: 2. */
  maxRetries?: number;

  /** IFC security label to apply to generated nodes. */
  securityLabel?: SecurityLabel;

  /** Temperature for generation (0-1). Default: 0.0 for determinism. */
  temperature?: number;

  /** Maximum tokens for response. Default: 4096. */
  maxTokens?: number;

  /** Custom Anthropic client (for testing/DI). */
  client?: Anthropic;
}

/**
 * Result of VPIR generation attempt.
 */
export interface VPIRGenerationResult {
  /** Whether generation succeeded. */
  success: boolean;

  /** The generated VPIR graph (if successful). */
  graph?: VPIRGraph;

  /** Number of attempts made. */
  attempts: number;

  /** Validation errors from failed attempts. */
  errors: string[];

  /** Raw LLM response text (for debugging). */
  rawResponse?: string;
}

/**
 * System prompt for VPIR graph generation.
 */
const VPIR_SYSTEM_PROMPT = `You are a reasoning chain generator for the Agent-Native Programming (ANP) paradigm.
Your task is to decompose a given task description into a VPIR (Verifiable Programmatic Intermediate Representation) graph — a directed acyclic graph of verifiable reasoning steps.

Each node in the graph represents one reasoning step:
- **observation**: Raw data gathering from an external source
- **inference**: A conclusion derived from input data
- **action**: A side-effecting operation (API call, file write, etc.)
- **assertion**: A claimed invariant or postcondition to verify
- **composition**: An aggregation of multiple sub-steps

Rules:
1. Every graph must have at least one root node (no inputs) and one terminal node
2. Nodes reference inputs via nodeId/port/dataType — forming a DAG
3. Every node must have at least one evidence entry
4. The graph must be acyclic (no circular dependencies)
5. Use the emit_vpir_graph tool to output the complete graph
6. Node IDs should be descriptive (e.g., "observe-input", "infer-dependencies")
7. Use ISO 8601 timestamps for createdAt fields
8. Set verifiable=true for deterministic steps, false for side-effecting actions`;

/**
 * Generate a VPIR graph from a natural language task description.
 *
 * Uses Claude API with Bridge Grammar schemas as tool definitions to
 * produce structurally valid VPIR graphs. Validates output through
 * the existing Bridge Grammar validator and retries on failure.
 *
 * @param taskDescription - Natural language description of the task
 * @param options - Generation options
 * @returns Generation result with VPIR graph or errors
 */
export async function generateVPIRGraph(
  taskDescription: string,
  options?: VPIRGeneratorOptions,
): Promise<VPIRGenerationResult> {
  const model = options?.model ?? 'claude-sonnet-4-20250514';
  const maxRetries = options?.maxRetries ?? 2;
  const temperature = options?.temperature ?? 0.0;
  const maxTokens = options?.maxTokens ?? 4096;

  const client = options?.client ?? new Anthropic();

  const tool = buildVPIRGraphTool(options?.securityLabel);
  const errors: string[] = [];
  let rawResponse: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const messages: Anthropic.MessageParam[] = buildMessages(
      taskDescription,
      attempt > 0 ? errors : undefined,
    );

    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: VPIR_SYSTEM_PROMPT,
      tools: [tool],
      tool_choice: { type: 'tool', name: 'emit_vpir_graph' },
      messages,
    });

    // Extract tool use from response
    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (!toolUse) {
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      );
      rawResponse = textBlock?.text;
      errors.push(`Attempt ${attempt + 1}: No tool_use block in response`);
      continue;
    }

    rawResponse = JSON.stringify(toolUse.input);

    // Apply security label override if specified
    const input = applySecurityLabel(toolUse.input, options?.securityLabel);

    // Validate through Bridge Grammar
    const validationResult = parseVPIRGraph(input);

    if (validationResult.valid && validationResult.graph) {
      return {
        success: true,
        graph: validationResult.graph,
        attempts: attempt + 1,
        errors: [],
        rawResponse,
      };
    }

    // Collect validation errors for retry prompt
    const attemptErrors = validationResult.errors.map(
      (e) => `[${e.code}] ${e.path}: ${e.message}`,
    );
    errors.push(
      `Attempt ${attempt + 1}: Validation failed — ${attemptErrors.join('; ')}`,
    );
  }

  return {
    success: false,
    attempts: maxRetries + 1,
    errors,
    rawResponse,
  };
}

/**
 * Build the Anthropic tool definition for VPIR graph generation.
 * Exported for reuse by the neurosymbolic Active Inference engine.
 */
export function buildVPIRGraphTool(
  securityLabel?: SecurityLabel,
): Anthropic.Tool {
  const description = securityLabel
    ? `Emit a complete VPIR reasoning graph. Use security label: owner="${securityLabel.owner}", trustLevel=${securityLabel.trustLevel}, classification="${securityLabel.classification}".`
    : 'Emit a complete VPIR reasoning graph as a directed acyclic graph of verifiable reasoning steps.';

  return {
    name: 'emit_vpir_graph',
    description,
    input_schema: VPIRGraphSchema as Anthropic.Tool.InputSchema,
  };
}

/**
 * Build the messages array for the API call.
 */
function buildMessages(
  taskDescription: string,
  previousErrors?: string[],
): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];

  if (previousErrors && previousErrors.length > 0) {
    // Include previous attempt and errors for retry
    messages.push({
      role: 'user',
      content: `Decompose this task into a VPIR reasoning graph:\n\n${taskDescription}`,
    });
    messages.push({
      role: 'assistant',
      content: 'I\'ll generate the VPIR graph. Let me try again with corrections.',
    });
    messages.push({
      role: 'user',
      content: `The previous attempt had validation errors:\n${previousErrors.join('\n')}\n\nPlease fix these issues and regenerate the VPIR graph.`,
    });
  } else {
    messages.push({
      role: 'user',
      content: `Decompose this task into a VPIR reasoning graph:\n\n${taskDescription}`,
    });
  }

  return messages;
}

/**
 * Apply a security label override to all nodes in the raw tool output.
 */
function applySecurityLabel(
  input: unknown,
  securityLabel?: SecurityLabel,
): unknown {
  if (!securityLabel || typeof input !== 'object' || input === null) return input;

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

/**
 * Create a mock Anthropic client for testing.
 *
 * Returns a client-like object that responds with pre-configured VPIR graphs.
 * Useful for unit tests that need to validate the generation pipeline without
 * making real API calls.
 *
 * @param toolInput - The raw JSON to return as tool_use input
 * @param failFirst - If true, first call returns text-only (no tool_use)
 */
export function createMockClient(
  toolInput: unknown,
  failFirst?: boolean,
): Anthropic {
  let callCount = 0;

  const mockClient = {
    messages: {
      create: async (): Promise<Anthropic.Message> => {
        callCount++;
        if (failFirst && callCount === 1) {
          return {
            id: 'mock-msg-1',
            type: 'message',
            role: 'assistant',
            content: [
              { type: 'text', text: 'I failed to use the tool.' },
            ],
            model: 'mock',
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          } as Anthropic.Message;
        }
        return {
          id: `mock-msg-${callCount}`,
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'mock-tool-1',
              name: 'emit_vpir_graph',
              input: toolInput,
            },
          ],
          model: 'mock',
          stop_reason: 'tool_use',
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        } as Anthropic.Message;
      },
    },
  };

  return mockClient as unknown as Anthropic;
}

/**
 * Create a valid VPIR graph JSON object for testing.
 *
 * Produces a simple but structurally valid VPIR graph that passes
 * Bridge Grammar validation. Useful as mock client input.
 */
export function createSampleVPIRGraphJSON(
  taskName: string = 'sample-task',
): Record<string, unknown> {
  const now = new Date().toISOString();
  const label = {
    owner: 'llm-generator',
    trustLevel: 2,
    classification: 'internal',
    createdAt: now,
  };

  return {
    id: `vpir-${taskName}`,
    name: `VPIR Graph: ${taskName}`,
    nodes: [
      {
        id: 'observe-input',
        type: 'observation',
        operation: 'Gather input data for task',
        inputs: [],
        outputs: [{ port: 'data', dataType: 'TaskInput' }],
        evidence: [{ type: 'data', source: 'user-input', confidence: 1.0 }],
        label,
        verifiable: true,
        createdAt: now,
        agentId: 'llm-generator',
      },
      {
        id: 'infer-plan',
        type: 'inference',
        operation: 'Analyze input and derive execution plan',
        inputs: [{ nodeId: 'observe-input', port: 'data', dataType: 'TaskInput' }],
        outputs: [{ port: 'plan', dataType: 'ExecutionPlan' }],
        evidence: [
          { type: 'model_output', source: 'llm-reasoning', confidence: 0.85 },
        ],
        label,
        verifiable: true,
        createdAt: now,
        agentId: 'llm-generator',
      },
      {
        id: 'execute-action',
        type: 'action',
        operation: 'Execute the derived plan',
        inputs: [{ nodeId: 'infer-plan', port: 'plan', dataType: 'ExecutionPlan' }],
        outputs: [{ port: 'result', dataType: 'ActionResult' }],
        evidence: [
          { type: 'data', source: 'execution-engine', confidence: 0.9 },
        ],
        label,
        verifiable: false,
        createdAt: now,
        agentId: 'llm-generator',
      },
      {
        id: 'assert-success',
        type: 'assertion',
        operation: 'Verify execution completed successfully',
        inputs: [{ nodeId: 'execute-action', port: 'result', dataType: 'ActionResult' }],
        outputs: [{ port: 'verified', dataType: 'boolean' }],
        evidence: [
          { type: 'rule', source: 'postcondition-check', confidence: 1.0 },
        ],
        label,
        verifiable: true,
        createdAt: now,
        agentId: 'llm-generator',
      },
    ],
    roots: ['observe-input'],
    terminals: ['assert-success'],
    createdAt: now,
  };
}
