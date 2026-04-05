/**
 * Knowledge Graph types for Tree-sitter DKB representation.
 *
 * Defines typed nodes, directed edges, and traversal queries for
 * representing codebases as graphs rather than flat files. This is
 * the foundation for the Tree-sitter DKB Knowledge Graph pillar.
 *
 * Based on:
 * - docs/research/original-prompt.md (Tree-sitter DKB Graph DB)
 * - Advisory Review 2026-04-05 (Judea Pearl — causal reasoning, graph memory)
 */

import type { SecurityLabel } from './ifc.js';

/**
 * Kind of code entity represented by a knowledge graph node.
 */
export type KGNodeKind =
  | 'module'
  | 'function'
  | 'type'
  | 'variable'
  | 'class'
  | 'interface'
  | 'import'
  | 'export';

/**
 * A node in the knowledge graph — a code entity.
 */
export interface KGNode {
  /** Unique identifier. */
  id: string;

  /** What kind of code entity this represents. */
  kind: KGNodeKind;

  /** Human-readable name. */
  name: string;

  /** Arbitrary metadata (e.g., file path, line number, docstring). */
  metadata: Record<string, unknown>;

  /** Optional IFC security label for provenance tracking. */
  securityLabel?: SecurityLabel;
}

/**
 * Typed relationship between two code entities.
 */
export type KGRelation =
  | 'defines'
  | 'imports'
  | 'calls'
  | 'extends'
  | 'implements'
  | 'depends_on'
  | 'contains'
  | 'references';

/**
 * A directed, typed edge between two nodes.
 */
export interface KGEdge {
  /** Unique identifier. */
  id: string;

  /** Source node ID. */
  source: string;

  /** Target node ID. */
  target: string;

  /** Relationship type. */
  relation: KGRelation;

  /** Optional metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * The knowledge graph: nodes + typed edges.
 */
export interface KnowledgeGraphDefinition {
  /** Unique identifier. */
  id: string;

  /** Human-readable name. */
  name: string;

  /** Nodes keyed by ID. */
  nodes: Map<string, KGNode>;

  /** Edges keyed by ID. */
  edges: Map<string, KGEdge>;
}

/**
 * Query parameters for graph traversal.
 */
export interface KGQuery {
  /** Start node for traversal. */
  startNodeId?: string;

  /** Filter by node kind. */
  kind?: KGNodeKind;

  /** Filter by edge relation. */
  relation?: KGRelation;

  /** Maximum traversal depth. Default: 1. */
  maxDepth?: number;

  /** Traversal direction. Default: 'outbound'. */
  direction?: 'outbound' | 'inbound' | 'both';
}

/**
 * Result of a knowledge graph query.
 */
export interface KGQueryResult {
  /** Matching nodes. */
  nodes: KGNode[];

  /** Edges traversed. */
  edges: KGEdge[];

  /** Multi-hop paths found (arrays of nodes). */
  paths: KGNode[][];
}
