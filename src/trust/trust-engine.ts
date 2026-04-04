/**
 * Trust Engine — graduated trust model with measurable trust scores.
 *
 * Implements the trust calibration and scoring described in:
 * - docs/research/phase-3/04-trust-safety-governance-framework.md (Sections 2-3)
 * - docs/research/phase-3/06-implementation-reference-architecture.md (Section 7)
 *
 * Trust is multi-dimensional and earned through demonstrated reliability.
 * Scores are computed from observable metrics, not self-reported claims.
 */

import type { TrustLevel } from '../types/agent.js';
import type {
  TrustCalibration,
  TrustChangeReason,
  TrustEvent,
  TrustMetrics,
  DimensionTrust,
} from '../types/trust.js';

/** Default empty metrics for new agents. */
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

export interface TrustEngine {
  /** Register an agent with an initial trust level. */
  registerAgent(agentId: string, initialLevel: TrustLevel): void;

  /** Record a trust-affecting event and update metrics accordingly. */
  recordEvent(event: TrustEvent): void;

  /** Get the current trust level for an agent. */
  getTrustLevel(agentId: string): TrustLevel | undefined;

  /** Get the full calibration record for an agent. */
  getCalibration(agentId: string): TrustCalibration | undefined;

  /** Recalibrate trust score and recommended level from current metrics. */
  calibrate(agentId: string): TrustCalibration;

  /** Manually set an agent's trust level (e.g., after human review). */
  setTrustLevel(agentId: string, level: TrustLevel, reason: string): void;

  /** Set a per-dimension trust override. */
  setDimensionOverride(agentId: string, override: DimensionTrust): void;

  /** Get all recorded events for an agent. */
  getEvents(agentId: string): TrustEvent[];

  /** Reset an agent's trust to initial state (e.g., after model update). */
  reset(agentId: string, reason: string): void;
}

/**
 * Scoring weights for trust calibration.
 * These determine how much each metric contributes to the overall trust score.
 */
const SCORING_WEIGHTS = {
  successRate: 30,
  bugRate: 20,
  escalationAccuracy: 20,
  confidenceCalibration: 15,
  volumePenalty: 15,
};

/** Minimum tasks before trust can be raised above level 1. */
const MIN_TASKS_FOR_PROMOTION = 5;

/**
 * Compute a 0–100 trust score from metrics.
 */
function computeTrustScore(metrics: TrustMetrics): number {
  const { tasksCompleted, tasksSuccessful, tasksFailed, changesPassingTests } = metrics;

  // Success rate component (0–1)
  const successRate =
    tasksCompleted > 0 ? (tasksSuccessful / tasksCompleted) : 1;

  // Bug rate component (0–1, higher is better = fewer bugs)
  const totalChanges = metrics.changesPassingTests + metrics.changesIntroducingBugs;
  const bugFreeRate =
    totalChanges > 0 ? (changesPassingTests / totalChanges) : 1;

  // Volume penalty: very few completed tasks → uncertain, penalize slightly
  const volumeFactor = Math.min(tasksCompleted / MIN_TASKS_FOR_PROMOTION, 1);

  // Failure penalty: direct failures are heavily weighted
  const failurePenalty =
    tasksCompleted > 0 ? Math.min(tasksFailed / tasksCompleted, 1) : 0;

  const score =
    SCORING_WEIGHTS.successRate * successRate +
    SCORING_WEIGHTS.bugRate * bugFreeRate +
    SCORING_WEIGHTS.escalationAccuracy * metrics.escalationAccuracy +
    SCORING_WEIGHTS.confidenceCalibration * metrics.confidenceCalibration +
    SCORING_WEIGHTS.volumePenalty * volumeFactor -
    failurePenalty * 15; // Extra penalty for failures

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Map a 0–100 trust score to a recommended trust level (0–4).
 */
function scoreToLevel(score: number, tasksCompleted: number): TrustLevel {
  // Not enough data to recommend above level 1
  if (tasksCompleted < MIN_TASKS_FOR_PROMOTION) {
    return score >= 40 ? 1 : 0;
  }

  if (score >= 90) return 4;
  if (score >= 75) return 3;
  if (score >= 55) return 2;
  if (score >= 30) return 1;
  return 0;
}

/** Metric deltas for each trust event reason. */
const EVENT_METRIC_UPDATES: Record<
  TrustChangeReason,
  (m: TrustMetrics) => void
> = {
  task_success: (m) => {
    m.tasksCompleted++;
    m.tasksSuccessful++;
    m.changesPassingTests++;
  },
  task_failure: (m) => {
    m.tasksCompleted++;
    m.tasksFailed++;
  },
  task_revision: (m) => {
    m.tasksCompleted++;
    m.tasksRequiringRevision++;
    m.changesPassingTests++;
  },
  bug_introduced: (m) => {
    m.changesIntroducingBugs++;
  },
  escalation_appropriate: (m) => {
    // Nudge escalation accuracy up
    m.escalationAccuracy = Math.min(1, m.escalationAccuracy + 0.05);
  },
  escalation_unnecessary: (m) => {
    // Nudge escalation accuracy down
    m.escalationAccuracy = Math.max(0, m.escalationAccuracy - 0.1);
  },
  security_violation: (m) => {
    m.tasksFailed++;
  },
  model_update: () => {
    // No metric change — handled by reset()
  },
  manual_adjustment: () => {
    // No metric change — handled by setTrustLevel()
  },
};

/**
 * In-memory trust engine implementation.
 */
export class InMemoryTrustEngine implements TrustEngine {
  private levels = new Map<string, TrustLevel>();
  private metrics = new Map<string, TrustMetrics>();
  private events = new Map<string, TrustEvent[]>();
  private dimensionOverrides = new Map<string, DimensionTrust[]>();
  private calibrations = new Map<string, TrustCalibration>();

  registerAgent(agentId: string, initialLevel: TrustLevel): void {
    if (this.levels.has(agentId)) {
      throw new Error(`Agent already registered: ${agentId}`);
    }
    this.levels.set(agentId, initialLevel);
    this.metrics.set(agentId, emptyMetrics());
    this.events.set(agentId, []);
    this.dimensionOverrides.set(agentId, []);
  }

  recordEvent(event: TrustEvent): void {
    const agentMetrics = this.metrics.get(event.agentId);
    if (!agentMetrics) {
      throw new Error(`Unknown agent: ${event.agentId}`);
    }

    // Record the event
    this.events.get(event.agentId)!.push(event);

    // Apply metric updates
    const updater = EVENT_METRIC_UPDATES[event.reason];
    updater(agentMetrics);
  }

  getTrustLevel(agentId: string): TrustLevel | undefined {
    return this.levels.get(agentId);
  }

  getCalibration(agentId: string): TrustCalibration | undefined {
    return this.calibrations.get(agentId);
  }

  calibrate(agentId: string): TrustCalibration {
    const currentLevel = this.levels.get(agentId);
    if (currentLevel === undefined) {
      throw new Error(`Unknown agent: ${agentId}`);
    }

    const agentMetrics = this.metrics.get(agentId)!;
    const trustScore = computeTrustScore(agentMetrics);
    const recommendedLevel = scoreToLevel(trustScore, agentMetrics.tasksCompleted);

    let adjustmentReason: string | undefined;
    if (recommendedLevel > currentLevel) {
      adjustmentReason = `Score ${trustScore} suggests promotion to level ${recommendedLevel}`;
    } else if (recommendedLevel < currentLevel) {
      adjustmentReason = `Score ${trustScore} suggests demotion to level ${recommendedLevel}`;
    }

    const calibration: TrustCalibration = {
      agentId,
      metrics: { ...agentMetrics },
      trustScore,
      recommendedLevel,
      currentLevel,
      dimensionOverrides: [...(this.dimensionOverrides.get(agentId) ?? [])],
      adjustmentReason,
      calibratedAt: new Date().toISOString(),
    };

    this.calibrations.set(agentId, calibration);
    return calibration;
  }

  setTrustLevel(agentId: string, level: TrustLevel, reason: string): void {
    if (!this.levels.has(agentId)) {
      throw new Error(`Unknown agent: ${agentId}`);
    }
    this.levels.set(agentId, level);
    this.events.get(agentId)!.push({
      agentId,
      reason: 'manual_adjustment',
      timestamp: new Date().toISOString(),
      details: reason,
    });
  }

  setDimensionOverride(agentId: string, override: DimensionTrust): void {
    const overrides = this.dimensionOverrides.get(agentId);
    if (!overrides) {
      throw new Error(`Unknown agent: ${agentId}`);
    }

    const idx = overrides.findIndex((o) => o.dimension === override.dimension);
    if (idx >= 0) {
      overrides[idx] = override;
    } else {
      overrides.push(override);
    }
  }

  getEvents(agentId: string): TrustEvent[] {
    return [...(this.events.get(agentId) ?? [])];
  }

  reset(agentId: string, reason: string): void {
    if (!this.levels.has(agentId)) {
      throw new Error(`Unknown agent: ${agentId}`);
    }

    this.levels.set(agentId, 0);
    this.metrics.set(agentId, emptyMetrics());
    this.dimensionOverrides.set(agentId, []);
    this.calibrations.delete(agentId);

    this.events.get(agentId)!.push({
      agentId,
      reason: 'model_update',
      timestamp: new Date().toISOString(),
      details: reason,
    });
  }
}
