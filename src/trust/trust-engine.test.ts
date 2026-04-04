import { InMemoryTrustEngine } from './trust-engine.js';

describe('InMemoryTrustEngine', () => {
  let engine: InMemoryTrustEngine;

  beforeEach(() => {
    engine = new InMemoryTrustEngine();
  });

  describe('registerAgent', () => {
    it('should register an agent with initial trust level', () => {
      engine.registerAgent('agent-1', 1);
      expect(engine.getTrustLevel('agent-1')).toBe(1);
    });

    it('should throw on duplicate registration', () => {
      engine.registerAgent('agent-1', 1);
      expect(() => engine.registerAgent('agent-1', 2)).toThrow('Agent already registered');
    });
  });

  describe('getTrustLevel', () => {
    it('should return undefined for unknown agent', () => {
      expect(engine.getTrustLevel('unknown')).toBeUndefined();
    });
  });

  describe('recordEvent', () => {
    it('should update metrics on task_success', () => {
      engine.registerAgent('agent-1', 1);
      engine.recordEvent({
        agentId: 'agent-1',
        reason: 'task_success',
        timestamp: new Date().toISOString(),
      });

      const cal = engine.calibrate('agent-1');
      expect(cal.metrics.tasksCompleted).toBe(1);
      expect(cal.metrics.tasksSuccessful).toBe(1);
      expect(cal.metrics.changesPassingTests).toBe(1);
    });

    it('should update metrics on task_failure', () => {
      engine.registerAgent('agent-1', 1);
      engine.recordEvent({
        agentId: 'agent-1',
        reason: 'task_failure',
        timestamp: new Date().toISOString(),
      });

      const cal = engine.calibrate('agent-1');
      expect(cal.metrics.tasksCompleted).toBe(1);
      expect(cal.metrics.tasksFailed).toBe(1);
    });

    it('should update metrics on task_revision', () => {
      engine.registerAgent('agent-1', 1);
      engine.recordEvent({
        agentId: 'agent-1',
        reason: 'task_revision',
        timestamp: new Date().toISOString(),
      });

      const cal = engine.calibrate('agent-1');
      expect(cal.metrics.tasksCompleted).toBe(1);
      expect(cal.metrics.tasksRequiringRevision).toBe(1);
    });

    it('should update metrics on bug_introduced', () => {
      engine.registerAgent('agent-1', 1);
      engine.recordEvent({
        agentId: 'agent-1',
        reason: 'bug_introduced',
        timestamp: new Date().toISOString(),
      });

      const cal = engine.calibrate('agent-1');
      expect(cal.metrics.changesIntroducingBugs).toBe(1);
    });

    it('should throw for unknown agent', () => {
      expect(() =>
        engine.recordEvent({
          agentId: 'unknown',
          reason: 'task_success',
          timestamp: new Date().toISOString(),
        }),
      ).toThrow('Unknown agent');
    });

    it('should adjust escalation accuracy', () => {
      engine.registerAgent('agent-1', 1);

      engine.recordEvent({
        agentId: 'agent-1',
        reason: 'escalation_unnecessary',
        timestamp: new Date().toISOString(),
      });

      const cal = engine.calibrate('agent-1');
      expect(cal.metrics.escalationAccuracy).toBeLessThan(1);

      engine.recordEvent({
        agentId: 'agent-1',
        reason: 'escalation_appropriate',
        timestamp: new Date().toISOString(),
      });

      const cal2 = engine.calibrate('agent-1');
      expect(cal2.metrics.escalationAccuracy).toBeGreaterThan(cal.metrics.escalationAccuracy);
    });
  });

  describe('calibrate', () => {
    it('should compute trust score for a new agent', () => {
      engine.registerAgent('agent-1', 0);
      const cal = engine.calibrate('agent-1');

      expect(cal.trustScore).toBeGreaterThanOrEqual(0);
      expect(cal.trustScore).toBeLessThanOrEqual(100);
      expect(cal.agentId).toBe('agent-1');
      expect(cal.currentLevel).toBe(0);
    });

    it('should recommend higher level after consistent successes', () => {
      engine.registerAgent('agent-1', 0);

      // Record enough successes to demonstrate reliability
      for (let i = 0; i < 10; i++) {
        engine.recordEvent({
          agentId: 'agent-1',
          reason: 'task_success',
          timestamp: new Date().toISOString(),
        });
      }

      const cal = engine.calibrate('agent-1');
      expect(cal.trustScore).toBeGreaterThan(70);
      expect(cal.recommendedLevel).toBeGreaterThanOrEqual(2);
      expect(cal.adjustmentReason).toContain('promotion');
    });

    it('should recommend lower level after failures', () => {
      engine.registerAgent('agent-1', 3);

      for (let i = 0; i < 5; i++) {
        engine.recordEvent({
          agentId: 'agent-1',
          reason: 'task_failure',
          timestamp: new Date().toISOString(),
        });
      }

      engine.recordEvent({
        agentId: 'agent-1',
        reason: 'bug_introduced',
        timestamp: new Date().toISOString(),
      });

      const cal = engine.calibrate('agent-1');
      expect(cal.recommendedLevel).toBeLessThan(3);
      expect(cal.adjustmentReason).toContain('demotion');
    });

    it('should not recommend above level 1 with few tasks', () => {
      engine.registerAgent('agent-1', 0);

      // Only 2 tasks — below the MIN_TASKS_FOR_PROMOTION threshold
      engine.recordEvent({
        agentId: 'agent-1',
        reason: 'task_success',
        timestamp: new Date().toISOString(),
      });
      engine.recordEvent({
        agentId: 'agent-1',
        reason: 'task_success',
        timestamp: new Date().toISOString(),
      });

      const cal = engine.calibrate('agent-1');
      expect(cal.recommendedLevel).toBeLessThanOrEqual(1);
    });

    it('should throw for unknown agent', () => {
      expect(() => engine.calibrate('unknown')).toThrow('Unknown agent');
    });

    it('should have no adjustment reason when levels match', () => {
      engine.registerAgent('agent-1', 1);

      // 2 successes: should recommend level 1 (few tasks)
      engine.recordEvent({
        agentId: 'agent-1',
        reason: 'task_success',
        timestamp: new Date().toISOString(),
      });
      engine.recordEvent({
        agentId: 'agent-1',
        reason: 'task_success',
        timestamp: new Date().toISOString(),
      });

      const cal = engine.calibrate('agent-1');
      if (cal.recommendedLevel === cal.currentLevel) {
        expect(cal.adjustmentReason).toBeUndefined();
      }
    });
  });

  describe('setTrustLevel', () => {
    it('should manually set trust level', () => {
      engine.registerAgent('agent-1', 1);
      engine.setTrustLevel('agent-1', 3, 'Promoted after code review');
      expect(engine.getTrustLevel('agent-1')).toBe(3);
    });

    it('should record a manual_adjustment event', () => {
      engine.registerAgent('agent-1', 1);
      engine.setTrustLevel('agent-1', 3, 'Promoted after code review');

      const events = engine.getEvents('agent-1');
      expect(events.some((e) => e.reason === 'manual_adjustment')).toBe(true);
    });

    it('should throw for unknown agent', () => {
      expect(() => engine.setTrustLevel('unknown', 2, 'test')).toThrow('Unknown agent');
    });
  });

  describe('setDimensionOverride', () => {
    it('should add a dimension override', () => {
      engine.registerAgent('agent-1', 2);
      engine.setDimensionOverride('agent-1', {
        dimension: 'scope',
        level: 3,
        scopes: ['src/utils/**'],
      });

      const cal = engine.calibrate('agent-1');
      expect(cal.dimensionOverrides).toHaveLength(1);
      expect(cal.dimensionOverrides[0].dimension).toBe('scope');
    });

    it('should replace existing override for same dimension', () => {
      engine.registerAgent('agent-1', 2);
      engine.setDimensionOverride('agent-1', { dimension: 'scope', level: 3 });
      engine.setDimensionOverride('agent-1', { dimension: 'scope', level: 4 });

      const cal = engine.calibrate('agent-1');
      expect(cal.dimensionOverrides).toHaveLength(1);
      expect(cal.dimensionOverrides[0].level).toBe(4);
    });

    it('should throw for unknown agent', () => {
      expect(() =>
        engine.setDimensionOverride('unknown', { dimension: 'scope', level: 1 }),
      ).toThrow('Unknown agent');
    });
  });

  describe('getEvents', () => {
    it('should return empty array for unknown agent', () => {
      expect(engine.getEvents('unknown')).toEqual([]);
    });

    it('should return all recorded events', () => {
      engine.registerAgent('agent-1', 1);
      engine.recordEvent({
        agentId: 'agent-1',
        reason: 'task_success',
        timestamp: new Date().toISOString(),
      });
      engine.recordEvent({
        agentId: 'agent-1',
        reason: 'task_failure',
        timestamp: new Date().toISOString(),
      });

      expect(engine.getEvents('agent-1')).toHaveLength(2);
    });
  });

  describe('reset', () => {
    it('should reset trust to level 0 and clear metrics', () => {
      engine.registerAgent('agent-1', 3);

      for (let i = 0; i < 5; i++) {
        engine.recordEvent({
          agentId: 'agent-1',
          reason: 'task_success',
          timestamp: new Date().toISOString(),
        });
      }

      engine.reset('agent-1', 'Model updated to v2');

      expect(engine.getTrustLevel('agent-1')).toBe(0);
      const cal = engine.calibrate('agent-1');
      expect(cal.metrics.tasksCompleted).toBe(0);
    });

    it('should record a model_update event', () => {
      engine.registerAgent('agent-1', 2);
      engine.reset('agent-1', 'New model version');

      const events = engine.getEvents('agent-1');
      expect(events.some((e) => e.reason === 'model_update')).toBe(true);
    });

    it('should clear dimension overrides', () => {
      engine.registerAgent('agent-1', 2);
      engine.setDimensionOverride('agent-1', { dimension: 'scope', level: 3 });
      engine.reset('agent-1', 'Reset');

      const cal = engine.calibrate('agent-1');
      expect(cal.dimensionOverrides).toHaveLength(0);
    });

    it('should throw for unknown agent', () => {
      expect(() => engine.reset('unknown', 'test')).toThrow('Unknown agent');
    });
  });
});
