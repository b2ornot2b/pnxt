/**
 * Bridge Grammar JSON Schema definitions for VPIR constrained decoding.
 *
 * These schemas mirror the VPIR types in src/types/vpir.ts exactly, expressed
 * as JSON Schema objects suitable for LLM constrained output (function calling,
 * tool use, or structured output mode). An LLM receiving these schemas is
 * forced to produce valid VPIR nodes — the paradigm's core loop.
 *
 * Based on:
 * - docs/research/original-prompt.md (Bridge Grammar)
 * - src/types/vpir.ts (VPIRNode, VPIRGraph, VPIRRef, Evidence, VPIROutput)
 * - src/types/ifc.ts (SecurityLabel, Classification)
 */

import type { JSONSchema } from '../types/json-schema.js';

/**
 * JSON Schema for Evidence.type (mirrors EvidenceType).
 */
export const EvidenceTypeSchema: JSONSchema = {
  type: 'string',
  enum: ['data', 'rule', 'model_output'],
  description: 'What kind of evidence this is.',
};

/**
 * JSON Schema for Evidence (mirrors Evidence interface).
 */
export const EvidenceSchema: JSONSchema = {
  type: 'object',
  properties: {
    type: EvidenceTypeSchema,
    source: {
      type: 'string',
      minLength: 1,
      description: 'Source identifier (agent ID, tool name, data URL, rule name).',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence in this evidence (0–1).',
    },
    description: {
      type: 'string',
      description: 'Optional human-readable description.',
    },
  },
  required: ['type', 'source', 'confidence'],
  additionalProperties: false,
};

/**
 * JSON Schema for VPIRRef (mirrors VPIRRef interface).
 */
export const VPIRRefSchema: JSONSchema = {
  type: 'object',
  properties: {
    nodeId: {
      type: 'string',
      minLength: 1,
      description: 'ID of the referenced node.',
    },
    port: {
      type: 'string',
      minLength: 1,
      description: 'Named output port on the referenced node.',
    },
    dataType: {
      type: 'string',
      minLength: 1,
      description: 'Type identifier for the data carried by this reference.',
    },
  },
  required: ['nodeId', 'port', 'dataType'],
  additionalProperties: false,
};

/**
 * JSON Schema for VPIROutput (mirrors VPIROutput interface).
 */
export const VPIROutputSchema: JSONSchema = {
  type: 'object',
  properties: {
    port: {
      type: 'string',
      minLength: 1,
      description: 'Port name for this output.',
    },
    dataType: {
      type: 'string',
      minLength: 1,
      description: 'Type identifier for the data produced.',
    },
    value: {
      description: 'Optional: the actual value (for concrete nodes).',
    },
  },
  required: ['port', 'dataType'],
  additionalProperties: false,
};

/**
 * JSON Schema for SecurityLabel (mirrors SecurityLabel interface from src/types/ifc.ts).
 */
export const SecurityLabelSchema: JSONSchema = {
  type: 'object',
  properties: {
    owner: {
      type: 'string',
      minLength: 1,
      description: 'Agent that produced/stored this data.',
    },
    trustLevel: {
      type: 'number',
      minimum: 0,
      maximum: 4,
      description: 'Trust level of the owner at the time of production (0–4).',
    },
    classification: {
      type: 'string',
      enum: ['public', 'internal', 'confidential', 'restricted'],
      description: 'Data classification.',
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
      description: 'When this label was created (ISO 8601).',
    },
  },
  required: ['owner', 'trustLevel', 'classification', 'createdAt'],
  additionalProperties: false,
};

/**
 * JSON Schema for VPIRNodeType (mirrors VPIRNodeType union).
 */
export const VPIRNodeTypeSchema: JSONSchema = {
  type: 'string',
  enum: ['inference', 'observation', 'action', 'assertion', 'composition'],
  description: 'Type of VPIR reasoning step.',
};

/**
 * JSON Schema for VPIRNode (mirrors VPIRNode interface).
 * This is the primary constrained-decoding schema.
 */
export const VPIRNodeSchema: JSONSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      minLength: 1,
      description: 'Unique identifier for this node.',
    },
    type: VPIRNodeTypeSchema,
    operation: {
      type: 'string',
      minLength: 1,
      description: 'Human-readable description of the operation.',
    },
    inputs: {
      type: 'array',
      items: VPIRRefSchema,
      description: 'References to input nodes (predecessors in the DAG).',
    },
    outputs: {
      type: 'array',
      items: VPIROutputSchema,
      description: 'Named outputs produced by this node.',
    },
    evidence: {
      type: 'array',
      items: EvidenceSchema,
      description: 'Evidence supporting this node\'s validity.',
    },
    label: SecurityLabelSchema,
    verifiable: {
      type: 'boolean',
      description: 'Whether this step can be mechanically verified.',
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
      description: 'When this node was created (ISO 8601).',
    },
    agentId: {
      type: 'string',
      description: 'Optional: agent that produced this node.',
    },
  },
  required: [
    'id',
    'type',
    'operation',
    'inputs',
    'outputs',
    'evidence',
    'label',
    'verifiable',
    'createdAt',
  ],
  additionalProperties: false,
};

/**
 * JSON Schema for VPIRGraph (for multi-node generation).
 * Nodes are an array here (not a Map) since JSON cannot represent Maps.
 */
export const VPIRGraphSchema: JSONSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      minLength: 1,
      description: 'Unique identifier for this graph.',
    },
    name: {
      type: 'string',
      minLength: 1,
      description: 'Human-readable name.',
    },
    nodes: {
      type: 'array',
      items: VPIRNodeSchema,
      minItems: 1,
      description: 'All nodes in the graph.',
    },
    roots: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      description: 'Root node IDs (starting points).',
    },
    terminals: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      description: 'Terminal node IDs (endpoints).',
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
      description: 'When this graph was created (ISO 8601).',
    },
  },
  required: ['id', 'name', 'nodes', 'roots', 'terminals', 'createdAt'],
  additionalProperties: false,
};
