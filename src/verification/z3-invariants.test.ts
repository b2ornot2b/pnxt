/**
 * Z3 SMT Invariant Verification test suite.
 *
 * Tests that Z3 correctly verifies/refutes capability grants, trust
 * transitions, IFC flow consistency, and side-effect trust requirements.
 */

import { createZ3Context } from './z3-invariants.js';
import type { Z3Context } from './z3-invariants.js';
import type { VPIRGraph, VPIRNode } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import type { TrustLevel } from '../types/agent.js';

/** Helper: create a SecurityLabel. */
function label(owner: string, trustLevel: TrustLevel, classification: 'public' | 'internal' | 'confidential' | 'restricted' = 'internal'): SecurityLabel {
  return { owner, trustLevel, classification, createdAt: '2026-04-05T00:00:00Z' };
}

/** Helper: create a minimal VPIRNode. */
function node(
  id: string,
  secLabel: SecurityLabel,
  inputRefs: Array<{ nodeId: string; port: string }> = [],
): VPIRNode {
  return {
    id,
    type: 'inference',
    operation: `Operation ${id}`,
    inputs: inputRefs.map((r) => ({ ...r, dataType: 'string' })),
    outputs: [{ port: 'result', dataType: 'string' }],
    evidence: [{ type: 'rule', source: 'test', confidence: 1.0 }],
    label: secLabel,
    verifiable: true,
    createdAt: '2026-04-05T00:00:00Z',
  };
}

/** Helper: build a VPIRGraph from nodes. */
function makeGraph(nodes: VPIRNode[], roots: string[], terminals: string[]): VPIRGraph {
  const nodeMap = new Map<string, VPIRNode>();
  for (const n of nodes) nodeMap.set(n.id, n);
  return {
    id: 'test-graph',
    name: 'Test Graph',
    nodes: nodeMap,
    roots,
    terminals,
    createdAt: '2026-04-05T00:00:00Z',
  };
}

describe('Z3 SMT Invariant Verification', () => {
  let ctx: Z3Context;

  beforeAll(async () => {
    ctx = await createZ3Context();
  }, 30000); // Z3 WASM init can take a few seconds

  afterAll(() => {
    // Allow Z3 WASM threads to shut down
    ctx = undefined as unknown as Z3Context;
  });

  describe('verifyCapabilityGrants', () => {
    it('should verify valid grants (agent trust >= required)', async () => {
      const result = await ctx.verifyCapabilityGrants([
        { operation: 'file.read', agentTrustLevel: 2, requiredTrustLevel: 0 },
        { operation: 'file.write', agentTrustLevel: 2, requiredTrustLevel: 1 },
        { operation: 'git.commit', agentTrustLevel: 3, requiredTrustLevel: 2 },
      ]);
      expect(result.verified).toBe(true);
      expect(result.solver).toBe('z3');
      expect(result.property).toBe('capability_grant_consistency');
    });

    it('should find counterexample for violating grants', async () => {
      const result = await ctx.verifyCapabilityGrants([
        { operation: 'file.read', agentTrustLevel: 2, requiredTrustLevel: 0 },
        { operation: 'process.exec', agentTrustLevel: 1, requiredTrustLevel: 3 }, // Violation
      ]);
      expect(result.verified).toBe(false);
      expect(result.counterexample).toBeDefined();
      expect(result.counterexample!.operation).toBe('process.exec');
    });

    it('should verify empty grants list', async () => {
      const result = await ctx.verifyCapabilityGrants([]);
      expect(result.verified).toBe(true);
    });

    it('should verify grants at exact boundary', async () => {
      const result = await ctx.verifyCapabilityGrants([
        { operation: 'file.write', agentTrustLevel: 1, requiredTrustLevel: 1 },
      ]);
      expect(result.verified).toBe(true);
    });

    it('should report duration', async () => {
      const result = await ctx.verifyCapabilityGrants([
        { operation: 'test', agentTrustLevel: 2, requiredTrustLevel: 1 },
      ]);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('verifyTrustTransitions', () => {
    it('should verify valid single-step promotions', async () => {
      const result = await ctx.verifyTrustTransitions([
        { agentId: 'a1', fromLevel: 0, toLevel: 1, reason: 'task_success' },
        { agentId: 'a1', fromLevel: 1, toLevel: 2, reason: 'task_success' },
        { agentId: 'a1', fromLevel: 2, toLevel: 3, reason: 'task_success' },
      ]);
      expect(result.verified).toBe(true);
      expect(result.property).toBe('trust_transition_monotonicity');
    });

    it('should find counterexample for skip-level promotion', async () => {
      const result = await ctx.verifyTrustTransitions([
        { agentId: 'a1', fromLevel: 1, toLevel: 3, reason: 'task_success' }, // Skips level 2
      ]);
      expect(result.verified).toBe(false);
      expect(result.counterexample).toBeDefined();
      expect(result.counterexample!.fromLevel).toBe(1);
      expect(result.counterexample!.toLevel).toBe(3);
    });

    it('should verify trust reset to 0 on model_update', async () => {
      const result = await ctx.verifyTrustTransitions([
        { agentId: 'a1', fromLevel: 4, toLevel: 0, reason: 'model_update' },
      ]);
      expect(result.verified).toBe(true);
    });

    it('should verify trust reset to 0 on security_violation', async () => {
      const result = await ctx.verifyTrustTransitions([
        { agentId: 'a1', fromLevel: 3, toLevel: 0, reason: 'security_violation' },
      ]);
      expect(result.verified).toBe(true);
    });

    it('should find counterexample for non-reset demotion', async () => {
      const result = await ctx.verifyTrustTransitions([
        { agentId: 'a1', fromLevel: 3, toLevel: 1, reason: 'task_failure' }, // Demotion without reset
      ]);
      expect(result.verified).toBe(false);
      expect(result.counterexample).toBeDefined();
    });

    it('should verify no-change transition', async () => {
      const result = await ctx.verifyTrustTransitions([
        { agentId: 'a1', fromLevel: 2, toLevel: 2, reason: 'task_success' },
      ]);
      expect(result.verified).toBe(true);
    });

    it('should verify empty transitions list', async () => {
      const result = await ctx.verifyTrustTransitions([]);
      expect(result.verified).toBe(true);
    });
  });

  describe('verifyIFCFlowConsistency', () => {
    it('should verify valid graph with upward trust flow', async () => {
      const graph = makeGraph(
        [
          node('a', label('agent-1', 1, 'public')),
          node('b', label('agent-2', 2, 'internal'), [{ nodeId: 'a', port: 'result' }]),
          node('c', label('agent-3', 3, 'confidential'), [{ nodeId: 'b', port: 'result' }]),
        ],
        ['a'],
        ['c'],
      );

      const result = await ctx.verifyIFCFlowConsistency(graph);
      expect(result.verified).toBe(true);
      expect(result.property).toBe('ifc_flow_lattice');
    });

    it('should find counterexample for downward trust flow', async () => {
      const graph = makeGraph(
        [
          node('high', label('agent-1', 4, 'restricted')),
          node('low', label('agent-2', 1, 'public'), [{ nodeId: 'high', port: 'result' }]),
        ],
        ['high'],
        ['low'],
      );

      const result = await ctx.verifyIFCFlowConsistency(graph);
      expect(result.verified).toBe(false);
      expect(result.counterexample).toBeDefined();
    });

    it('should verify graph with same-level flow', async () => {
      const graph = makeGraph(
        [
          node('a', label('agent-1', 2, 'internal')),
          node('b', label('agent-2', 2, 'internal'), [{ nodeId: 'a', port: 'result' }]),
        ],
        ['a'],
        ['b'],
      );

      const result = await ctx.verifyIFCFlowConsistency(graph);
      expect(result.verified).toBe(true);
    });

    it('should detect classification-only violation', async () => {
      // Same trust level, but classification drops
      const graph = makeGraph(
        [
          node('a', label('agent-1', 2, 'confidential')),
          node('b', label('agent-2', 2, 'public'), [{ nodeId: 'a', port: 'result' }]),
        ],
        ['a'],
        ['b'],
      );

      const result = await ctx.verifyIFCFlowConsistency(graph);
      expect(result.verified).toBe(false);
    });

    it('should verify empty graph (no edges)', async () => {
      const graph = makeGraph(
        [node('solo', label('agent-1', 1))],
        ['solo'],
        ['solo'],
      );

      const result = await ctx.verifyIFCFlowConsistency(graph);
      expect(result.verified).toBe(true);
    });
  });

  describe('verifySideEffectTrustRequirements', () => {
    it('should verify tools with correct trust levels', async () => {
      const result = await ctx.verifySideEffectTrustRequirements([
        { toolName: 'read_file', sideEffects: ['file_read'], declaredTrustLevel: 0, expectedMinTrustLevel: 0 },
        { toolName: 'write_file', sideEffects: ['file_write'], declaredTrustLevel: 1, expectedMinTrustLevel: 1 },
        { toolName: 'git_push', sideEffects: ['git', 'network'], declaredTrustLevel: 2, expectedMinTrustLevel: 2 },
        { toolName: 'exec_cmd', sideEffects: ['process'], declaredTrustLevel: 3, expectedMinTrustLevel: 3 },
      ]);
      expect(result.verified).toBe(true);
      expect(result.property).toBe('side_effect_trust_requirements');
    });

    it('should find counterexample for under-declared trust', async () => {
      const result = await ctx.verifySideEffectTrustRequirements([
        { toolName: 'read_file', sideEffects: ['file_read'], declaredTrustLevel: 0, expectedMinTrustLevel: 0 },
        { toolName: 'dangerous_tool', sideEffects: ['process', 'network'], declaredTrustLevel: 1, expectedMinTrustLevel: 3 }, // Violation
      ]);
      expect(result.verified).toBe(false);
      expect(result.counterexample).toBeDefined();
      expect(result.counterexample!.toolName).toBe('dangerous_tool');
    });

    it('should verify over-declared trust (conservative is fine)', async () => {
      const result = await ctx.verifySideEffectTrustRequirements([
        { toolName: 'safe_tool', sideEffects: ['none'], declaredTrustLevel: 4, expectedMinTrustLevel: 0 },
      ]);
      expect(result.verified).toBe(true);
    });

    it('should verify empty tools list', async () => {
      const result = await ctx.verifySideEffectTrustRequirements([]);
      expect(result.verified).toBe(true);
    });
  });
});
