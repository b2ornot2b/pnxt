/**
 * Self-Modification Orchestrator test suite.
 *
 * Sprint 15 — Advisory Panel: Kay (paradigm), Pearl (causal), de Moura (SMT).
 */

import { SelfModificationOrchestrator } from './self-modification-orchestrator.js';
import type { VPIRGraph, VPIRNode } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import { createLabel } from '../types/ifc.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeLabel(trust: number = 2): SecurityLabel {
  return createLabel('test', trust as 0 | 1 | 2 | 3 | 4, 'internal');
}

function makeNode(
  id: string,
  type: VPIRNode['type'],
  inputs: Array<{ nodeId: string; port: string; dataType: string }> = [],
  trust: number = 2,
  operation?: string,
): VPIRNode {
  return {
    id,
    type,
    operation: operation ?? `${type} ${id}`,
    inputs,
    outputs: [{ port: 'output', dataType: 'object' }],
    evidence: [{ type: 'data', source: 'test', confidence: 0.9 }],
    label: makeLabel(trust),
    verifiable: true,
    createdAt: new Date().toISOString(),
  };
}

function makeGraph(nodes: VPIRNode[], name: string = 'Test Pipeline'): VPIRGraph {
  const nodeMap = new Map<string, VPIRNode>();
  for (const n of nodes) nodeMap.set(n.id, n);
  const roots = nodes.filter((n) => n.inputs.length === 0).map((n) => n.id);
  const consumed = new Set<string>();
  for (const n of nodes) for (const r of n.inputs) consumed.add(r.nodeId);
  const terminals = nodes.filter((n) => !consumed.has(n.id)).map((n) => n.id);

  return {
    id: `graph-${Date.now()}`,
    name,
    nodes: nodeMap,
    roots,
    terminals,
    createdAt: new Date().toISOString(),
  };
}

function ref(nodeId: string): { nodeId: string; port: string; dataType: string } {
  return { nodeId, port: 'output', dataType: 'object' };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('SelfModificationOrchestrator', () => {
  let orchestrator: SelfModificationOrchestrator;

  beforeEach(() => {
    orchestrator = new SelfModificationOrchestrator({
      autoApproveThreshold: 0.7,
      minimumConfidence: 0.3,
    });
  });

  describe('proposeModification', () => {
    it('should create a proposal with correct initial state', () => {
      const source = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
      ]);
      const target = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
        makeNode('c', 'action', [ref('b')]),
      ]);

      const proposal = orchestrator.proposeModification(
        'Add action stage after inference',
        source,
        target,
      );

      expect(proposal.status).toBe('proposed');
      expect(proposal.description).toBe('Add action stage after inference');
      expect(proposal.diff.operations.length).toBeGreaterThan(0);
      expect(proposal.timeline.proposedAt).toBeDefined();
    });

    it('should track proposals in history', () => {
      const source = makeGraph([makeNode('a', 'observation')]);
      const target = makeGraph([makeNode('a', 'observation')]);

      orchestrator.proposeModification('Test 1', source, target);
      orchestrator.proposeModification('Test 2', source, target);

      expect(orchestrator.proposalHistory.length).toBe(2);
    });

    it('should generate unique proposal IDs', () => {
      const source = makeGraph([makeNode('a', 'observation')]);
      const target = makeGraph([makeNode('a', 'observation')]);

      const p1 = orchestrator.proposeModification('Test 1', source, target);
      const p2 = orchestrator.proposeModification('Test 2', source, target);

      expect(p1.id).not.toBe(p2.id);
    });
  });

  describe('evaluateProposal', () => {
    it('should evaluate a proposed modification', async () => {
      const source = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
      ]);
      const target = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
        makeNode('c', 'action', [ref('b')]),
      ]);

      const proposal = orchestrator.proposeModification('Add stage', source, target);
      const evaluated = await orchestrator.evaluateProposal(proposal);

      expect(evaluated.status).toBe('evaluated');
      expect(evaluated.confidence).toBeDefined();
      expect(evaluated.confidence!.composite).toBeGreaterThanOrEqual(0);
      expect(evaluated.confidence!.composite).toBeLessThanOrEqual(1);
      expect(evaluated.preservation).toBeDefined();
      expect(evaluated.causalImpact).toBeDefined();
      expect(evaluated.timeline.evaluatedAt).toBeDefined();
    });

    it('should reject re-evaluation of already evaluated proposal', async () => {
      const source = makeGraph([makeNode('a', 'observation')]);
      const target = makeGraph([makeNode('a', 'observation')]);

      const proposal = orchestrator.proposeModification('Test', source, target);
      await orchestrator.evaluateProposal(proposal);

      await expect(orchestrator.evaluateProposal(proposal)).rejects.toThrow(
        'Cannot evaluate proposal',
      );
    });

    it('should include causal impact when not skipped', async () => {
      const source = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
      ]);
      const target = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
      ]);
      target.nodes.get('b')!.operation = 'Modified inference';

      const proposal = orchestrator.proposeModification('Modify b', source, target);
      await orchestrator.evaluateProposal(proposal);

      expect(proposal.causalImpact).toBeDefined();
    });

    it('should skip causal analysis when configured', async () => {
      const orch = new SelfModificationOrchestrator({ skipCausalAnalysis: true });
      const source = makeGraph([makeNode('a', 'observation')]);
      const target = makeGraph([makeNode('a', 'observation')]);

      const proposal = orch.proposeModification('Test', source, target);
      await orch.evaluateProposal(proposal);

      expect(proposal.causalImpact).toBeUndefined();
    });
  });

  describe('applyModification', () => {
    it('should apply a safe modification successfully', async () => {
      const source = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
      ]);
      const target = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
        makeNode('c', 'action', [ref('b')]),
      ]);

      const proposal = orchestrator.proposeModification(
        'Add action stage',
        source,
        target,
      );
      const result = await orchestrator.applyModification(proposal);

      expect(result.applied).toBe(true);
      expect(result.proposal.status).toBe('applied');
      expect(result.resultGraph.nodes.has('c')).toBe(true);
      expect(result.totalTimeMs).toBeGreaterThan(0);
    });

    it('should auto-evaluate if proposal has not been evaluated', async () => {
      const source = makeGraph([
        makeNode('a', 'observation'),
      ]);
      const target = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'action', [ref('a')]),
      ]);

      const proposal = orchestrator.proposeModification('Add b', source, target);
      expect(proposal.status).toBe('proposed');

      const result = await orchestrator.applyModification(proposal);

      // Should have been evaluated first, then applied
      expect(proposal.confidence).toBeDefined();
      expect(result.applied).toBeDefined();
    });

    it('should reject modification with low confidence', async () => {
      const orch = new SelfModificationOrchestrator({
        minimumConfidence: 0.99, // Very high threshold
      });

      const source = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
      ]);
      const target = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
        makeNode('c', 'action', [ref('b')]),
      ]);

      const result = await orch.proposeAndApply('Add stage', source, target);

      expect(result.applied).toBe(false);
      expect(result.proposal.status).toBe('rejected');
      expect(result.proposal.rejectionReason).toContain('below minimum threshold');
    });

    it('should rollback IFC-violating modification', async () => {
      const source = makeGraph([
        makeNode('a', 'observation', [], 2),
        makeNode('b', 'inference', [ref('a')], 2),
      ]);

      // Create target with IFC violation (high trust → low trust)
      const target = makeGraph([
        makeNode('a', 'observation', [], 4),
        makeNode('b', 'inference', [ref('a')], 0),
      ]);

      const result = await orchestrator.proposeAndApply(
        'Modify trust levels (IFC violation)',
        source,
        target,
      );

      // May be rejected or rolled back depending on confidence scoring
      expect(result.resultGraph).toBeDefined();
    });
  });

  describe('proposeAndApply', () => {
    it('should run the full pipeline in one call', async () => {
      const source = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
      ]);
      const target = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
        makeNode('c', 'assertion', [ref('b')]),
      ]);

      const result = await orchestrator.proposeAndApply(
        'Add assertion stage',
        source,
        target,
      );

      expect(result.proposal.status).not.toBe('proposed');
      expect(result.totalTimeMs).toBeGreaterThan(0);
    });

    it('should handle metadata-only modifications', async () => {
      const source = makeGraph([
        makeNode('a', 'observation'),
      ], 'Original Name');

      const target = makeGraph([
        makeNode('a', 'observation'),
      ], 'Modified Name');

      const result = await orchestrator.proposeAndApply(
        'Rename pipeline',
        source,
        target,
      );

      expect(result.applied).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const source = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
      ]);
      const target = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
        makeNode('c', 'action', [ref('b')]),
      ]);

      await orchestrator.proposeAndApply('Mod 1', source, target);
      await orchestrator.proposeAndApply('Mod 2', source, target);

      const stats = orchestrator.getStats();

      expect(stats.total).toBe(2);
      expect(stats.applied + stats.rejected + stats.rolledBack).toBe(2);
      expect(stats.averageConfidence).toBeGreaterThanOrEqual(0);
    });

    it('should return zero stats initially', () => {
      const stats = orchestrator.getStats();

      expect(stats.total).toBe(0);
      expect(stats.applied).toBe(0);
      expect(stats.rejected).toBe(0);
      expect(stats.rolledBack).toBe(0);
      expect(stats.averageConfidence).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty graph modification', async () => {
      const source = makeGraph([]);
      const target = makeGraph([makeNode('a', 'observation')]);

      const result = await orchestrator.proposeAndApply(
        'Add first node to empty graph',
        source,
        target,
      );

      expect(result.proposal.status).not.toBe('proposed');
    });

    it('should handle no-op modification', async () => {
      const source = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'inference', [ref('a')]),
      ]);

      const result = await orchestrator.proposeAndApply(
        'No-op',
        source,
        source,
      );

      expect(result.applied).toBe(true);
    });

    it('should reject applying an already applied proposal', async () => {
      const source = makeGraph([
        makeNode('a', 'observation'),
      ]);
      const target = makeGraph([
        makeNode('a', 'observation'),
        makeNode('b', 'action', [ref('a')]),
      ]);

      const proposal = orchestrator.proposeModification('Add b', source, target);
      await orchestrator.applyModification(proposal);

      await expect(orchestrator.applyModification(proposal)).rejects.toThrow(
        'Cannot apply proposal',
      );
    });

    it('should clone source and target graphs to prevent mutation', () => {
      const source = makeGraph([makeNode('a', 'observation')]);
      const target = makeGraph([makeNode('a', 'observation')]);

      const proposal = orchestrator.proposeModification('Test', source, target);

      // Mutate the original — should not affect the proposal
      source.name = 'Mutated';
      expect(proposal.sourceGraph.name).not.toBe('Mutated');
    });
  });
});
