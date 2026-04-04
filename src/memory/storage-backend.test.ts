import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { InMemoryStorageBackend, FileStorageBackend } from './storage-backend.js';
import type { StoredMemoryRecord } from './storage-backend.js';

function makeRecord(id: string): StoredMemoryRecord {
  return {
    id,
    entry: {
      type: 'semantic',
      content: `content for ${id}`,
      metadata: {
        source: 'test',
        confidence: 0.9,
        topics: ['testing'],
        entities: [],
        timestamp: new Date().toISOString(),
      },
    },
    accessCount: 0,
    lastAccessed: new Date().toISOString(),
  };
}

describe('InMemoryStorageBackend', () => {
  it('should load an empty map initially', async () => {
    const backend = new InMemoryStorageBackend();
    const records = await backend.load();
    expect(records.size).toBe(0);
  });

  it('should append and load records', async () => {
    const backend = new InMemoryStorageBackend();
    await backend.append('mem_1', makeRecord('mem_1'));
    await backend.append('mem_2', makeRecord('mem_2'));

    const records = await backend.load();
    expect(records.size).toBe(2);
    expect(records.get('mem_1')?.entry.content).toBe('content for mem_1');
  });

  it('should remove records', async () => {
    const backend = new InMemoryStorageBackend();
    await backend.append('mem_1', makeRecord('mem_1'));
    await backend.remove('mem_1');

    const records = await backend.load();
    expect(records.size).toBe(0);
  });

  it('should save and load a full map', async () => {
    const backend = new InMemoryStorageBackend();
    const map = new Map<string, StoredMemoryRecord>();
    map.set('mem_1', makeRecord('mem_1'));
    map.set('mem_2', makeRecord('mem_2'));

    await backend.save(map);
    const loaded = await backend.load();
    expect(loaded.size).toBe(2);
  });
});

describe('FileStorageBackend', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pnxt-test-'));
    filePath = path.join(tmpDir, 'memories.json');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should return empty map when file does not exist', async () => {
    const backend = new FileStorageBackend(filePath);
    const records = await backend.load();
    expect(records.size).toBe(0);
  });

  it('should persist records to file and reload them', async () => {
    const backend = new FileStorageBackend(filePath);
    await backend.append('mem_1', makeRecord('mem_1'));
    await backend.append('mem_2', makeRecord('mem_2'));

    // Create a fresh instance to verify persistence
    const backend2 = new FileStorageBackend(filePath);
    const records = await backend2.load();
    expect(records.size).toBe(2);
    expect(records.get('mem_1')?.entry.content).toBe('content for mem_1');
  });

  it('should remove records from file', async () => {
    const backend = new FileStorageBackend(filePath);
    await backend.append('mem_1', makeRecord('mem_1'));
    await backend.append('mem_2', makeRecord('mem_2'));
    await backend.remove('mem_1');

    const backend2 = new FileStorageBackend(filePath);
    const records = await backend2.load();
    expect(records.size).toBe(1);
    expect(records.has('mem_1')).toBe(false);
  });

  it('should save full map to file', async () => {
    const backend = new FileStorageBackend(filePath);
    const map = new Map<string, StoredMemoryRecord>();
    map.set('mem_1', makeRecord('mem_1'));

    await backend.save(map);

    const backend2 = new FileStorageBackend(filePath);
    const loaded = await backend2.load();
    expect(loaded.size).toBe(1);
  });
});
