/**
 * Channel IFC label enforcement tests.
 *
 * Validates that channels with an IFC label expose it for downstream
 * enforcement, and that labeled channels work correctly with the
 * existing channel API.
 */

import { Channel } from './channel.js';
import { createLabel, canFlowTo } from '../types/ifc.js';

describe('Channel — IFC Label Support', () => {
  it('should store and expose the channel label', () => {
    const label = createLabel('agent-a', 2, 'internal');
    const ch = new Channel<string>({ id: 'ch-1', dataType: 'string', label });
    expect(ch.label).toBeDefined();
    expect(ch.label!.trustLevel).toBe(2);
    expect(ch.label!.classification).toBe('internal');
  });

  it('should have no label when not configured', () => {
    const ch = new Channel<string>({ id: 'ch-2', dataType: 'string' });
    expect(ch.label).toBeUndefined();
  });

  it('should allow send/receive on labeled channel', async () => {
    const label = createLabel('agent-a', 2, 'internal');
    const ch = new Channel<string>({ id: 'ch-3', dataType: 'string', label });

    await ch.send('hello');
    const value = await ch.receive();
    expect(value).toBe('hello');
  });

  it('should work with async iteration on labeled channel', async () => {
    const label = createLabel('agent-a', 3, 'confidential');
    const ch = new Channel<number>({ id: 'ch-4', dataType: 'number', label });

    await ch.send(1);
    await ch.send(2);
    ch.close();

    const values: number[] = [];
    for await (const v of ch) {
      values.push(v);
    }
    expect(values).toEqual([1, 2]);
  });

  it('should preserve label across close/reopen cycle', () => {
    const label = createLabel('agent-b', 1, 'public');
    const ch = new Channel<string>({ id: 'ch-5', dataType: 'string', label });
    ch.close();
    // Label persists even after close
    expect(ch.label).toBeDefined();
    expect(ch.label!.owner).toBe('agent-b');
  });

  it('should enable downstream IFC checking via canFlowTo', () => {
    const channelLabel = createLabel('system', 2, 'internal');
    const ch = new Channel<string>({ id: 'ch-6', dataType: 'string', label: channelLabel });

    // Data from a low-trust source can flow to a higher-trust channel
    const lowLabel = createLabel('agent-c', 1, 'public');
    expect(canFlowTo(lowLabel, ch.label!)).toBe(true);

    // Data from a high-trust source cannot flow to a lower-trust channel
    const highLabel = createLabel('agent-d', 4, 'restricted');
    expect(canFlowTo(highLabel, ch.label!)).toBe(false);
  });

  it('should support backpressure on labeled channels', async () => {
    const label = createLabel('agent-a', 2, 'internal');
    const ch = new Channel<number>({ id: 'ch-7', dataType: 'number', bufferSize: 2, label });

    await ch.send(1);
    await ch.send(2);
    expect(ch.trySend(3)).toBe(false); // Buffer full

    const v = await ch.receive();
    expect(v).toBe(1);
    expect(ch.trySend(3)).toBe(true); // Space available
  });
});
