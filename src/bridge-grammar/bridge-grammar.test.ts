/**
 * Bridge Grammar test suite — validates that the JSON Schema definitions
 * correctly constrain LLM output to valid VPIR nodes and graphs.
 */

import { parseVPIRNode, parseVPIRGraph } from './schema-validator.js';
import {
  toFunctionCallingSchema,
  toAnthropicToolSchema,
  toStructuredOutputSchema,
  getSchemaForFormat,
} from './constrained-output.js';
import {
  VPIRNodeSchema,
  VPIRGraphSchema,
  SecurityLabelSchema,
  EvidenceSchema,
} from './vpir-schema.js';
import type { VPIRNode } from '../types/vpir.js';

/** Helper: create a minimal valid VPIRNode JSON object. */
function validNodeJSON(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'node-1',
    type: 'inference',
    operation: 'Derive conclusion from inputs',
    inputs: [],
    outputs: [{ port: 'result', dataType: 'string' }],
    evidence: [
      { type: 'rule', source: 'logic-engine', confidence: 0.95 },
    ],
    label: {
      owner: 'agent-a',
      trustLevel: 2,
      classification: 'internal',
      createdAt: '2026-04-05T12:00:00Z',
    },
    verifiable: true,
    createdAt: '2026-04-05T12:00:00Z',
    ...overrides,
  };
}

/** Helper: create a minimal valid VPIRGraph JSON object. */
function validGraphJSON(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'graph-1',
    name: 'Test reasoning chain',
    nodes: [
      validNodeJSON({ id: 'root', inputs: [] }),
      validNodeJSON({
        id: 'step-2',
        inputs: [{ nodeId: 'root', port: 'result', dataType: 'string' }],
      }),
    ],
    roots: ['root'],
    terminals: ['step-2'],
    createdAt: '2026-04-05T12:00:00Z',
    ...overrides,
  };
}

describe('Bridge Grammar — parseVPIRNode', () => {
  it('should parse a valid VPIRNode JSON successfully', () => {
    const result = parseVPIRNode(validNodeJSON());
    expect(result.valid).toBe(true);
    expect(result.node).toBeDefined();
    expect(result.node!.id).toBe('node-1');
    expect(result.node!.type).toBe('inference');
    expect(result.errors).toEqual([]);
  });

  it('should preserve all fields in the parsed node', () => {
    const json = validNodeJSON({ agentId: 'agent-007' });
    const result = parseVPIRNode(json);
    expect(result.valid).toBe(true);
    expect(result.node!.agentId).toBe('agent-007');
    expect(result.node!.evidence).toHaveLength(1);
    expect(result.node!.evidence[0].confidence).toBe(0.95);
    expect(result.node!.label.classification).toBe('internal');
  });

  it('should round-trip: TS VPIRNode -> JSON -> parse -> compare', () => {
    const original: VPIRNode = {
      id: 'roundtrip-1',
      type: 'observation',
      operation: 'Read file contents',
      inputs: [],
      outputs: [{ port: 'data', dataType: 'buffer' }],
      evidence: [{ type: 'data', source: 'fs', confidence: 1.0 }],
      label: {
        owner: 'agent-b',
        trustLevel: 3,
        classification: 'confidential',
        createdAt: '2026-04-05T10:00:00Z',
      },
      verifiable: false,
      createdAt: '2026-04-05T10:00:00Z',
    };

    const json = JSON.parse(JSON.stringify(original));
    const result = parseVPIRNode(json);

    expect(result.valid).toBe(true);
    expect(result.node).toEqual(original);
  });

  describe('required field validation', () => {
    it('should reject missing id', () => {
      const result = parseVPIRNode(validNodeJSON({ id: '' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === '/id')).toBe(true);
    });

    it('should reject missing type', () => {
      const result = parseVPIRNode(validNodeJSON({ type: undefined }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === '/type')).toBe(true);
    });

    it('should reject missing operation', () => {
      const result = parseVPIRNode(validNodeJSON({ operation: '' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === '/operation')).toBe(true);
    });

    it('should reject missing verifiable', () => {
      const result = parseVPIRNode(validNodeJSON({ verifiable: 'yes' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === '/verifiable')).toBe(true);
    });

    it('should reject missing createdAt', () => {
      const result = parseVPIRNode(validNodeJSON({ createdAt: '' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === '/createdAt')).toBe(true);
    });

    it('should reject missing label', () => {
      const result = parseVPIRNode(validNodeJSON({ label: null }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === '/label')).toBe(true);
    });

    it('should reject missing inputs', () => {
      const result = parseVPIRNode(validNodeJSON({ inputs: 'not-an-array' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === '/inputs')).toBe(true);
    });
  });

  describe('enum constraint validation', () => {
    it('should reject invalid node type', () => {
      const result = parseVPIRNode(validNodeJSON({ type: 'speculation' }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_ENUM' && e.path === '/type')).toBe(true);
    });

    it('should accept all valid node types', () => {
      const types = ['inference', 'observation', 'action', 'assertion', 'composition'];
      for (const type of types) {
        const result = parseVPIRNode(validNodeJSON({ type }));
        expect(result.valid).toBe(true);
      }
    });

    it('should reject invalid evidence type', () => {
      const result = parseVPIRNode(validNodeJSON({
        evidence: [{ type: 'guess', source: 'me', confidence: 0.5 }],
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_ENUM' && e.path.includes('evidence'))).toBe(true);
    });

    it('should reject invalid classification', () => {
      const result = parseVPIRNode(validNodeJSON({
        label: { owner: 'a', trustLevel: 1, classification: 'secret', createdAt: '2026-01-01T00:00:00Z' },
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_ENUM')).toBe(true);
    });
  });

  describe('range validation', () => {
    it('should reject confidence > 1', () => {
      const result = parseVPIRNode(validNodeJSON({
        evidence: [{ type: 'data', source: 'src', confidence: 1.5 }],
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_RANGE' && e.path.includes('confidence'))).toBe(true);
    });

    it('should reject confidence < 0', () => {
      const result = parseVPIRNode(validNodeJSON({
        evidence: [{ type: 'data', source: 'src', confidence: -0.1 }],
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_RANGE')).toBe(true);
    });

    it('should reject trustLevel > 4', () => {
      const result = parseVPIRNode(validNodeJSON({
        label: { owner: 'a', trustLevel: 5, classification: 'public', createdAt: '2026-01-01T00:00:00Z' },
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_RANGE' && e.path.includes('trustLevel'))).toBe(true);
    });

    it('should reject trustLevel < 0', () => {
      const result = parseVPIRNode(validNodeJSON({
        label: { owner: 'a', trustLevel: -1, classification: 'public', createdAt: '2026-01-01T00:00:00Z' },
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_RANGE')).toBe(true);
    });

    it('should reject non-integer trustLevel', () => {
      const result = parseVPIRNode(validNodeJSON({
        label: { owner: 'a', trustLevel: 2.5, classification: 'public', createdAt: '2026-01-01T00:00:00Z' },
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_RANGE')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should reject null input', () => {
      const result = parseVPIRNode(null);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_TYPE');
    });

    it('should reject array input', () => {
      const result = parseVPIRNode([1, 2, 3]);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_TYPE');
    });

    it('should reject string input', () => {
      const result = parseVPIRNode('not a node');
      expect(result.valid).toBe(false);
    });

    it('should reject empty object', () => {
      const result = parseVPIRNode({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should accept node with empty evidence array', () => {
      const result = parseVPIRNode(validNodeJSON({ evidence: [] }));
      expect(result.valid).toBe(true);
    });

    it('should accept node with empty inputs array', () => {
      const result = parseVPIRNode(validNodeJSON({ inputs: [] }));
      expect(result.valid).toBe(true);
    });

    it('should handle evidence with optional description', () => {
      const result = parseVPIRNode(validNodeJSON({
        evidence: [
          { type: 'data', source: 'src', confidence: 0.8, description: 'test evidence' },
        ],
      }));
      expect(result.valid).toBe(true);
      expect(result.node!.evidence[0].description).toBe('test evidence');
    });

    it('should handle output with optional value', () => {
      const result = parseVPIRNode(validNodeJSON({
        outputs: [{ port: 'result', dataType: 'number', value: 42 }],
      }));
      expect(result.valid).toBe(true);
      expect(result.node!.outputs[0].value).toBe(42);
    });
  });

  describe('VPIRRef validation', () => {
    it('should reject ref with missing nodeId', () => {
      const result = parseVPIRNode(validNodeJSON({
        inputs: [{ nodeId: '', port: 'out', dataType: 'string' }],
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.includes('inputs/0'))).toBe(true);
    });

    it('should reject ref with missing port', () => {
      const result = parseVPIRNode(validNodeJSON({
        inputs: [{ nodeId: 'n1', port: '', dataType: 'string' }],
      }));
      expect(result.valid).toBe(false);
    });

    it('should reject non-object ref', () => {
      const result = parseVPIRNode(validNodeJSON({
        inputs: ['not-a-ref'],
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_TYPE')).toBe(true);
    });
  });
});

describe('Bridge Grammar — parseVPIRGraph', () => {
  it('should parse a valid VPIRGraph JSON successfully', () => {
    const result = parseVPIRGraph(validGraphJSON());
    expect(result.valid).toBe(true);
    expect(result.graph).toBeDefined();
    expect(result.graph!.nodes.size).toBe(2);
    expect(result.graph!.roots).toEqual(['root']);
    expect(result.graph!.terminals).toEqual(['step-2']);
  });

  it('should reject empty nodes array', () => {
    const result = parseVPIRGraph(validGraphJSON({ nodes: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'EMPTY_NODES')).toBe(true);
  });

  it('should reject duplicate node IDs', () => {
    const result = parseVPIRGraph(validGraphJSON({
      nodes: [
        validNodeJSON({ id: 'same-id' }),
        validNodeJSON({ id: 'same-id' }),
      ],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'DUPLICATE_NODE_ID')).toBe(true);
  });

  it('should detect IFC violation in graph flow', () => {
    // High trust node flowing to low trust node
    const result = parseVPIRGraph(validGraphJSON({
      nodes: [
        validNodeJSON({
          id: 'high-trust',
          inputs: [],
          label: { owner: 'a', trustLevel: 4, classification: 'restricted', createdAt: '2026-01-01T00:00:00Z' },
        }),
        validNodeJSON({
          id: 'low-trust',
          inputs: [{ nodeId: 'high-trust', port: 'result', dataType: 'string' }],
          label: { owner: 'b', trustLevel: 1, classification: 'public', createdAt: '2026-01-01T00:00:00Z' },
        }),
      ],
      roots: ['high-trust'],
      terminals: ['low-trust'],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'VPIR_IFC_VIOLATION')).toBe(true);
  });

  it('should reject non-object input', () => {
    const result = parseVPIRGraph(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('INVALID_TYPE');
  });

  it('should reject missing graph fields', () => {
    const result = parseVPIRGraph({ id: 'g1' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should propagate node-level errors with correct paths', () => {
    const result = parseVPIRGraph(validGraphJSON({
      nodes: [
        validNodeJSON({ id: '' }),  // Invalid node
      ],
      roots: [],
      terminals: [],
    }));
    expect(result.valid).toBe(false);
    // Error path should include the node index
    expect(result.errors.some((e) => e.path.includes('/nodes/0'))).toBe(true);
  });
});

describe('Bridge Grammar — Constrained Output Formatters', () => {
  describe('toFunctionCallingSchema', () => {
    it('should produce a valid function-calling schema', () => {
      const schema = toFunctionCallingSchema();
      expect(schema.name).toBe('emit_vpir_node');
      expect(schema.strict).toBe(true);
      expect(schema.parameters).toBeDefined();
    });

    it('should narrow to a specific node type when specified', () => {
      const schema = toFunctionCallingSchema('action');
      const params = schema.parameters as Record<string, unknown>;
      const properties = (params as Record<string, Record<string, unknown>>).properties as Record<string, Record<string, unknown>>;
      expect(properties.type.const).toBe('action');
    });

    it('should include all required VPIRNode fields', () => {
      const schema = toFunctionCallingSchema();
      const params = schema.parameters as Record<string, unknown>;
      const required = (params as Record<string, unknown>).required as string[];
      expect(required).toContain('id');
      expect(required).toContain('type');
      expect(required).toContain('operation');
      expect(required).toContain('inputs');
      expect(required).toContain('outputs');
      expect(required).toContain('evidence');
      expect(required).toContain('label');
      expect(required).toContain('verifiable');
      expect(required).toContain('createdAt');
    });
  });

  describe('toAnthropicToolSchema', () => {
    it('should produce a valid Anthropic tool schema', () => {
      const schema = toAnthropicToolSchema();
      expect(schema.name).toBe('emit_vpir_node');
      expect(schema.input_schema).toBeDefined();
    });

    it('should narrow node type when specified', () => {
      const schema = toAnthropicToolSchema('observation');
      const inputSchema = schema.input_schema as Record<string, unknown>;
      const properties = (inputSchema as Record<string, Record<string, unknown>>).properties as Record<string, Record<string, unknown>>;
      expect(properties.type.const).toBe('observation');
    });
  });

  describe('toStructuredOutputSchema', () => {
    it('should produce a valid structured output schema for graphs', () => {
      const schema = toStructuredOutputSchema();
      expect(schema.type).toBe('json_schema');
      const jsonSchema = (schema as Record<string, Record<string, unknown>>).json_schema;
      expect(jsonSchema.name).toBe('vpir_graph');
      expect(jsonSchema.strict).toBe(true);
      expect(jsonSchema.schema).toBeDefined();
    });
  });

  describe('getSchemaForFormat', () => {
    it('should return function calling schema', () => {
      const schema = getSchemaForFormat('function_calling');
      expect(schema.name).toBe('emit_vpir_node');
      expect(schema.strict).toBe(true);
    });

    it('should return tool use schema', () => {
      const schema = getSchemaForFormat('tool_use');
      expect(schema.input_schema).toBeDefined();
    });

    it('should return structured output schema', () => {
      const schema = getSchemaForFormat('structured_output');
      expect(schema.type).toBe('json_schema');
    });
  });
});

describe('Bridge Grammar — Schema Structure', () => {
  it('VPIRNodeSchema should have all required properties', () => {
    expect(VPIRNodeSchema.properties).toBeDefined();
    const props = Object.keys(VPIRNodeSchema.properties!);
    expect(props).toContain('id');
    expect(props).toContain('type');
    expect(props).toContain('operation');
    expect(props).toContain('inputs');
    expect(props).toContain('outputs');
    expect(props).toContain('evidence');
    expect(props).toContain('label');
    expect(props).toContain('verifiable');
    expect(props).toContain('createdAt');
    expect(props).toContain('agentId');
  });

  it('VPIRGraphSchema should have all required properties', () => {
    expect(VPIRGraphSchema.properties).toBeDefined();
    const props = Object.keys(VPIRGraphSchema.properties!);
    expect(props).toContain('id');
    expect(props).toContain('name');
    expect(props).toContain('nodes');
    expect(props).toContain('roots');
    expect(props).toContain('terminals');
    expect(props).toContain('createdAt');
  });

  it('SecurityLabelSchema should constrain trustLevel to 0-4', () => {
    expect(SecurityLabelSchema.properties!.trustLevel.minimum).toBe(0);
    expect(SecurityLabelSchema.properties!.trustLevel.maximum).toBe(4);
  });

  it('EvidenceSchema should constrain confidence to 0-1', () => {
    expect(EvidenceSchema.properties!.confidence.minimum).toBe(0);
    expect(EvidenceSchema.properties!.confidence.maximum).toBe(1);
  });

  it('VPIRGraphSchema nodes should require at least 1 item', () => {
    expect(VPIRGraphSchema.properties!.nodes.minItems).toBe(1);
  });
});
