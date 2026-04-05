/**
 * Tests for Z3 Graph Pre-Verification.
 *
 * Sprint 12 — Advisory Panel: Leonardo de Moura (SMT depth).
 */

import { createZ3Context } from './z3-invariants.js';
import type { Z3Context } from './z3-invariants.js';
import { verifyGraphProperties } from './z3-graph-verifier.js';
import type { VPIRGraph, VPIRNode } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import { createStandardRegistry } from '../aci/tool-registry.js';

// ── Helpers ─────────────────────────────────────────────────────────

function makeLabel(
  trust: number = 2,
  classification: 'public' | 'internal' | 'confidential' | 'restricted' = 'internal',
): SecurityLabel {
  return {
    owner: 'test',
    trustLevel: trust as 0 | 1 | 2 | 3 | 4,
    classification,
    createdAt: new Date().toISOString(),
  };
}

function makeNode(overrides: Partial<VPIRNode> & { id: string }): VPIRNode {
  return {
    type: 'observation',
    operation: 'test',
    inputs: [],
    outputs: [{ port: 'data', dataType: 'string' }],
    evidence: [{ type: 'data', source: 'test', confidence: 0.9 }],
    label: makeLabel(),
    verifiable: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeGraph(nodes: VPIRNode[], roots: string[], terminals: string[]): VPIRGraph {
  const nodeMap = new Map<string, VPIRNode>();
  for (const n of nodes) nodeMap.set(n.id, n);
  return {
    id: 'test-graph',
    name: 'Test',
    nodes: nodeMap,
    roots,
    terminals,
    createdAt: new Date().toISOString(),
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Z3 Graph Pre-Verification', () => {
  let ctx: Z3Context;

  beforeAll(async () => {
    ctx = await createZ3Context();
  }, 30000);

  describe('acyclicity', () => {
    it('should verify a valid DAG', async () => {
      const a = makeNode({ id: 'a' });
      const b = makeNode({
        id: 'b',
        type: 'inference',
        inputs: [{ nodeId: 'a', port: 'data', dataType: 'string' }],
      });
      const graph = makeGraph([a, b], ['a'], ['b']);

      const result = await verifyGraphProperties(graph, ctx);
      const acyclicity = result.properties.find((p) => p.name === 'acyclicity');
      expect(acyclicity?.status).toBe('verified');
    });

    it('should detect cycles', async () => {
      const a = makeNode({
        id: 'a',
        inputs: [{ nodeId: 'b', port: 'data', dataType: 'string' }],
      });
      const b = makeNode({
        id: 'b',
        type: 'inference',
        inputs: [{ nodeId: 'a', port: 'data', dataType: 'string' }],
      });
      const graph = makeGraph([a, b], ['a'], ['b']);

      const result = await verifyGraphProperties(graph, ctx);
      const acyclicity = result.properties.find((p) => p.name === 'acyclicity');
      expect(acyclicity?.status).toBe('violated');
    });

    it('should verify single-node graph', async () => {
      const a = makeNode({ id: 'a' });
      const graph = makeGraph([a], ['a'], ['a']);

      const result = await verifyGraphProperties(graph, ctx);
      const acyclicity = result.properties.find((p) => p.name === 'acyclicity');
      expect(acyclicity?.status).toBe('verified');
    });
  });

  describe('input completeness', () => {
    it('should verify when all inputs reference existing nodes', async () => {
      const a = makeNode({ id: 'a' });
      const b = makeNode({
        id: 'b',
        type: 'inference',
        inputs: [{ nodeId: 'a', port: 'data', dataType: 'string' }],
      });
      const graph = makeGraph([a, b], ['a'], ['b']);

      const result = await verifyGraphProperties(graph, ctx);
      const completeness = result.properties.find((p) => p.name === 'input_completeness');
      expect(completeness?.status).toBe('verified');
    });

    it('should detect references to non-existent nodes', async () => {
      const a = makeNode({
        id: 'a',
        type: 'inference',
        inputs: [{ nodeId: 'nonexistent', port: 'data', dataType: 'string' }],
      });
      const graph = makeGraph([a], ['a'], ['a']);

      const result = await verifyGraphProperties(graph, ctx);
      const completeness = result.properties.find((p) => p.name === 'input_completeness');
      expect(completeness?.status).toBe('violated');
      expect(completeness?.details).toContain('nonexistent');
    });
  });

  describe('IFC monotonicity', () => {
    it('should verify valid information flow (public → internal)', async () => {
      const a = makeNode({ id: 'a', label: makeLabel(2, 'public') });
      const b = makeNode({
        id: 'b',
        type: 'inference',
        inputs: [{ nodeId: 'a', port: 'data', dataType: 'string' }],
        label: makeLabel(2, 'internal'),
      });
      const graph = makeGraph([a, b], ['a'], ['b']);

      const result = await verifyGraphProperties(graph, ctx);
      const ifc = result.properties.find((p) => p.name === 'ifc_monotonicity');
      expect(ifc?.status).toBe('verified');
    });

    it('should detect invalid flow (confidential → public)', async () => {
      const a = makeNode({ id: 'a', label: makeLabel(2, 'confidential') });
      const b = makeNode({
        id: 'b',
        type: 'inference',
        inputs: [{ nodeId: 'a', port: 'data', dataType: 'string' }],
        label: makeLabel(2, 'public'),
      });
      const graph = makeGraph([a, b], ['a'], ['b']);

      const result = await verifyGraphProperties(graph, ctx);
      const ifc = result.properties.find((p) => p.name === 'ifc_monotonicity');
      expect(ifc?.status).toBe('violated');
      expect(ifc?.details).toContain('violates');
    });

    it('should verify same-level flow', async () => {
      const a = makeNode({ id: 'a', label: makeLabel(2, 'internal') });
      const b = makeNode({
        id: 'b',
        type: 'inference',
        inputs: [{ nodeId: 'a', port: 'data', dataType: 'string' }],
        label: makeLabel(2, 'internal'),
      });
      const graph = makeGraph([a, b], ['a'], ['b']);

      const result = await verifyGraphProperties(graph, ctx);
      const ifc = result.properties.find((p) => p.name === 'ifc_monotonicity');
      expect(ifc?.status).toBe('verified');
    });
  });

  describe('handler trust', () => {
    it('should verify when trust levels are sufficient', async () => {
      const registry = createStandardRegistry();
      const a = makeNode({ id: 'a' });
      const b = makeNode({
        id: 'b',
        type: 'action',
        operation: 'math-eval',
        inputs: [{ nodeId: 'a', port: 'data', dataType: 'string' }],
        label: makeLabel(2),
      });
      const graph = makeGraph([a, b], ['a'], ['b']);

      const result = await verifyGraphProperties(graph, ctx, registry);
      const trust = result.properties.find((p) => p.name === 'handler_trust');
      expect(trust?.status).toBe('verified');
    });

    it('should skip when no registry provided', async () => {
      const a = makeNode({ id: 'a', type: 'action', operation: 'anything' });
      const graph = makeGraph([a], ['a'], ['a']);

      const result = await verifyGraphProperties(graph, ctx);
      const trust = result.properties.find((p) => p.name === 'handler_trust');
      expect(trust?.status).toBe('verified');
      expect(trust?.details).toContain('skipped');
    });
  });

  describe('composite result', () => {
    it('should report verified=true when all properties pass', async () => {
      const a = makeNode({ id: 'a' });
      const b = makeNode({
        id: 'b',
        type: 'inference',
        inputs: [{ nodeId: 'a', port: 'data', dataType: 'string' }],
      });
      const graph = makeGraph([a, b], ['a'], ['b']);

      const result = await verifyGraphProperties(graph, ctx);
      expect(result.verified).toBe(true);
      expect(result.properties).toHaveLength(4);
      expect(result.z3TimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should report verified=false when any property fails', async () => {
      const a = makeNode({
        id: 'a',
        inputs: [{ nodeId: 'missing', port: 'data', dataType: 'string' }],
      });
      const graph = makeGraph([a], ['a'], ['a']);

      const result = await verifyGraphProperties(graph, ctx);
      expect(result.verified).toBe(false);
    });
  });
});
