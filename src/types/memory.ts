/**
 * Memory types for the three-layer memory model.
 *
 * Based on Phase 3 research:
 * - docs/research/phase-3/02-semantic-memory-architecture.md
 * - docs/research/phase-3/06-implementation-reference-architecture.md
 */

export type MemoryType = 'semantic' | 'episodic';

export interface MemoryEntry {
  type: MemoryType;
  content: string;
  metadata: {
    source: string;
    confidence: number;
    topics: string[];
    entities: string[];
    timestamp: string;
  };
}

export interface MemoryResult {
  id: string;
  entry: MemoryEntry;
  relevance: number;
  accessCount: number;
  lastAccessed: string;
}

export interface MemoryQueryParams {
  text: string;
  memory_type?: MemoryType;
  recency_weight?: number;
  limit?: number;
  min_relevance?: number;
}

export interface ConsolidationParams {
  since?: string;
  topic?: string;
}

export interface ConsolidationReport {
  consolidatedCount: number;
  newSemanticMemories: number;
  timestamp: string;
}
