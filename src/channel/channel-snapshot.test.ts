import {
  ChannelSnapshotMismatchError,
  ProcessSnapshotMismatchError,
} from '../errors/vpir-errors.js';
import type { ChannelSnapshot, ProcessDefinition } from '../types/channel.js';
import { Channel } from './channel.js';
import { Process } from './process.js';

// ── Channel.getSnapshot / restore ────────────────────────────────

describe('Channel snapshot/restore', () => {
  it('captures buffer contents in FIFO order', async () => {
    const ch = new Channel<number>({ id: 'snap1', dataType: 'number', bufferSize: 8 });
    await ch.send(1);
    await ch.send(2);
    await ch.send(3);

    const snap = ch.getSnapshot();
    expect(snap.channelId).toBe('snap1');
    expect(snap.bufferSize).toBe(8);
    expect(snap.buffer).toEqual([1, 2, 3]);
    expect(snap.state).toBe('open');
  });

  it('captures bufferSize', async () => {
    const ch = new Channel<string>({ id: 'snap-size', dataType: 'string', bufferSize: 4 });
    const snap = ch.getSnapshot();
    expect(snap.bufferSize).toBe(4);
  });

  it('captures empty buffer as a valid snapshot', () => {
    const ch = new Channel<number>({ id: 'empty', dataType: 'number' });
    const snap = ch.getSnapshot();
    expect(snap.buffer).toEqual([]);
  });

  it('restore replaces the buffer and preserves FIFO order', async () => {
    const source = new Channel<string>({ id: 'src', dataType: 'string', bufferSize: 8 });
    await source.send('a');
    await source.send('b');
    await source.send('c');
    const snap = source.getSnapshot();

    // Fresh channel with the same id and bufferSize.
    const target = new Channel<string>({ id: 'src', dataType: 'string', bufferSize: 8 });
    target.restore(snap);

    expect(await target.receive()).toBe('a');
    expect(await target.receive()).toBe('b');
    expect(await target.receive()).toBe('c');
  });

  it('restore followed by getSnapshot round-trips', async () => {
    const a = new Channel<number>({ id: 'rt', dataType: 'number', bufferSize: 8 });
    await a.send(10);
    await a.send(20);
    const snap1 = a.getSnapshot();

    const b = new Channel<number>({ id: 'rt', dataType: 'number', bufferSize: 8 });
    b.restore(snap1);
    const snap2 = b.getSnapshot();

    expect(snap2.buffer).toEqual(snap1.buffer);
    expect(snap2.bufferSize).toBe(snap1.bufferSize);
    expect(snap2.channelId).toBe(snap1.channelId);
    expect(snap2.state).toBe(snap1.state);
  });

  it('restore throws ChannelSnapshotMismatchError on channelId mismatch', () => {
    const ch = new Channel<number>({ id: 'a', dataType: 'number' });
    const badSnap: ChannelSnapshot<number> = {
      channelId: 'b',
      buffer: [],
      bufferSize: 16,
      state: 'open',
      timestamp: 0,
    };
    expect(() => ch.restore(badSnap)).toThrow(ChannelSnapshotMismatchError);
  });

  it('restore throws ChannelSnapshotMismatchError on bufferSize mismatch', () => {
    const ch = new Channel<number>({ id: 'a', dataType: 'number', bufferSize: 4 });
    const badSnap: ChannelSnapshot<number> = {
      channelId: 'a',
      buffer: [],
      bufferSize: 8,
      state: 'open',
      timestamp: 0,
    };
    expect(() => ch.restore(badSnap)).toThrow(ChannelSnapshotMismatchError);
  });

  it('restore throws when the snapshot buffer overflows the configured capacity', () => {
    const ch = new Channel<number>({ id: 'a', dataType: 'number', bufferSize: 2 });
    const badSnap: ChannelSnapshot<number> = {
      channelId: 'a',
      buffer: [1, 2, 3], // length 3 > bufferSize 2
      bufferSize: 2,
      state: 'open',
      timestamp: 0,
    };
    expect(() => ch.restore(badSnap)).toThrow(ChannelSnapshotMismatchError);
  });

  it('restores the closed state so subsequent receives on an empty buffer fail cleanly', async () => {
    const source = new Channel<number>({ id: 'c', dataType: 'number', bufferSize: 4 });
    source.close();
    const snap = source.getSnapshot();
    expect(snap.state).toBe('closed');

    const target = new Channel<number>({ id: 'c', dataType: 'number', bufferSize: 4 });
    target.restore(snap);
    expect(target.stats.state).toBe('closed');
  });
});

// ── Process.getSnapshot / restore ───────────────────────────────

function makeDefinition(id: string): ProcessDefinition {
  return { id, name: `proc-${id}`, inputs: [], outputs: [] };
}

describe('Process snapshot/restore', () => {
  it('captures the process id and idle state by default', () => {
    const p = new Process(makeDefinition('p1'), async () => {});
    const snap = p.getSnapshot();
    expect(snap.processId).toBe('p1');
    expect(snap.state).toBe('idle');
  });

  it('captures the running state after start', () => {
    const p = new Process(
      makeDefinition('p2'),
      async () => new Promise((resolve) => setTimeout(resolve, 5)),
    );
    p.start();
    const snap = p.getSnapshot();
    expect(snap.state).toBe('running');
  });

  it('captures the completed state after wait', async () => {
    const p = new Process(makeDefinition('p3'), async () => {});
    p.start();
    await p.wait();
    const snap = p.getSnapshot();
    expect(snap.state).toBe('completed');
  });

  it('restores the state onto a matching process', () => {
    const a = new Process(makeDefinition('p4'), async () => {});
    a.start();
    const snap = a.getSnapshot();

    const b = new Process(makeDefinition('p4'), async () => {});
    b.restore(snap);
    expect(b.currentState).toBe(snap.state);
  });

  it('throws ProcessSnapshotMismatchError on processId mismatch', () => {
    const a = new Process(makeDefinition('a'), async () => {});
    const snap = new Process(makeDefinition('b'), async () => {}).getSnapshot();
    expect(() => a.restore(snap)).toThrow(ProcessSnapshotMismatchError);
  });
});
