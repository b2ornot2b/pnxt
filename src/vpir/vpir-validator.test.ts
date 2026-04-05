import { validateNode, validateGraph } from './vpir-validator.js';
import type { VPIRNode, VPIRGraph } from '../types/vpir.js';
import { createLabel } from '../types/ifc.js';

function makeNode(overrides: Partial<VPIRNode> = {}): VPIRNode {
  return {
    id: 'node-1',
    type: 'inference',
    operation: 'Derive conclusion from data',
    inputs: [],
    outputs: [{ port: 'result', dataType: 'string' }],
    evidence: [{ type: 'data', source: 'test', confidence: 0.9 }],
    label: createLabel('agent-a', 2, 'internal'),
    verifiable: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeGraph(nodes: VPIRNode[], roots: string[], terminals: string[]): VPIRGraph {
  const nodeMap = new Map<string, VPIRNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }
  return {
    id: 'graph-1',
    name: 'test-graph',
    nodes: nodeMap,
    roots,
    terminals,
    createdAt: new Date().toISOString(),
  };
}

describe('validateNode', () => {
  it('should pass for a valid node', () => {
    const result = validateNode(makeNode());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail for missing operation', () => {
    const result = validateNode(makeNode({ operation: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_OPERATION')).toBe(true);
  });

  it('should fail for invalid evidence confidence', () => {
    const result = validateNode(
      makeNode({
        evidence: [{ type: 'data', source: 'test', confidence: 1.5 }],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_CONFIDENCE')).toBe(true);
  });

  it('should warn for node with no evidence', () => {
    const result = validateNode(makeNode({ evidence: [] }));
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.code === 'NO_EVIDENCE')).toBe(true);
  });

  it('should warn for non-assertion node with no outputs', () => {
    const result = validateNode(makeNode({ type: 'inference', outputs: [] }));
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.code === 'NO_OUTPUTS')).toBe(true);
  });

  it('should not warn for assertion with no outputs', () => {
    const result = validateNode(makeNode({ type: 'assertion', outputs: [] }));
    expect(result.warnings.some((w) => w.code === 'NO_OUTPUTS')).toBe(false);
  });
});

describe('validateGraph', () => {
  it('should pass for a valid two-node DAG', () => {
    const nodeA = makeNode({ id: 'a', outputs: [{ port: 'out', dataType: 'string' }] });
    const nodeB = makeNode({
      id: 'b',
      inputs: [{ nodeId: 'a', port: 'out', dataType: 'string' }],
    });

    const graph = makeGraph([nodeA, nodeB], ['a'], ['b']);
    const result = validateGraph(graph);
    expect(result.valid).toBe(true);
  });

  it('should fail for empty graph', () => {
    const graph = makeGraph([], [], []);
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'EMPTY_GRAPH')).toBe(true);
  });

  it('should fail for unresolved reference', () => {
    const node = makeNode({
      id: 'a',
      inputs: [{ nodeId: 'nonexistent', port: 'out', dataType: 'string' }],
    });

    const graph = makeGraph([node], ['a'], ['a']);
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'UNRESOLVED_REF')).toBe(true);
  });

  it('should fail for invalid port reference', () => {
    const nodeA = makeNode({ id: 'a', outputs: [{ port: 'out', dataType: 'string' }] });
    const nodeB = makeNode({
      id: 'b',
      inputs: [{ nodeId: 'a', port: 'wrong_port', dataType: 'string' }],
    });

    const graph = makeGraph([nodeA, nodeB], ['a'], ['b']);
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_PORT_REF')).toBe(true);
  });

  it('should detect cycles', () => {
    const nodeA = makeNode({
      id: 'a',
      outputs: [{ port: 'out', dataType: 'string' }],
      inputs: [{ nodeId: 'b', port: 'out', dataType: 'string' }],
    });
    const nodeB = makeNode({
      id: 'b',
      outputs: [{ port: 'out', dataType: 'string' }],
      inputs: [{ nodeId: 'a', port: 'out', dataType: 'string' }],
    });

    const graph = makeGraph([nodeA, nodeB], [], []);
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'CYCLE_DETECTED')).toBe(true);
  });

  it('should detect IFC violation across node boundaries', () => {
    // Node A has high trust, Node B has low trust.
    // Data flowing from A to B violates IFC.
    const nodeA = makeNode({
      id: 'a',
      label: createLabel('admin', 4, 'restricted'),
      outputs: [{ port: 'out', dataType: 'string' }],
    });
    const nodeB = makeNode({
      id: 'b',
      label: createLabel('observer', 1, 'public'),
      inputs: [{ nodeId: 'a', port: 'out', dataType: 'string' }],
    });

    const graph = makeGraph([nodeA, nodeB], ['a'], ['b']);
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'IFC_VIOLATION')).toBe(true);
  });

  it('should allow valid IFC flow from low to high trust', () => {
    const nodeA = makeNode({
      id: 'a',
      label: createLabel('observer', 1, 'public'),
      outputs: [{ port: 'out', dataType: 'string' }],
    });
    const nodeB = makeNode({
      id: 'b',
      label: createLabel('admin', 4, 'restricted'),
      inputs: [{ nodeId: 'a', port: 'out', dataType: 'string' }],
    });

    const graph = makeGraph([nodeA, nodeB], ['a'], ['b']);
    const result = validateGraph(graph);
    // Should not have IFC violations
    expect(result.errors.filter((e) => e.code === 'IFC_VIOLATION')).toHaveLength(0);
  });

  it('should fail for invalid root reference', () => {
    const node = makeNode({ id: 'a' });
    const graph = makeGraph([node], ['nonexistent'], ['a']);
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_ROOT')).toBe(true);
  });

  it('should warn when root has inputs', () => {
    const nodeA = makeNode({
      id: 'a',
      outputs: [{ port: 'out', dataType: 'string' }],
    });
    const nodeB = makeNode({
      id: 'b',
      inputs: [{ nodeId: 'a', port: 'out', dataType: 'string' }],
    });

    // Declaring 'b' as root even though it has inputs
    const graph = makeGraph([nodeA, nodeB], ['b'], []);
    const result = validateGraph(graph);
    expect(result.warnings.some((w) => w.code === 'ROOT_HAS_INPUTS')).toBe(true);
  });
});
