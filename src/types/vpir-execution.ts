/**
 * VPIR Execution types.
 *
 * Defines the context, result, and trace types for executing VPIR graphs.
 * The interpreter walks a validated VPIRGraph in topological order,
 * producing an execution trace with IFC enforcement at every boundary.
 */

import type { SecurityLabel } from './ifc.js';

/**
 * Function that implements an inference operation.
 * Receives named inputs from predecessor nodes, returns a value.
 */
export type InferenceHandler = (inputs: Map<string, unknown>) => Promise<unknown>;

/**
 * Function that evaluates an assertion over its inputs.
 * Returns true if the assertion holds, false otherwise.
 */
export type AssertionHandler = (inputs: Map<string, unknown>) => Promise<boolean>;

/**
 * Context for executing a VPIR graph.
 */
export interface VPIRExecutionContext {
  /** Agent executing this graph. */
  agentId: string;

  /** Security label for the execution context. */
  label: SecurityLabel;

  /** Registered inference handlers, keyed by operation name. */
  handlers: Map<string, InferenceHandler>;

  /** Registered assertion handlers, keyed by operation name. */
  assertionHandlers?: Map<string, AssertionHandler>;

  /** ACI gateway for executing action nodes. */
  aciGateway?: {
    invoke(invocation: {
      toolName: string;
      input: unknown;
      agentId: string;
      requestId: string;
      requesterLabel?: SecurityLabel;
    }): Promise<{
      requestId: string;
      success: boolean;
      output?: unknown;
      error?: { code: string; message: string; retryable: boolean };
      duration: number;
      resultLabel?: SecurityLabel;
    }>;
  };

  /** Maximum execution time in milliseconds. */
  timeout?: number;

  /** Sub-graph resolver for composition nodes. */
  subGraphResolver?: (graphId: string) => Promise<import('./vpir.js').VPIRGraph | undefined>;
}

/**
 * Result of executing a single VPIR node.
 */
export interface VPIRExecutionTrace {
  /** Node that was executed. */
  nodeId: string;

  /** Operation name. */
  operation: string;

  /** Inputs collected from predecessor nodes. */
  inputs: Record<string, unknown>;

  /** Output produced by this node. */
  output: unknown;

  /** Security label at this step. */
  label: SecurityLabel;

  /** Execution time in milliseconds. */
  durationMs: number;

  /** When this step executed. */
  timestamp: string;

  /** Whether this step succeeded. */
  success: boolean;

  /** Error message if failed. */
  error?: string;
}

/**
 * Error during VPIR execution.
 */
export interface VPIRExecutionError {
  /** Node where the error occurred. */
  nodeId: string;

  /** Error code. */
  code: 'ASSERTION_FAILED' | 'HANDLER_ERROR' | 'IFC_VIOLATION' | 'TIMEOUT' | 'NO_HANDLER' | 'ACI_ERROR' | 'SUBGRAPH_ERROR' | 'VALIDATION_ERROR';

  /** Human-readable description. */
  message: string;
}

/**
 * Options for VPIR graph execution.
 */
export interface VPIRExecutionOptions {
  /** Enable parallel execution of independent branches. Default: false. */
  parallel?: boolean;

  /** Enable result caching for deterministic nodes. Default: undefined (no cache). */
  cache?: VPIRResultCache;

  /** Maximum concurrent node executions when parallel is true. Default: 4. */
  maxConcurrency?: number;
}

/**
 * Cache interface for storing and retrieving deterministic node results.
 * Keyed by node ID and a hash of the node's inputs.
 */
export interface VPIRResultCache {
  /** Retrieve a cached result. Returns undefined on cache miss. */
  get(nodeId: string, inputHash: string): Promise<unknown | undefined>;

  /** Store a result in the cache. */
  set(nodeId: string, inputHash: string, value: unknown): Promise<void>;

  /** Check if a result exists in the cache. */
  has(nodeId: string, inputHash: string): Promise<boolean>;
}

/**
 * Options for LLM-driven VPIR generation in the integration pipeline.
 */
export interface LLMPipelineOptions {
  /** Enable LLM-driven VPIR generation. Default: false (use deterministic). */
  enabled: boolean;

  /** Custom Anthropic client (for testing/DI). */
  client?: import('@anthropic-ai/sdk').default;

  /** Claude model to use. Default: 'claude-sonnet-4-20250514'. */
  model?: string;

  /** Maximum retry attempts for invalid output. Default: 2. */
  maxRetries?: number;
}

/**
 * An execution plan grouping nodes into parallel waves.
 * Nodes within a wave have all dependencies satisfied and can run concurrently.
 */
export interface ExecutionWave {
  /** Node IDs in this wave, all of which can execute in parallel. */
  nodeIds: string[];
}

/**
 * A plan for executing a VPIR graph, potentially with parallelism.
 */
export interface ExecutionPlan {
  /** Ordered waves of nodes to execute. */
  waves: ExecutionWave[];

  /** Total number of nodes in the plan. */
  totalNodes: number;

  /** Maximum parallelism (widest wave). */
  maxParallelism: number;
}

/**
 * Result of executing a VPIR graph.
 */
export interface VPIRExecutionResult {
  /** Graph that was executed. */
  graphId: string;

  /** Overall execution status. */
  status: 'completed' | 'failed' | 'timeout';

  /** Outputs from terminal nodes, keyed by "nodeId:port". */
  outputs: Record<string, unknown>;

  /** Step-by-step execution trace. */
  trace: VPIRExecutionTrace[];

  /** Errors encountered during execution. */
  errors: VPIRExecutionError[];

  /** Total execution time in milliseconds. */
  durationMs: number;
}
