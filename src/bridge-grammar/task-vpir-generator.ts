/**
 * Task-Aware VPIR Generation — enhanced LLM prompting with handler-library awareness.
 *
 * Extends the base VPIR generator with knowledge of available tool handlers,
 * enabling LLMs to author VPIR graphs that reference real, executable operations
 * from the standard handler library.
 *
 * Sprint 11 deliverable — Advisory Panel: Kay, Liskov, Agha.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { SecurityLabel } from '../types/ifc.js';
import type { ToolRegistration } from '../types/aci.js';
import { VPIRGraphSchema } from './vpir-schema.js';
import { parseVPIRGraph } from './schema-validator.js';
import { ToolRegistry, createStandardRegistry } from '../aci/tool-registry.js';
import type { VPIRGeneratorOptions, VPIRGenerationResult } from './llm-vpir-generator.js';

// ── Types ─────────────────────────────────────────────────────────

export interface TaskVPIRGeneratorOptions extends VPIRGeneratorOptions {
  /** Tool registry to document available handlers. Uses standard if not provided. */
  toolRegistry?: ToolRegistry;
}

// ── System Prompt ─────────────────────────────────────────────────

/**
 * Build the task-aware system prompt that describes available handlers.
 */
export function buildTaskAwareSystemPrompt(registrations: ToolRegistration[]): string {
  const handlerDocs = registrations.map((reg) => {
    const inputFields = reg.inputSchema?.properties
      ? Object.entries(reg.inputSchema.properties as Record<string, { type?: string; description?: string }>)
        .map(([key, val]) => `    - ${key}: ${val.type ?? 'any'} — ${val.description ?? ''}`)
        .join('\n')
      : '    (no documented fields)';

    const required = Array.isArray(reg.inputSchema?.required)
      ? (reg.inputSchema.required as string[]).join(', ')
      : 'none';

    return `### ${reg.name}
  Description: ${reg.description}
  Required trust: ${reg.requiredTrustLevel ?? 0}
  Side effects: ${reg.sideEffects.join(', ')}
  Input fields:
${inputFields}
  Required: ${required}`;
  });

  return `You are a task-aware reasoning chain generator for the Agent-Native Programming (ANP) paradigm.
Your task is to decompose a given task description into a VPIR (Verifiable Programmatic Intermediate Representation) graph that uses REAL tool handlers to perform work.

## Available Tool Handlers

The following handlers are registered and available for use as operation names in action nodes:

${handlerDocs.join('\n\n')}

## Rules

1. **Observation nodes** carry literal input data in outputs[0].value
2. **Action nodes** MUST use one of the handler names listed above as their operation name
3. **Inference nodes** can use handler names for pure transforms (json-transform, math-eval, string-format) or describe custom logic
4. **Assertion nodes** can use data-validate for validation checks
5. Every graph must have at least one root node (no inputs) and one terminal node
6. Nodes reference inputs via nodeId/port/dataType — forming a DAG
7. Every node must have at least one evidence entry
8. The graph must be acyclic
9. Use the emit_vpir_graph tool to output the complete graph
10. Node IDs should be descriptive (e.g., "observe-input", "convert-temperature")
11. Use ISO 8601 timestamps for createdAt fields
12. Set verifiable=true for deterministic steps, false for side-effecting actions with external dependencies`;
}

/**
 * Build the Anthropic tool definition for task-aware VPIR generation.
 */
export function buildTaskAwareVPIRTool(
  registry: ToolRegistry,
  securityLabel?: SecurityLabel,
): Anthropic.Tool {
  const registrations = registry.listRegistrations();
  const handlerList = registrations.map((r) => r.name).join(', ');

  const description = securityLabel
    ? `Emit a VPIR graph that uses real tool handlers (${handlerList}). Security label: owner="${securityLabel.owner}", trustLevel=${securityLabel.trustLevel}, classification="${securityLabel.classification}".`
    : `Emit a VPIR graph that uses real tool handlers (${handlerList}) for execution.`;

  return {
    name: 'emit_vpir_graph',
    description,
    input_schema: VPIRGraphSchema as Anthropic.Tool.InputSchema,
  };
}

// ── Generator ─────────────────────────────────────────────────────

/**
 * Generate a task-aware VPIR graph from a natural language description.
 *
 * Extends the base generator with handler-library documentation in the system prompt,
 * enabling the LLM to author VPIR graphs with real handler operations.
 */
export async function generateTaskVPIRGraph(
  taskDescription: string,
  options?: TaskVPIRGeneratorOptions,
): Promise<VPIRGenerationResult> {
  const registry = options?.toolRegistry ?? createStandardRegistry();
  const model = options?.model ?? 'claude-sonnet-4-20250514';
  const maxRetries = options?.maxRetries ?? 2;
  const temperature = options?.temperature ?? 0.0;
  const maxTokens = options?.maxTokens ?? 4096;

  const client = options?.client ?? new Anthropic();
  const registrations = registry.listRegistrations();

  const systemPrompt = buildTaskAwareSystemPrompt(registrations);
  const tool = buildTaskAwareVPIRTool(registry, options?.securityLabel);
  const errors: string[] = [];
  let rawResponse: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const messages = buildMessages(taskDescription, attempt > 0 ? errors : undefined);

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
      errors.push(`Attempt ${attempt + 1}: No tool_use block in response`);
      continue;
    }

    rawResponse = JSON.stringify(toolUse.input);

    // Apply security label override if specified
    const input = applySecurityLabel(toolUse.input, options?.securityLabel);

    // Validate through Bridge Grammar
    const validationResult = parseVPIRGraph(input);

    if (!validationResult.valid || !validationResult.graph) {
      const attemptErrors = validationResult.errors.map(
        (e) => `[${e.code}] ${e.path}: ${e.message}`,
      );
      errors.push(
        `Attempt ${attempt + 1}: Validation failed — ${attemptErrors.join('; ')}`,
      );
      continue;
    }

    // Post-generation: validate that all action operations resolve to registered handlers
    const discovery = registry.discoverTools(validationResult.graph);
    if (!discovery.allAvailable) {
      errors.push(
        `Attempt ${attempt + 1}: Missing handlers — ${discovery.missing.join(', ')}. Available handlers: ${registrations.map((r) => r.name).join(', ')}`,
      );
      continue;
    }

    return {
      success: true,
      graph: validationResult.graph,
      attempts: attempt + 1,
      errors: [],
      rawResponse,
    };
  }

  return {
    success: false,
    attempts: maxRetries + 1,
    errors,
    rawResponse,
  };
}

// ── Helpers ───────────────────────────────────────────────────────

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
      content: `The previous attempt had errors:\n${previousErrors.join('\n')}\n\nPlease fix these issues and regenerate.`,
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
