/**
 * Channel<T> — Typed async FIFO channel with backpressure.
 *
 * The fundamental communication primitive for Dataflow Process Networks.
 * Channels are bounded buffers: sends block when full, receives block when empty.
 * This replaces synchronous RPC-style tool invocations with true dataflow.
 *
 * Based on:
 * - docs/research/original-prompt.md (Dataflow Process Networks)
 * - Advisory Review 2026-04-05 (Robin Milner: "Where are the channels?")
 */

import type {
  ChannelConfig,
  ChannelInterface,
  ChannelSnapshot,
  ChannelState,
  ChannelStats,
} from '../types/channel.js';
import type { SecurityLabel } from '../types/ifc.js';
import { ChannelSnapshotMismatchError } from '../errors/vpir-errors.js';

interface Waiter<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

/**
 * Bounded async FIFO channel with backpressure.
 *
 * - `send(value)` blocks (awaits) when buffer is full.
 * - `receive()` blocks (awaits) when buffer is empty.
 * - `close()` signals no more values will be sent.
 * - Supports `for await (const value of channel)` iteration.
 */
export class Channel<T> implements ChannelInterface<T> {
  readonly id: string;
  readonly dataType: string;
  readonly label?: SecurityLabel;

  private buffer: T[] = [];
  private readonly bufferSize: number;
  private state: ChannelState = 'open';
  private sentCount = 0;
  private receivedCount = 0;

  /** Receivers waiting for data. */
  private receivers: Waiter<T>[] = [];

  /** Senders waiting for buffer space. */
  private senders: Array<{ value: T } & Waiter<void>> = [];

  constructor(config: ChannelConfig) {
    this.id = config.id;
    this.dataType = config.dataType;
    this.bufferSize = config.bufferSize ?? 16;
    this.label = config.label;

    if (this.bufferSize < 1) {
      throw new Error('Channel buffer size must be at least 1');
    }
  }

  get stats(): ChannelStats {
    return {
      sent: this.sentCount,
      received: this.receivedCount,
      buffered: this.buffer.length,
      state: this.state,
    };
  }

  /**
   * Send a value into the channel. Blocks if buffer is full.
   * Throws if channel is closed.
   */
  async send(value: T): Promise<void> {
    if (this.state === 'closed') {
      throw new Error(`Cannot send on closed channel ${this.id}`);
    }

    // If a receiver is already waiting, deliver directly.
    if (this.receivers.length > 0) {
      const receiver = this.receivers.shift()!;
      this.sentCount++;
      this.receivedCount++;
      receiver.resolve(value);
      return;
    }

    // If buffer has space, enqueue.
    if (this.buffer.length < this.bufferSize) {
      this.buffer.push(value);
      this.sentCount++;
      return;
    }

    // Buffer is full — block until space opens.
    return new Promise<void>((resolve, reject) => {
      this.senders.push({ value, resolve, reject });
    });
  }

  /**
   * Try to send without blocking. Returns true if sent, false if buffer full.
   */
  trySend(value: T): boolean {
    if (this.state === 'closed') {
      return false;
    }

    if (this.receivers.length > 0) {
      const receiver = this.receivers.shift()!;
      this.sentCount++;
      this.receivedCount++;
      receiver.resolve(value);
      return true;
    }

    if (this.buffer.length < this.bufferSize) {
      this.buffer.push(value);
      this.sentCount++;
      return true;
    }

    return false;
  }

  /**
   * Receive a value from the channel. Blocks if buffer is empty.
   * Throws ChannelClosedError if channel is closed and buffer is empty.
   */
  async receive(): Promise<T> {
    // Drain buffer first.
    if (this.buffer.length > 0) {
      const value = this.buffer.shift()!;
      this.receivedCount++;

      // Unblock a waiting sender if any.
      if (this.senders.length > 0) {
        const sender = this.senders.shift()!;
        this.buffer.push(sender.value);
        this.sentCount++;
        sender.resolve();
      }

      return value;
    }

    // Unblock a waiting sender directly.
    if (this.senders.length > 0) {
      const sender = this.senders.shift()!;
      this.sentCount++;
      this.receivedCount++;
      sender.resolve();
      return sender.value;
    }

    // If closed and no data, signal end.
    if (this.state === 'closed') {
      throw new ChannelClosedError(this.id);
    }

    // Block until data arrives.
    return new Promise<T>((resolve, reject) => {
      this.receivers.push({ resolve, reject });
    });
  }

  /**
   * Try to receive without blocking. Returns undefined if nothing available.
   */
  tryReceive(): T | undefined {
    if (this.buffer.length > 0) {
      const value = this.buffer.shift()!;
      this.receivedCount++;

      if (this.senders.length > 0) {
        const sender = this.senders.shift()!;
        this.buffer.push(sender.value);
        this.sentCount++;
        sender.resolve();
      }

      return value;
    }

    if (this.senders.length > 0) {
      const sender = this.senders.shift()!;
      this.sentCount++;
      this.receivedCount++;
      sender.resolve();
      return sender.value;
    }

    return undefined;
  }

  /**
   * Close the channel. No more values can be sent.
   * Pending receivers will get ChannelClosedError.
   * Pending senders will get an error.
   */
  close(): void {
    if (this.state === 'closed') return;
    this.state = 'closed';

    // Reject all waiting senders.
    for (const sender of this.senders) {
      sender.reject(new Error(`Channel ${this.id} closed while waiting to send`));
    }
    this.senders = [];

    // Reject all waiting receivers (if buffer is also empty).
    if (this.buffer.length === 0) {
      for (const receiver of this.receivers) {
        receiver.reject(new ChannelClosedError(this.id));
      }
      this.receivers = [];
    }
  }

  /**
   * Capture the channel's durable state — buffer contents in FIFO order
   * plus the configured bufferSize. Pending senders/receivers are not
   * captured: a snapshot-safe channel has no blocked waiters. Callers
   * should drain or quiesce the channel before snapshotting if waiters
   * are possible.
   *
   * Sprint 16 — interface only. Full DPN replay that also restores
   * causal ordering across multiple actors is a future sprint.
   */
  getSnapshot(): ChannelSnapshot<T> {
    return {
      channelId: this.id,
      buffer: [...this.buffer],
      bufferSize: this.bufferSize,
      state: this.state,
      timestamp: Date.now(),
    };
  }

  /**
   * Restore the channel's buffer from a snapshot. Validates that the
   * snapshot was taken from a channel with the same id and bufferSize
   * (throws ChannelSnapshotMismatchError otherwise). Existing buffer
   * contents and state are replaced; pending waiters (if any) are left
   * intact — callers should only restore on a freshly-constructed
   * channel with no active traffic.
   */
  restore(snapshot: ChannelSnapshot<T>): void {
    if (snapshot.channelId !== this.id) {
      throw new ChannelSnapshotMismatchError(
        `Cannot restore snapshot for channel ${snapshot.channelId} onto channel ${this.id}`,
      );
    }
    if (snapshot.bufferSize !== this.bufferSize) {
      throw new ChannelSnapshotMismatchError(
        `Snapshot bufferSize=${snapshot.bufferSize} does not match channel bufferSize=${this.bufferSize}`,
      );
    }
    if (snapshot.buffer.length > this.bufferSize) {
      throw new ChannelSnapshotMismatchError(
        `Snapshot buffer length ${snapshot.buffer.length} exceeds bufferSize ${this.bufferSize}`,
      );
    }
    this.buffer = [...snapshot.buffer];
    this.state = snapshot.state;
  }

  /**
   * Async iterator: yields values until the channel is closed and drained.
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    while (true) {
      try {
        yield await this.receive();
      } catch (e) {
        if (e instanceof ChannelClosedError) {
          return;
        }
        throw e;
      }
    }
  }
}

/**
 * Error thrown when trying to receive from a closed, empty channel.
 */
export class ChannelClosedError extends Error {
  constructor(channelId: string) {
    super(`Channel ${channelId} is closed`);
    this.name = 'ChannelClosedError';
  }
}
