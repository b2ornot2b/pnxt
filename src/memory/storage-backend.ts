/**
 * StorageBackend — pluggable persistence layer for MemoryService.
 *
 * Decouples memory storage from in-memory Maps, allowing file-based,
 * database-backed, or other persistent implementations.
 */

import { readFile, writeFile } from 'node:fs/promises';
import type { MemoryEntry } from '../types/memory.js';

export interface StoredMemoryRecord {
  id: string;
  entry: MemoryEntry;
  accessCount: number;
  lastAccessed: string;
}

export interface StorageBackend {
  load(): Promise<Map<string, StoredMemoryRecord>>;

  save(records: Map<string, StoredMemoryRecord>): Promise<void>;

  append(id: string, record: StoredMemoryRecord): Promise<void>;

  remove(id: string): Promise<void>;
}

/**
 * In-memory storage backend — no persistence, used for testing.
 */
export class InMemoryStorageBackend implements StorageBackend {
  private records = new Map<string, StoredMemoryRecord>();

  async load(): Promise<Map<string, StoredMemoryRecord>> {
    return new Map(this.records);
  }

  async save(records: Map<string, StoredMemoryRecord>): Promise<void> {
    this.records = new Map(records);
  }

  async append(id: string, record: StoredMemoryRecord): Promise<void> {
    this.records.set(id, record);
  }

  async remove(id: string): Promise<void> {
    this.records.delete(id);
  }
}

/**
 * File-based JSON storage backend for persistent memory across sessions.
 *
 * Stores all memory records as a JSON file on disk. Suitable for
 * single-process prototyping; not designed for concurrent access.
 */
export class FileStorageBackend implements StorageBackend {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async load(): Promise<Map<string, StoredMemoryRecord>> {
    try {
      const data = await readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data) as Record<string, StoredMemoryRecord>;
      return new Map(Object.entries(parsed));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return new Map();
      }
      throw error;
    }
  }

  async save(records: Map<string, StoredMemoryRecord>): Promise<void> {
    const obj = Object.fromEntries(records);
    await writeFile(this.filePath, JSON.stringify(obj, null, 2), 'utf-8');
  }

  async append(id: string, record: StoredMemoryRecord): Promise<void> {
    const records = await this.load();
    records.set(id, record);
    await this.save(records);
  }

  async remove(id: string): Promise<void> {
    const records = await this.load();
    records.delete(id);
    await this.save(records);
  }
}
