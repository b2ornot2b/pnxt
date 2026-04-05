/**
 * DPN Supervisor — supervises process actors with restart policies.
 *
 * Implements the supervisor pattern for DPN: when a child process actor
 * fails, the supervisor can restart it with bounded retries, providing
 * fault tolerance for VPIR graph execution.
 *
 * Features:
 * - Bounded restart with configurable max retries per process
 * - Priority mailbox: verification/assertion messages processed first
 * - Supervision strategies: one-for-one (restart only failed) or
 *   all-for-one (restart all children on any failure)
 * - Event log for observability
 *
 * Sprint 10 deliverable — Advisory Panel: Kay, Liskov, Milner.
 */

import type {
  ProcessDefinition,
  ProcessFunction,
  ProcessState,
} from '../types/channel.js';
import { Process } from './process.js';

// ── Types ─────────────────────────────────────────────────────────

export type SupervisionStrategy = 'one-for-one' | 'all-for-one';

export interface SupervisorOptions {
  /** Maximum restart attempts per process before giving up. Default: 3. */
  maxRestarts?: number;

  /** Time window (ms) in which maxRestarts applies. Default: 60000 (1 min). */
  restartWindow?: number;

  /** Supervision strategy. Default: 'one-for-one'. */
  strategy?: SupervisionStrategy;

  /** Delay between restart attempts in ms. Default: 100. */
  restartDelay?: number;
}

export type SupervisorEventType =
  | 'child-started'
  | 'child-completed'
  | 'child-failed'
  | 'child-restarted'
  | 'child-max-restarts'
  | 'supervisor-started'
  | 'supervisor-stopped';

export interface SupervisorEvent {
  type: SupervisorEventType;
  processId: string;
  timestamp: string;
  details?: string;
  restartCount?: number;
}

export interface ChildSpec {
  definition: ProcessDefinition;
  behavior: ProcessFunction;
}

interface ChildState {
  spec: ChildSpec;
  process: Process;
  restartTimestamps: number[];
  totalRestarts: number;
}

export type MessagePriority = 'high' | 'normal' | 'low';

export interface PriorityMessage<T = unknown> {
  priority: MessagePriority;
  payload: T;
  timestamp: number;
}

// ── Priority Mailbox ──────────────────────────────────────────────

/**
 * A mailbox that dequeues messages by priority (high > normal > low).
 * Verification and assertion messages should be sent as 'high' priority.
 */
export class PriorityMailbox<T = unknown> {
  private high: PriorityMessage<T>[] = [];
  private normal: PriorityMessage<T>[] = [];
  private low: PriorityMessage<T>[] = [];

  enqueue(message: PriorityMessage<T>): void {
    switch (message.priority) {
      case 'high':
        this.high.push(message);
        break;
      case 'normal':
        this.normal.push(message);
        break;
      case 'low':
        this.low.push(message);
        break;
    }
  }

  dequeue(): PriorityMessage<T> | undefined {
    if (this.high.length > 0) return this.high.shift();
    if (this.normal.length > 0) return this.normal.shift();
    if (this.low.length > 0) return this.low.shift();
    return undefined;
  }

  get size(): number {
    return this.high.length + this.normal.length + this.low.length;
  }

  get isEmpty(): boolean {
    return this.size === 0;
  }

  peek(): PriorityMessage<T> | undefined {
    if (this.high.length > 0) return this.high[0];
    if (this.normal.length > 0) return this.normal[0];
    if (this.low.length > 0) return this.low[0];
    return undefined;
  }
}

// ── DPN Supervisor ────────────────────────────────────────────────

export class DPNSupervisor {
  private readonly maxRestarts: number;
  private readonly restartWindow: number;
  private readonly strategy: SupervisionStrategy;
  private readonly restartDelay: number;

  private children = new Map<string, ChildState>();
  private events: SupervisorEvent[] = [];
  private running = false;

  constructor(options?: SupervisorOptions) {
    this.maxRestarts = options?.maxRestarts ?? 3;
    this.restartWindow = options?.restartWindow ?? 60_000;
    this.strategy = options?.strategy ?? 'one-for-one';
    this.restartDelay = options?.restartDelay ?? 100;
  }

  /**
   * Add a child process to the supervisor.
   */
  addChild(spec: ChildSpec): void {
    if (this.children.has(spec.definition.id)) {
      throw new Error(`Child already registered: ${spec.definition.id}`);
    }

    const process = new Process(spec.definition, spec.behavior);
    this.children.set(spec.definition.id, {
      spec,
      process,
      restartTimestamps: [],
      totalRestarts: 0,
    });
  }

  /**
   * Start the supervisor and all child processes.
   */
  async start(): Promise<void> {
    this.running = true;
    this.logEvent('supervisor-started', 'supervisor');

    for (const [id, child] of this.children) {
      child.process.start();
      this.logEvent('child-started', id);
    }

    // Monitor all children
    await this.monitor();
  }

  /**
   * Wait for all children to complete or fail permanently.
   */
  private async monitor(): Promise<void> {
    const pendingChildren = new Set(this.children.keys());

    while (pendingChildren.size > 0 && this.running) {
      const settled: string[] = [];

      for (const id of pendingChildren) {
        const child = this.children.get(id);
        if (!child) {
          settled.push(id);
          continue;
        }

        const state = child.process.currentState;

        if (state === 'completed') {
          this.logEvent('child-completed', id);
          settled.push(id);
        } else if (state === 'failed') {
          this.logEvent('child-failed', id);

          const canRestart = this.canRestart(child);
          if (canRestart) {
            if (this.strategy === 'all-for-one') {
              await this.restartAll();
              // Reset pending set
              pendingChildren.clear();
              for (const childId of this.children.keys()) {
                pendingChildren.add(childId);
              }
              break;
            } else {
              await this.restartChild(id, child);
            }
          } else {
            this.logEvent('child-max-restarts', id, `Max restarts (${this.maxRestarts}) exceeded`);
            settled.push(id);
          }
        }
      }

      for (const id of settled) {
        pendingChildren.delete(id);
      }

      // Poll interval
      if (pendingChildren.size > 0) {
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    this.running = false;
    this.logEvent('supervisor-stopped', 'supervisor');
  }

  /**
   * Check if a child can be restarted within the restart window.
   */
  private canRestart(child: ChildState): boolean {
    const now = Date.now();
    // Prune old timestamps outside the window
    child.restartTimestamps = child.restartTimestamps.filter(
      (ts) => now - ts < this.restartWindow,
    );
    return child.restartTimestamps.length < this.maxRestarts;
  }

  /**
   * Restart a single failed child process.
   */
  private async restartChild(id: string, child: ChildState): Promise<void> {
    await new Promise((r) => setTimeout(r, this.restartDelay));

    child.restartTimestamps.push(Date.now());
    child.totalRestarts++;

    // Create a new Process instance with the same spec
    const newProcess = new Process(child.spec.definition, child.spec.behavior);
    child.process = newProcess;
    newProcess.start();

    this.logEvent('child-restarted', id, `Restart #${child.totalRestarts}`);
  }

  /**
   * Restart all children (all-for-one strategy).
   */
  private async restartAll(): Promise<void> {
    await new Promise((r) => setTimeout(r, this.restartDelay));

    for (const [id, child] of this.children) {
      child.restartTimestamps.push(Date.now());
      child.totalRestarts++;

      const newProcess = new Process(child.spec.definition, child.spec.behavior);
      child.process = newProcess;
      newProcess.start();

      this.logEvent('child-restarted', id, `All-for-one restart #${child.totalRestarts}`);
    }
  }

  /**
   * Stop the supervisor.
   */
  stop(): void {
    this.running = false;
  }

  /**
   * Get the current state of a child process.
   */
  getChildState(id: string): ProcessState | undefined {
    return this.children.get(id)?.process.currentState;
  }

  /**
   * Get the restart count for a child.
   */
  getRestartCount(id: string): number {
    return this.children.get(id)?.totalRestarts ?? 0;
  }

  /**
   * Get the supervisor event log.
   */
  getEvents(): SupervisorEvent[] {
    return [...this.events];
  }

  /**
   * Get child IDs.
   */
  getChildIds(): string[] {
    return Array.from(this.children.keys());
  }

  /**
   * Whether the supervisor is currently running.
   */
  get isRunning(): boolean {
    return this.running;
  }

  private logEvent(type: SupervisorEventType, processId: string, details?: string): void {
    const child = this.children.get(processId);
    this.events.push({
      type,
      processId,
      timestamp: new Date().toISOString(),
      details,
      restartCount: child?.totalRestarts,
    });
  }
}
