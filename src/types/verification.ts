/**
 * Formal verification types for Z3 SMT integration.
 *
 * Used by the verification module to express the results of checking
 * invariants over capability grants, trust transitions, and IFC flow.
 *
 * Based on:
 * - Advisory Review 2026-04-05 (Leonardo de Moura — SMT solver pillar)
 */

/**
 * Properties that can be formally verified with Z3.
 */
export type VerificationProperty =
  | 'capability_grant_consistency'
  | 'trust_transition_monotonicity'
  | 'ifc_flow_lattice'
  | 'side_effect_trust_requirements';

/**
 * Result of a Z3 verification check.
 */
export interface VerificationResult {
  /** Whether the property was verified (invariant holds). */
  verified: boolean;

  /** If not verified, a counterexample showing the violation. */
  counterexample?: Record<string, unknown>;

  /** Solver used. */
  solver: 'z3';

  /** Time taken in milliseconds. */
  duration: number;

  /** The property that was verified. */
  property: VerificationProperty;
}
