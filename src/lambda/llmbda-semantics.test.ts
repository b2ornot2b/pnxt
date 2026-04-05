/**
 * Tests for LLMbda Calculus as Semantic Foundation of VPIR.
 *
 * Sprint 6 — Advisory Panel: Alonzo Church (Lambda Calculus).
 */

import {
  vpirNodeToLambda,
  annotateGraphWithSemantics,
  resetIdCounter,
} from './llmbda.js';
import type { VPIRGraph, VPIRNode } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';

// --- Helpers ---

function makeLabel(owner: string = 'test'): SecurityLabel {
  return {
    owner,
    trustLevel: 2,
    classification: 'internal',
    createdAt: new Date().toISOString(),
  };
}

function makeNode(
  id: string,
  type: VPIRNode['type'],
  inputs: { nodeId: string; port: string; dataType: string }[] = [],
  outputType: string = 'string',
): VPIRNode {
  return {
    id,
    type,
    operation: `op_${id}`,
    inputs,
    outputs: [{ port: 'out', dataType: outputType }],
    evidence: [{ type: 'data', source: 'test', confidence: 1.0 }],
    label: makeLabel(),
    verifiable: true,
    createdAt: new Date().toISOString(),
  };
}

function makeGraph(nodes: VPIRNode[]): VPIRGraph {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const roots = nodes.filter((n) => n.inputs.length === 0).map((n) => n.id);
  const referencedIds = new Set(nodes.flatMap((n) => n.inputs.map((i) => i.nodeId)));
  const terminals = nodes.filter((n) => !referencedIds.has(n.id)).map((n) => n.id);
  return {
    id: 'test-graph',
    name: 'Test Graph',
    nodes: nodeMap,
    roots,
    terminals,
    createdAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  resetIdCounter();
});

// --- vpirNodeToLambda ---

describe('vpirNodeToLambda', () => {
  it('should convert observation node to variable', () => {
    const node = makeNode('obs1', 'observation');
    const term = vpirNodeToLambda(node);

    expect(term.kind).toBe('variable');
    expect(term.label).toEqual(node.label);
  });

  it('should convert inference node with no inputs to variable', () => {
    const node = makeNode('inf1', 'inference');
    const term = vpirNodeToLambda(node);

    expect(term.kind).toBe('variable');
  });

  it('should convert inference node with inputs to application', () => {
    const node = makeNode('inf1', 'inference', [
      { nodeId: 'obs1', port: 'out', dataType: 'string' },
    ]);
    const term = vpirNodeToLambda(node);

    expect(term.kind).toBe('application');
  });

  it('should convert inference node with multiple inputs to nested application', () => {
    const node = makeNode('inf1', 'inference', [
      { nodeId: 'obs1', port: 'out', dataType: 'string' },
      { nodeId: 'obs2', port: 'out', dataType: 'number' },
    ]);
    const term = vpirNodeToLambda(node);

    // f(x1)(x2) → the outermost is an application
    expect(term.kind).toBe('application');
  });

  it('should convert action node to abstraction', () => {
    const node = makeNode('act1', 'action', [
      { nodeId: 'obs1', port: 'out', dataType: 'string' },
    ]);
    const term = vpirNodeToLambda(node);

    expect(term.kind).toBe('abstraction');
  });

  it('should convert assertion node to predicate application', () => {
    const node = makeNode('assert1', 'assertion', [
      { nodeId: 'obs1', port: 'out', dataType: 'string' },
    ]);
    const term = vpirNodeToLambda(node);

    expect(term.kind).toBe('application');
  });

  it('should convert assertion node with no inputs to predicate variable', () => {
    const node = makeNode('assert1', 'assertion');
    const term = vpirNodeToLambda(node);

    expect(term.kind).toBe('variable');
  });

  it('should convert composition node with inputs to nested application', () => {
    const node = makeNode('comp1', 'composition', [
      { nodeId: 'sub1', port: 'out', dataType: 'string' },
      { nodeId: 'sub2', port: 'out', dataType: 'number' },
    ]);
    const term = vpirNodeToLambda(node);

    expect(term.kind).toBe('application');
  });

  it('should convert composition node with no inputs to variable', () => {
    const node = makeNode('comp1', 'composition');
    const term = vpirNodeToLambda(node);

    expect(term.kind).toBe('variable');
  });

  it('should propagate security labels from VPIR node to lambda term', () => {
    const node = makeNode('obs1', 'observation');
    node.label = {
      owner: 'secure-agent',
      trustLevel: 4,
      classification: 'restricted',
      createdAt: new Date().toISOString(),
    };

    const term = vpirNodeToLambda(node);
    expect(term.label.owner).toBe('secure-agent');
    expect(term.label.trustLevel).toBe(4);
    expect(term.label.classification).toBe('restricted');
  });
});

// --- annotateGraphWithSemantics ---

describe('annotateGraphWithSemantics', () => {
  it('should annotate all nodes in a graph', () => {
    const obs = makeNode('obs1', 'observation');
    const inf = makeNode('inf1', 'inference', [
      { nodeId: 'obs1', port: 'out', dataType: 'string' },
    ]);
    const graph = makeGraph([obs, inf]);

    const annotated = annotateGraphWithSemantics(graph);

    expect(annotated.nodes.size).toBe(2);
    for (const node of annotated.nodes.values()) {
      expect(node.lambdaSemantics).toBeDefined();
    }
  });

  it('should not mutate the original graph', () => {
    const obs = makeNode('obs1', 'observation');
    const graph = makeGraph([obs]);

    const annotated = annotateGraphWithSemantics(graph);

    expect(graph.nodes.get('obs1')!.lambdaSemantics).toBeUndefined();
    expect(annotated.nodes.get('obs1')!.lambdaSemantics).toBeDefined();
  });

  it('should preserve graph metadata', () => {
    const obs = makeNode('obs1', 'observation');
    const graph = makeGraph([obs]);

    const annotated = annotateGraphWithSemantics(graph);

    expect(annotated.id).toBe(graph.id);
    expect(annotated.name).toBe(graph.name);
    expect(annotated.roots).toEqual(graph.roots);
    expect(annotated.terminals).toEqual(graph.terminals);
  });

  it('should handle a complex graph with all node types', () => {
    const obs = makeNode('obs1', 'observation');
    const inf = makeNode('inf1', 'inference', [
      { nodeId: 'obs1', port: 'out', dataType: 'string' },
    ]);
    const act = makeNode('act1', 'action', [
      { nodeId: 'inf1', port: 'out', dataType: 'string' },
    ]);
    const assert1 = makeNode('assert1', 'assertion', [
      { nodeId: 'act1', port: 'out', dataType: 'string' },
    ]);
    const comp = makeNode('comp1', 'composition', [
      { nodeId: 'assert1', port: 'out', dataType: 'Bool' },
    ]);
    const graph = makeGraph([obs, inf, act, assert1, comp]);

    const annotated = annotateGraphWithSemantics(graph);

    expect(annotated.nodes.size).toBe(5);
    expect(annotated.nodes.get('obs1')!.lambdaSemantics!.kind).toBe('variable');
    expect(annotated.nodes.get('inf1')!.lambdaSemantics!.kind).toBe('application');
    expect(annotated.nodes.get('act1')!.lambdaSemantics!.kind).toBe('abstraction');
    expect(annotated.nodes.get('assert1')!.lambdaSemantics!.kind).toBe('application');
    expect(annotated.nodes.get('comp1')!.lambdaSemantics!.kind).toBe('application');
  });

  it('should handle empty graph', () => {
    const graph: VPIRGraph = {
      id: 'empty',
      name: 'Empty',
      nodes: new Map(),
      roots: [],
      terminals: [],
      createdAt: new Date().toISOString(),
    };

    const annotated = annotateGraphWithSemantics(graph);
    expect(annotated.nodes.size).toBe(0);
  });
});
