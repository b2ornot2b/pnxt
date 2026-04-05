/**
 * Visualization types for structured JSON export.
 *
 * Defines web-renderable graph formats for VPIR graphs, HoTT categories,
 * pipeline results, and execution traces. Suitable for consumption by
 * D3.js, Cytoscape.js, or similar web visualization libraries.
 *
 * Based on:
 * - status.md (Phase 6 Sprint 2: Enhanced visualization)
 * - Advisory Review 2026-04-05 (Kay/Liskov: move beyond ASCII)
 */

import type { SecurityLabel } from './ifc.js';

// --- VPIR Graph JSON ---

/**
 * A node in the exported VPIR graph.
 */
export interface GraphNode {
  /** Node ID. */
  id: string;

  /** VPIR node type. */
  type: 'observation' | 'inference' | 'action' | 'assertion' | 'composition';

  /** Operation label. */
  label: string;

  /** Position hint for layout. */
  position: {
    /** Topological layer (0 = roots). */
    layer: number;
    /** Index within layer. */
    index: number;
  };

  /** Security label if present. */
  securityLabel?: SecurityLabel;

  /** Whether this node is verifiable. */
  verifiable?: boolean;
}

/**
 * An edge in the exported VPIR graph.
 */
export interface GraphEdge {
  /** Edge ID. */
  id: string;

  /** Source node ID. */
  source: string;

  /** Target node ID. */
  target: string;

  /** Port label. */
  label: string;

  /** Data type flowing through this edge. */
  dataType: string;
}

/**
 * Metadata for the exported graph.
 */
export interface GraphMetadata {
  /** Graph ID. */
  id: string;

  /** Graph name. */
  name: string;

  /** Total node count. */
  nodeCount: number;

  /** Total edge count. */
  edgeCount: number;

  /** Root node IDs. */
  roots: string[];

  /** Terminal node IDs. */
  terminals: string[];
}

/**
 * Full JSON export of a VPIR graph.
 */
export interface VPIRGraphJSON {
  /** Exported nodes with layout hints. */
  nodes: GraphNode[];

  /** Exported edges with data types. */
  edges: GraphEdge[];

  /** Graph metadata. */
  metadata: GraphMetadata;
}

// --- Category JSON ---

/**
 * An object in the exported category.
 */
export interface CatObject {
  /** Object ID. */
  id: string;

  /** Object kind. */
  kind: 'type' | 'term' | 'context';

  /** Display label. */
  label: string;

  /** Security label if present. */
  securityLabel?: SecurityLabel;
}

/**
 * A morphism in the exported category.
 */
export interface CatMorphism {
  /** Morphism ID. */
  id: string;

  /** Source object ID. */
  source: string;

  /** Target object ID. */
  target: string;

  /** Display label. */
  label: string;

  /** Algebraic properties. */
  properties: string[];
}

/**
 * A 1-path in the exported category.
 */
export interface CatPath {
  /** Path ID. */
  id: string;

  /** Left morphism ID. */
  leftId: string;

  /** Right morphism ID. */
  rightId: string;

  /** Witness evidence. */
  witness: string;
}

/**
 * A 2-path (higher path) in the exported category.
 */
export interface CatHigherPath {
  /** Higher path ID. */
  id: string;

  /** Left 1-path ID. */
  leftPathId: string;

  /** Right 1-path ID. */
  rightPathId: string;

  /** Witness evidence. */
  witness: string;
}

/**
 * Full JSON export of a HoTT category.
 */
export interface CategoryGraphJSON {
  /** Category ID. */
  id: string;

  /** Category name. */
  name: string;

  /** Objects in the category. */
  objects: CatObject[];

  /** Morphisms (arrows). */
  morphisms: CatMorphism[];

  /** 1-path equivalences. */
  paths: CatPath[];

  /** 2-path equivalences (higher paths). */
  higherPaths: CatHigherPath[];
}

// --- Pipeline JSON ---

/**
 * A stage in the pipeline visualization.
 */
export interface StageGraph {
  /** Stage name. */
  stage: string;

  /** Whether this stage completed. */
  completed: boolean;

  /** Duration in milliseconds. */
  durationMs: number;

  /** Number of items produced at this stage. */
  itemCount: number;

  /** Stage-specific data. */
  data?: Record<string, unknown>;
}

/**
 * Connection between pipeline stages.
 */
export interface StageConnection {
  /** Source stage name. */
  from: string;

  /** Target stage name. */
  to: string;

  /** Label describing what flows between stages. */
  label: string;
}

/**
 * Full JSON export of a pipeline execution.
 */
export interface PipelineGraphJSON {
  /** Whether pipeline succeeded. */
  success: boolean;

  /** Stage results. */
  stages: StageGraph[];

  /** Connections between stages. */
  connections: StageConnection[];

  /** Summary statistics. */
  summary: {
    totalDurationMs: number;
    stagesCompleted: number;
    categoricallyValid: boolean;
    ifcConsistent: boolean;
  };
}

// --- Trace JSON ---

/**
 * A step in the execution trace.
 */
export interface TraceStep {
  /** Step index. */
  index: number;

  /** Node ID. */
  nodeId: string;

  /** Operation name. */
  operation: string;

  /** Whether this step succeeded. */
  success: boolean;

  /** Input values (serialized). */
  inputs: Record<string, unknown>;

  /** Output value (serialized). */
  output?: unknown;

  /** Error message if failed. */
  error?: string;

  /** Timestamp. */
  timestamp: string;

  /** Security label if present. */
  securityLabel?: SecurityLabel;
}

/**
 * Timeline entry for visualization.
 */
export interface TimelineEntry {
  /** Node ID. */
  nodeId: string;

  /** Start time relative to trace start (ms). */
  startMs: number;

  /** Duration (ms). */
  durationMs: number;

  /** Status. */
  status: 'completed' | 'failed' | 'timeout';
}

/**
 * Summary of the trace.
 */
export interface TraceSummary {
  /** Graph ID. */
  graphId: string;

  /** Overall status. */
  status: 'completed' | 'failed' | 'timeout';

  /** Total duration. */
  totalDurationMs: number;

  /** Total steps executed. */
  totalSteps: number;

  /** Steps that succeeded. */
  successfulSteps: number;

  /** Steps that failed. */
  failedSteps: number;

  /** Output keys. */
  outputKeys: string[];
}

/**
 * Full JSON export of an execution trace.
 */
export interface TraceJSON {
  /** Step-by-step execution data. */
  steps: TraceStep[];

  /** Timeline for visualization. */
  timeline: TimelineEntry[];

  /** Summary statistics. */
  summary: TraceSummary;
}
