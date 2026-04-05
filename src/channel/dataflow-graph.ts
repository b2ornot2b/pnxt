/**
 * DataflowGraph — composition of processes connected by typed channels.
 *
 * A DataflowGraph manages the lifecycle of processes and channels,
 * wiring them together according to a graph definition. This is the
 * top-level abstraction for building Dataflow Process Networks.
 */

import type {
  ChannelConfig,
  DataflowGraphDefinition,
  ProcessFunction,
  ReadableChannel,
  WritableChannel,
} from '../types/channel.js';
import { Channel } from './channel.js';
import { Process } from './process.js';

/**
 * A running dataflow graph that manages processes and channels.
 */
export class DataflowGraph {
  readonly definition: DataflowGraphDefinition;

  private processes = new Map<string, Process>();
  private channels = new Map<string, Channel<unknown>>();

  constructor(definition: DataflowGraphDefinition) {
    this.definition = definition;
  }

  /**
   * Register a process with its behavior function.
   */
  addProcess<TIn = unknown, TOut = unknown>(
    processId: string,
    behavior: ProcessFunction<TIn, TOut>,
  ): Process<TIn, TOut> {
    const def = this.definition.processes.find((p) => p.id === processId);
    if (!def) {
      throw new Error(`Process ${processId} not found in graph definition`);
    }

    const process = new Process<TIn, TOut>(def, behavior);
    this.processes.set(processId, process as Process);
    return process;
  }

  /**
   * Create and wire all channels based on the graph's connections.
   * Must be called after all processes are added.
   */
  wireConnections(): void {
    for (const conn of this.definition.connections) {
      const sourceProcess = this.processes.get(conn.source.processId);
      const targetProcess = this.processes.get(conn.target.processId);

      if (!sourceProcess) {
        throw new Error(`Source process ${conn.source.processId} not registered`);
      }
      if (!targetProcess) {
        throw new Error(`Target process ${conn.target.processId} not registered`);
      }

      const config: ChannelConfig = {
        id: conn.channelId,
        dataType: 'unknown',
        bufferSize: 16,
      };

      const channel = new Channel<unknown>(config);
      this.channels.set(conn.channelId, channel);

      sourceProcess.bindOutput(
        conn.source.port,
        channel as WritableChannel<unknown>,
      );
      targetProcess.bindInput(
        conn.target.port,
        channel as ReadableChannel<unknown>,
      );
    }
  }

  /**
   * Start all processes and wire all connections.
   */
  start(): void {
    this.wireConnections();
    for (const process of this.processes.values()) {
      process.start();
    }
  }

  /**
   * Wait for all processes to complete.
   */
  async wait(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const process of this.processes.values()) {
      promises.push(process.wait());
    }
    await Promise.all(promises);
  }

  /**
   * Get a process by ID.
   */
  getProcess(processId: string): Process | undefined {
    return this.processes.get(processId);
  }

  /**
   * Get a channel by ID.
   */
  getChannel(channelId: string): Channel<unknown> | undefined {
    return this.channels.get(channelId);
  }

  /**
   * Close all channels in the graph.
   */
  closeAll(): void {
    for (const channel of this.channels.values()) {
      channel.close();
    }
  }
}
