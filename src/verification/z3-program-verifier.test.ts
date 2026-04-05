/**
 * User-Program Property Verification test suite.
 *
 * Sprint 7 — Advisory Panel: Leonardo de Moura (SMT depth).
 */

import { createZ3Context } from './z3-invariants.js';
import type { Z3Context } from './z3-invariants.js';
import { ProgramVerifier, toSmtLib2 } from './z3-program-verifier.js';
import type { VPIRGraph, VPIRNode, VPIROutput, VPIRRef, Evidence } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import type { ProgramProperty } from '../types/verification.js';
import { createLabel } from '../types/ifc.js';

// --- Helpers ---

function makeLabel(trust: number, classification: 'public' | 'internal' | 'confidential' | 'restricted' = 'internal'): SecurityLabel {
  return createLabel('test', trust as 0 | 1 | 2 | 3 | 4, classification);
}

function makeEvidence(confidence: number): Evidence {
  return { type: 'data', source: 'test', confidence };
}

function makeOutput(port: string, dataType: string): VPIROutput {
  return { port, dataType };
}

function makeRef(nodeId: string, port: string): VPIRRef {
  return { nodeId, port, dataType: 'any' };
}

function makeNode(
  id: string,
  type: 'observation' | 'inference' | 'action' | 'assertion' | 'composition',
  opts: {
    trust?: number;
    classification?: 'public' | 'internal' | 'confidential' | 'restricted';
    confidence?: number;
    inputs?: VPIRRef[];
    outputs?: VPIROutput[];
  } = {},
): VPIRNode {
  return {
    id,
    type,
    operation: `Test ${type} ${id}`,
    inputs: opts.inputs ?? [],
    outputs: opts.outputs ?? [makeOutput('out', 'any')],
    evidence: [makeEvidence(opts.confidence ?? 0.9)],
    label: makeLabel(opts.trust ?? 2, opts.classification ?? 'internal'),
    verifiable: true,
    createdAt: new Date().toISOString(),
  };
}

function makeGraph(nodes: VPIRNode[], roots: string[], terminals: string[]): VPIRGraph {
  const nodeMap = new Map<string, VPIRNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }
  return {
    id: 'test-graph',
    name: 'Test Graph',
    nodes: nodeMap,
    roots,
    terminals,
    createdAt: new Date().toISOString(),
  };
}

// --- Tests ---

describe('ProgramVerifier', () => {
  let ctx: Z3Context;

  beforeAll(async () => {
    ctx = await createZ3Context();
  }, 30000);

  afterAll(() => {
    ctx = undefined as unknown as Z3Context;
  });

  describe('variable binding', () => {
    it('should bind VPIR node trust levels to Z3 variables', async () => {
      const node = makeNode('obs1', 'observation', { trust: 3 });
      const graph = makeGraph([node], ['obs1'], ['obs1']);
      const verifier = new ProgramVerifier(ctx, graph);

      const prop: ProgramProperty = {
        id: 'test-trust',
        kind: 'assertion',
        targetNodes: ['obs1'],
        formula: '(>= node_obs1_trust 3)',
        description: 'Trust level >= 3',
      };

      const result = await verifier.verifyProgramProperty(prop);
      expect(result.verified).toBe(true);
      expect(result.boundVariables).toHaveProperty('node_obs1_trust');
    });

    it('should bind VPIR node classification levels', async () => {
      const node = makeNode('obs1', 'observation', { classification: 'confidential' });
      const graph = makeGraph([node], ['obs1'], ['obs1']);
      const verifier = new ProgramVerifier(ctx, graph);

      // confidential = 2 in CLASSIFICATION_ORDER
      const prop: ProgramProperty = {
        id: 'test-class',
        kind: 'assertion',
        targetNodes: ['obs1'],
        formula: '(= node_obs1_class 2)',
        description: 'Classification is confidential',
      };

      const result = await verifier.verifyProgramProperty(prop);
      expect(result.verified).toBe(true);
    });

    it('should bind confidence values (scaled to 0-100)', async () => {
      const node = makeNode('obs1', 'observation', { confidence: 0.85 });
      const graph = makeGraph([node], ['obs1'], ['obs1']);
      const verifier = new ProgramVerifier(ctx, graph);

      const prop: ProgramProperty = {
        id: 'test-conf',
        kind: 'assertion',
        targetNodes: ['obs1'],
        formula: '(>= node_obs1_confidence 85)',
        description: 'Confidence >= 85%',
      };

      const result = await verifier.verifyProgramProperty(prop);
      expect(result.verified).toBe(true);
    });

    it('should handle missing target nodes gracefully', async () => {
      const node = makeNode('obs1', 'observation');
      const graph = makeGraph([node], ['obs1'], ['obs1']);
      const verifier = new ProgramVerifier(ctx, graph);

      const prop: ProgramProperty = {
        id: 'test-missing',
        kind: 'assertion',
        targetNodes: ['nonexistent'],
        formula: '(>= node_nonexistent_trust 0)',
        description: 'Nonexistent node',
      };

      const result = await verifier.verifyProgramProperty(prop);
      expect(result.verified).toBe(false);
      expect(result.counterexample).toBeDefined();
    });

    it('should bind multiple nodes correctly', async () => {
      const n1 = makeNode('obs1', 'observation', { trust: 3 });
      const n2 = makeNode('inf1', 'inference', { trust: 2, inputs: [makeRef('obs1', 'out')] });
      const graph = makeGraph([n1, n2], ['obs1'], ['inf1']);
      const verifier = new ProgramVerifier(ctx, graph);

      const prop: ProgramProperty = {
        id: 'test-multi',
        kind: 'invariant',
        targetNodes: ['obs1', 'inf1'],
        formula: '(and (>= node_obs1_trust 2) (>= node_inf1_trust 2))',
        description: 'All nodes have trust >= 2',
      };

      const result = await verifier.verifyProgramProperty(prop);
      expect(result.verified).toBe(true);
      expect(result.boundVariables).toHaveProperty('node_obs1_trust');
      expect(result.boundVariables).toHaveProperty('node_inf1_trust');
    });
  });

  describe('precondition verification', () => {
    it('should verify a precondition that holds', async () => {
      const root = makeNode('root', 'observation', { trust: 3, classification: 'confidential' });
      const graph = makeGraph([root], ['root'], ['root']);
      const verifier = new ProgramVerifier(ctx, graph);

      const prop: ProgramProperty = {
        id: 'pre-1',
        kind: 'precondition',
        targetNodes: ['root'],
        formula: '(>= node_root_trust 2)',
        description: 'Root input has trust >= 2',
      };

      const result = await verifier.verifyProgramProperty(prop);
      expect(result.verified).toBe(true);
      expect(result.property).toBe('user_precondition');
    });

    it('should produce counterexample for failing precondition', async () => {
      const root = makeNode('root', 'observation', { trust: 1 });
      const graph = makeGraph([root], ['root'], ['root']);
      const verifier = new ProgramVerifier(ctx, graph);

      const prop: ProgramProperty = {
        id: 'pre-2',
        kind: 'precondition',
        targetNodes: ['root'],
        formula: '(>= node_root_trust 3)',
        description: 'Root input has trust >= 3',
      };

      const result = await verifier.verifyProgramProperty(prop);
      expect(result.verified).toBe(false);
      expect(result.counterexample).toBeDefined();
    });
  });

  describe('postcondition verification', () => {
    it('should verify a postcondition that holds', async () => {
      const root = makeNode('root', 'observation', { trust: 2 });
      const terminal = makeNode('out', 'inference', {
        trust: 3,
        classification: 'confidential',
        inputs: [makeRef('root', 'out')],
      });
      const graph = makeGraph([root, terminal], ['root'], ['out']);
      const verifier = new ProgramVerifier(ctx, graph);

      const prop: ProgramProperty = {
        id: 'post-1',
        kind: 'postcondition',
        targetNodes: ['out'],
        formula: '(>= node_out_trust 3)',
        description: 'Output trust >= 3',
      };

      const result = await verifier.verifyProgramProperty(prop);
      expect(result.verified).toBe(true);
      expect(result.property).toBe('user_postcondition');
    });
  });

  describe('invariant verification', () => {
    it('should verify an invariant across all target nodes', async () => {
      const n1 = makeNode('a', 'observation', { trust: 2 });
      const n2 = makeNode('b', 'inference', { trust: 3, inputs: [makeRef('a', 'out')] });
      const n3 = makeNode('c', 'assertion', { trust: 4, inputs: [makeRef('b', 'out')] });
      const graph = makeGraph([n1, n2, n3], ['a'], ['c']);
      const verifier = new ProgramVerifier(ctx, graph);

      const prop: ProgramProperty = {
        id: 'inv-1',
        kind: 'invariant',
        targetNodes: ['a', 'b', 'c'],
        formula: '(and (>= node_a_trust 2) (>= node_b_trust 2) (>= node_c_trust 2))',
        description: 'All nodes have trust >= 2',
      };

      const result = await verifier.verifyProgramProperty(prop);
      expect(result.verified).toBe(true);
      expect(result.property).toBe('user_invariant');
    });

    it('should detect invariant violation', async () => {
      const n1 = makeNode('a', 'observation', { trust: 1 });
      const n2 = makeNode('b', 'inference', { trust: 3, inputs: [makeRef('a', 'out')] });
      const graph = makeGraph([n1, n2], ['a'], ['b']);
      const verifier = new ProgramVerifier(ctx, graph);

      const prop: ProgramProperty = {
        id: 'inv-2',
        kind: 'invariant',
        targetNodes: ['a', 'b'],
        formula: '(and (>= node_a_trust 2) (>= node_b_trust 2))',
        description: 'All nodes have trust >= 2',
      };

      const result = await verifier.verifyProgramProperty(prop);
      expect(result.verified).toBe(false);
    });
  });

  describe('assertion verification', () => {
    it('should verify an assertion on a specific node', async () => {
      const node = makeNode('gate', 'assertion', { trust: 4, confidence: 1.0 });
      const graph = makeGraph([node], ['gate'], ['gate']);
      const verifier = new ProgramVerifier(ctx, graph);

      const prop: ProgramProperty = {
        id: 'assert-1',
        kind: 'assertion',
        targetNodes: ['gate'],
        formula: '(and (= node_gate_trust 4) (= node_gate_confidence 100))',
        description: 'Gate has max trust and confidence',
      };

      const result = await verifier.verifyProgramProperty(prop);
      expect(result.verified).toBe(true);
      expect(result.property).toBe('user_assertion');
    });
  });

  describe('complex formulas', () => {
    it('should handle implication (=>)', async () => {
      const node = makeNode('n1', 'action', { trust: 3 });
      const graph = makeGraph([node], ['n1'], ['n1']);
      const verifier = new ProgramVerifier(ctx, graph);

      // action type = 2; if type is action, trust must be >= 3
      const prop: ProgramProperty = {
        id: 'complex-1',
        kind: 'assertion',
        targetNodes: ['n1'],
        formula: '(=> (= node_n1_type 2) (>= node_n1_trust 3))',
        description: 'Actions require trust >= 3',
      };

      const result = await verifier.verifyProgramProperty(prop);
      expect(result.verified).toBe(true);
    });

    it('should handle arithmetic in formulas', async () => {
      const n1 = makeNode('a', 'observation', { trust: 2 });
      const n2 = makeNode('b', 'inference', { trust: 3, inputs: [makeRef('a', 'out')] });
      const graph = makeGraph([n1, n2], ['a'], ['b']);
      const verifier = new ProgramVerifier(ctx, graph);

      const prop: ProgramProperty = {
        id: 'arith-1',
        kind: 'assertion',
        targetNodes: ['a', 'b'],
        formula: '(>= (+ node_a_trust node_b_trust) 5)',
        description: 'Combined trust >= 5',
      };

      const result = await verifier.verifyProgramProperty(prop);
      expect(result.verified).toBe(true);
    });
  });

  describe('verifyAll', () => {
    it('should verify multiple properties and return all results', async () => {
      const node = makeNode('obs1', 'observation', { trust: 3, confidence: 0.9 });
      const graph = makeGraph([node], ['obs1'], ['obs1']);
      const verifier = new ProgramVerifier(ctx, graph);

      const props: ProgramProperty[] = [
        {
          id: 'p1',
          kind: 'assertion',
          targetNodes: ['obs1'],
          formula: '(>= node_obs1_trust 2)',
          description: 'Trust >= 2',
        },
        {
          id: 'p2',
          kind: 'assertion',
          targetNodes: ['obs1'],
          formula: '(>= node_obs1_confidence 90)',
          description: 'Confidence >= 90%',
        },
      ];

      const results = await verifier.verifyAll(props);
      expect(results).toHaveLength(2);
      expect(results[0].verified).toBe(true);
      expect(results[1].verified).toBe(true);
    });

    it('should handle mix of pass and fail', async () => {
      const node = makeNode('obs1', 'observation', { trust: 1 });
      const graph = makeGraph([node], ['obs1'], ['obs1']);
      const verifier = new ProgramVerifier(ctx, graph);

      const props: ProgramProperty[] = [
        {
          id: 'p1',
          kind: 'assertion',
          targetNodes: ['obs1'],
          formula: '(>= node_obs1_trust 0)',
          description: 'Trust >= 0 (passes)',
        },
        {
          id: 'p2',
          kind: 'assertion',
          targetNodes: ['obs1'],
          formula: '(>= node_obs1_trust 4)',
          description: 'Trust >= 4 (fails)',
        },
      ];

      const results = await verifier.verifyAll(props);
      expect(results).toHaveLength(2);
      expect(results[0].verified).toBe(true);
      expect(results[1].verified).toBe(false);
    });
  });

  describe('toSmtLib2', () => {
    it('should generate valid SMT-LIB2 string', () => {
      const node = makeNode('obs1', 'observation', { trust: 3 });
      const graph = makeGraph([node], ['obs1'], ['obs1']);

      const prop: ProgramProperty = {
        id: 'smt-1',
        kind: 'assertion',
        targetNodes: ['obs1'],
        formula: '(>= node_obs1_trust 2)',
        description: 'Trust >= 2',
      };

      const smt = toSmtLib2(graph, prop);
      expect(smt).toContain('(set-logic QF_LIA)');
      expect(smt).toContain('(declare-const node_obs1_trust Int)');
      expect(smt).toContain('(assert (= node_obs1_trust 3))');
      expect(smt).toContain('(assert (not (>= node_obs1_trust 2)))');
      expect(smt).toContain('(check-sat)');
    });
  });
});
