/**
 * Experiment types for Sprint 9 — Categorical Frontier.
 *
 * Defines types for the categorical tokenization experiment and
 * self-hosting proof of concept. These are research prototypes
 * exploring the frontier of the paradigm vision.
 *
 * Sprint 9 deliverable — Advisory Panel: Sutskever, Voevodsky, Kay.
 */

import type { VPIRGraph } from './vpir.js';
import type { Category } from './hott.js';
import type { DPNExecutionResult } from '../channel/dpn-runtime.js';

// ── Categorical Tokenization ───────────────────────────────────────

/**
 * A categorical token — a token with categorical structure.
 *
 * Unlike standard string tokens, categorical tokens carry morphism
 * composition rules and equivalence class membership. Adjacent tokens
 * in a sequence must be connected by a valid morphism.
 */
export interface CategoricalToken {
  /** Unique identifier. */
  id: string;

  /** The category this token belongs to (e.g., 'observation', 'inference'). */
  category: string;

  /** Morphism rule IDs this token can compose with. */
  composableMorphisms: string[];

  /** HoTT path-equivalence class. */
  equivalenceClass: string;

  /** Human-readable label. */
  label: string;
}

/**
 * A morphism rule connecting two token categories.
 */
export interface MorphismRule {
  /** Unique identifier. */
  id: string;

  /** Source token category. */
  sourceCategory: string;

  /** Target token category. */
  targetCategory: string;

  /** Human-readable label. */
  label: string;
}

/**
 * A vocabulary of categorical tokens with morphism composition rules.
 */
export interface CategoricalTokenVocabulary {
  /** Tokens keyed by ID. */
  tokens: Map<string, CategoricalToken>;

  /** Morphism rules governing valid token composition. */
  morphismRules: MorphismRule[];
}

/**
 * Statistics from a tokenization run.
 */
export interface TokenizationStats {
  /** Total tokens produced. */
  totalTokens: number;

  /** Number of adjacent token pairs connected by valid morphisms. */
  validMorphismPairs: number;

  /** Number of invalid transitions (adjacent pairs without a morphism). */
  invalidTransitions: number;

  /** Composition coherence score (0–1): validPairs / totalPairs. */
  compositionCoherence: number;
}

/**
 * Result of tokenizing a VPIR graph.
 */
export interface TokenizationResult {
  /** The categorical tokens produced. */
  tokens: CategoricalToken[];

  /** Whether the token sequence is categorically well-formed. */
  isWellFormed: boolean;

  /** Tokenization statistics. */
  stats: TokenizationStats;
}

/**
 * Which tokenization approach was used.
 */
export type TokenizationApproach = 'baseline' | 'categorical' | 'hybrid';

/**
 * Result of running one tokenization approach on a VPIR graph.
 */
export interface ExperimentResult {
  /** Which approach was used. */
  approach: TokenizationApproach;

  /** Structural validity: did the graph survive roundtrip? (0–1). */
  structuralValidity: number;

  /** Semantic correctness: are node operations preserved? (0–1). */
  semanticCorrectness: number;

  /** Composition coherence: are morphism chains valid? (0–1). */
  compositionCoherence: number;
}

// ── Self-Hosting PoC ───────────────────────────────────────────────

/**
 * Result of the self-hosting proof of concept.
 */
export interface SelfHostingResult {
  /** The VPIR graph describing the pnxt pipeline. */
  pipelineGraph: VPIRGraph;

  /** Z3 verification result on the self-description. */
  verificationPassed: boolean;

  /** HoTT category derived from the self-description. */
  category: Category;

  /** DPN execution result of the self-description. */
  executionResult: DPNExecutionResult;
}
