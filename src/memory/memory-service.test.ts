import { InMemoryMemoryService } from './memory-service.js';
import { InMemoryStorageBackend, FileStorageBackend } from './storage-backend.js';
import type { MemoryEntry } from '../types/memory.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    type: 'semantic',
    content: 'TypeScript is used for type safety',
    metadata: {
      source: 'test',
      confidence: 0.9,
      topics: ['typescript'],
      entities: ['src/index.ts'],
      timestamp: new Date().toISOString(),
    },
    ...overrides,
  };
}

describe('InMemoryMemoryService', () => {
  let service: InMemoryMemoryService;

  beforeEach(() => {
    service = new InMemoryMemoryService();
  });

  describe('store', () => {
    it('should return a unique id', async () => {
      const id1 = await service.store(makeEntry());
      const id2 = await service.store(makeEntry());
      expect(id1).not.toBe(id2);
    });
  });

  describe('query', () => {
    it('should return matching memories by keyword relevance', async () => {
      await service.store(makeEntry({ content: 'TypeScript is great for type safety' }));
      await service.store(makeEntry({ content: 'Python is dynamically typed' }));

      const results = await service.query({ text: 'TypeScript type' });
      expect(results.length).toBe(2);
      expect(results[0].relevance).toBeGreaterThan(results[1].relevance);
    });

    it('should filter by memory_type', async () => {
      await service.store(makeEntry({ type: 'semantic', content: 'fact about code' }));
      await service.store(makeEntry({ type: 'episodic', content: 'event about code' }));

      const results = await service.query({ text: 'code', memory_type: 'episodic' });
      expect(results.length).toBe(1);
      expect(results[0].entry.type).toBe('episodic');
    });

    it('should respect limit', async () => {
      for (let i = 0; i < 5; i++) {
        await service.store(makeEntry({ content: `memory ${i} about testing` }));
      }

      const results = await service.query({ text: 'testing', limit: 2 });
      expect(results.length).toBe(2);
    });

    it('should filter by min_relevance', async () => {
      await service.store(makeEntry({ content: 'completely unrelated content xyz' }));
      await service.store(makeEntry({ content: 'searching for test patterns' }));

      const results = await service.query({ text: 'test patterns', min_relevance: 0.5 });
      expect(results.every((r) => r.relevance >= 0.5)).toBe(true);
    });
  });

  describe('update', () => {
    it('should update memory content', async () => {
      const id = await service.store(makeEntry({ content: 'old content' }));
      await service.update(id, { content: 'new content' });

      const results = await service.query({ text: 'new content' });
      expect(results[0].entry.content).toBe('new content');
    });

    it('should throw for unknown id', async () => {
      await expect(service.update('nonexistent', { content: 'x' })).rejects.toThrow(
        'Memory not found',
      );
    });
  });

  describe('forget', () => {
    it('should remove a memory', async () => {
      const id = await service.store(makeEntry({ content: 'forgettable' }));
      await service.forget(id, 'no longer relevant');

      const results = await service.query({ text: 'forgettable' });
      expect(results.length).toBe(0);
    });

    it('should throw for unknown id', async () => {
      await expect(service.forget('nonexistent', 'reason')).rejects.toThrow('Memory not found');
    });
  });

  describe('getRelated', () => {
    it('should return memories referencing the entity', async () => {
      await service.store(
        makeEntry({
          metadata: {
            source: 'test',
            confidence: 1,
            topics: [],
            entities: ['file-a.ts'],
            timestamp: new Date().toISOString(),
          },
        }),
      );
      await service.store(
        makeEntry({
          metadata: {
            source: 'test',
            confidence: 1,
            topics: [],
            entities: ['file-b.ts'],
            timestamp: new Date().toISOString(),
          },
        }),
      );

      const results = await service.getRelated('file-a.ts');
      expect(results.length).toBe(1);
    });
  });

  describe('consolidate', () => {
    it('should report consolidation of episodic memories', async () => {
      for (let i = 0; i < 6; i++) {
        await service.store(
          makeEntry({
            type: 'episodic',
            metadata: {
              source: 'test',
              confidence: 1,
              topics: ['dev'],
              entities: [],
              timestamp: new Date().toISOString(),
            },
          }),
        );
      }

      const report = await service.consolidate({ topic: 'dev' });
      expect(report.consolidatedCount).toBe(6);
      expect(report.newSemanticMemories).toBe(2);
    });
  });
});

describe('InMemoryMemoryService with StorageBackend', () => {
  it('should use InMemoryStorageBackend by default', async () => {
    const service = new InMemoryMemoryService();
    const id = await service.store(makeEntry());
    expect(id).toBe('mem_1');
  });

  it('should persist via explicit InMemoryStorageBackend', async () => {
    const backend = new InMemoryStorageBackend();
    const service1 = new InMemoryMemoryService({ backend });
    await service1.store(makeEntry({ content: 'persistent fact' }));

    // Second service instance sharing the same backend
    const service2 = new InMemoryMemoryService({ backend });
    const results = await service2.query({ text: 'persistent' });
    expect(results.length).toBe(1);
    expect(results[0].entry.content).toBe('persistent fact');
  });

  it('should continue ID sequence from backend records', async () => {
    const backend = new InMemoryStorageBackend();
    const service1 = new InMemoryMemoryService({ backend });
    await service1.store(makeEntry());
    await service1.store(makeEntry());

    const service2 = new InMemoryMemoryService({ backend });
    const id = await service2.store(makeEntry());
    expect(id).toBe('mem_3');
  });
});

describe('InMemoryMemoryService with FileStorageBackend', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pnxt-mem-test-'));
    filePath = path.join(tmpDir, 'memories.json');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should persist memories to disk across service instances', async () => {
    const service1 = new InMemoryMemoryService({
      backend: new FileStorageBackend(filePath),
    });
    await service1.store(makeEntry({ content: 'fact about TypeScript' }));
    await service1.store(makeEntry({ content: 'fact about testing' }));

    // New service instance reads from disk
    const service2 = new InMemoryMemoryService({
      backend: new FileStorageBackend(filePath),
    });
    const results = await service2.query({ text: 'TypeScript' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entry.content).toContain('TypeScript');
  });

  it('should persist forget operations', async () => {
    const service1 = new InMemoryMemoryService({
      backend: new FileStorageBackend(filePath),
    });
    const id = await service1.store(makeEntry({ content: 'to be forgotten' }));
    await service1.forget(id, 'no longer needed');

    const service2 = new InMemoryMemoryService({
      backend: new FileStorageBackend(filePath),
    });
    const results = await service2.query({ text: 'forgotten' });
    expect(results.length).toBe(0);
  });
});
