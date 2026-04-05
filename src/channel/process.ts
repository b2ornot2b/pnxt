/**
 * Process — an actor in the Dataflow Process Network.
 *
 * A Process wraps a behavior function that reads from input channels and
 * writes to output channels. Processes are the unit of concurrency in the
 * DPN: each runs independently, communicating only through typed channels.
 */

import type {
  ProcessDefinition,
  ProcessFunction,
  ProcessState,
  ReadableChannel,
  WritableChannel,
} from '../types/channel.js';

/**
 * A running process in the dataflow graph.
 */
export class Process<TIn = unknown, TOut = unknown> {
  readonly definition: ProcessDefinition;
  private state: ProcessState = 'idle';
  private behavior: ProcessFunction<TIn, TOut>;
  private runPromise: Promise<void> | null = null;

  private inputChannels = new Map<string, ReadableChannel<TIn>>();
  private outputChannels = new Map<string, WritableChannel<TOut>>();

  constructor(definition: ProcessDefinition, behavior: ProcessFunction<TIn, TOut>) {
    this.definition = definition;
    this.behavior = behavior;
  }

  get id(): string {
    return this.definition.id;
  }

  get name(): string {
    return this.definition.name;
  }

  get currentState(): ProcessState {
    return this.state;
  }

  /**
   * Bind an input channel to a named input port.
   */
  bindInput(portName: string, channel: ReadableChannel<TIn>): void {
    const port = this.definition.inputs.find((p) => p.name === portName);
    if (!port) {
      throw new Error(`Process ${this.id} has no input port "${portName}"`);
    }
    this.inputChannels.set(portName, channel);
  }

  /**
   * Bind an output channel to a named output port.
   */
  bindOutput(portName: string, channel: WritableChannel<TOut>): void {
    const port = this.definition.outputs.find((p) => p.name === portName);
    if (!port) {
      throw new Error(`Process ${this.id} has no output port "${portName}"`);
    }
    this.outputChannels.set(portName, channel);
  }

  /**
   * Start the process. Runs the behavior function asynchronously.
   */
  start(): void {
    if (this.state !== 'idle') {
      throw new Error(`Process ${this.id} is already ${this.state}`);
    }

    this.state = 'running';
    this.runPromise = this.behavior(this.inputChannels, this.outputChannels)
      .then(() => {
        this.state = 'completed';
      })
      .catch(() => {
        this.state = 'failed';
      });
  }

  /**
   * Wait for the process to complete.
   */
  async wait(): Promise<void> {
    if (this.runPromise) {
      await this.runPromise;
    }
  }
}
