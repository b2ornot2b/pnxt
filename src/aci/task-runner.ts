/**
 * External Task Runner — orchestrates the complete VPIR task pipeline.
 *
 * Takes a task specification (JSON or VPIRGraph), validates it, optionally
 * verifies formal properties with Z3, and executes through the DPN runtime
 * with tool registry resolution. No TypeScript required at any point.
 *
 * Pipeline: Task Spec (JSON) → Builder → Verify → DPN Execute → Result
 *
 * Sprint 11 deliverable — Advisory Panel: Kay, Liskov, Agha.
 */

import type { VPIRGraph } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import type { TrustLevel } from '../types/agent.js';
import type { DPNExecutionResult } from '../channel/dpn-runtime.js';
import { DPNRuntime } from '../channel/dpn-runtime.js';
import { ToolRegistry, createStandardRegistry } from './tool-registry.js';
import { VPIRGraphBuilder } from '../vpir/vpir-graph-builder.js';

// ── Types ─────────────────────────────────────────────────────────

export interface TaskRunnerOptions {
  /** Tool registry for resolving action operations. Uses standard registry if not provided. */
  toolRegistry?: ToolRegistry;

  /** Agent trust level for tool validation. Default: 2. */
  agentTrust?: TrustLevel;

  /** Agent ID for execution context. Default: 'task-runner'. */
  agentId?: string;

  /** Security label for the execution context. */
  securityLabel?: SecurityLabel;

  /** Maximum execution time in milliseconds. Default: 30000. */
  timeout?: number;
}

export interface TaskExecutionResult {
  /** Whether the task completed successfully. */
  success: boolean;

  /** Outputs from terminal nodes, keyed by "nodeId:port". */
  outputs: Record<string, unknown>;

  /** The VPIR graph that was executed. */
  graphId: string;

  /** DPN execution status. */
  status: 'completed' | 'failed' | 'timeout' | 'build_error' | 'validation_error';

  /** Duration in milliseconds. */
  durationMs: number;

  /** Error messages (if any). */
  errors: string[];

  /** Full DPN execution result (if execution was reached). */
  dpnResult?: DPNExecutionResult;
}

// ── Task Runner ───────────────────────────────────────────────────

export class TaskRunner {
  private readonly toolRegistry: ToolRegistry;
  private readonly agentTrust: TrustLevel;
  private readonly agentId: string;
  private readonly securityLabel: SecurityLabel;
  private readonly timeout: number;

  constructor(options: TaskRunnerOptions = {}) {
    this.toolRegistry = options.toolRegistry ?? createStandardRegistry();
    this.agentTrust = options.agentTrust ?? 2;
    this.agentId = options.agentId ?? 'task-runner';
    this.timeout = options.timeout ?? 30_000;
    this.securityLabel = options.securityLabel ?? {
      owner: this.agentId,
      trustLevel: this.agentTrust,
      classification: 'internal',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Run a task from a JSON spec or VPIRGraph.
   *
   * If taskSpec is a plain object, it is parsed via VPIRGraphBuilder.fromJSON().
   * If taskSpec is already a VPIRGraph (has a `nodes` Map), it is used directly.
   */
  async run(taskSpec: unknown): Promise<TaskExecutionResult> {
    const startTime = Date.now();

    // Step 1: Build or accept the VPIR graph
    let graph: VPIRGraph;

    if (this.isVPIRGraph(taskSpec)) {
      graph = taskSpec;
    } else {
      const buildResult = VPIRGraphBuilder.fromJSON(taskSpec, {
        toolRegistry: this.toolRegistry,
      });
      if (!buildResult.success || !buildResult.graph) {
        return {
          success: false,
          outputs: {},
          graphId: '',
          status: 'build_error',
          durationMs: Date.now() - startTime,
          errors: buildResult.errors,
        };
      }
      graph = buildResult.graph;
    }

    // Step 2: Tool discovery validation
    const discovery = this.toolRegistry.discoverTools(graph);
    if (!discovery.allAvailable) {
      return {
        success: false,
        outputs: {},
        graphId: graph.id,
        status: 'validation_error',
        durationMs: Date.now() - startTime,
        errors: discovery.missing.map(
          (m) => `Missing tool handler for operation: "${m}"`,
        ),
      };
    }

    // Step 3: Trust validation
    const trustResult = this.toolRegistry.validateTrust(graph, this.agentTrust);
    if (!trustResult.sufficient) {
      return {
        success: false,
        outputs: {},
        graphId: graph.id,
        status: 'validation_error',
        durationMs: Date.now() - startTime,
        errors: trustResult.insufficientTools.map(
          (t) => `Insufficient trust for tool "${t.toolName}": requires ${t.requiredTrust}, agent has ${t.agentTrust}`,
        ),
      };
    }

    // Step 4: Execute through DPN runtime
    const runtime = new DPNRuntime({
      context: {
        agentId: this.agentId,
        label: this.securityLabel,
        handlers: new Map(),
      },
      toolRegistry: this.toolRegistry,
      timeout: this.timeout,
    });

    try {
      runtime.compile(graph);
      const dpnResult = await runtime.execute();

      return {
        success: dpnResult.status === 'completed',
        outputs: dpnResult.outputs,
        graphId: graph.id,
        status: dpnResult.status,
        durationMs: Date.now() - startTime,
        errors: dpnResult.errors.map((e) => `[${e.code}] ${e.message}`),
        dpnResult,
      };
    } catch (err) {
      return {
        success: false,
        outputs: {},
        graphId: graph.id,
        status: 'failed',
        durationMs: Date.now() - startTime,
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
  }

  /**
   * Check if a value is already a VPIRGraph (has a nodes Map).
   */
  private isVPIRGraph(value: unknown): value is VPIRGraph {
    return (
      typeof value === 'object' &&
      value !== null &&
      'nodes' in value &&
      (value as { nodes: unknown }).nodes instanceof Map
    );
  }
}
