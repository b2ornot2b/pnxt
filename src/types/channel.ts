/**
 * Dataflow Process Network (DPN) types.
 *
 * Defines typed async FIFO channels, ports, processes, and dataflow graphs.
 * This is the concurrency foundation for the paradigm — agents communicate
 * via channels instead of RPC calls through a central gateway.
 *
 * Based on:
 * - docs/research/original-prompt.md (Dataflow Process Networks)
 * - Advisory Review 2026-04-05 (Robin Milner, Gul Agha — concurrency pillar)
 */

/**
 * Channel state lifecycle.
 */
export type ChannelState = 'open' | 'closed';

/**
 * Port direction: input receives data, output sends data.
 */
export type PortDirection = 'input' | 'output';

/**
 * A named, typed port on a process.
 */
export interface PortDefinition {
  name: string;
  direction: PortDirection;
  /** Type identifier for the data this port carries. */
  dataType: string;
}

/**
 * Runtime channel statistics.
 */
export interface ChannelStats {
  sent: number;
  received: number;
  buffered: number;
  state: ChannelState;
}

/**
 * Configuration for creating a channel.
 */
export interface ChannelConfig {
  /** Unique identifier for this channel. */
  id: string;

  /** Type identifier for the data this channel carries. */
  dataType: string;

  /** Maximum buffer size. Sends block when full. Default: 16. */
  bufferSize?: number;

  /** Optional IFC security label. When set, the channel enforces that
   *  sent data's label can flow to this channel's label. */
  label?: import('./ifc.js').SecurityLabel;
}

/**
 * Read-only interface for consuming from a channel.
 */
export interface ReadableChannel<T> {
  receive(): Promise<T>;
  tryReceive(): T | undefined;
  [Symbol.asyncIterator](): AsyncIterableIterator<T>;
  readonly stats: ChannelStats;
}

/**
 * Write-only interface for producing to a channel.
 */
export interface WritableChannel<T> {
  send(value: T): Promise<void>;
  trySend(value: T): boolean;
  close(): void;
  readonly stats: ChannelStats;
}

/**
 * Full channel interface combining read and write.
 */
export interface ChannelInterface<T> extends ReadableChannel<T>, WritableChannel<T> {}

/**
 * A process in the dataflow graph — an actor with named input/output ports.
 */
export interface ProcessDefinition {
  /** Unique identifier for this process. */
  id: string;

  /** Human-readable name. */
  name: string;

  /** Input port definitions. */
  inputs: PortDefinition[];

  /** Output port definitions. */
  outputs: PortDefinition[];

  /** Optional agent ID if this process wraps an agent. */
  agentId?: string;
}

/**
 * A connection between two processes in the dataflow graph.
 */
export interface Connection {
  /** Channel carrying data between the processes. */
  channelId: string;

  /** Source process and port. */
  source: {
    processId: string;
    port: string;
  };

  /** Target process and port. */
  target: {
    processId: string;
    port: string;
  };
}

/**
 * A dataflow graph: a set of processes connected by channels.
 */
export interface DataflowGraphDefinition {
  /** Unique identifier for this graph. */
  id: string;

  /** Human-readable name. */
  name: string;

  /** Processes in the graph. */
  processes: ProcessDefinition[];

  /** Connections wiring processes together. */
  connections: Connection[];
}

/**
 * State of a process within a running graph.
 */
export type ProcessState = 'idle' | 'running' | 'completed' | 'failed';

/**
 * Snapshot of a Channel's durable state. Captures the current buffer
 * contents in FIFO order and the channel's configured bufferSize so that
 * restore() can validate the snapshot matches the target channel's
 * geometry. Blocked senders/receivers are intentionally NOT captured —
 * a Channel with pending waiters is not in a snapshot-safe state by the
 * DPN bisimulation argument (see ADR-001).
 *
 * Sprint 16 — Phase 8, M5. Interface-only this sprint; full DPN replay
 * that restores causal ordering across actors is a future sprint.
 */
export interface ChannelSnapshot<T = unknown> {
  channelId: string;
  buffer: T[];
  bufferSize: number;
  state: ChannelState;
  timestamp: number;
}

/**
 * Snapshot of a Process's durable state.
 */
export interface ProcessSnapshot {
  processId: string;
  state: ProcessState;
  timestamp: number;
}

/**
 * Process behavior function: reads from input channels, writes to output channels.
 */
export type ProcessFunction<TIn = unknown, TOut = unknown> = (
  inputs: Map<string, ReadableChannel<TIn>>,
  outputs: Map<string, WritableChannel<TOut>>,
) => Promise<void>;
