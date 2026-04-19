/**
 * VPIR Interpreter — executes validated VPIR graphs.
 *
 * Walks a VPIRGraph in topological order, executing each node according
 * to its type. Produces a full execution trace with IFC enforcement at
 * every data-flow boundary.
 *
 * Node execution semantics:
 * - observation: extracts evidence data as output values
 * - inference: applies a registered handler to input values
 * - action: invokes an ACI tool (trust + IFC checked)
 * - assertion: evaluates a predicate; fails execution if false
 * - composition: recursively executes a sub-graph
 */

import type { VPIRGraph, VPIRNode } from '../types/vpir.js';
import type {
  VPIRExecutionContext,
  VPIRExecutionResult,
  VPIRExecutionTrace,
  VPIRExecutionError,
  VPIRExecutionOptions,
} from '../types/vpir-execution.js';
import type {
  ExecutionState,
  VPIRJournal,
} from '../types/vpir-journal.js';
import type { AuditEvent } from '../types/aci.js';
import type { SecurityLabel } from '../types/ifc.js';
import { validateGraph } from './vpir-validator.js';
import { ACIError, AssertionError, HandlerError, SubGraphError } from '../errors/vpir-errors.js';
import { canFlowTo, joinLabels } from '../types/ifc.js';
import { analyzeParallelism, createInputHash, Semaphore } from './vpir-optimizer.js';
import { assertCheckpointMatchesGraph, graphContentHash } from './vpir-journal.js';

/**
 * Execute a validated VPIR graph.
 *
 * @param graph - The VPIR graph to execute (must pass validation)
 * @param context - Execution context with handlers, ACI gateway, and timeout
 * @param options - Optional execution options (parallel, cache, concurrency)
 * @returns Execution result with outputs, trace, and errors
 */
export async function executeGraph(
  graph: VPIRGraph,
  context: VPIRExecutionContext,
  options?: VPIRExecutionOptions,
): Promise<VPIRExecutionResult> {
  const startTime = Date.now();
  const trace: VPIRExecutionTrace[] = [];
  const errors: VPIRExecutionError[] = [];

  // Seed from a prior checkpoint when resuming. The resumed nodeOutputs
  // carries the exact port maps written pre-crash, preserving IFC-label
  // provenance because collectInputs reads from this map by reference.
  const nodeOutputs = new Map<string, Map<string, unknown>>();
  const completedNodes = new Set<string>();
  if (options?.resumeFrom) {
    for (const [nodeId, ports] of options.resumeFrom.nodeOutputs) {
      nodeOutputs.set(nodeId, new Map(ports));
    }
    for (const id of options.resumeFrom.completedNodes) {
      completedNodes.add(id);
    }
  }

  // Validate graph structure before execution.
  const validation = validateGraph(graph);
  if (!validation.valid) {
    return {
      graphId: graph.id,
      status: 'failed',
      outputs: {},
      trace,
      errors: validation.errors.map((e) => ({
        nodeId: e.nodeId,
        code: 'VALIDATION_ERROR' as const,
        message: e.message,
      })),
      durationMs: Date.now() - startTime,
    };
  }

  // Journal session — bundles the journal, running completed-set, and
  // the frozen content hash used in every checkpoint this run emits.
  const journalSession = options?.journal
    ? {
        journal: options.journal,
        graphHash: graphContentHash(graph),
        completedNodes,
        nextCheckpoint: 0,
      }
    : undefined;

  // Parallel execution path.
  if (options?.parallel) {
    return executeParallel(
      graph,
      context,
      options,
      startTime,
      trace,
      errors,
      nodeOutputs,
      journalSession,
    );
  }

  // Sequential execution path (default).
  const order = topologicalSort(graph);

  for (const nodeId of order) {
    if (completedNodes.has(nodeId)) {
      continue; // Already settled in a previous run — skip re-execution.
    }

    if (context.timeout && Date.now() - startTime > context.timeout) {
      errors.push({
        nodeId,
        code: 'TIMEOUT',
        message: `Execution timed out after ${context.timeout}ms`,
      });
      return {
        graphId: graph.id,
        status: 'timeout',
        outputs: collectOutputs(graph, nodeOutputs),
        trace,
        errors,
        durationMs: Date.now() - startTime,
      };
    }

    const result = await executeSingleNode(
      nodeId, graph, context, options, nodeOutputs, trace, errors, journalSession,
    );
    if (result) return { ...result, durationMs: Date.now() - startTime };

    // Node settled — journal it and emit a checkpoint before moving on.
    if (journalSession) {
      await journalNodeCompletion(journalSession, graph, nodeId, nodeOutputs);
    }
  }

  return {
    graphId: graph.id,
    status: 'completed',
    outputs: collectOutputs(graph, nodeOutputs),
    trace,
    errors,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Reconstruct an `ExecutionState` from a journal's most recent checkpoint.
 * Validates that the current graph still hashes to the checkpoint's hash;
 * throws `JournalGraphHashError` on mismatch (structural change between
 * crash and resume). Returns `null` when no checkpoint exists for the graph.
 */
export async function resumeFromCheckpoint(
  graph: VPIRGraph,
  journal: VPIRJournal,
): Promise<ExecutionState | null> {
  const checkpoint = await journal.latestCheckpoint(graph.id);
  if (!checkpoint) return null;

  assertCheckpointMatchesGraph(checkpoint, graph);
  return journal.replay(checkpoint.checkpointId);
}

// ── Internal helpers for durability ───────────────────────────────────────

interface JournalSession {
  journal: VPIRJournal;
  graphHash: string;
  completedNodes: Set<string>;
  nextCheckpoint: number;
}

async function journalNodeCompletion(
  session: JournalSession,
  graph: VPIRGraph,
  nodeId: string,
  nodeOutputs: Map<string, Map<string, unknown>>,
): Promise<void> {
  const node = graph.nodes.get(nodeId)!;
  const outputs = Object.fromEntries(nodeOutputs.get(nodeId) ?? new Map());
  const inputs = Object.fromEntries(collectInputs(node, nodeOutputs));
  const now = Date.now();

  await session.journal.append({
    graphId: graph.id,
    nodeId,
    inputs,
    outputs,
    label: node.label,
    timestamp: now,
  });

  session.completedNodes.add(nodeId);
  const checkpointId = `cp-${graph.id}-${String(session.nextCheckpoint++).padStart(6, '0')}`;
  await session.journal.recordCheckpoint({
    checkpointId,
    graphId: graph.id,
    graphHash: session.graphHash,
    completedNodeIds: [...session.completedNodes],
    timestamp: now,
  });
}

/**
 * Execute a VPIR graph with parallel wave-based execution.
 */
async function executeParallel(
  graph: VPIRGraph,
  context: VPIRExecutionContext,
  options: VPIRExecutionOptions,
  startTime: number,
  trace: VPIRExecutionTrace[],
  errors: VPIRExecutionError[],
  nodeOutputs: Map<string, Map<string, unknown>>,
  journalSession?: JournalSession,
): Promise<VPIRExecutionResult> {
  const plan = analyzeParallelism(graph);
  const maxConcurrency = options.maxConcurrency ?? 4;
  const semaphore = new Semaphore(maxConcurrency);

  for (const wave of plan.waves) {
    // Filter out nodes already settled by a resumed checkpoint.
    const pending = journalSession
      ? wave.nodeIds.filter((id) => !journalSession.completedNodes.has(id))
      : wave.nodeIds;

    if (pending.length === 0) continue;

    // Check timeout before each wave.
    if (context.timeout && Date.now() - startTime > context.timeout) {
      errors.push({
        nodeId: pending[0],
        code: 'TIMEOUT',
        message: `Execution timed out after ${context.timeout}ms`,
      });
      return {
        graphId: graph.id,
        status: 'timeout',
        outputs: collectOutputs(graph, nodeOutputs),
        trace,
        errors,
        durationMs: Date.now() - startTime,
      };
    }

    // Execute all pending nodes in this wave concurrently.
    const waveTraces: VPIRExecutionTrace[] = [];
    const waveErrors: VPIRExecutionError[] = [];
    let waveFailed = false;
    const settledInWave: string[] = [];

    const nodePromises = pending.map(async (nodeId) => {
      await semaphore.acquire();
      try {
        if (waveFailed) return; // Skip if another node in this wave failed.

        const result = await executeSingleNode(
          nodeId, graph, context, options, nodeOutputs, waveTraces, waveErrors, journalSession,
        );
        if (result) {
          waveFailed = true;
        } else {
          settledInWave.push(nodeId);
        }
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(nodePromises);

    // Merge wave results into main trace/errors.
    trace.push(...waveTraces);
    errors.push(...waveErrors);

    if (waveFailed) {
      return {
        graphId: graph.id,
        status: 'failed',
        outputs: collectOutputs(graph, nodeOutputs),
        trace,
        errors,
        durationMs: Date.now() - startTime,
      };
    }

    // Wave succeeded — journal every settled node, then emit one
    // checkpoint for the wave. Order within the wave is irrelevant for
    // replay because intra-wave nodes have no data dependencies on each
    // other by definition (that is the parallelism invariant).
    if (journalSession) {
      for (const nodeId of settledInWave) {
        await journalNodeCompletion(journalSession, graph, nodeId, nodeOutputs);
      }
    }
  }

  return {
    graphId: graph.id,
    status: 'completed',
    outputs: collectOutputs(graph, nodeOutputs),
    trace,
    errors,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Execute a single node with optional caching.
 *
 * Returns a partial result if execution should stop (error/failure),
 * or null if execution should continue.
 */
async function executeSingleNode(
  nodeId: string,
  graph: VPIRGraph,
  context: VPIRExecutionContext,
  options: VPIRExecutionOptions | undefined,
  nodeOutputs: Map<string, Map<string, unknown>>,
  trace: VPIRExecutionTrace[],
  errors: VPIRExecutionError[],
  journalSession: JournalSession | undefined,
): Promise<Omit<VPIRExecutionResult, 'durationMs'> | null> {
  const node = graph.nodes.get(nodeId)!;
  const inputs = collectInputs(node, nodeOutputs);

  // Check IFC flow.
  const ifcError = checkIFCFlow(node, graph, nodeOutputs);
  if (ifcError) {
    errors.push(ifcError);
    trace.push(makeTrace(node, inputs, undefined, false, ifcError.message));
    return {
      graphId: graph.id,
      status: 'failed',
      outputs: collectOutputs(graph, nodeOutputs),
      trace,
      errors,
    };
  }

  try {
    let output: unknown;

    // Human nodes are special: they suspend on an external gateway, so
    // they must not be cached and they emit a pre-await checkpoint so
    // crash-recovery can re-enter the wait. See Sprint 17 / M6.
    if (node.type === 'human') {
      output = await executeHuman(node, inputs, context, graph, journalSession);
    } else if (options?.cache && (node.type === 'observation' || node.type === 'inference')) {
      const inputHash = createInputHash(inputs);
      const cached = await options.cache.get(nodeId, inputHash);

      if (cached !== undefined) {
        output = cached;
      } else {
        output = await executeNode(node, inputs, context);
        await options.cache.set(nodeId, inputHash, output);
      }
    } else {
      output = await executeNode(node, inputs, context);
    }

    // Store outputs.
    const portOutputs = new Map<string, unknown>();
    if (node.outputs.length === 1) {
      portOutputs.set(node.outputs[0].port, output);
    } else if (node.outputs.length > 1 && output && typeof output === 'object') {
      const outputObj = output as Record<string, unknown>;
      for (const out of node.outputs) {
        portOutputs.set(out.port, outputObj[out.port]);
      }
    }
    nodeOutputs.set(nodeId, portOutputs);

    trace.push(makeTrace(node, inputs, output, true));
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = categorizeError(err);

    errors.push({ nodeId, code, message });
    trace.push(makeTrace(node, inputs, undefined, false, message));

    return {
      graphId: graph.id,
      status: 'failed',
      outputs: collectOutputs(graph, nodeOutputs),
      trace,
      errors,
    };
  }
}

/**
 * Execute a single VPIR node.
 */
async function executeNode(
  node: VPIRNode,
  inputs: Map<string, unknown>,
  context: VPIRExecutionContext,
): Promise<unknown> {
  switch (node.type) {
    case 'observation':
      return executeObservation(node);

    case 'inference':
      return executeInference(node, inputs, context);

    case 'action':
      return executeAction(node, inputs, context);

    case 'assertion':
      return executeAssertion(node, inputs, context);

    case 'composition':
      return executeComposition(node, inputs, context);

    case 'human':
      // Human nodes are handled at the executeSingleNode level so that the
      // journal session and graph are in scope. Reaching this branch means
      // the caller bypassed the human-node special case — treat as a bug.
      throw new HandlerError(
        'Human nodes must be executed via executeSingleNode; direct executeNode invocation is unsupported',
      );

    default:
      throw new Error(`Unknown node type: ${node.type}`);
  }
}

/**
 * Observation nodes extract their evidence data as output.
 */
function executeObservation(node: VPIRNode): unknown {
  if (node.evidence.length === 0) {
    return undefined;
  }

  // If outputs have values, return those; otherwise return evidence data.
  if (node.outputs.length > 0 && node.outputs[0].value !== undefined) {
    return node.outputs[0].value;
  }

  // Return evidence as structured data.
  if (node.evidence.length === 1) {
    return {
      type: node.evidence[0].type,
      source: node.evidence[0].source,
      confidence: node.evidence[0].confidence,
    };
  }

  return node.evidence.map((e) => ({
    type: e.type,
    source: e.source,
    confidence: e.confidence,
  }));
}

/**
 * Inference nodes apply a registered handler to their inputs.
 */
async function executeInference(
  node: VPIRNode,
  inputs: Map<string, unknown>,
  context: VPIRExecutionContext,
): Promise<unknown> {
  const handler = context.handlers.get(node.operation);
  if (!handler) {
    throw new HandlerError(`No inference handler registered for operation "${node.operation}"`);
  }

  return handler(inputs);
}

/**
 * Action nodes invoke an ACI tool.
 */
async function executeAction(
  node: VPIRNode,
  inputs: Map<string, unknown>,
  context: VPIRExecutionContext,
): Promise<unknown> {
  if (!context.aciGateway) {
    throw new ACIError('No ACI gateway provided for action node execution');
  }

  // Build tool invocation from node metadata.
  const toolName = node.operation;
  const input = inputs.size === 1
    ? inputs.values().next().value
    : Object.fromEntries(inputs);

  const result = await context.aciGateway.invoke({
    toolName,
    input,
    agentId: context.agentId,
    requestId: `vpir-${node.id}`,
    requesterLabel: node.label,
  });

  if (!result.success) {
    throw new ACIError(
      result.error?.message ?? `Action "${toolName}" failed`,
    );
  }

  return result.output;
}

/**
 * Assertion nodes evaluate a predicate over inputs.
 */
async function executeAssertion(
  node: VPIRNode,
  inputs: Map<string, unknown>,
  context: VPIRExecutionContext,
): Promise<unknown> {
  // Check for a registered assertion handler.
  const handler = context.assertionHandlers?.get(node.operation);
  if (handler) {
    const holds = await handler(inputs);
    if (!holds) {
      throw new AssertionError(`Assertion failed: ${node.operation}`);
    }
    return true;
  }

  // Fall back to inference handler if available.
  const inferenceHandler = context.handlers.get(node.operation);
  if (inferenceHandler) {
    const result = await inferenceHandler(inputs);
    if (result === false || result === null || result === undefined) {
      throw new AssertionError(`Assertion failed: ${node.operation}`);
    }
    return result;
  }

  // No handler: assertion passes vacuously (with warning in trace).
  return true;
}

/**
 * Composition nodes execute a sub-graph.
 */
async function executeComposition(
  node: VPIRNode,
  _inputs: Map<string, unknown>,
  context: VPIRExecutionContext,
): Promise<unknown> {
  if (!context.subGraphResolver) {
    throw new SubGraphError('No sub-graph resolver provided for composition node');
  }

  // The node's operation is the sub-graph ID.
  const subGraph = await context.subGraphResolver(node.operation);
  if (!subGraph) {
    throw new SubGraphError(`Sub-graph "${node.operation}" not found`);
  }

  const result = await executeGraph(subGraph, context);
  if (result.status !== 'completed') {
    const errorMsg = result.errors.map((e) => e.message).join('; ');
    throw new SubGraphError(`Sub-graph execution failed: ${errorMsg}`);
  }

  return result.outputs;
}

/**
 * Execute a human-in-the-loop node (Sprint 17, M6).
 *
 * Semantics:
 *   1. Throw if no humanGateway is configured on the context.
 *   2. Enforce the `human.attention` capability if a capabilityGuard is present.
 *   3. Compute `inputJoin` — the provenance join of every predecessor label.
 *   4. Emit a pre-await checkpoint so a crash between prompt-issued and
 *      response-received can be resumed without losing prior settled nodes.
 *   5. Delegate to `gateway.prompt(...)`.
 *   6. Derive `responseLabel = joinLabels(humanLabel, inputJoin)`.
 *   7. Emit an AuditEvent with actor.type = 'human'.
 *   8. Return the human's response value.
 */
async function executeHuman(
  node: VPIRNode,
  inputs: Map<string, unknown>,
  context: VPIRExecutionContext,
  graph: VPIRGraph,
  journalSession: JournalSession | undefined,
): Promise<unknown> {
  if (!context.humanGateway) {
    throw new HandlerError(
      `Human node "${node.id}" requires a humanGateway on the execution context`,
    );
  }

  if (context.capabilityGuard) {
    const allowed = await context.capabilityGuard('human.attention');
    if (!allowed) {
      throw new HandlerError(
        `Human node "${node.id}" requires the 'human.attention' capability`,
      );
    }
  }

  const spec = node.humanPromptSpec;
  if (!spec) {
    throw new HandlerError(
      `Human node "${node.id}" is missing its humanPromptSpec`,
    );
  }

  const inputJoin = computeInputJoin(node, graph, context.agentId);

  if (journalSession) {
    await journalPreAwaitCheckpoint(journalSession, graph);
  }

  const response = await context.humanGateway.prompt({
    promptId: node.id,
    message: spec.message,
    context: inputs,
    requesterLabel: node.label,
    timeout: spec.timeout,
    requiresExplicitProvenance: spec.requiresExplicitProvenance,
  });

  const humanLabel: SecurityLabel = {
    owner: response.humanId,
    trustLevel: 4,
    classification: node.label.classification,
    createdAt: new Date(response.respondedAt).toISOString(),
  };
  const responseLabel = joinLabels(humanLabel, inputJoin);

  if (context.humanAuditSink) {
    const event: AuditEvent = {
      id: `audit-${node.id}-${response.respondedAt}`,
      timestamp: new Date(response.respondedAt).toISOString(),
      category: 'action',
      actor: { type: 'human', id: response.humanId },
      event: node.operation,
      details: {
        nodeId: node.id,
        promptMessage: spec.message,
        responseLabel,
      },
      requestId: `vpir-${node.id}`,
      result: 'success',
    };
    await context.humanAuditSink(event);
  }

  return response.response;
}

/**
 * Compute the provenance join over a node's predecessor labels.
 * Starts from a baseline label so a human node with zero inputs still
 * produces a valid joined label.
 */
function computeInputJoin(
  node: VPIRNode,
  graph: VPIRGraph,
  agentId: string,
): SecurityLabel {
  let acc: SecurityLabel = {
    owner: agentId,
    trustLevel: 0,
    classification: 'public',
    createdAt: new Date().toISOString(),
  };

  for (const ref of node.inputs) {
    const source = graph.nodes.get(ref.nodeId);
    if (source) {
      acc = joinLabels(acc, source.label);
    }
  }
  return acc;
}

/**
 * Emit a pre-await checkpoint for a human node. The checkpoint snapshots
 * the already-settled nodes so a crash during `gateway.prompt()` can
 * resume without re-executing their handlers. The human node itself is
 * not yet in `completedNodes`, so on resume its gateway is re-invoked;
 * idempotent gateway surfaces de-duplicate by `promptId`.
 */
async function journalPreAwaitCheckpoint(
  session: JournalSession,
  graph: VPIRGraph,
): Promise<void> {
  const checkpointId = `cp-${graph.id}-${String(session.nextCheckpoint++).padStart(6, '0')}-preawait`;
  await session.journal.recordCheckpoint({
    checkpointId,
    graphId: graph.id,
    graphHash: session.graphHash,
    completedNodeIds: [...session.completedNodes],
    timestamp: Date.now(),
  });
}

/**
 * Compute topological order of nodes in the graph.
 */
export function topologicalSort(graph: VPIRGraph): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const nodeId of graph.nodes.keys()) {
    inDegree.set(nodeId, 0);
    adjacency.set(nodeId, []);
  }

  // Build adjacency list from input references.
  for (const node of graph.nodes.values()) {
    for (const ref of node.inputs) {
      if (graph.nodes.has(ref.nodeId)) {
        adjacency.get(ref.nodeId)!.push(node.id);
        inDegree.set(node.id, (inDegree.get(node.id) ?? 0) + 1);
      }
    }
  }

  // Kahn's algorithm.
  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    sorted.push(nodeId);

    for (const neighbor of adjacency.get(nodeId)!) {
      const newDegree = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  return sorted;
}

/**
 * Collect inputs for a node from its predecessors' outputs.
 */
function collectInputs(
  node: VPIRNode,
  nodeOutputs: Map<string, Map<string, unknown>>,
): Map<string, unknown> {
  const inputs = new Map<string, unknown>();

  for (const ref of node.inputs) {
    const sourceOutputs = nodeOutputs.get(ref.nodeId);
    if (sourceOutputs) {
      const key = `${ref.nodeId}:${ref.port}`;
      inputs.set(key, sourceOutputs.get(ref.port));
    }
  }

  return inputs;
}

/**
 * Check IFC flow constraints for a node's inputs.
 */
function checkIFCFlow(
  node: VPIRNode,
  graph: VPIRGraph,
  _nodeOutputs: Map<string, Map<string, unknown>>,
): VPIRExecutionError | null {
  for (const ref of node.inputs) {
    const source = graph.nodes.get(ref.nodeId);
    if (source && source.label && node.label) {
      if (!canFlowTo(source.label, node.label)) {
        return {
          nodeId: node.id,
          code: 'IFC_VIOLATION',
          message: `IFC violation: data from "${source.id}" (trust ${source.label.trustLevel}, ${source.label.classification}) cannot flow to "${node.id}" (trust ${node.label.trustLevel}, ${node.label.classification})`,
        };
      }
    }
  }
  return null;
}

/**
 * Collect final outputs from terminal nodes.
 */
function collectOutputs(
  graph: VPIRGraph,
  nodeOutputs: Map<string, Map<string, unknown>>,
): Record<string, unknown> {
  const outputs: Record<string, unknown> = {};

  for (const termId of graph.terminals) {
    const termOutputs = nodeOutputs.get(termId);
    if (termOutputs) {
      for (const [port, value] of termOutputs) {
        outputs[`${termId}:${port}`] = value;
      }
    }
  }

  return outputs;
}

/**
 * Create a trace entry for a node execution step.
 */
function makeTrace(
  node: VPIRNode,
  inputs: Map<string, unknown>,
  output: unknown,
  success: boolean,
  error?: string,
): VPIRExecutionTrace {
  return {
    nodeId: node.id,
    operation: node.operation,
    inputs: Object.fromEntries(inputs),
    output,
    label: node.label,
    durationMs: 0, // Timing captured at call site if needed
    timestamp: new Date().toISOString(),
    success,
    error,
  };
}

/**
 * Categorize an error into a VPIRExecutionError code.
 */
function categorizeError(
  err: unknown,
): VPIRExecutionError['code'] {
  if (err instanceof AssertionError) return 'ASSERTION_FAILED';
  if (err instanceof ACIError) return 'ACI_ERROR';
  if (err instanceof SubGraphError) return 'SUBGRAPH_ERROR';
  if (err instanceof HandlerError) return 'NO_HANDLER';
  return 'HANDLER_ERROR';
}

// Error classes imported from '../errors/vpir-errors.js'
