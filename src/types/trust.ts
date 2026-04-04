/**
 * Trust engine types — graduated trust model with measurable trust scores.
 *
 * Based on Phase 3 research:
 * - docs/research/phase-3/04-trust-safety-governance-framework.md (Sections 2-3)
 * - docs/research/phase-3/06-implementation-reference-architecture.md (Section 7)
 */

import type { TrustLevel } from './agent.js';

/**
 * Observable performance metrics used to compute trust scores.
 */
export interface TrustMetrics {
  tasksCompleted: number;
  tasksSuccessful: number;
  tasksRequiringRevision: number;
  tasksFailed: number;

  changesIntroducingBugs: number;
  changesPassingTests: number;

  /** Fraction of escalations that were warranted (0–1). */
  escalationAccuracy: number;

  /** Correlation between stated and actual confidence (0–1). */
  confidenceCalibration: number;
}

/**
 * Trust is multi-dimensional. An agent may be trusted for one type of action
 * but not another.
 */
export type TrustDimension = 'scope' | 'action' | 'impact' | 'domain' | 'judgment';

/**
 * Per-dimension trust override. Allows fine-grained trust control.
 */
export interface DimensionTrust {
  dimension: TrustDimension;
  level: TrustLevel;
  /** Specific scopes within this dimension (e.g., file paths, domains). */
  scopes?: string[];
}

/**
 * Full trust calibration record for an agent.
 */
export interface TrustCalibration {
  agentId: string;
  metrics: TrustMetrics;

  /** Computed trust score (0–100). */
  trustScore: number;

  /** Level recommended by the scoring algorithm. */
  recommendedLevel: TrustLevel;

  /** Currently assigned level. */
  currentLevel: TrustLevel;

  /** Per-dimension overrides. */
  dimensionOverrides: DimensionTrust[];

  /** If recommended differs from current. */
  adjustmentReason?: string;

  /** When this calibration was last computed (ISO 8601). */
  calibratedAt: string;
}

/**
 * Events that trigger trust changes.
 */
export type TrustChangeReason =
  | 'task_success'
  | 'task_failure'
  | 'task_revision'
  | 'bug_introduced'
  | 'escalation_appropriate'
  | 'escalation_unnecessary'
  | 'security_violation'
  | 'model_update'
  | 'manual_adjustment';

/**
 * Record of a trust-affecting event.
 */
export interface TrustEvent {
  agentId: string;
  reason: TrustChangeReason;
  timestamp: string;
  details?: string;
}
