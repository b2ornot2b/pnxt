/**
 * DPN Runtime — executes VPIR graphs through Dataflow Process Networks.
 *
 * This is the paradigm-defining execution engine: instead of interpreting
 * VPIR nodes imperatively (topological sort + function calls), the DPN
 * Runtime maps each node to a Process actor and each edge to a typed
 * Channel, executing the graph through actor message-passing.
 *
 * This elevates DPN from "a library" to "the execution substrate,"
 * addressing Robin Milner's concern that DPN should be the execution
 * paradigm, not just a component.
 *
 * Sprint 4 deliverable — Advisory Panel: Kay, Liskov, Milner.
 */

import type { VPIRGraph, VPIRNode } from '../types/vpir.js';
import type {
  VPIRExecutionContext,
} from '../types/vpir-execution.js';
import type {
  Connection,
  DataflowGraphDefinition,
  PortDefinition,
  ProcessDefinition,
  ProcessFunction,
  ProcessState,
  ReadableChannel,
  WritableChannel,
} from '../types/channel.js';
import { validateGraph } from '../vpir/vpir-validator.js';
import { canFlowTo } from '../types/ifc.js';
import { Channel } from './channel.js';
import { Process } from './process.js';
import type { ChannelTraceEntry } from './tracing-channel.js';
import { ACIError, AssertionError, HandlerError } from '../errors/vpir-errors.js';

// ── Public types ────────────────────────────────────────────────────

export interface DPNRuntimeOptions {
  /** VPIR execution context (handlers, ACI gateway, security label). */
  context: VPIRExecutionContext;

  /** Maximum execution time in milliseconds. Default: 30000. */
  timeout?: number;

  /** Channel buffer size. Default: 16. */
  channelBufferSize?: number;

  /** Enable channel-level tracing. Default: true. */
  enableTracing?: boolean;
}

export interface DPNExecutionError {
  processId: string;
  code: string;
  message: string;
}

export interface DPNExecutionTrace {
  processStates: Record<string, ProcessState>;
  channelEntries: ChannelTraceEntry[];
  channelStats: Record<string, { sent: number; received: number; buffered: number }>;
}

export interface DPNExecutionResult {
  graphId: string;
  status: 'completed' | 'failed' | 'timeout';
  outputs: Record<string, unknown>;
  trace: DPNExecutionTrace;
  durationMs: number;
  errors: DPNExecutionError[];
}

// ── DPN Runtime ─────────────────────────────────────────────────────

export class DPNRuntime {
  private readonly context: VPIRExecutionContext;
  private readonly timeout: number;
  private readonly bufferSize: number;
  private readonly enableTracing: boolean;

  private vpirGraph: VPIRGraph | null = null;
  private processes = new Map<string, Process>();
  private channels = new Map<string, Channel<unknown>>();
  private outputChannels = new Map<string, Channel<unknown>>();
  private traceEntries: ChannelTraceEntry[] = [];
  private compiled = false;

  constructor(options: DPNRuntimeOptions) {
    this.context = options.context;
    this.timeout = options.timeout ?? 30_000;
    this.bufferSize = options.channelBufferSize ?? 16;
    this.enableTracing = options.enableTracing ?? true;
  }

  /**
   * Compile a VPIR graph into a DPN configuration.
   * Maps each VPIR node to a Process and each edge to a Channel.
   */
  compile(graph: VPIRGraph): void {
    const validation = validateGraph(graph);
    if (!validation.valid) {
      const messages = validation.errors.map((e) => e.message).join('; ');
      throw new Error(`VPIR graph validation failed: ${messages}`);
    }

    this.vpirGraph = graph;
    this.processes.clear();
    this.channels.clear();
    this.outputChannels.clear();
    this.traceEntries = [];

    // Build process definitions and connections from VPIR graph.
    const { definition, outputCollectors } = this.buildGraphDefinition(graph);

    // Create processes with behaviors.
    for (const procDef of definition.processes) {
      const node = graph.nodes.get(procDef.id)!;
      const behavior = this.createProcessBehavior(node);
      const process = new Process(procDef, behavior);
      this.processes.set(procDef.id, process);
    }

    // Create and wire channels.
    for (const conn of definition.connections) {
      const channel = new Channel<unknown>({
        id: conn.channelId,
        dataType: 'unknown',
        bufferSize: this.bufferSize,
      });
      this.channels.set(conn.channelId, channel);

      const sourceProcess = this.processes.get(conn.source.processId)!;
      const targetProcess = this.processes.get(conn.target.processId)!;

      // Tracing wrappers — we intercept via logging after send/receive
      sourceProcess.bindOutput(conn.source.port, channel);
      targetProcess.bindInput(conn.target.port, channel);
    }

    // Create output collector channels for terminal nodes.
    for (const { nodeId, port, channelId } of outputCollectors) {
      const channel = new Channel<unknown>({
        id: channelId,
        dataType: 'unknown',
        bufferSize: this.bufferSize,
      });
      this.outputChannels.set(`${nodeId}:${port}`, channel);
      this.channels.set(channelId, channel);

      const process = this.processes.get(nodeId)!;
      process.bindOutput(port, channel);
    }

    this.compiled = true;
  }

  /**
   * Execute the compiled graph through DPN channels.
   */
  async execute(): Promise<DPNExecutionResult> {
    if (!this.compiled || !this.vpirGraph) {
      throw new Error('DPNRuntime: must call compile() before execute()');
    }

    const startTime = Date.now();
    const errors: DPNExecutionError[] = [];

    // Start all processes.
    for (const process of this.processes.values()) {
      process.start();
    }

    // Wait for completion with timeout.
    const waitPromises: Promise<void>[] = [];
    for (const process of this.processes.values()) {
      waitPromises.push(process.wait());
    }

    const timeoutPromise = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), this.timeout),
    );

    const result = await Promise.race([
      Promise.all(waitPromises).then(() => 'done' as const),
      timeoutPromise,
    ]);

    const durationMs = Date.now() - startTime;

    if (result === 'timeout') {
      // Close all channels to unblock waiting processes.
      for (const channel of this.channels.values()) {
        channel.close();
      }
      // Wait briefly for processes to react to channel closure.
      await Promise.race([
        Promise.all(waitPromises),
        new Promise((r) => setTimeout(r, 500)),
      ]);

      errors.push({
        processId: 'runtime',
        code: 'TIMEOUT',
        message: `Execution timed out after ${this.timeout}ms`,
      });

      return {
        graphId: this.vpirGraph.id,
        status: 'timeout',
        outputs: this.collectOutputs(),
        trace: this.buildTrace(),
        durationMs,
        errors,
      };
    }

    // Check for failed processes.
    for (const process of this.processes.values()) {
      if (process.currentState === 'failed') {
        errors.push({
          processId: process.id,
          code: 'PROCESS_FAILED',
          message: `Process "${process.name}" failed`,
        });
      }
    }

    const status = errors.length > 0 ? 'failed' : 'completed';

    return {
      graphId: this.vpirGraph.id,
      status,
      outputs: this.collectOutputs(),
      trace: this.buildTrace(),
      durationMs,
      errors,
    };
  }

  /**
   * Get the execution trace (available after execute()).
   */
  getTrace(): DPNExecutionTrace {
    return this.buildTrace();
  }

  /**
   * Get the number of compiled processes.
   */
  get processCount(): number {
    return this.processes.size;
  }

  /**
   * Get the number of compiled channels (including output collectors).
   */
  get channelCount(): number {
    return this.channels.size;
  }

  // ── Private helpers ─────────────────────────────────────────────

  /**
   * Build a DataflowGraphDefinition from a VPIR graph.
   */
  private buildGraphDefinition(graph: VPIRGraph): {
    definition: DataflowGraphDefinition;
    outputCollectors: Array<{ nodeId: string; port: string; channelId: string }>;
  } {
    const processes: ProcessDefinition[] = [];
    const connections: Connection[] = [];
    const outputCollectors: Array<{ nodeId: string; port: string; channelId: string }> = [];

    // Count how many consumers each output port has (for fan-out).
    // Key: "nodeId:port", Value: list of consuming node IDs.
    const portConsumers = new Map<string, string[]>();
    for (const node of graph.nodes.values()) {
      for (const ref of node.inputs) {
        const key = `${ref.nodeId}:${ref.port}`;
        const existing = portConsumers.get(key) ?? [];
        existing.push(node.id);
        portConsumers.set(key, existing);
      }
    }

    for (const node of graph.nodes.values()) {
      // Build input port definitions from the node's input refs.
      const inputPorts: PortDefinition[] = node.inputs.map((ref) => ({
        name: `${ref.nodeId}:${ref.port}`,
        direction: 'input' as const,
        dataType: ref.dataType,
      }));

      // Build output port definitions.
      // For fan-out: if a port has N consumers, create N output ports (port->consumer1, etc.)
      const outputPorts: PortDefinition[] = [];
      for (const out of node.outputs) {
        const consumers = portConsumers.get(`${node.id}:${out.port}`);
        if (consumers && consumers.length > 1) {
          // Fan-out: one output port per consumer.
          for (const consumerId of consumers) {
            outputPorts.push({
              name: `${out.port}->${consumerId}`,
              direction: 'output' as const,
              dataType: out.dataType,
            });
          }
        } else {
          outputPorts.push({
            name: out.port,
            direction: 'output' as const,
            dataType: out.dataType,
          });
        }
      }

      // Terminal nodes get an extra output collector port if their output isn't consumed.
      for (const out of node.outputs) {
        const portKey = `${node.id}:${out.port}`;
        if (!portConsumers.has(portKey)) {
          const collectorId = `collector-${node.id}-${out.port}`;
          outputCollectors.push({ nodeId: node.id, port: out.port, channelId: collectorId });
          // Only add port if not already present (non-fan-out case).
          if (!outputPorts.some((p) => p.name === out.port)) {
            outputPorts.push({
              name: out.port,
              direction: 'output' as const,
              dataType: out.dataType,
            });
          }
        }
      }

      processes.push({
        id: node.id,
        name: node.operation,
        inputs: inputPorts,
        outputs: outputPorts,
        agentId: node.agentId,
      });

      // Create connections for each input ref.
      for (const ref of node.inputs) {
        const consumers = portConsumers.get(`${ref.nodeId}:${ref.port}`);
        const sourcePort = consumers && consumers.length > 1
          ? `${ref.port}->${node.id}`
          : ref.port;

        connections.push({
          channelId: `edge-${ref.nodeId}-${ref.port}-to-${node.id}`,
          source: { processId: ref.nodeId, port: sourcePort },
          target: { processId: node.id, port: `${ref.nodeId}:${ref.port}` },
        });
      }
    }

    return {
      definition: {
        id: `dpn-${graph.id}`,
        name: `DPN: ${graph.name}`,
        processes,
        connections,
      },
      outputCollectors,
    };
  }

  /**
   * Create a ProcessFunction for a VPIR node based on its type.
   */
  private createProcessBehavior(node: VPIRNode): ProcessFunction {
    const context = this.context;
    const graph = this.vpirGraph!;
    const traceEntries = this.traceEntries;
    const enableTracing = this.enableTracing;

    return async (
      inputs: Map<string, ReadableChannel<unknown>>,
      outputs: Map<string, WritableChannel<unknown>>,
    ): Promise<void> => {
      try {
        // Collect input values from channels.
        const inputValues = new Map<string, unknown>();
        for (const [portName, channel] of inputs) {
          const value = await channel.receive();

          // IFC check: verify source label can flow to this node's label.
          const refNodeId = portName.split(':')[0];
          const sourceNode = graph.nodes.get(refNodeId);
          if (sourceNode && !canFlowTo(sourceNode.label, node.label)) {
            throw new Error(
              `IFC violation: data from "${refNodeId}" cannot flow to "${node.id}"`,
            );
          }

          inputValues.set(portName, value);

          if (enableTracing) {
            traceEntries.push({
              channelId: `edge-${portName}-to-${node.id}`,
              direction: 'receive',
              timestamp: new Date().toISOString(),
              targetProcessId: node.id,
              sourceProcessId: refNodeId,
              dataType: 'unknown',
              valueSnapshot: value,
              label: node.label,
            });
          }
        }

        // Execute the node.
        const result = await this.executeNodeBehavior(node, inputValues, context);

        // Write result to all output channels.
        // Fan-out ports have names like "port->consumerId"; strip the suffix.
        for (const [portName, channel] of outputs) {
          let outputValue: unknown;
          const basePort = portName.includes('->') ? portName.split('->')[0] : portName;

          if (node.outputs.length === 1) {
            outputValue = result;
          } else if (result && typeof result === 'object') {
            outputValue = (result as Record<string, unknown>)[basePort];
          } else {
            outputValue = result;
          }

          await channel.send(outputValue);
          channel.close();

          if (enableTracing) {
            traceEntries.push({
              channelId: `output-${node.id}-${portName}`,
              direction: 'send',
              timestamp: new Date().toISOString(),
              sourceProcessId: node.id,
              dataType: 'unknown',
              valueSnapshot: outputValue,
              label: node.label,
            });
          }
        }
      } catch (err) {
        // Poison pill: close all output channels so downstream fails gracefully.
        for (const [, channel] of outputs) {
          try { channel.close(); } catch { /* already closed */ }
        }
        throw err;
      }
    };
  }

  /**
   * Execute a single VPIR node's logic (mirrors vpir-interpreter semantics).
   */
  private async executeNodeBehavior(
    node: VPIRNode,
    inputs: Map<string, unknown>,
    context: VPIRExecutionContext,
  ): Promise<unknown> {
    switch (node.type) {
      case 'observation':
        return this.executeObservation(node);

      case 'inference': {
        const handler = context.handlers.get(node.operation);
        if (!handler) {
          throw new HandlerError(
            `No inference handler registered for operation "${node.operation}"`,
          );
        }
        return handler(inputs);
      }

      case 'action': {
        if (!context.aciGateway) {
          throw new ACIError('No ACI gateway provided for action node execution');
        }
        const input = inputs.size === 1
          ? inputs.values().next().value
          : Object.fromEntries(inputs);

        const result = await context.aciGateway.invoke({
          toolName: node.operation,
          input,
          agentId: context.agentId,
          requestId: `dpn-${node.id}`,
          requesterLabel: node.label,
        });

        if (!result.success) {
          throw new ACIError(result.error?.message ?? `Action "${node.operation}" failed`);
        }
        return result.output;
      }

      case 'assertion': {
        const assertHandler = context.assertionHandlers?.get(node.operation);
        if (assertHandler) {
          const holds = await assertHandler(inputs);
          if (!holds) {
            throw new AssertionError(`Assertion failed: ${node.operation}`);
          }
          return true;
        }
        const inferHandler = context.handlers.get(node.operation);
        if (inferHandler) {
          const val = await inferHandler(inputs);
          if (val === false || val === null || val === undefined) {
            throw new AssertionError(`Assertion failed: ${node.operation}`);
          }
          return val;
        }
        return true;
      }

      case 'composition':
        throw new Error('Composition nodes not yet supported in DPN runtime');

      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  /**
   * Observation nodes extract their evidence data as output.
   */
  private executeObservation(node: VPIRNode): unknown {
    if (node.outputs.length > 0 && node.outputs[0].value !== undefined) {
      return node.outputs[0].value;
    }

    if (node.evidence.length === 0) {
      return undefined;
    }

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
   * Collect outputs from terminal output collector channels.
   */
  private collectOutputs(): Record<string, unknown> {
    const outputs: Record<string, unknown> = {};
    for (const [key, channel] of this.outputChannels) {
      const value = channel.tryReceive();
      if (value !== undefined) {
        outputs[key] = value;
      }
    }
    return outputs;
  }

  /**
   * Build the execution trace from process states and channel entries.
   */
  private buildTrace(): DPNExecutionTrace {
    const processStates: Record<string, ProcessState> = {};
    for (const [id, process] of this.processes) {
      processStates[id] = process.currentState;
    }

    const channelStats: Record<string, { sent: number; received: number; buffered: number }> = {};
    for (const [id, channel] of this.channels) {
      const stats = channel.stats;
      channelStats[id] = {
        sent: stats.sent,
        received: stats.received,
        buffered: stats.buffered,
      };
    }

    return {
      processStates,
      channelEntries: [...this.traceEntries],
      channelStats,
    };
  }
}
