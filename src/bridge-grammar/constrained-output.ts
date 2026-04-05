/**
 * Constrained Output Formatters — convert Bridge Grammar schemas into
 * LLM-specific constrained decoding formats.
 *
 * These are schema-only utilities. They produce the JSON Schema in the
 * format expected by different LLM APIs (OpenAI function calling, Anthropic
 * tool use, structured output). No LLM API calls are made here.
 *
 * Based on:
 * - Advisory Review 2026-04-05 (Bridge Grammar as paradigm differentiator)
 */

import type { VPIRNodeType } from '../types/vpir.js';
import type { ConstrainedOutputFormat } from '../types/bridge-grammar.js';
import type { JSONSchema } from '../types/json-schema.js';
import {
  VPIRNodeSchema,
  VPIRNodeTypeSchema,
  VPIRGraphSchema,
} from './vpir-schema.js';

/**
 * Produce an OpenAI-style function-calling schema for VPIRNode generation.
 *
 * When `nodeType` is specified, the `type` field is locked to that value,
 * narrowing the LLM's output to a specific kind of reasoning step.
 */
export function toFunctionCallingSchema(nodeType?: VPIRNodeType): Record<string, unknown> {
  const parameters = nodeType
    ? narrowNodeSchema(nodeType)
    : VPIRNodeSchema;

  return {
    name: 'emit_vpir_node',
    description: 'Emit a single VPIR reasoning step as a verifiable node.',
    parameters,
    strict: true,
  };
}

/**
 * Produce an Anthropic tool_use schema for VPIRNode generation.
 */
export function toAnthropicToolSchema(nodeType?: VPIRNodeType): Record<string, unknown> {
  const inputSchema = nodeType
    ? narrowNodeSchema(nodeType)
    : VPIRNodeSchema;

  return {
    name: 'emit_vpir_node',
    description: 'Emit a single VPIR reasoning step as a verifiable node.',
    input_schema: inputSchema,
  };
}

/**
 * Produce a structured output response_format schema for VPIRGraph generation.
 *
 * This is used when the LLM should produce an entire reasoning chain
 * (multiple nodes) in a single response.
 */
export function toStructuredOutputSchema(): Record<string, unknown> {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'vpir_graph',
      description: 'A complete VPIR reasoning chain as a directed acyclic graph.',
      schema: VPIRGraphSchema,
      strict: true,
    },
  };
}

/**
 * Get the appropriate schema for a given output format.
 */
export function getSchemaForFormat(
  format: ConstrainedOutputFormat,
  nodeType?: VPIRNodeType,
): Record<string, unknown> {
  switch (format) {
    case 'function_calling':
      return toFunctionCallingSchema(nodeType);
    case 'tool_use':
      return toAnthropicToolSchema(nodeType);
    case 'structured_output':
      return toStructuredOutputSchema();
  }
}

/**
 * Create a node schema narrowed to a specific VPIRNodeType.
 * The `type` field becomes a const instead of an enum.
 */
function narrowNodeSchema(nodeType: VPIRNodeType): JSONSchema {
  return {
    ...VPIRNodeSchema,
    properties: {
      ...VPIRNodeSchema.properties,
      type: {
        ...VPIRNodeTypeSchema,
        const: nodeType,
        enum: undefined,
      },
    },
  };
}
