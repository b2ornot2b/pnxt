/**
 * Protocol-Channel Integration tests.
 *
 * Tests that NL protocol conversations work correctly when transported
 * over DPN channels with IFC enforcement, backpressure, and async iteration.
 */

import type { SecurityLabel } from '../types/ifc.js';
import type { ProtocolMessage } from '../types/protocol.js';
import { createLabel } from '../types/ifc.js';
import {
  createProtocolChannel,
  createProtocolSessionPair,
} from './protocol-channel.js';
import { ProtocolError } from './nl-protocol.js';

// Helper labels for tests.
const agentLabel = (id: string, trust: 0 | 1 | 2 | 3 | 4 = 2): SecurityLabel =>
  createLabel(id, trust, 'internal');

describe('createProtocolChannel', () => {
  it('should create a bidirectional channel pair', () => {
    const pair = createProtocolChannel({
      conversationId: 'conv-1',
      protocol: 'task-delegation',
      initiatorId: 'agent-a',
      responderId: 'agent-b',
    });

    expect(pair.conversationId).toBe('conv-1');
    expect(pair.protocol).toBe('task-delegation');
    expect(pair.toResponder).toBeDefined();
    expect(pair.toInitiator).toBeDefined();
  });

  it('should use specified buffer size', () => {
    const pair = createProtocolChannel({
      conversationId: 'conv-2',
      protocol: 'task-delegation',
      initiatorId: 'agent-a',
      responderId: 'agent-b',
      bufferSize: 4,
    });

    expect(pair.toResponder.stats.state).toBe('open');
    expect(pair.toInitiator.stats.state).toBe('open');
  });

  it('should apply IFC label to channels', () => {
    const label = agentLabel('system', 3);
    const pair = createProtocolChannel({
      conversationId: 'conv-3',
      protocol: 'task-delegation',
      initiatorId: 'agent-a',
      responderId: 'agent-b',
      label,
    });

    expect(pair.toResponder.label).toEqual(label);
    expect(pair.toInitiator.label).toEqual(label);
  });

  it('should close both channels', () => {
    const pair = createProtocolChannel({
      conversationId: 'conv-4',
      protocol: 'task-delegation',
      initiatorId: 'agent-a',
      responderId: 'agent-b',
    });

    pair.close();

    expect(pair.toResponder.stats.state).toBe('closed');
    expect(pair.toInitiator.stats.state).toBe('closed');
  });
});

describe('ProtocolChannelSession', () => {
  describe('task-delegation protocol', () => {
    it('should complete a full delegation lifecycle over channels', async () => {
      const { initiator, responder } = createProtocolSessionPair(
        'task-delegation',
        'agent-a',
        'agent-b',
      );

      const label = agentLabel('agent-a');

      // Initiator sends request.
      const reqPromise = initiator.send('request', 'Please analyze this data', label);
      const recvReq = await responder.receive();
      await reqPromise;

      expect(recvReq.type).toBe('request');
      expect(recvReq.content).toBe('Please analyze this data');
      expect(responder.conversation.state).toBe('negotiating');
      expect(initiator.conversation.state).toBe('negotiating');

      // Responder accepts.
      const accPromise = responder.send('accept', 'Will do', agentLabel('agent-b'));
      const recvAcc = await initiator.receive();
      await accPromise;

      expect(recvAcc.type).toBe('accept');
      expect(initiator.conversation.state).toBe('agreed');

      // Responder confirms completion.
      const confPromise = responder.send('confirm', 'Done', agentLabel('agent-b'));
      const recvConf = await initiator.receive();
      await confPromise;

      expect(recvConf.type).toBe('confirm');
      expect(initiator.conversation.state).toBe('completed');
      expect(initiator.isComplete).toBe(true);

      initiator.close();
    });

    it('should handle rejection', async () => {
      const { initiator, responder } = createProtocolSessionPair(
        'task-delegation',
        'agent-a',
        'agent-b',
      );

      const label = agentLabel('agent-a');

      const reqPromise = initiator.send('request', 'Analyze this', label);
      await responder.receive();
      await reqPromise;

      const rejPromise = responder.send('reject', 'Too busy', agentLabel('agent-b'));
      const recvRej = await initiator.receive();
      await rejPromise;

      expect(recvRej.type).toBe('reject');
      expect(initiator.conversation.state).toBe('failed');
      expect(initiator.isComplete).toBe(true);

      initiator.close();
    });

    it('should support delegation flow', async () => {
      const { initiator, responder } = createProtocolSessionPair(
        'task-delegation',
        'agent-a',
        'agent-b',
      );

      const label = agentLabel('agent-a');

      // request → accept → delegate → confirm
      const reqP = initiator.send('request', 'Do task', label);
      await responder.receive();
      await reqP;

      const accP = responder.send('accept', 'OK', agentLabel('agent-b'));
      await initiator.receive();
      await accP;

      const delP = responder.send('delegate', 'Passing to agent-c', agentLabel('agent-b'));
      const recvDel = await initiator.receive();
      await delP;

      expect(recvDel.type).toBe('delegate');
      expect(initiator.conversation.state).toBe('executing');

      const confP = responder.send('confirm', 'Completed by agent-c', agentLabel('agent-b'));
      await initiator.receive();
      await confP;

      expect(initiator.conversation.state).toBe('completed');
      initiator.close();
    });
  });

  describe('capability-negotiation protocol', () => {
    it('should complete a negotiation lifecycle', async () => {
      const { initiator, responder } = createProtocolSessionPair(
        'capability-negotiation',
        'agent-a',
        'agent-b',
      );

      const label = agentLabel('agent-a');

      // query → inform → propose → accept → confirm
      const qP = initiator.send('query', 'What can you do?', label);
      await responder.receive();
      await qP;
      expect(responder.conversation.state).toBe('negotiating');

      const iP = responder.send('inform', 'I can analyze data', agentLabel('agent-b'));
      await initiator.receive();
      await iP;

      const pP = initiator.send('propose', 'Analyze dataset X', label);
      await responder.receive();
      await pP;

      const aP = responder.send('accept', 'Agreed', agentLabel('agent-b'));
      await initiator.receive();
      await aP;
      expect(initiator.conversation.state).toBe('agreed');

      const cP = initiator.send('confirm', 'Confirmed', label);
      await responder.receive();
      await cP;

      expect(initiator.conversation.state).toBe('completed');
      expect(responder.conversation.state).toBe('completed');
      initiator.close();
    });
  });

  describe('conflict-resolution protocol', () => {
    it('should resolve conflict via proposal and acceptance', async () => {
      const { initiator, responder } = createProtocolSessionPair(
        'conflict-resolution',
        'agent-a',
        'agent-b',
      );

      const labelA = agentLabel('agent-a');
      const labelB = agentLabel('agent-b');

      // inform → inform → propose → accept → confirm
      const i1P = initiator.send('inform', 'I found issue X', labelA);
      await responder.receive();
      await i1P;

      const i2P = responder.send('inform', 'I see it differently', labelB);
      await initiator.receive();
      await i2P;

      const pP = initiator.send('propose', 'Lets do Y', labelA);
      await responder.receive();
      await pP;

      const aP = responder.send('accept', 'Agreed', labelB);
      await initiator.receive();
      await aP;
      expect(initiator.conversation.state).toBe('agreed');

      const cP = responder.send('confirm', 'Done', labelB);
      await initiator.receive();
      await cP;

      expect(initiator.conversation.state).toBe('completed');
      initiator.close();
    });

    it('should handle escalation', async () => {
      const { initiator, responder } = createProtocolSessionPair(
        'conflict-resolution',
        'agent-a',
        'agent-b',
      );

      const labelA = agentLabel('agent-a');
      const labelB = agentLabel('agent-b');

      const iP = initiator.send('inform', 'Problem detected', labelA);
      await responder.receive();
      await iP;

      const eP = responder.send('escalate', 'Need supervisor', labelB);
      await initiator.receive();
      await eP;

      expect(initiator.conversation.state).toBe('failed');
      expect(initiator.isComplete).toBe(true);
      initiator.close();
    });
  });

  describe('transition validation', () => {
    it('should reject invalid transitions', async () => {
      const { initiator } = createProtocolSessionPair(
        'task-delegation',
        'agent-a',
        'agent-b',
      );

      // Initiator cannot send 'accept' in 'initiated' state.
      await expect(
        initiator.send('accept', 'OK', agentLabel('agent-a')),
      ).rejects.toThrow(ProtocolError);

      initiator.close();
    });

    it('should reject messages after conversation completes', async () => {
      const { initiator, responder } = createProtocolSessionPair(
        'task-delegation',
        'agent-a',
        'agent-b',
      );

      const label = agentLabel('agent-a');

      // Complete the conversation: request → reject.
      const rP = initiator.send('request', 'Do X', label);
      await responder.receive();
      await rP;

      const rejP = responder.send('reject', 'No', agentLabel('agent-b'));
      await initiator.receive();
      await rejP;

      // Try to send after completion.
      await expect(
        initiator.send('request', 'Try again', label),
      ).rejects.toThrow(ProtocolError);

      initiator.close();
    });
  });

  describe('IFC enforcement', () => {
    it('should reject messages with labels that cannot flow to channel label', async () => {
      const channelLabel = agentLabel('system', 3);
      channelLabel.classification = 'confidential';

      const { initiator } = createProtocolSessionPair(
        'task-delegation',
        'agent-a',
        'agent-b',
        channelLabel,
      );

      // Low-trust label cannot flow to high-trust channel.
      // Actually, canFlowTo checks from.trust <= to.trust AND from.class <= to.class.
      // A label with trust=2, class=restricted CANNOT flow to trust=3, class=confidential
      // because restricted > confidential.
      const restrictedLabel = createLabel('agent-a', 2, 'restricted');

      await expect(
        initiator.send('request', 'Secret data', restrictedLabel),
      ).rejects.toThrow(/IFC violation/);

      initiator.close();
    });

    it('should allow messages with compatible labels', async () => {
      const channelLabel = agentLabel('system', 3);
      channelLabel.classification = 'confidential';

      const { initiator, responder } = createProtocolSessionPair(
        'task-delegation',
        'agent-a',
        'agent-b',
        channelLabel,
      );

      // Label with trust=2, class=internal CAN flow to trust=3, class=confidential.
      const compatibleLabel = createLabel('agent-a', 2, 'internal');

      const sP = initiator.send('request', 'Normal data', compatibleLabel);
      await responder.receive();
      await sP;

      expect(initiator.conversation.state).toBe('negotiating');
      initiator.close();
    });
  });

  describe('async iteration', () => {
    it('should iterate over inbound messages', async () => {
      const { initiator, responder } = createProtocolSessionPair(
        'task-delegation',
        'agent-a',
        'agent-b',
      );

      const label = agentLabel('agent-a');
      const labelB = agentLabel('agent-b');

      // Send all messages in sequence from one side.
      const sendAll = async () => {
        await initiator.send('request', 'Do task', label);
        // Wait briefly for responder to receive before sending next.
        await new Promise((r) => setTimeout(r, 10));
        await responder.send('accept', 'OK', labelB);
        await new Promise((r) => setTimeout(r, 10));
        await responder.send('confirm', 'Done', labelB);
      };

      const received: ProtocolMessage[] = [];
      const receiveAll = async () => {
        // Responder receives request, then initiator iterates rest.
        const req = await responder.receive();
        received.push(req);

        for await (const msg of initiator.messages()) {
          received.push(msg);
        }
      };

      await Promise.all([sendAll(), receiveAll()]);

      expect(received).toHaveLength(3);
      expect(received[0].type).toBe('request');
      expect(received[1].type).toBe('accept');
      expect(received[2].type).toBe('confirm');

      initiator.close();
    });

    it('should stop iterating when channel is closed', async () => {
      const { initiator, responder } = createProtocolSessionPair(
        'task-delegation',
        'agent-a',
        'agent-b',
      );

      const label = agentLabel('agent-a');

      // Send request then close.
      await initiator.send('request', 'Do task', label);
      await responder.receive();

      // Close channels while initiator is iterating.
      const received: ProtocolMessage[] = [];
      const iterPromise = (async () => {
        for await (const msg of initiator.messages()) {
          received.push(msg);
        }
      })();

      // Give the iterator time to start waiting.
      await new Promise((r) => setTimeout(r, 10));
      initiator.close();

      await iterPromise;
      expect(received).toHaveLength(0);
    });
  });

  describe('backpressure', () => {
    it('should handle backpressure with small buffer', async () => {
      const { initiator, responder } = createProtocolSessionPair(
        'task-delegation',
        'agent-a',
        'agent-b',
        undefined,
        1, // Buffer size of 1.
      );

      const label = agentLabel('agent-a');

      // Send request — should work (fills buffer of 1).
      const sendPromise = initiator.send('request', 'Do task', label);

      // Receive to drain buffer.
      const msg = await responder.receive();
      await sendPromise;

      expect(msg.type).toBe('request');
      expect(msg.content).toBe('Do task');

      initiator.close();
    });
  });

  describe('createProtocolSessionPair', () => {
    it('should create matched sessions with same conversation ID', () => {
      const { initiator, responder } = createProtocolSessionPair(
        'task-delegation',
        'agent-a',
        'agent-b',
      );

      expect(initiator.role).toBe('initiator');
      expect(responder.role).toBe('responder');
      expect(initiator.agentId).toBe('agent-a');
      expect(responder.agentId).toBe('agent-b');
      expect(initiator.channels.conversationId).toBe(responder.channels.conversationId);

      initiator.close();
    });

    it('should share the same underlying channels', async () => {
      const { initiator, responder } = createProtocolSessionPair(
        'task-delegation',
        'agent-a',
        'agent-b',
      );

      const label = agentLabel('agent-a');

      await initiator.send('request', 'Test', label);
      const msg = await responder.receive();

      expect(msg.content).toBe('Test');

      // Both sessions see the channel stats.
      expect(initiator.channels.toResponder.stats.sent).toBe(1);
      expect(responder.channels.toResponder.stats.received).toBe(1);

      initiator.close();
    });
  });

  describe('metadata propagation', () => {
    it('should preserve metadata through channels', async () => {
      const { initiator, responder } = createProtocolSessionPair(
        'task-delegation',
        'agent-a',
        'agent-b',
      );

      const label = agentLabel('agent-a');
      const metadata = { priority: 'high', taskId: 'task-42', tags: ['urgent'] };

      await initiator.send('request', 'Urgent task', label, metadata);
      const msg = await responder.receive();

      expect(msg.metadata).toEqual(metadata);

      initiator.close();
    });
  });

  describe('conversation state synchronization', () => {
    it('should maintain consistent state across both sessions', async () => {
      const { initiator, responder } = createProtocolSessionPair(
        'task-delegation',
        'agent-a',
        'agent-b',
      );

      const labelA = agentLabel('agent-a');
      const labelB = agentLabel('agent-b');

      expect(initiator.conversation.state).toBe('initiated');
      expect(responder.conversation.state).toBe('initiated');

      const rP = initiator.send('request', 'Do X', labelA);
      await responder.receive();
      await rP;

      expect(initiator.conversation.state).toBe('negotiating');
      expect(responder.conversation.state).toBe('negotiating');

      const aP = responder.send('accept', 'OK', labelB);
      await initiator.receive();
      await aP;

      expect(initiator.conversation.state).toBe('agreed');
      expect(responder.conversation.state).toBe('agreed');

      initiator.close();
    });

    it('should track message history on both sides', async () => {
      const { initiator, responder } = createProtocolSessionPair(
        'task-delegation',
        'agent-a',
        'agent-b',
      );

      const labelA = agentLabel('agent-a');
      const labelB = agentLabel('agent-b');

      const rP = initiator.send('request', 'Do X', labelA);
      await responder.receive();
      await rP;

      const aP = responder.send('accept', 'OK', labelB);
      await initiator.receive();
      await aP;

      expect(initiator.conversation.messages).toHaveLength(2);
      expect(responder.conversation.messages).toHaveLength(2);
      expect(initiator.conversation.messages[0].type).toBe('request');
      expect(initiator.conversation.messages[1].type).toBe('accept');

      initiator.close();
    });
  });
});
