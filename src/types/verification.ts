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
  | 'side_effect_trust_requirements'
  | 'morphism_composition_associativity'
  | 'identity_morphism_laws'
  | 'groupoid_inverse_law'
  | 'higher_path_consistency'
  | 'n_path_coherence'
  | 'lambda_type_safety'
  | 'ifc_noninterference_proof'
  | 'dpn_progress'
  | 'dpn_deadlock_freedom'
  | 'dpn_fairness'
  | 'univalence_axiom'
  | 'user_precondition'
  | 'user_postcondition'
  | 'user_invariant'
  | 'user_assertion'
  | 'bisimulation_equivalence';

/**
 * Result of a Z3 verification check.
 */
export interface VerificationResult {
  /** Whether the property was verified (invariant holds). */
  verified: boolean;

  /** If not verified, a counterexample showing the violation. */
  counterexample?: Record<string, unknown>;

  /** Solver used. */
  solver: 'z3' | 'cvc5' | 'transport';

  /** Time taken in milliseconds. */
  duration: number;

  /** The property that was verified. */
  property: VerificationProperty;
}

// ── User-Program Verification Types (Sprint 7) ─────────────────────

/**
 * Kind of user-specified program property.
 */
export type ProgramPropertyKind = 'precondition' | 'postcondition' | 'invariant' | 'assertion';

/**
 * A user-specified property to verify on a VPIR program.
 *
 * Users express properties as SMT-LIB2 formulas referencing VPIR node
 * attributes via the naming convention: node_<id>_trust, node_<id>_class,
 * node_<id>_confidence.
 */
export interface ProgramProperty {
  /** Unique identifier. */
  id: string;

  /** What kind of property this is. */
  kind: ProgramPropertyKind;

  /** VPIR node IDs this property applies to. */
  targetNodes: string[];

  /** SMT-LIB2 formula expressing the property. */
  formula: string;

  /** Human-readable description. */
  description: string;
}

/**
 * Result of verifying a user-specified program property.
 */
export interface ProgramVerificationResult extends VerificationResult {
  /** The program property that was verified. */
  programProperty: ProgramProperty;

  /** Variable bindings used: variable name → VPIR node mapping. */
  boundVariables: Record<string, string>;
}

// ── Multi-Solver Configuration (Sprint 7) ──────────────────────────

/**
 * Configuration for the multi-solver verification system.
 */
export interface VerificationConfig {
  /** Which solver to use. 'auto' tries Z3 first, CVC5 as fallback. */
  solver: 'z3' | 'cvc5' | 'auto';

  /** Per-query timeout in milliseconds. Default: 5000. */
  timeout?: number;

  /** Path to CVC5 binary (subprocess mode). */
  cvc5Path?: string;

  /** In 'auto' mode, fall back to CVC5 on Z3 timeout/unknown. Default: true. */
  fallbackOnTimeout?: boolean;
}
