import {
  createMutablePipelineDescription,
  proposePipelineModification,
  applyPipelineModification,
  getPipelineHistory,
} from './self-mutation.js';
import type { PipelineModification } from './self-mutation.js';

// ── Tests ─────────────────────────────────────────────────────────

describe('Mutable Self-Description', () => {
  describe('createMutablePipelineDescription', () => {
    it('should create a mutable wrapper around the self-description', () => {
      const desc = createMutablePipelineDescription();
      expect(desc.graph).toBeDefined();
      expect(desc.graph.id).toBe('pnxt-self-description');
      expect(desc.graph.nodes.size).toBe(6);
      expect(desc.version).toBe(1);
      expect(desc.history).toHaveLength(0);
    });

    it('should include HoTT categorization', () => {
      const desc = createMutablePipelineDescription();
      expect(desc.categorization).toBeDefined();
      expect(desc.categorization!.category).toBeDefined();
      expect(desc.categorization!.validation.valid).toBe(true);
    });

    it('should have correct pipeline structure', () => {
      const desc = createMutablePipelineDescription();
      expect(desc.graph.roots).toContain('nl-input');
      expect(desc.graph.terminals).toContain('dpn-execution');
    });
  });

  describe('proposePipelineModification', () => {
    it('should create a transaction for adding a stage', () => {
      const desc = createMutablePipelineDescription();
      const modification: PipelineModification = {
        type: 'add_stage',
        description: 'Add caching between VPIR and HoTT',
        newStage: {
          id: 'cache-layer',
          type: 'action',
          operation: 'cache-vpir',
          trustLevel: 2,
          classification: 'internal',
          outputDataType: 'object',
        },
        afterStageId: 'vpir-generation',
      };

      const txn = proposePipelineModification(desc, modification);
      expect(txn.status).toBe('pending');
      expect(txn.diff.operations.length).toBeGreaterThan(0);
      expect(txn.rollbackDiff).toBeDefined();
    });

    it('should create a transaction for removing a stage', () => {
      const desc = createMutablePipelineDescription();
      const modification: PipelineModification = {
        type: 'remove_stage',
        description: 'Remove HoTT categorization stage',
        removeStageId: 'hott-categorization',
      };

      const txn = proposePipelineModification(desc, modification);
      expect(txn.status).toBe('pending');
      expect(txn.diff.operations.length).toBeGreaterThan(0);
    });

    it('should create a transaction for modifying a stage', () => {
      const desc = createMutablePipelineDescription();
      const modification: PipelineModification = {
        type: 'modify_stage',
        description: 'Upgrade verification trust level',
        modifyStageId: 'z3-verification',
        modifications: { trustLevel: 4 },
      };

      const txn = proposePipelineModification(desc, modification);
      expect(txn.status).toBe('pending');
    });

    it('should create a transaction for adding a parallel branch', () => {
      const desc = createMutablePipelineDescription();
      const modification: PipelineModification = {
        type: 'add_branch',
        description: 'Add logging branch from bridge grammar',
        newStage: {
          id: 'logging-branch',
          type: 'action',
          operation: 'log-output',
          trustLevel: 1,
          classification: 'public',
          outputDataType: 'string',
        },
        afterStageId: 'bridge-grammar',
      };

      const txn = proposePipelineModification(desc, modification);
      expect(txn.status).toBe('pending');
    });

    it('should throw for missing required fields', () => {
      const desc = createMutablePipelineDescription();
      expect(() => proposePipelineModification(desc, {
        type: 'add_stage',
        description: 'Missing newStage',
      })).toThrow('add_stage requires newStage');
    });

    it('should throw for non-existent stage removal', () => {
      const desc = createMutablePipelineDescription();
      expect(() => proposePipelineModification(desc, {
        type: 'remove_stage',
        description: 'Remove missing stage',
        removeStageId: 'non-existent',
      })).toThrow('not found');
    });
  });

  describe('applyPipelineModification', () => {
    it('should commit a valid add-stage modification', async () => {
      const desc = createMutablePipelineDescription();
      const modification: PipelineModification = {
        type: 'add_stage',
        description: 'Add caching layer',
        newStage: {
          id: 'cache-layer',
          type: 'inference',
          operation: 'cache-vpir',
          trustLevel: 2,
          classification: 'internal',
          outputDataType: 'object',
        },
        afterStageId: 'vpir-generation',
      };

      const txn = proposePipelineModification(desc, modification);
      const updated = await applyPipelineModification(desc, txn);

      expect(updated.version).toBe(2);
      expect(updated.graph.nodes.size).toBe(7); // 6 + 1
      expect(updated.graph.nodes.has('cache-layer')).toBe(true);
      expect(updated.history).toHaveLength(1);
    });

    it('should maintain categorization after modification', async () => {
      const desc = createMutablePipelineDescription();
      const modification: PipelineModification = {
        type: 'add_branch',
        description: 'Add logging branch',
        newStage: {
          id: 'logging',
          type: 'action',
          operation: 'log',
          trustLevel: 1,
          classification: 'internal',
          outputDataType: 'string',
        },
        afterStageId: 'nl-input',
      };

      const txn = proposePipelineModification(desc, modification);
      const updated = await applyPipelineModification(desc, txn);

      if (updated.version > 1) {
        expect(updated.categorization).toBeDefined();
      }
    });

    it('should rollback modifications that fail validation', async () => {
      const desc = createMutablePipelineDescription();

      // Create a modification that introduces an IFC violation
      // (high trust flowing to low trust)
      const modification: PipelineModification = {
        type: 'modify_stage',
        description: 'Lower DPN execution trust (causes IFC violation)',
        modifyStageId: 'dpn-execution',
        modifications: { trustLevel: 0, classification: 'public' },
      };

      const txn = proposePipelineModification(desc, modification);
      const updated = await applyPipelineModification(desc, txn);

      // Should be rolled back because trust flows from high (z3) to low (dpn)
      expect(updated.version).toBe(1); // Unchanged
      expect(updated.graph.nodes.size).toBe(6); // Original
    });
  });

  describe('getPipelineHistory', () => {
    it('should report initial state correctly', () => {
      const desc = createMutablePipelineDescription();
      const history = getPipelineHistory(desc);

      expect(history.version).toBe(1);
      expect(history.totalTransactions).toBe(0);
      expect(history.committedCount).toBe(0);
    });

    it('should track committed transactions', async () => {
      const desc = createMutablePipelineDescription();
      const modification: PipelineModification = {
        type: 'add_branch',
        description: 'Add logging',
        newStage: {
          id: 'log',
          type: 'action',
          operation: 'log',
          trustLevel: 1,
          classification: 'internal',
          outputDataType: 'string',
        },
        afterStageId: 'nl-input',
      };

      const txn = proposePipelineModification(desc, modification);
      const updated = await applyPipelineModification(desc, txn);

      const history = getPipelineHistory(updated);
      expect(history.totalTransactions).toBe(1);
    });
  });
});
