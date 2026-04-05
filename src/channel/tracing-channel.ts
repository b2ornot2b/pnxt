/**
 * TracingChannel — a channel decorator that records send/receive events.
 *
 * Wraps a Channel<T> and appends trace entries to a shared array on every
 * send/receive operation. This enables DPN execution observability without
 * modifying the core Channel implementation.
 */

import type {
  ChannelInterface,
  ChannelStats,
  ReadableChannel,
  WritableChannel,
} from '../types/channel.js';
import type { SecurityLabel } from '../types/ifc.js';

/**
 * A single traced channel event (send or receive).
 */
export interface ChannelTraceEntry {
  channelId: string;
  direction: 'send' | 'receive';
  timestamp: string;
  sourceProcessId?: string;
  targetProcessId?: string;
  dataType: string;
  valueSnapshot: unknown;
  label?: SecurityLabel;
}

/**
 * A channel wrapper that logs all send/receive operations to a shared trace array.
 */
export class TracingChannel<T> implements ChannelInterface<T> {
  constructor(
    private readonly inner: ChannelInterface<T>,
    private readonly trace: ChannelTraceEntry[],
    private readonly channelId: string,
    private readonly dataType: string,
    private readonly sourceProcessId?: string,
    private readonly targetProcessId?: string,
    private readonly label?: SecurityLabel,
  ) {}

  async send(value: T): Promise<void> {
    await this.inner.send(value);
    this.trace.push({
      channelId: this.channelId,
      direction: 'send',
      timestamp: new Date().toISOString(),
      sourceProcessId: this.sourceProcessId,
      targetProcessId: this.targetProcessId,
      dataType: this.dataType,
      valueSnapshot: value,
      label: this.label,
    });
  }

  trySend(value: T): boolean {
    const result = this.inner.trySend(value);
    if (result) {
      this.trace.push({
        channelId: this.channelId,
        direction: 'send',
        timestamp: new Date().toISOString(),
        sourceProcessId: this.sourceProcessId,
        targetProcessId: this.targetProcessId,
        dataType: this.dataType,
        valueSnapshot: value,
        label: this.label,
      });
    }
    return result;
  }

  async receive(): Promise<T> {
    const value = await this.inner.receive();
    this.trace.push({
      channelId: this.channelId,
      direction: 'receive',
      timestamp: new Date().toISOString(),
      sourceProcessId: this.sourceProcessId,
      targetProcessId: this.targetProcessId,
      dataType: this.dataType,
      valueSnapshot: value,
      label: this.label,
    });
    return value;
  }

  tryReceive(): T | undefined {
    const value = this.inner.tryReceive();
    if (value !== undefined) {
      this.trace.push({
        channelId: this.channelId,
        direction: 'receive',
        timestamp: new Date().toISOString(),
        sourceProcessId: this.sourceProcessId,
        targetProcessId: this.targetProcessId,
        dataType: this.dataType,
        valueSnapshot: value,
        label: this.label,
      });
    }
    return value;
  }

  close(): void {
    this.inner.close();
  }

  get stats(): ChannelStats {
    return this.inner.stats;
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    // Delegate to the inner channel's iterator but trace each value
    for await (const value of this.inner) {
      this.trace.push({
        channelId: this.channelId,
        direction: 'receive',
        timestamp: new Date().toISOString(),
        sourceProcessId: this.sourceProcessId,
        targetProcessId: this.targetProcessId,
        dataType: this.dataType,
        valueSnapshot: value,
        label: this.label,
      });
      yield value;
    }
  }
}

/**
 * Create a pair of tracing views for a channel: one for writing (source) and one for reading (target).
 */
export function createTracingPair<T>(
  inner: ChannelInterface<T>,
  trace: ChannelTraceEntry[],
  channelId: string,
  dataType: string,
  sourceProcessId: string,
  targetProcessId: string,
  label?: SecurityLabel,
): { writer: WritableChannel<T>; reader: ReadableChannel<T> } {
  const writer = new TracingChannel<T>(
    inner, trace, channelId, dataType, sourceProcessId, targetProcessId, label,
  );
  const reader = new TracingChannel<T>(
    inner, trace, channelId, dataType, sourceProcessId, targetProcessId, label,
  );
  return { writer, reader };
}
