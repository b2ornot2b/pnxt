/**
 * Bridge Grammar types — constrained-decoding schema for LLM VPIR output.
 *
 * The Bridge Grammar is the paradigm's minimum viable differentiator: it
 * forces LLMs to produce valid VPIR nodes via JSON Schema constraints,
 * enabling mechanically verifiable reasoning chains from model output.
 *
 * Based on:
 * - docs/research/original-prompt.md (Bridge Grammar)
 * - Advisory Review 2026-04-05 (Panel consensus: Bridge Grammar first)
 */

import type { VPIRNode, VPIRGraph } from './vpir.js';

/**
 * Result of parsing LLM output through the Bridge Grammar.
 */
export interface BridgeGrammarResult {
  /** Whether the parse succeeded. */
  valid: boolean;

  /** Parsed VPIR node (if valid). */
  node?: VPIRNode;

  /** Parsed VPIR graph (if valid, for multi-node output). */
  graph?: VPIRGraph;

  /** Errors encountered during parsing. */
  errors: BridgeGrammarError[];
}

/**
 * A specific error encountered during Bridge Grammar parsing.
 */
export interface BridgeGrammarError {
  /** Machine-readable error code. */
  code: string;

  /** JSON pointer path to the offending field (e.g., "/inputs/0/nodeId"). */
  path: string;

  /** Human-readable error description. */
  message: string;
}

/**
 * Output format for constrained decoding schemas.
 */
export type ConstrainedOutputFormat = 'function_calling' | 'tool_use' | 'structured_output';
