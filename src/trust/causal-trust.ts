/**
 * Causal Trust Scorer — difficulty-weighted trust scoring.
 *
 * Replaces the fixed-weight scoring in the trust engine with a causal model
 * where task difficulty modulates how much a success/failure affects trust.
 *
 * Causal DAG:
 *   {task_difficulty, agent_skill} -> task_outcome -> trust_update
 *
 * - Success on a hard task contributes more to trust than success on a trivial task.
 * - Failure on a trivial task is more damaging than failure on a hard task.
 * - Agent skill is a latent variable estimated from difficulty-weighted outcomes.
 *
 * Based on:
 * - Advisory Review 2026-04-05 (Judea Pearl — causal trust modeling)
 */

import type { TrustMetrics, TrustEvent, TaskDifficulty } from '../types/trust.js';
import type { TrustLevel } from '../types/agent.js';

/**
 * Difficulty weights: how much a task at each difficulty level contributes
 * to the trust score relative to a baseline task.
 */
const DIFFICULTY_WEIGHTS: Record<TaskDifficulty, number> = {
  trivial: 0.5,
  easy: 0.75,
  moderate: 1.0,
  hard: 1.5,
  expert: 2.0,
};

/**
 * Failure penalty multiplier: how severely a failure at each difficulty
 * penalizes trust. Trivial failures are more damaging (the task was easy,
 * so failure indicates low competence).
 */
const FAILURE_PENALTY: Record<TaskDifficulty, number> = {
  trivial: 2.0,
  easy: 1.5,
  moderate: 1.0,
  hard: 0.75,
  expert: 0.5,
};

/** Minimum tasks before trust can be raised above level 1. */
const MIN_TASKS_FOR_PROMOTION = 5;

/**
 * Compute a difficulty-weighted trust score (0–100) from metrics and events.
 *
 * When events carry difficulty annotations, the scorer weights outcomes
 * by difficulty. When no difficulty is provided, it behaves similarly
 * to the fixed scorer (difficulty defaults to 'moderate' = weight 1.0).
 */
export function computeCausalTrustScore(
  metrics: TrustMetrics,
  events: TrustEvent[],
): number {
  // Separate outcome events by type
  const successes = events.filter((e) => e.reason === 'task_success');
  const failures = events.filter((e) => e.reason === 'task_failure');
  const revisions = events.filter((e) => e.reason === 'task_revision');

  // Compute weighted success score
  let weightedSuccesses = 0;
  let totalWeight = 0;

  for (const ev of successes) {
    const diff = ev.difficulty ?? 'moderate';
    const weight = DIFFICULTY_WEIGHTS[diff];
    weightedSuccesses += weight;
    totalWeight += weight;
  }

  for (const ev of revisions) {
    const diff = ev.difficulty ?? 'moderate';
    const weight = DIFFICULTY_WEIGHTS[diff] * 0.6; // Revisions count partial
    weightedSuccesses += weight;
    totalWeight += weight;
  }

  // Compute weighted failure penalty
  let weightedFailures = 0;
  for (const ev of failures) {
    const diff = ev.difficulty ?? 'moderate';
    weightedFailures += FAILURE_PENALTY[diff];
    totalWeight += DIFFICULTY_WEIGHTS[diff];
  }

  // Base success rate from weighted outcomes
  const successRate = totalWeight > 0
    ? weightedSuccesses / (weightedSuccesses + weightedFailures)
    : 1;

  // Bug-free rate (unchanged from fixed scorer)
  const totalChanges = metrics.changesPassingTests + metrics.changesIntroducingBugs;
  const bugFreeRate = totalChanges > 0
    ? metrics.changesPassingTests / totalChanges
    : 1;

  // Volume factor
  const volumeFactor = Math.min(metrics.tasksCompleted / MIN_TASKS_FOR_PROMOTION, 1);

  // Compute latent skill estimate from difficulty-weighted history
  const skillEstimate = computeSkillEstimate(successes, failures, revisions);

  // Compute average difficulty bonus: harder tasks get a bonus
  const avgDifficultyBonus = computeAvgDifficultyBonus(events);

  // Combine components
  const score =
    25 * successRate +       // Weighted success rate
    20 * bugFreeRate +       // Bug-free code rate
    20 * metrics.escalationAccuracy +
    15 * metrics.confidenceCalibration +
    10 * (volumeFactor * skillEstimate) +
    10 * avgDifficultyBonus; // Harder tasks = higher ceiling

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Estimate latent agent skill from difficulty-weighted outcomes.
 *
 * Agents who succeed on harder tasks have a higher skill estimate.
 * This is a simplified Bayesian skill estimator.
 */
function computeSkillEstimate(
  successes: TrustEvent[],
  failures: TrustEvent[],
  revisions: TrustEvent[],
): number {
  if (successes.length + failures.length + revisions.length === 0) {
    return 0.5; // Prior: neutral skill
  }

  let skillNumerator = 0;
  let skillDenominator = 0;

  for (const ev of successes) {
    const diff = ev.difficulty ?? 'moderate';
    const weight = DIFFICULTY_WEIGHTS[diff];
    skillNumerator += weight; // Success adds weight proportional to difficulty
    skillDenominator += weight;
  }

  for (const ev of revisions) {
    const diff = ev.difficulty ?? 'moderate';
    const weight = DIFFICULTY_WEIGHTS[diff];
    skillNumerator += weight * 0.5; // Revisions add partial credit
    skillDenominator += weight;
  }

  for (const ev of failures) {
    const diff = ev.difficulty ?? 'moderate';
    const weight = DIFFICULTY_WEIGHTS[diff];
    // Failures don't add to numerator, but do add to denominator
    skillDenominator += weight;
  }

  return skillDenominator > 0 ? skillNumerator / skillDenominator : 0.5;
}

/**
 * Compute a difficulty bonus based on the average difficulty of completed tasks.
 * Agents tackling harder tasks earn a higher bonus (0–1).
 */
function computeAvgDifficultyBonus(events: TrustEvent[]): number {
  const outcomeEvents = events.filter(
    (e) => e.reason === 'task_success' || e.reason === 'task_failure' || e.reason === 'task_revision',
  );

  if (outcomeEvents.length === 0) return 0.5;

  const totalWeight = outcomeEvents.reduce((sum, e) => {
    const diff = e.difficulty ?? 'moderate';
    return sum + DIFFICULTY_WEIGHTS[diff];
  }, 0);

  // Normalize: moderate (1.0) maps to 0.5, expert (2.0) maps to 1.0, trivial (0.5) maps to 0.25
  const avgWeight = totalWeight / outcomeEvents.length;
  return Math.min(1, avgWeight / 2);
}

/**
 * Map a causal trust score to a recommended trust level.
 */
export function causalScoreToLevel(score: number, tasksCompleted: number): TrustLevel {
  if (tasksCompleted < MIN_TASKS_FOR_PROMOTION) {
    return score >= 40 ? 1 : 0;
  }

  if (score >= 90) return 4;
  if (score >= 75) return 3;
  if (score >= 55) return 2;
  if (score >= 30) return 1;
  return 0;
}
