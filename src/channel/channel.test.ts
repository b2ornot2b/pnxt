import { Channel, ChannelClosedError } from './channel.js';
import { Process } from './process.js';
import { DataflowGraph } from './dataflow-graph.js';
import type { DataflowGraphDefinition } from '../types/channel.js';

describe('Channel', () => {
  describe('basic send/receive', () => {
    it('should send and receive a value', async () => {
      const ch = new Channel<number>({ id: 'ch1', dataType: 'number' });
      await ch.send(42);
      const value = await ch.receive();
      expect(value).toBe(42);
    });

    it('should maintain FIFO order', async () => {
      const ch = new Channel<string>({ id: 'ch2', dataType: 'string' });
      await ch.send('first');
      await ch.send('second');
      await ch.send('third');

      expect(await ch.receive()).toBe('first');
      expect(await ch.receive()).toBe('second');
      expect(await ch.receive()).toBe('third');
    });

    it('should track stats', async () => {
      const ch = new Channel<number>({ id: 'ch3', dataType: 'number' });
      await ch.send(1);
      await ch.send(2);
      await ch.receive();

      expect(ch.stats.sent).toBe(2);
      expect(ch.stats.received).toBe(1);
      expect(ch.stats.buffered).toBe(1);
      expect(ch.stats.state).toBe('open');
    });
  });

  describe('trySend/tryReceive', () => {
    it('should return true when buffer has space', () => {
      const ch = new Channel<number>({ id: 'ch4', dataType: 'number', bufferSize: 2 });
      expect(ch.trySend(1)).toBe(true);
      expect(ch.trySend(2)).toBe(true);
      expect(ch.trySend(3)).toBe(false);
    });

    it('should return undefined when buffer is empty', () => {
      const ch = new Channel<number>({ id: 'ch5', dataType: 'number' });
      expect(ch.tryReceive()).toBeUndefined();
    });
  });

  describe('backpressure', () => {
    it('should block send when buffer is full', async () => {
      const ch = new Channel<number>({ id: 'ch6', dataType: 'number', bufferSize: 1 });
      await ch.send(1); // fills buffer

      let sendResolved = false;
      const sendPromise = ch.send(2).then(() => {
        sendResolved = true;
      });

      // Send should be blocked
      await new Promise((r) => setTimeout(r, 10));
      expect(sendResolved).toBe(false);

      // Receive unblocks the sender
      const val = await ch.receive();
      expect(val).toBe(1);

      await sendPromise;
      expect(sendResolved).toBe(true);

      // The second value should now be in the buffer
      const val2 = await ch.receive();
      expect(val2).toBe(2);
    });

    it('should block receive when buffer is empty', async () => {
      const ch = new Channel<number>({ id: 'ch7', dataType: 'number' });

      let received = false;
      const receivePromise = ch.receive().then((v) => {
        received = true;
        return v;
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(received).toBe(false);

      await ch.send(99);
      const value = await receivePromise;
      expect(value).toBe(99);
      expect(received).toBe(true);
    });
  });

  describe('close', () => {
    it('should throw ChannelClosedError on receive from closed empty channel', async () => {
      const ch = new Channel<number>({ id: 'ch8', dataType: 'number' });
      ch.close();

      await expect(ch.receive()).rejects.toThrow(ChannelClosedError);
    });

    it('should throw on send to closed channel', async () => {
      const ch = new Channel<number>({ id: 'ch9', dataType: 'number' });
      ch.close();

      await expect(ch.send(1)).rejects.toThrow('Cannot send on closed channel');
    });

    it('should allow draining buffered values after close', async () => {
      const ch = new Channel<number>({ id: 'ch10', dataType: 'number' });
      await ch.send(1);
      await ch.send(2);
      ch.close();

      expect(await ch.receive()).toBe(1);
      expect(await ch.receive()).toBe(2);
      await expect(ch.receive()).rejects.toThrow(ChannelClosedError);
    });

    it('should be idempotent', () => {
      const ch = new Channel<number>({ id: 'ch11', dataType: 'number' });
      ch.close();
      ch.close(); // should not throw
      expect(ch.stats.state).toBe('closed');
    });
  });

  describe('async iteration', () => {
    it('should iterate over values until closed', async () => {
      const ch = new Channel<number>({ id: 'ch12', dataType: 'number', bufferSize: 4 });

      // Send values and close in background.
      setTimeout(async () => {
        await ch.send(1);
        await ch.send(2);
        await ch.send(3);
        ch.close();
      }, 5);

      const values: number[] = [];
      for await (const v of ch) {
        values.push(v);
      }

      expect(values).toEqual([1, 2, 3]);
    });
  });

  describe('validation', () => {
    it('should reject buffer size less than 1', () => {
      expect(() => new Channel({ id: 'bad', dataType: 'any', bufferSize: 0 })).toThrow(
        'Channel buffer size must be at least 1',
      );
    });
  });
});

describe('Process', () => {
  it('should run a behavior function', async () => {
    const results: number[] = [];

    const proc = new Process(
      {
        id: 'proc1',
        name: 'doubler',
        inputs: [{ name: 'in', direction: 'input', dataType: 'number' }],
        outputs: [{ name: 'out', direction: 'output', dataType: 'number' }],
      },
      async (inputs, outputs) => {
        const inCh = inputs.get('in')!;
        const outCh = outputs.get('out')!;

        for await (const val of inCh) {
          await outCh.send(val * 2);
        }
        outCh.close();
      },
    );

    const inChannel = new Channel<number>({ id: 'in', dataType: 'number' });
    const outChannel = new Channel<number>({ id: 'out', dataType: 'number' });

    proc.bindInput('in', inChannel);
    proc.bindOutput('out', outChannel);
    proc.start();

    expect(proc.currentState).toBe('running');

    await inChannel.send(5);
    await inChannel.send(10);
    inChannel.close();

    for await (const val of outChannel) {
      results.push(val);
    }

    await proc.wait();

    expect(results).toEqual([10, 20]);
    expect(proc.currentState).toBe('completed');
  });

  it('should reject binding to non-existent port', () => {
    const proc = new Process(
      {
        id: 'proc2',
        name: 'test',
        inputs: [{ name: 'in', direction: 'input', dataType: 'string' }],
        outputs: [],
      },
      async () => {},
    );

    const ch = new Channel<string>({ id: 'ch', dataType: 'string' });
    expect(() => proc.bindInput('nonexistent', ch)).toThrow('has no input port');
  });
});

describe('DataflowGraph', () => {
  it('should wire two processes and pass data through', async () => {
    const graphDef: DataflowGraphDefinition = {
      id: 'graph1',
      name: 'producer-consumer',
      processes: [
        {
          id: 'producer',
          name: 'Producer',
          inputs: [],
          outputs: [{ name: 'out', direction: 'output', dataType: 'number' }],
        },
        {
          id: 'consumer',
          name: 'Consumer',
          inputs: [{ name: 'in', direction: 'input', dataType: 'number' }],
          outputs: [],
        },
      ],
      connections: [
        {
          channelId: 'ch_prod_cons',
          source: { processId: 'producer', port: 'out' },
          target: { processId: 'consumer', port: 'in' },
        },
      ],
    };

    const received: number[] = [];

    const graph = new DataflowGraph(graphDef);

    graph.addProcess<never, number>('producer', async (_inputs, outputs) => {
      const out = outputs.get('out')!;
      await out.send(1);
      await out.send(2);
      await out.send(3);
      out.close();
    });

    graph.addProcess<number, never>('consumer', async (inputs) => {
      const inCh = inputs.get('in')!;
      for await (const val of inCh) {
        received.push(val);
      }
    });

    graph.start();
    await graph.wait();

    expect(received).toEqual([1, 2, 3]);
  });

  it('should throw when adding process not in definition', () => {
    const graph = new DataflowGraph({
      id: 'g2',
      name: 'empty',
      processes: [],
      connections: [],
    });

    expect(() => graph.addProcess('nope', async () => {})).toThrow('not found in graph definition');
  });
});
