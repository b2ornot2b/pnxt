/**
 * Memory Service — three-layer memory model (working, semantic, episodic).
 *
 * This is the foundational service for agent-native programming.
 * Implements the architecture described in:
 * - docs/research/phase-3/02-semantic-memory-architecture.md
 */

import type {
  MemoryEntry,
  MemoryResult,
  MemoryQueryParams,
  ConsolidationParams,
  ConsolidationReport,
} from '../types/memory.js';

export interface MemoryService {
  store(entry: MemoryEntry): Promise<string>;

  query(params: MemoryQueryParams): Promise<MemoryResult[]>;

  update(id: string, updates: Partial<MemoryEntry>): Promise<void>;

  forget(id: string, reason: string): Promise<void>;

  getRelated(entityId: string, relationship?: string): Promise<MemoryResult[]>;

  consolidate(params: ConsolidationParams): Promise<ConsolidationReport>;
}

/**
 * In-memory implementation of MemoryService for prototyping and testing.
 */
export class InMemoryMemoryService implements MemoryService {
  private memories = new Map<string, { entry: MemoryEntry; accessCount: number; lastAccessed: string }>();
  private nextId = 1;

  async store(entry: MemoryEntry): Promise<string> {
    const id = `mem_${this.nextId++}`;
    this.memories.set(id, {
      entry,
      accessCount: 0,
      lastAccessed: new Date().toISOString(),
    });
    return id;
  }

  async query(params: MemoryQueryParams): Promise<MemoryResult[]> {
    const results: MemoryResult[] = [];
    const limit = params.limit ?? 10;

    for (const [id, stored] of this.memories) {
      if (params.memory_type && stored.entry.type !== params.memory_type) {
        continue;
      }

      // Simple keyword-based relevance scoring for the prototype.
      // A production implementation would use vector embeddings.
      const relevance = this.computeRelevance(params.text, stored.entry.content);

      if (params.min_relevance && relevance < params.min_relevance) {
        continue;
      }

      stored.accessCount++;
      stored.lastAccessed = new Date().toISOString();

      results.push({
        id,
        entry: stored.entry,
        relevance,
        accessCount: stored.accessCount,
        lastAccessed: stored.lastAccessed,
      });
    }

    results.sort((a, b) => b.relevance - a.relevance);
    return results.slice(0, limit);
  }

  async update(id: string, updates: Partial<MemoryEntry>): Promise<void> {
    const stored = this.memories.get(id);
    if (!stored) {
      throw new Error(`Memory not found: ${id}`);
    }

    if (updates.content !== undefined) {
      stored.entry.content = updates.content;
    }
    if (updates.type !== undefined) {
      stored.entry.type = updates.type;
    }
    if (updates.metadata !== undefined) {
      stored.entry.metadata = { ...stored.entry.metadata, ...updates.metadata };
    }
  }

  async forget(id: string, _reason: string): Promise<void> {
    if (!this.memories.has(id)) {
      throw new Error(`Memory not found: ${id}`);
    }
    this.memories.delete(id);
  }

  async getRelated(entityId: string, _relationship?: string): Promise<MemoryResult[]> {
    const results: MemoryResult[] = [];

    for (const [id, stored] of this.memories) {
      if (stored.entry.metadata.entities.includes(entityId)) {
        results.push({
          id,
          entry: stored.entry,
          relevance: 1.0,
          accessCount: stored.accessCount,
          lastAccessed: stored.lastAccessed,
        });
      }
    }

    return results;
  }

  async consolidate(params: ConsolidationParams): Promise<ConsolidationReport> {
    let consolidatedCount = 0;

    for (const [, stored] of this.memories) {
      if (stored.entry.type !== 'episodic') continue;

      if (params.since && stored.entry.metadata.timestamp < params.since) continue;

      if (params.topic && !stored.entry.metadata.topics.includes(params.topic)) continue;

      consolidatedCount++;
    }

    return {
      consolidatedCount,
      newSemanticMemories: Math.ceil(consolidatedCount / 3),
      timestamp: new Date().toISOString(),
    };
  }

  private computeRelevance(query: string, content: string): number {
    const queryTokens = query.toLowerCase().split(/\s+/);
    const contentLower = content.toLowerCase();

    let matches = 0;
    for (const token of queryTokens) {
      if (contentLower.includes(token)) {
        matches++;
      }
    }

    return queryTokens.length > 0 ? matches / queryTokens.length : 0;
  }
}
