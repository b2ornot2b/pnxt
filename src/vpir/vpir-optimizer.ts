/**
 * VPIR Optimizer — parallel execution planning and result caching.
 *
 * Analyzes VPIR graph DAGs to identify independent branches that can
 * execute concurrently. Groups nodes into "execution waves" where all
 * nodes in a wave have their dependencies satisfied. Also provides an
 * in-memory result cache for deterministic node outputs.
 */

import type { VPIRGraph } from '../types/vpir.js';
import type {
  ExecutionPlan,
  ExecutionWave,
  VPIRResultCache,
} from '../types/vpir-execution.js';

/**
 * Analyze a VPIR graph and produce an execution plan with parallel waves.
 *
 * Uses a modified Kahn's algorithm that groups nodes by their "depth"
 * (longest path from a root). Nodes at the same depth have no dependencies
 * on each other and can execute in parallel.
 */
export function analyzeParallelism(graph: VPIRGraph): ExecutionPlan {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const nodeId of graph.nodes.keys()) {
    inDegree.set(nodeId, 0);
    adjacency.set(nodeId, []);
  }

  // Build adjacency from input references.
  for (const node of graph.nodes.values()) {
    for (const ref of node.inputs) {
      if (graph.nodes.has(ref.nodeId)) {
        adjacency.get(ref.nodeId)!.push(node.id);
        inDegree.set(node.id, (inDegree.get(node.id) ?? 0) + 1);
      }
    }
  }

  // Wave-based Kahn's: all zero-in-degree nodes form a wave.
  const waves: ExecutionWave[] = [];
  const remaining = new Map(inDegree);

  while (remaining.size > 0) {
    const waveNodeIds: string[] = [];

    for (const [nodeId, degree] of remaining) {
      if (degree === 0) {
        waveNodeIds.push(nodeId);
      }
    }

    if (waveNodeIds.length === 0) {
      // Cycle detected — shouldn't happen with validated graphs.
      break;
    }

    waves.push({ nodeIds: waveNodeIds });

    // Remove wave nodes and decrement successors.
    for (const nodeId of waveNodeIds) {
      remaining.delete(nodeId);
      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (remaining.has(neighbor)) {
          remaining.set(neighbor, remaining.get(neighbor)! - 1);
        }
      }
    }
  }

  const totalNodes = Array.from(graph.nodes.keys()).length;
  const maxParallelism = waves.reduce((max, w) => Math.max(max, w.nodeIds.length), 0);

  return { waves, totalNodes, maxParallelism };
}

/**
 * Create a deterministic hash of node inputs for cache keying.
 *
 * Uses JSON serialization with sorted keys for consistency.
 * Handles Map, undefined, and circular reference gracefully.
 */
export function createInputHash(inputs: Map<string, unknown>): string {
  const entries: [string, unknown][] = [];

  for (const [key, value] of inputs) {
    entries.push([key, value]);
  }

  // Sort by key for deterministic ordering.
  entries.sort(([a], [b]) => a.localeCompare(b));

  try {
    return stableStringify(entries);
  } catch {
    // Fallback for non-serializable inputs.
    return `unstable-${Date.now()}-${Math.random()}`;
  }
}

/**
 * Stable JSON stringify with sorted object keys.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const pairs = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
    return '{' + pairs.join(',') + '}';
  }

  return String(value);
}

/**
 * In-memory implementation of VPIRResultCache.
 *
 * Stores results in a nested Map keyed by nodeId → inputHash → value.
 */
export class InMemoryResultCache implements VPIRResultCache {
  private store = new Map<string, Map<string, unknown>>();

  async get(nodeId: string, inputHash: string): Promise<unknown | undefined> {
    return this.store.get(nodeId)?.get(inputHash);
  }

  async set(nodeId: string, inputHash: string, value: unknown): Promise<void> {
    if (!this.store.has(nodeId)) {
      this.store.set(nodeId, new Map());
    }
    this.store.get(nodeId)!.set(inputHash, value);
  }

  async has(nodeId: string, inputHash: string): Promise<boolean> {
    return this.store.get(nodeId)?.has(inputHash) ?? false;
  }

  /** Number of cached entries (for testing). */
  get size(): number {
    let count = 0;
    for (const inner of this.store.values()) {
      count += inner.size;
    }
    return count;
  }

  /** Clear all cached entries. */
  clear(): void {
    this.store.clear();
  }
}

/**
 * Simple concurrency limiter (semaphore).
 *
 * Limits the number of concurrent async operations.
 */
export class Semaphore {
  private current = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly maxConcurrency: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.maxConcurrency) {
      this.current++;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.current++;
        resolve();
      });
    });
  }

  release(): void {
    this.current--;
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    }
  }
}
