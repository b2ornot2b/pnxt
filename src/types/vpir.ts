/**
 * Verifiable Programmatic Intermediate Representation (VPIR) types.
 *
 * A VPIR graph is a DAG of reasoning steps, where each node represents
 * a verifiable operation (inference, observation, action, assertion, or
 * composition). Every node carries evidence and an IFC security label,
 * enabling mechanically verifiable reasoning chains with provenance tracking.
 *
 * Based on:
 * - docs/research/original-prompt.md (VPIR)
 * - Advisory Review 2026-04-05 (Panel consensus: define VPIRNode type)
 */

import type { SecurityLabel } from './ifc.js';
import type { LambdaTerm } from './lambda.js';

/**
 * Types of VPIR reasoning steps.
 */
export type VPIRNodeType =
  | 'inference'    // Derived conclusion from inputs
  | 'observation'  // Raw data from external source
  | 'action'       // Side-effecting operation
  | 'assertion'    // Claimed invariant or postcondition
  | 'composition'  // Aggregation of sub-nodes
  | 'human';       // Human-in-the-loop (Sprint 17, M6)

/**
 * Specification for a human-in-the-loop prompt (Sprint 17, M6).
 * Attached to nodes with type === 'human'.
 */
export interface HumanPromptSpec {
  /** Prompt text shown to the human. */
  message: string;

  /** Milliseconds to wait for a response. Undefined means wait indefinitely. */
  timeout?: number;

  /**
   * When true, the gateway surface must surface the joined input label to
   * the operator before accepting a response.
   */
  requiresExplicitProvenance?: boolean;
}

/**
 * Evidence supporting a VPIR node's validity.
 */
export type EvidenceType = 'data' | 'rule' | 'model_output';

export interface Evidence {
  /** What kind of evidence this is. */
  type: EvidenceType;

  /** Source identifier (agent ID, tool name, data URL, rule name). */
  source: string;

  /** Confidence in this evidence (0–1). */
  confidence: number;

  /** Optional human-readable description. */
  description?: string;
}

/**
 * A typed reference to another VPIR node's output.
 */
export interface VPIRRef {
  /** ID of the referenced node. */
  nodeId: string;

  /** Named output port on the referenced node. */
  port: string;

  /** Type identifier for the data carried by this reference. */
  dataType: string;
}

/**
 * A single verifiable reasoning step in the VPIR graph.
 */
export interface VPIRNode {
  /** Unique identifier for this node. */
  id: string;

  /** What kind of reasoning step this represents. */
  type: VPIRNodeType;

  /** Human-readable description of the operation. */
  operation: string;

  /** References to input nodes (predecessors in the DAG). */
  inputs: VPIRRef[];

  /** Named outputs produced by this node. */
  outputs: VPIROutput[];

  /** Evidence supporting this node's validity. */
  evidence: Evidence[];

  /** IFC security label for provenance tracking. */
  label: SecurityLabel;

  /** Whether this step can be mechanically verified. */
  verifiable: boolean;

  /** When this node was created (ISO 8601). */
  createdAt: string;

  /** Optional: agent that produced this node. */
  agentId?: string;

  /** Optional lambda calculus denotation (semantic foundation — Sprint 6). */
  lambdaSemantics?: LambdaTerm;

  /**
   * Optional human-prompt specification. Required when `type === 'human'`;
   * must be absent for all other node types. See Sprint 17 / M6.
   */
  humanPromptSpec?: HumanPromptSpec;
}

/**
 * A named output produced by a VPIR node.
 */
export interface VPIROutput {
  /** Port name for this output. */
  port: string;

  /** Type identifier for the data produced. */
  dataType: string;

  /** Optional: the actual value (for concrete nodes). */
  value?: unknown;
}

/**
 * A directed acyclic graph of VPIR nodes representing a complete reasoning chain.
 */
export interface VPIRGraph {
  /** Unique identifier for this graph. */
  id: string;

  /** Human-readable name. */
  name: string;

  /** All nodes in the graph, keyed by node ID. */
  nodes: Map<string, VPIRNode>;

  /** Root node IDs (nodes with no inputs — starting points). */
  roots: string[];

  /** Terminal node IDs (nodes whose outputs are not consumed). */
  terminals: string[];

  /** When this graph was created (ISO 8601). */
  createdAt: string;
}

/**
 * Result of validating a VPIR node or graph.
 */
export interface VPIRValidationResult {
  valid: boolean;
  errors: VPIRValidationError[];
  warnings: VPIRValidationWarning[];
}

export interface VPIRValidationError {
  nodeId: string;
  code: string;
  message: string;
}

export interface VPIRValidationWarning {
  nodeId: string;
  code: string;
  message: string;
}

// ── Diff/Patch Types (Sprint 14) ──────────────────────────────────

/**
 * Types of operations in a VPIR graph diff.
 */
export type DiffOperationType =
  | 'add_node'
  | 'remove_node'
  | 'modify_node'
  | 'add_edge'
  | 'remove_edge'
  | 'reroute_edge'
  | 'modify_metadata';

/**
 * A single operation in a VPIR graph diff.
 */
export interface DiffOperation {
  /** What kind of change this represents. */
  type: DiffOperationType;

  /** Path to the affected element (e.g., "nodes/node-id", "edges/from:port→to"). */
  path: string;

  /** Previous value (for modify/remove operations). */
  before?: unknown;

  /** New value (for add/modify operations). */
  after?: unknown;
}

/**
 * A structured diff between two VPIR graphs.
 */
export interface VPIRDiff {
  /** Unique identifier for this diff. */
  id: string;

  /** ID of the source (before) graph. */
  sourceGraphId: string;

  /** ID of the target (after) graph. */
  targetGraphId: string;

  /** Ordered list of diff operations. */
  operations: DiffOperation[];

  /** Diff metadata. */
  metadata: {
    createdAt: string;
    description?: string;
  };
}

/**
 * A conflict detected when applying a patch.
 */
export interface PatchConflict {
  /** The operation that caused the conflict. */
  operation: DiffOperation;

  /** Human-readable reason for the conflict. */
  reason: string;
}

/**
 * Result of applying a patch to a VPIR graph.
 */
export interface PatchResult {
  /** Whether the patch was applied successfully. */
  success: boolean;

  /** The patched graph (if successful). */
  graph?: VPIRGraph;

  /** Conflicts encountered during patch application. */
  conflicts: PatchConflict[];
}
