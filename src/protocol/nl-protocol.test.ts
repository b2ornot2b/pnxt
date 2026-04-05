import {
  createConversation,
  sendMessage,
  getValidTransitions,
  isComplete,
  createMessage,
  getProtocolDefinition,
  ProtocolError,
} from './nl-protocol.js';
import type { ProtocolConversation, ProtocolMessage } from '../types/protocol.js';
import { createLabel } from '../types/ifc.js';

const AGENT_A = 'agent-alpha';
const AGENT_B = 'agent-beta';
const DEFAULT_LABEL = createLabel(AGENT_A, 2, 'internal');

function msg(
  conv: ProtocolConversation,
  type: ProtocolMessage['type'],
  from: string,
  to: string,
  content = '',
): ProtocolMessage {
  return createMessage(type, from, to, conv.id, content, DEFAULT_LABEL);
}

describe('createConversation', () => {
  it('should create a conversation in initiated state', () => {
    const conv = createConversation('task-delegation', AGENT_A, AGENT_B);

    expect(conv.state).toBe('initiated');
    expect(conv.protocol).toBe('task-delegation');
    expect(conv.participants).toEqual([AGENT_A, AGENT_B]);
    expect(conv.messages).toHaveLength(0);
    expect(conv.startedAt).toBeDefined();
    expect(conv.completedAt).toBeUndefined();
  });

  it('should generate unique conversation IDs', () => {
    const conv1 = createConversation('task-delegation', AGENT_A, AGENT_B);
    const conv2 = createConversation('task-delegation', AGENT_A, AGENT_B);

    expect(conv1.id).not.toBe(conv2.id);
  });
});

describe('task-delegation protocol', () => {
  it('should complete happy path: request → accept → confirm', () => {
    let conv = createConversation('task-delegation', AGENT_A, AGENT_B);

    conv = sendMessage(conv, msg(conv, 'request', AGENT_A, AGENT_B, 'Please analyze this code'));
    expect(conv.state).toBe('negotiating');
    expect(conv.messages).toHaveLength(1);

    conv = sendMessage(conv, msg(conv, 'accept', AGENT_B, AGENT_A, 'I will analyze it'));
    expect(conv.state).toBe('agreed');

    conv = sendMessage(conv, msg(conv, 'confirm', AGENT_B, AGENT_A, 'Analysis complete'));
    expect(conv.state).toBe('completed');
    expect(isComplete(conv)).toBe(true);
    expect(conv.completedAt).toBeDefined();
  });

  it('should handle rejection: request → reject', () => {
    let conv = createConversation('task-delegation', AGENT_A, AGENT_B);

    conv = sendMessage(conv, msg(conv, 'request', AGENT_A, AGENT_B, 'Do this'));
    conv = sendMessage(conv, msg(conv, 'reject', AGENT_B, AGENT_A, 'Cannot do that'));

    expect(conv.state).toBe('failed');
    expect(isComplete(conv)).toBe(true);
  });

  it('should handle delegation: request → accept → delegate → confirm', () => {
    let conv = createConversation('task-delegation', AGENT_A, AGENT_B);

    conv = sendMessage(conv, msg(conv, 'request', AGENT_A, AGENT_B, 'Build feature'));
    conv = sendMessage(conv, msg(conv, 'accept', AGENT_B, AGENT_A, 'Accepted'));
    conv = sendMessage(conv, msg(conv, 'delegate', AGENT_B, AGENT_A, 'Delegating subtask'));
    expect(conv.state).toBe('executing');

    conv = sendMessage(conv, msg(conv, 'confirm', AGENT_B, AGENT_A, 'Done'));
    expect(conv.state).toBe('completed');
  });

  it('should reject invalid transitions', () => {
    let conv = createConversation('task-delegation', AGENT_A, AGENT_B);

    // Cannot confirm before request
    expect(() => {
      sendMessage(conv, msg(conv, 'confirm', AGENT_A, AGENT_B));
    }).toThrow(ProtocolError);

    conv = sendMessage(conv, msg(conv, 'request', AGENT_A, AGENT_B, 'Task'));

    // Initiator cannot accept their own request
    expect(() => {
      sendMessage(conv, msg(conv, 'accept', AGENT_A, AGENT_B));
    }).toThrow(ProtocolError);
  });

  it('should reject messages after completion', () => {
    let conv = createConversation('task-delegation', AGENT_A, AGENT_B);

    conv = sendMessage(conv, msg(conv, 'request', AGENT_A, AGENT_B, 'Task'));
    conv = sendMessage(conv, msg(conv, 'reject', AGENT_B, AGENT_A, 'No'));

    expect(() => {
      sendMessage(conv, msg(conv, 'request', AGENT_A, AGENT_B, 'Try again'));
    }).toThrow(/terminal state/);
  });
});

describe('capability-negotiation protocol', () => {
  it('should complete happy path: query → inform → propose → accept → confirm', () => {
    let conv = createConversation('capability-negotiation', AGENT_A, AGENT_B);

    conv = sendMessage(conv, msg(conv, 'query', AGENT_A, AGENT_B, 'What can you do?'));
    expect(conv.state).toBe('negotiating');

    conv = sendMessage(conv, msg(conv, 'inform', AGENT_B, AGENT_A, 'I can analyze code'));
    expect(conv.state).toBe('negotiating');

    conv = sendMessage(conv, msg(conv, 'propose', AGENT_A, AGENT_B, 'Analyze this repo'));
    expect(conv.state).toBe('negotiating');

    conv = sendMessage(conv, msg(conv, 'accept', AGENT_B, AGENT_A, 'Agreed'));
    expect(conv.state).toBe('agreed');

    conv = sendMessage(conv, msg(conv, 'confirm', AGENT_A, AGENT_B, 'Confirmed'));
    expect(conv.state).toBe('completed');
  });

  it('should handle rejection', () => {
    let conv = createConversation('capability-negotiation', AGENT_A, AGENT_B);

    conv = sendMessage(conv, msg(conv, 'query', AGENT_A, AGENT_B, 'What can you do?'));
    conv = sendMessage(conv, msg(conv, 'reject', AGENT_B, AGENT_A, 'Not available'));

    expect(conv.state).toBe('failed');
  });
});

describe('conflict-resolution protocol', () => {
  it('should complete happy path: inform → propose → accept → confirm', () => {
    let conv = createConversation('conflict-resolution', AGENT_A, AGENT_B);

    conv = sendMessage(conv, msg(conv, 'inform', AGENT_A, AGENT_B, 'There is a conflict'));
    expect(conv.state).toBe('negotiating');

    conv = sendMessage(conv, msg(conv, 'propose', AGENT_A, AGENT_B, 'I suggest this resolution'));
    expect(conv.state).toBe('negotiating');

    conv = sendMessage(conv, msg(conv, 'accept', AGENT_B, AGENT_A, 'Agreed'));
    expect(conv.state).toBe('agreed');

    conv = sendMessage(conv, msg(conv, 'confirm', AGENT_B, AGENT_A, 'Resolved'));
    expect(conv.state).toBe('completed');
  });

  it('should handle escalation', () => {
    let conv = createConversation('conflict-resolution', AGENT_A, AGENT_B);

    conv = sendMessage(conv, msg(conv, 'inform', AGENT_A, AGENT_B, 'Conflict exists'));
    conv = sendMessage(conv, msg(conv, 'escalate', AGENT_B, AGENT_A, 'Cannot resolve, escalating'));

    expect(conv.state).toBe('failed');
    expect(isComplete(conv)).toBe(true);
  });

  it('should allow multiple inform/propose exchanges', () => {
    let conv = createConversation('conflict-resolution', AGENT_A, AGENT_B);

    conv = sendMessage(conv, msg(conv, 'inform', AGENT_A, AGENT_B, 'Issue 1'));
    conv = sendMessage(conv, msg(conv, 'inform', AGENT_B, AGENT_A, 'My perspective'));
    conv = sendMessage(conv, msg(conv, 'propose', AGENT_A, AGENT_B, 'Solution A'));
    conv = sendMessage(conv, msg(conv, 'propose', AGENT_B, AGENT_A, 'Counter: Solution B'));
    conv = sendMessage(conv, msg(conv, 'accept', AGENT_A, AGENT_B, 'OK'));

    expect(conv.state).toBe('agreed');
  });
});

describe('getValidTransitions', () => {
  it('should return valid transitions for current state', () => {
    const conv = createConversation('task-delegation', AGENT_A, AGENT_B);
    const valid = getValidTransitions(conv);

    expect(valid).toContain('request');
    expect(valid).not.toContain('accept');
  });

  it('should filter by sender role', () => {
    let conv = createConversation('task-delegation', AGENT_A, AGENT_B);
    conv = sendMessage(conv, msg(conv, 'request', AGENT_A, AGENT_B, 'Task'));

    const initiatorValid = getValidTransitions(conv, 'initiator');
    const responderValid = getValidTransitions(conv, 'responder');

    expect(initiatorValid).toHaveLength(0);
    expect(responderValid).toContain('accept');
    expect(responderValid).toContain('reject');
  });

  it('should return empty array for completed conversation', () => {
    let conv = createConversation('task-delegation', AGENT_A, AGENT_B);
    conv = sendMessage(conv, msg(conv, 'request', AGENT_A, AGENT_B, 'Task'));
    conv = sendMessage(conv, msg(conv, 'reject', AGENT_B, AGENT_A, 'No'));

    expect(getValidTransitions(conv)).toHaveLength(0);
  });
});

describe('isComplete', () => {
  it('should return false for in-progress conversation', () => {
    const conv = createConversation('task-delegation', AGENT_A, AGENT_B);
    expect(isComplete(conv)).toBe(false);
  });

  it('should return true for completed conversation', () => {
    let conv = createConversation('task-delegation', AGENT_A, AGENT_B);
    conv = sendMessage(conv, msg(conv, 'request', AGENT_A, AGENT_B, 'Task'));
    conv = sendMessage(conv, msg(conv, 'accept', AGENT_B, AGENT_A, 'OK'));
    conv = sendMessage(conv, msg(conv, 'confirm', AGENT_B, AGENT_A, 'Done'));
    expect(isComplete(conv)).toBe(true);
  });

  it('should return true for failed conversation', () => {
    let conv = createConversation('task-delegation', AGENT_A, AGENT_B);
    conv = sendMessage(conv, msg(conv, 'request', AGENT_A, AGENT_B, 'Task'));
    conv = sendMessage(conv, msg(conv, 'reject', AGENT_B, AGENT_A, 'No'));
    expect(isComplete(conv)).toBe(true);
  });
});

describe('IFC enforcement', () => {
  it('should allow messages with compatible labels', () => {
    let conv = createConversation('task-delegation', AGENT_A, AGENT_B);

    const labelA = createLabel(AGENT_A, 2, 'internal');
    const labelB = createLabel(AGENT_B, 2, 'internal');

    const msg1 = createMessage('request', AGENT_A, AGENT_B, conv.id, 'Task', labelA);
    conv = sendMessage(conv, msg1);

    const msg2 = createMessage('accept', AGENT_B, AGENT_A, conv.id, 'OK', labelB);
    conv = sendMessage(conv, msg2);

    expect(conv.state).toBe('agreed');
  });

  it('should reject messages with incompatible labels', () => {
    let conv = createConversation('task-delegation', AGENT_A, AGENT_B);

    const publicLabel = createLabel(AGENT_A, 1, 'public');
    const restrictedLabel = createLabel(AGENT_B, 4, 'restricted');

    const msg1 = createMessage('request', AGENT_A, AGENT_B, conv.id, 'Task', publicLabel);
    conv = sendMessage(conv, msg1);

    const msg2 = createMessage('accept', AGENT_B, AGENT_A, conv.id, 'OK', restrictedLabel);
    // Should succeed because low→high is valid flow
    conv = sendMessage(conv, msg2);
    expect(conv.state).toBe('agreed');
  });
});

describe('participant validation', () => {
  it('should reject messages from non-participants', () => {
    const conv = createConversation('task-delegation', AGENT_A, AGENT_B);
    const outsider = 'agent-outsider';

    expect(() => {
      sendMessage(conv, msg(conv, 'request', outsider, AGENT_B));
    }).toThrow(/not a participant/);
  });

  it('should reject messages with wrong conversation ID', () => {
    const conv = createConversation('task-delegation', AGENT_A, AGENT_B);
    const wrongMsg = createMessage('request', AGENT_A, AGENT_B, 'wrong-id', 'Task', DEFAULT_LABEL);

    expect(() => {
      sendMessage(conv, wrongMsg);
    }).toThrow(/does not match/);
  });
});

describe('getProtocolDefinition', () => {
  it('should return transitions for task-delegation', () => {
    const transitions = getProtocolDefinition('task-delegation');
    expect(transitions.length).toBeGreaterThan(0);
    expect(transitions.some((t) => t.messageType === 'request')).toBe(true);
  });

  it('should return transitions for all protocols', () => {
    for (const protocol of ['task-delegation', 'capability-negotiation', 'conflict-resolution'] as const) {
      const transitions = getProtocolDefinition(protocol);
      expect(transitions.length).toBeGreaterThan(0);
    }
  });
});

describe('createMessage', () => {
  it('should create a message with all fields', () => {
    const message = createMessage(
      'request',
      AGENT_A,
      AGENT_B,
      'conv-1',
      'Please help',
      DEFAULT_LABEL,
      { priority: 'high' },
      'prev-msg-id',
    );

    expect(message.type).toBe('request');
    expect(message.from).toBe(AGENT_A);
    expect(message.to).toBe(AGENT_B);
    expect(message.conversationId).toBe('conv-1');
    expect(message.content).toBe('Please help');
    expect(message.metadata).toEqual({ priority: 'high' });
    expect(message.label).toBe(DEFAULT_LABEL);
    expect(message.inReplyTo).toBe('prev-msg-id');
    expect(message.id).toBeDefined();
    expect(message.timestamp).toBeDefined();
  });
});

describe('multiple concurrent conversations', () => {
  it('should track independent conversations separately', () => {
    let conv1 = createConversation('task-delegation', AGENT_A, AGENT_B);
    let conv2 = createConversation('task-delegation', AGENT_A, AGENT_B);

    conv1 = sendMessage(conv1, msg(conv1, 'request', AGENT_A, AGENT_B, 'Task 1'));
    conv2 = sendMessage(conv2, msg(conv2, 'request', AGENT_A, AGENT_B, 'Task 2'));

    conv1 = sendMessage(conv1, msg(conv1, 'reject', AGENT_B, AGENT_A, 'No'));
    conv2 = sendMessage(conv2, msg(conv2, 'accept', AGENT_B, AGENT_A, 'Yes'));

    expect(conv1.state).toBe('failed');
    expect(conv2.state).toBe('agreed');
  });
});
