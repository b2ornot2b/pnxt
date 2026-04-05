/**
 * DPN Bisimulation types.
 *
 * Defines Labelled Transition Systems (LTS), bisimulation relations,
 * and equivalence results for formal DPN configuration comparison.
 *
 * Bisimulation is fundamental for refactoring dataflow programs:
 * proving that a restructured actor network produces the same
 * observable behavior.
 *
 * Based on:
 * - docs/sprints/sprint-7-verification-maturity.md (Milner gap)
 * - Advisory Review 2026-04-05 (Robin Milner — bisimulation)
 */

import type { ChannelState, ProcessState } from './channel.js';
import type { PathTerm } from './hott.js';

// ── DPN State Snapshots ────────────────────────────────────────────

/**
 * Snapshot of a single process's state.
 */
export interface ProcessStateSnapshot {
  processId: string;
  state: ProcessState;
  /** Port names waiting for data. */
  pendingInputs: string[];
  /** Port names waiting to send. */
  pendingOutputs: string[];
}

/**
 * Snapshot of a single channel's state.
 */
export interface ChannelStateSnapshot {
  channelId: string;
  /** Number of buffered items. */
  bufferCount: number;
  state: ChannelState;
}

/**
 * A complete snapshot of a DPN configuration at one point in time.
 */
export interface DPNState {
  /** Unique identifier for this state (hash-based). */
  id: string;
  processStates: ProcessStateSnapshot[];
  channelStates: ChannelStateSnapshot[];
}

// ── LTS Actions and Transitions ────────────────────────────────────

/**
 * An observable action in the LTS.
 */
export type DPNAction =
  | { kind: 'send'; processId: string; channelId: string; port: string }
  | { kind: 'receive'; processId: string; channelId: string; port: string }
  | { kind: 'tau'; processId: string; description: string };

/**
 * A transition in the Labelled Transition System.
 */
export interface DPNTransition {
  fromStateId: string;
  action: DPNAction;
  toStateId: string;
}

/**
 * A Labelled Transition System constructed from a DPN configuration.
 */
export interface LabelledTransitionSystem {
  /** All reachable states. */
  states: Map<string, DPNState>;
  /** Initial state ID. */
  initialStateId: string;
  /** All transitions. */
  transitions: DPNTransition[];
  /** Whether the exploration was bounded (hit maxStates). */
  bounded: boolean;
}

// ── Bisimulation Results ───────────────────────────────────────────

/**
 * A bisimulation relation: set of equivalent state pairs.
 */
export interface BisimulationRelation {
  /** Pairs of equivalent state IDs: [stateId from LTS1, stateId from LTS2]. */
  pairs: Array<[string, string]>;
  /** Whether this is a strong bisimulation. */
  isStrong: boolean;
  /** Whether this is an observational (weak) equivalence. */
  isObservational: boolean;
}

/**
 * Result of a bisimulation check.
 */
export interface BisimulationResult {
  /** Whether the two configurations are equivalent. */
  equivalent: boolean;
  /** The bisimulation relation (if equivalent). */
  relation?: BisimulationRelation;
  /** Human-readable witness or explanation. */
  witness?: string;
  /** HoTT path witnessing the equivalence (if equivalent). */
  hottPath?: PathTerm;
  /** Distinguishing counterexample (if not equivalent). */
  counterexample?: {
    state1Id: string;
    state2Id: string;
    distinguishingAction: DPNAction;
  };
}

// ── Configuration ──────────────────────────────────────────────────

/**
 * Options for bisimulation checking.
 */
export interface BisimulationOptions {
  /** Maximum states to explore per LTS. Default: 200. */
  maxStates?: number;
  /** Generate HoTT path for equivalent configs. Default: true. */
  generateHoTTPath?: boolean;
}
