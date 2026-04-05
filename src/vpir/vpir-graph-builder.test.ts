import { VPIRGraphBuilder } from './vpir-graph-builder.js';
import type { SecurityLabel } from '../types/ifc.js';
import { createStandardRegistry } from '../aci/tool-registry.js';

function makeLabel(trustLevel: number = 2): SecurityLabel {
  return {
    owner: 'test',
    trustLevel: trustLevel as 0 | 1 | 2 | 3 | 4,
    classification: 'internal',
    createdAt: new Date().toISOString(),
  };
}

describe('VPIRGraphBuilder', () => {
  describe('fluent API', () => {
    it('should build a single observation node', () => {
      const result = new VPIRGraphBuilder({ id: 'g1', name: 'Test' })
        .addObservation({
          id: 'obs-1',
          operation: 'observe-input',
          outputs: [{ port: 'data', dataType: 'string' }],
        })
        .build();

      expect(result.success).toBe(true);
      expect(result.graph).toBeDefined();
      expect(result.graph!.nodes.size).toBe(1);
      expect(result.graph!.roots).toEqual(['obs-1']);
      expect(result.graph!.terminals).toEqual(['obs-1']);
    });

    it('should build a multi-node pipeline', () => {
      const result = new VPIRGraphBuilder({ id: 'g2', name: 'Pipeline' })
        .addObservation({
          id: 'observe',
          operation: 'gather-input',
          outputs: [{ port: 'data', dataType: 'number' }],
        })
        .addInference({
          id: 'transform',
          operation: 'json-transform',
          inputs: [{ nodeId: 'observe', port: 'data', dataType: 'number' }],
          outputs: [{ port: 'result', dataType: 'number' }],
        })
        .addAction({
          id: 'convert',
          operation: 'unit-convert',
          inputs: [{ nodeId: 'transform', port: 'result', dataType: 'number' }],
          outputs: [{ port: 'result', dataType: 'number' }],
        })
        .addAssertion({
          id: 'validate',
          operation: 'data-validate',
          inputs: [{ nodeId: 'convert', port: 'result', dataType: 'number' }],
          outputs: [{ port: 'verified', dataType: 'boolean' }],
        })
        .build();

      expect(result.success).toBe(true);
      expect(result.graph!.nodes.size).toBe(4);
      expect(result.graph!.roots).toEqual(['observe']);
      expect(result.graph!.terminals).toEqual(['validate']);
    });

    it('should auto-compute roots and terminals', () => {
      const result = new VPIRGraphBuilder()
        .addObservation({
          id: 'a',
          operation: 'input-a',
          outputs: [{ port: 'out', dataType: 'string' }],
        })
        .addObservation({
          id: 'b',
          operation: 'input-b',
          outputs: [{ port: 'out', dataType: 'string' }],
        })
        .addInference({
          id: 'merge',
          operation: 'merge-data',
          inputs: [
            { nodeId: 'a', port: 'out', dataType: 'string' },
            { nodeId: 'b', port: 'out', dataType: 'string' },
          ],
          outputs: [{ port: 'merged', dataType: 'string' }],
        })
        .build();

      expect(result.success).toBe(true);
      expect(result.graph!.roots).toContain('a');
      expect(result.graph!.roots).toContain('b');
      expect(result.graph!.terminals).toEqual(['merge']);
    });

    it('should use default evidence when none provided', () => {
      const result = new VPIRGraphBuilder({ defaultAgentId: 'my-agent' })
        .addObservation({ id: 'obs', operation: 'input' })
        .build();

      expect(result.success).toBe(true);
      const node = result.graph!.nodes.get('obs')!;
      expect(node.evidence.length).toBe(1);
      expect(node.evidence[0].source).toBe('my-agent');
    });

    it('should use default label when none provided', () => {
      const result = new VPIRGraphBuilder({
        defaultLabel: makeLabel(3),
      })
        .addObservation({ id: 'obs', operation: 'input' })
        .build();

      expect(result.success).toBe(true);
      const node = result.graph!.nodes.get('obs')!;
      expect(node.label.trustLevel).toBe(3);
    });

    it('should support explicit labels per node', () => {
      const result = new VPIRGraphBuilder()
        .addObservation({
          id: 'obs',
          operation: 'input',
          label: {
            owner: 'custom',
            trustLevel: 4,
            classification: 'restricted',
          },
        })
        .build();

      expect(result.success).toBe(true);
      const node = result.graph!.nodes.get('obs')!;
      expect(node.label.owner).toBe('custom');
      expect(node.label.classification).toBe('restricted');
    });

    it('should support observation nodes with literal values', () => {
      const result = new VPIRGraphBuilder()
        .addObservation({
          id: 'obs',
          operation: 'literal-data',
          outputs: [{ port: 'data', dataType: 'object', value: { temperature: 98.6 } }],
        })
        .build();

      expect(result.success).toBe(true);
      const node = result.graph!.nodes.get('obs')!;
      expect(node.outputs[0].value).toEqual({ temperature: 98.6 });
    });

    it('should add default output for non-assertion nodes with no outputs', () => {
      const result = new VPIRGraphBuilder()
        .addObservation({ id: 'obs', operation: 'input' })
        .build();

      expect(result.success).toBe(true);
      const node = result.graph!.nodes.get('obs')!;
      expect(node.outputs.length).toBe(1);
      expect(node.outputs[0].port).toBe('result');
    });

    it('should support addNode with explicit type', () => {
      const result = new VPIRGraphBuilder()
        .addNode({
          id: 'n1',
          type: 'observation',
          operation: 'input',
        })
        .build();

      expect(result.success).toBe(true);
      expect(result.graph!.nodes.get('n1')!.type).toBe('observation');
    });
  });

  describe('validation errors', () => {
    it('should fail on empty graph', () => {
      const result = new VPIRGraphBuilder().build();
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('no nodes');
    });

    it('should fail on duplicate node IDs', () => {
      const result = new VPIRGraphBuilder()
        .addObservation({ id: 'dup', operation: 'a' })
        .addObservation({ id: 'dup', operation: 'b' })
        .build();

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Duplicate node ID');
    });

    it('should fail on unresolved input references', () => {
      const result = new VPIRGraphBuilder()
        .addInference({
          id: 'n1',
          operation: 'process',
          inputs: [{ nodeId: 'nonexistent', port: 'data', dataType: 'string' }],
        })
        .build();

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('UNRESOLVED_REF'))).toBe(true);
    });

    it('should fail on cycle detection', () => {
      const result = new VPIRGraphBuilder()
        .addInference({
          id: 'a',
          operation: 'step-a',
          inputs: [{ nodeId: 'b', port: 'result', dataType: 'string' }],
          outputs: [{ port: 'result', dataType: 'string' }],
        })
        .addInference({
          id: 'b',
          operation: 'step-b',
          inputs: [{ nodeId: 'a', port: 'result', dataType: 'string' }],
          outputs: [{ port: 'result', dataType: 'string' }],
        })
        .build();

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('CYCLE'))).toBe(true);
    });

    it('should fail on IFC violation (high to low flow)', () => {
      const result = new VPIRGraphBuilder()
        .addObservation({
          id: 'high',
          operation: 'secret-data',
          outputs: [{ port: 'data', dataType: 'string' }],
          label: { owner: 'sys', trustLevel: 4, classification: 'restricted' },
        })
        .addInference({
          id: 'low',
          operation: 'process',
          inputs: [{ nodeId: 'high', port: 'data', dataType: 'string' }],
          label: { owner: 'sys', trustLevel: 0, classification: 'public' },
        })
        .build();

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('IFC'))).toBe(true);
    });
  });

  describe('tool registry integration', () => {
    it('should validate action operations against the registry', () => {
      const registry = createStandardRegistry();

      const result = new VPIRGraphBuilder()
        .withToolRegistry(registry)
        .addObservation({
          id: 'obs',
          operation: 'input',
          outputs: [{ port: 'data', dataType: 'object' }],
        })
        .addAction({
          id: 'act',
          operation: 'unit-convert',
          inputs: [{ nodeId: 'obs', port: 'data', dataType: 'object' }],
        })
        .build();

      expect(result.success).toBe(true);
    });

    it('should fail when action references missing handler', () => {
      const registry = createStandardRegistry();

      const result = new VPIRGraphBuilder()
        .withToolRegistry(registry)
        .addObservation({
          id: 'obs',
          operation: 'input',
          outputs: [{ port: 'data', dataType: 'object' }],
        })
        .addAction({
          id: 'act',
          operation: 'nonexistent-handler',
          inputs: [{ nodeId: 'obs', port: 'data', dataType: 'object' }],
        })
        .build();

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('nonexistent-handler');
    });
  });

  describe('fromJSON', () => {
    it('should construct a graph from bridge grammar JSON', () => {
      const now = new Date().toISOString();
      const label = {
        owner: 'test',
        trustLevel: 2,
        classification: 'internal',
        createdAt: now,
      };

      const json = {
        id: 'from-json-test',
        name: 'JSON Graph',
        nodes: [
          {
            id: 'obs',
            type: 'observation',
            operation: 'gather-input',
            inputs: [],
            outputs: [{ port: 'data', dataType: 'string' }],
            evidence: [{ type: 'data', source: 'user', confidence: 1.0 }],
            label,
            verifiable: true,
            createdAt: now,
          },
          {
            id: 'infer',
            type: 'inference',
            operation: 'process-data',
            inputs: [{ nodeId: 'obs', port: 'data', dataType: 'string' }],
            outputs: [{ port: 'result', dataType: 'string' }],
            evidence: [{ type: 'rule', source: 'logic', confidence: 0.9 }],
            label,
            verifiable: true,
            createdAt: now,
          },
        ],
        roots: ['obs'],
        terminals: ['infer'],
        createdAt: now,
      };

      const result = VPIRGraphBuilder.fromJSON(json);
      expect(result.success).toBe(true);
      expect(result.graph).toBeDefined();
      expect(result.graph!.nodes.size).toBe(2);
      expect(result.graph!.id).toBe('from-json-test');
    });

    it('should fail on invalid JSON', () => {
      const result = VPIRGraphBuilder.fromJSON({ not: 'a valid graph' });
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate tool registry on fromJSON', () => {
      const now = new Date().toISOString();
      const label = {
        owner: 'test',
        trustLevel: 2,
        classification: 'internal',
        createdAt: now,
      };

      const json = {
        id: 'registry-test',
        name: 'Registry Test',
        nodes: [
          {
            id: 'obs',
            type: 'observation',
            operation: 'input',
            inputs: [],
            outputs: [{ port: 'data', dataType: 'object' }],
            evidence: [{ type: 'data', source: 'user', confidence: 1.0 }],
            label,
            verifiable: true,
            createdAt: now,
          },
          {
            id: 'act',
            type: 'action',
            operation: 'missing-tool',
            inputs: [{ nodeId: 'obs', port: 'data', dataType: 'object' }],
            outputs: [{ port: 'result', dataType: 'object' }],
            evidence: [{ type: 'data', source: 'tool', confidence: 1.0 }],
            label,
            verifiable: false,
            createdAt: now,
          },
        ],
        roots: ['obs'],
        terminals: ['act'],
        createdAt: now,
      };

      const registry = createStandardRegistry();
      const result = VPIRGraphBuilder.fromJSON(json, { toolRegistry: registry });
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('missing-tool');
    });

    it('should pass with valid tool registry', () => {
      const now = new Date().toISOString();
      const label = {
        owner: 'test',
        trustLevel: 2,
        classification: 'internal',
        createdAt: now,
      };

      const json = {
        id: 'valid-registry',
        name: 'Valid Registry Test',
        nodes: [
          {
            id: 'obs',
            type: 'observation',
            operation: 'input',
            inputs: [],
            outputs: [{ port: 'data', dataType: 'object' }],
            evidence: [{ type: 'data', source: 'user', confidence: 1.0 }],
            label,
            verifiable: true,
            createdAt: now,
          },
          {
            id: 'act',
            type: 'action',
            operation: 'unit-convert',
            inputs: [{ nodeId: 'obs', port: 'data', dataType: 'object' }],
            outputs: [{ port: 'result', dataType: 'object' }],
            evidence: [{ type: 'data', source: 'tool', confidence: 1.0 }],
            label,
            verifiable: false,
            createdAt: now,
          },
        ],
        roots: ['obs'],
        terminals: ['act'],
        createdAt: now,
      };

      const registry = createStandardRegistry();
      const result = VPIRGraphBuilder.fromJSON(json, { toolRegistry: registry });
      expect(result.success).toBe(true);
    });
  });
});
