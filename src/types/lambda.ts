/**
 * LLMbda Calculus types — typed lambda calculus with IFC labels.
 *
 * Defines the computational substrate tying all paradigm pillars together.
 * Lambda terms represent computations that LLMs produce; beta reduction
 * models reasoning steps; IFC labels enforce noninterference guarantees.
 *
 * Based on:
 * - docs/research/original-prompt.md (LLMbda Calculus with IFC)
 * - Advisory Review 2026-04-05 (Alonzo Church — lambda calculus substrate)
 */

import type { SecurityLabel } from './ifc.js';

/**
 * Kinds of lambda terms.
 */
export type LambdaTermKind = 'variable' | 'abstraction' | 'application';

/**
 * Types in the simple typed lambda calculus.
 *
 * - Base types: named atomic types (e.g., 'Int', 'Bool', 'String')
 * - Arrow types: function types (param → result)
 */
export interface LambdaType {
  /** 'base' for atomic types, 'arrow' for function types. */
  tag: 'base' | 'arrow';

  /** Name (only for base types). */
  name?: string;

  /** Parameter type (only for arrow types). */
  param?: LambdaType;

  /** Result type (only for arrow types). */
  result?: LambdaType;
}

/**
 * A lambda term — the atomic unit of computation.
 * Every term carries an IFC security label for noninterference checking.
 */
export interface LambdaTerm {
  /** Unique identifier. */
  id: string;

  /** What kind of term this is. */
  kind: LambdaTermKind;

  /** IFC security label at this binding site. */
  label: SecurityLabel;
}

/**
 * A variable reference.
 */
export interface Variable extends LambdaTerm {
  kind: 'variable';

  /** Variable name. */
  name: string;

  /** Type of this variable. */
  type: LambdaType;
}

/**
 * A lambda abstraction (function definition): λx.body
 */
export interface Abstraction extends LambdaTerm {
  kind: 'abstraction';

  /** The bound parameter. */
  param: Variable;

  /** The function body. */
  body: LambdaTerm;

  /** Type of this abstraction: param.type → body's type. */
  type: LambdaType;
}

/**
 * A function application: (func arg)
 */
export interface Application extends LambdaTerm {
  kind: 'application';

  /** The function being applied. */
  func: LambdaTerm;

  /** The argument. */
  arg: LambdaTerm;

  /** Result type (the codomain of func's arrow type). */
  type: LambdaType;
}

/**
 * Typing context — maps variable names to their types and labels.
 */
export interface TypeContext {
  bindings: Map<string, { type: LambdaType; label: SecurityLabel }>;
}

/**
 * Result of type checking a lambda term.
 */
export interface TypeCheckResult {
  /** Whether the term is well-typed. */
  valid: boolean;

  /** Inferred type (if valid). */
  type?: LambdaType;

  /** Type errors found. */
  errors: string[];

  /** IFC violations found. */
  ifcViolations: IFCViolation[];
}

/**
 * An information flow control violation.
 */
export interface IFCViolation {
  /** Human-readable description. */
  message: string;

  /** The high-security label that leaked. */
  highLabel: SecurityLabel;

  /** The low-security context it leaked to. */
  lowLabel: SecurityLabel;

  /** Term where the violation occurred. */
  termId: string;
}

/**
 * Result of normalizing a lambda term.
 */
export interface ReductionResult {
  /** The reduced term. */
  term: LambdaTerm;

  /** Number of reduction steps taken. */
  steps: number;

  /** Detailed reduction steps. */
  reductions: ReductionStep[];

  /** Whether the term reached normal form. */
  normalForm: boolean;
}

/**
 * A single reduction step.
 */
export interface ReductionStep {
  /** String representation before reduction. */
  before: string;

  /** String representation after reduction. */
  after: string;

  /** Which reduction rule was applied. */
  rule: 'beta' | 'eta';
}
