/**
 * Causal Trust Scorer test suite.
 *
 * Validates that difficulty-weighted trust scoring produces higher trust
 * for agents succeeding at hard tasks and lower trust for agents failing
 * at trivial tasks.
 */

import { computeCausalTrustScore, causalScoreToLevel } from './causal-trust.js';
import type { TrustMetrics, TrustEvent, TaskDifficulty } from '../types/trust.js';

function emptyMetrics(): TrustMetrics {
  return {
    tasksCompleted: 0,
    tasksSuccessful: 0,
    tasksRequiringRevision: 0,
    tasksFailed: 0,
    changesIntroducingBugs: 0,
    changesPassingTests: 0,
    escalationAccuracy: 1,
    confidenceCalibration: 1,
  };
}

function makeEvent(
  reason: TrustEvent['reason'],
  difficulty?: TaskDifficulty,
): TrustEvent {
  return {
    agentId: 'test-agent',
    reason,
    timestamp: new Date().toISOString(),
    difficulty,
  };
}

describe('Causal Trust Scorer', () => {
  describe('difficulty weighting', () => {
    it('should give higher score for hard task successes', () => {
      // Use lower escalation/confidence so the score has room to differentiate
      const metrics = {
        ...emptyMetrics(),
        tasksCompleted: 5,
        tasksSuccessful: 5,
        changesPassingTests: 5,
        escalationAccuracy: 0.7,
        confidenceCalibration: 0.7,
      };

      const hardEvents = Array.from({ length: 5 }, () => makeEvent('task_success', 'hard'));
      const trivialEvents = Array.from({ length: 5 }, () => makeEvent('task_success', 'trivial'));

      const hardScore = computeCausalTrustScore(metrics, hardEvents);
      const trivialScore = computeCausalTrustScore(metrics, trivialEvents);

      expect(hardScore).toBeGreaterThan(trivialScore);
    });

    it('should penalize trivial task failures more than hard task failures', () => {
      const metrics = {
        ...emptyMetrics(),
        tasksCompleted: 6,
        tasksSuccessful: 3,
        tasksFailed: 3,
        changesPassingTests: 3,
      };

      const trivialFails = [
        ...Array.from({ length: 3 }, () => makeEvent('task_success', 'moderate')),
        ...Array.from({ length: 3 }, () => makeEvent('task_failure', 'trivial')),
      ];
      const hardFails = [
        ...Array.from({ length: 3 }, () => makeEvent('task_success', 'moderate')),
        ...Array.from({ length: 3 }, () => makeEvent('task_failure', 'hard')),
      ];

      const trivialScore = computeCausalTrustScore(metrics, trivialFails);
      const hardScore = computeCausalTrustScore(metrics, hardFails);

      // Trivial failures should result in lower score
      expect(trivialScore).toBeLessThan(hardScore);
    });

    it('should handle mixed difficulty events', () => {
      const metrics = {
        ...emptyMetrics(),
        tasksCompleted: 4,
        tasksSuccessful: 3,
        tasksFailed: 1,
        changesPassingTests: 3,
      };

      const events = [
        makeEvent('task_success', 'hard'),
        makeEvent('task_success', 'moderate'),
        makeEvent('task_success', 'easy'),
        makeEvent('task_failure', 'trivial'),
      ];

      const score = computeCausalTrustScore(metrics, events);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('no difficulty annotations', () => {
    it('should produce reasonable scores without difficulty info', () => {
      const metrics = {
        ...emptyMetrics(),
        tasksCompleted: 10,
        tasksSuccessful: 8,
        tasksFailed: 2,
        changesPassingTests: 8,
        changesIntroducingBugs: 2,
      };

      const events = [
        ...Array.from({ length: 8 }, () => makeEvent('task_success')),
        ...Array.from({ length: 2 }, () => makeEvent('task_failure')),
      ];

      const score = computeCausalTrustScore(metrics, events);
      expect(score).toBeGreaterThan(30);
      expect(score).toBeLessThan(90);
    });

    it('should produce max-area score for perfect no-difficulty history', () => {
      const metrics = {
        ...emptyMetrics(),
        tasksCompleted: 10,
        tasksSuccessful: 10,
        changesPassingTests: 10,
      };

      const events = Array.from({ length: 10 }, () => makeEvent('task_success'));
      const score = computeCausalTrustScore(metrics, events);
      expect(score).toBeGreaterThanOrEqual(85);
    });
  });

  describe('revision handling', () => {
    it('should give partial credit for revisions', () => {
      const metrics = {
        ...emptyMetrics(),
        tasksCompleted: 5,
        tasksSuccessful: 3,
        tasksRequiringRevision: 2,
        changesPassingTests: 5,
      };

      const eventsWithRevisions = [
        ...Array.from({ length: 3 }, () => makeEvent('task_success', 'moderate')),
        ...Array.from({ length: 2 }, () => makeEvent('task_revision', 'moderate')),
      ];

      const eventsAllSuccess = [
        ...Array.from({ length: 5 }, () => makeEvent('task_success', 'moderate')),
      ];

      const revisionScore = computeCausalTrustScore(metrics, eventsWithRevisions);
      const successScore = computeCausalTrustScore(
        { ...metrics, tasksSuccessful: 5, tasksRequiringRevision: 0 },
        eventsAllSuccess,
      );

      // Revisions should score lower than pure successes
      expect(revisionScore).toBeLessThan(successScore);
      // But higher than failures
      expect(revisionScore).toBeGreaterThan(30);
    });
  });

  describe('edge cases', () => {
    it('should handle empty events', () => {
      const score = computeCausalTrustScore(emptyMetrics(), []);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should handle all expert successes', () => {
      const metrics = {
        ...emptyMetrics(),
        tasksCompleted: 3,
        tasksSuccessful: 3,
        changesPassingTests: 3,
      };

      const events = Array.from({ length: 3 }, () => makeEvent('task_success', 'expert'));
      const score = computeCausalTrustScore(metrics, events);
      expect(score).toBeGreaterThan(50);
    });

    it('should clamp score to 0-100 range', () => {
      const metrics = { ...emptyMetrics(), escalationAccuracy: 0, confidenceCalibration: 0 };
      const events = Array.from({ length: 10 }, () => makeEvent('task_failure', 'trivial'));
      const score = computeCausalTrustScore(
        { ...metrics, tasksCompleted: 10, tasksFailed: 10 },
        events,
      );
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('causalScoreToLevel', () => {
    it('should limit to level 1 with few tasks', () => {
      expect(causalScoreToLevel(95, 3)).toBe(1);
    });

    it('should allow level 0 with poor score and few tasks', () => {
      expect(causalScoreToLevel(20, 2)).toBe(0);
    });

    it('should map high scores to high levels', () => {
      expect(causalScoreToLevel(95, 10)).toBe(4);
      expect(causalScoreToLevel(80, 10)).toBe(3);
      expect(causalScoreToLevel(60, 10)).toBe(2);
      expect(causalScoreToLevel(40, 10)).toBe(1);
      expect(causalScoreToLevel(10, 10)).toBe(0);
    });
  });
});
