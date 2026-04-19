/**
 * Natural Language Protocol — formalized agent-to-agent communication.
 *
 * Defines protocol state machines for structured conversations between agents.
 * Each protocol specifies valid message transitions, ensuring conversations
 * follow predictable patterns. Messages carry IFC labels for information
 * flow control and can be transported over DPN channels.
 *
 * Three built-in protocols:
 * - task-delegation: request → [accept|reject] → confirm
 * - capability-negotiation: query → inform → propose → [accept|reject]
 * - conflict-resolution: inform → propose → [accept|reject|escalate]
 */

import type {
  ProtocolName,
  ProtocolState,
  ProtocolMessage,
  ProtocolMessageType,
  ProtocolConversation,
  ProtocolTransition,
} from '../types/protocol.js';
import type { SecurityLabel } from '../types/ifc.js';
import { canFlowTo } from '../types/ifc.js';

/**
 * Protocol transition definitions.
 */
const PROTOCOL_TRANSITIONS: Record<ProtocolName, ProtocolTransition[]> = {
  'task-delegation': [
    { from: 'initiated', messageType: 'request', to: 'negotiating', sender: 'initiator' },
    { from: 'negotiating', messageType: 'accept', to: 'agreed', sender: 'responder' },
    { from: 'negotiating', messageType: 'reject', to: 'failed', sender: 'responder' },
    { from: 'agreed', messageType: 'confirm', to: 'completed', sender: 'responder' },
    { from: 'agreed', messageType: 'delegate', to: 'executing', sender: 'responder' },
    { from: 'executing', messageType: 'confirm', to: 'completed', sender: 'responder' },
  ],
  'capability-negotiation': [
    { from: 'initiated', messageType: 'query', to: 'negotiating', sender: 'initiator' },
    { from: 'negotiating', messageType: 'inform', to: 'negotiating', sender: 'responder' },
    { from: 'negotiating', messageType: 'propose', to: 'negotiating', sender: 'initiator' },
    { from: 'negotiating', messageType: 'accept', to: 'agreed', sender: 'responder' },
    { from: 'negotiating', messageType: 'reject', to: 'failed', sender: 'responder' },
    { from: 'agreed', messageType: 'confirm', to: 'completed', sender: 'initiator' },
  ],
  'conflict-resolution': [
    { from: 'initiated', messageType: 'inform', to: 'negotiating', sender: 'initiator' },
    { from: 'negotiating', messageType: 'inform', to: 'negotiating', sender: 'responder' },
    { from: 'negotiating', messageType: 'propose', to: 'negotiating', sender: 'initiator' },
    { from: 'negotiating', messageType: 'propose', to: 'negotiating', sender: 'responder' },
    { from: 'negotiating', messageType: 'accept', to: 'agreed', sender: 'responder' },
    { from: 'negotiating', messageType: 'accept', to: 'agreed', sender: 'initiator' },
    { from: 'negotiating', messageType: 'reject', to: 'failed', sender: 'responder' },
    { from: 'negotiating', messageType: 'reject', to: 'failed', sender: 'initiator' },
    { from: 'negotiating', messageType: 'escalate', to: 'failed', sender: 'initiator' },
    { from: 'negotiating', messageType: 'escalate', to: 'failed', sender: 'responder' },
    { from: 'agreed', messageType: 'confirm', to: 'completed', sender: 'initiator' },
    { from: 'agreed', messageType: 'confirm', to: 'completed', sender: 'responder' },
  ],
  // Sprint 17 / M6 — Human-in-the-Loop approval.
  //   initiator = agent requesting approval (also acts as "system" for timeouts)
  //   responder = the human operator
  'human-approval': [
    { from: 'initiated', messageType: 'request', to: 'awaiting_human', sender: 'initiator' },
    { from: 'awaiting_human', messageType: 'accept', to: 'completed', sender: 'responder' },
    { from: 'awaiting_human', messageType: 'reject', to: 'rejected', sender: 'responder' },
    { from: 'awaiting_human', messageType: 'propose', to: 'awaiting_human', sender: 'responder' },
    { from: 'awaiting_human', messageType: 'inform', to: 'timed_out', sender: 'initiator' },
  ],
};

/**
 * Terminal states per protocol. Shared terminals (`completed`, `failed`) apply
 * to every protocol; `human-approval` adds `rejected` and `timed_out` as
 * additional terminals. Refactored from a flat array in Sprint 17 so
 * human-approval-specific terminals do not bleed into the other three
 * protocols' semantics.
 */
const SHARED_TERMINAL_STATES: ProtocolState[] = ['completed', 'failed'];

const TERMINAL_STATES_BY_PROTOCOL: Record<ProtocolName, ProtocolState[]> = {
  'task-delegation': SHARED_TERMINAL_STATES,
  'capability-negotiation': SHARED_TERMINAL_STATES,
  'conflict-resolution': SHARED_TERMINAL_STATES,
  'human-approval': [...SHARED_TERMINAL_STATES, 'rejected', 'timed_out'],
};

function isTerminalState(protocol: ProtocolName, state: ProtocolState): boolean {
  return TERMINAL_STATES_BY_PROTOCOL[protocol].includes(state);
}

/**
 * Create a new protocol conversation.
 *
 * @param protocol - Which protocol to use
 * @param initiator - Agent ID of the conversation initiator
 * @param responder - Agent ID of the responder
 * @returns A new conversation in 'initiated' state
 */
export function createConversation(
  protocol: ProtocolName,
  initiator: string,
  responder: string,
): ProtocolConversation {
  return {
    id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    protocol,
    state: 'initiated',
    participants: [initiator, responder],
    messages: [],
    startedAt: new Date().toISOString(),
  };
}

/**
 * Send a message in a protocol conversation.
 *
 * Validates that:
 * 1. The transition is legal for the current state and protocol
 * 2. The sender is a participant
 * 3. The sender has the correct role for this transition
 * 4. IFC labels allow the message flow
 *
 * @returns Updated conversation with the new message appended
 * @throws Error if the transition is invalid
 */
export function sendMessage(
  conversation: ProtocolConversation,
  message: ProtocolMessage,
): ProtocolConversation {
  // Check conversation is not in a terminal state.
  if (isComplete(conversation)) {
    throw new ProtocolError(
      `Conversation ${conversation.id} is in terminal state "${conversation.state}"`,
    );
  }

  // Validate sender is a participant.
  if (!conversation.participants.includes(message.from)) {
    throw new ProtocolError(
      `Agent "${message.from}" is not a participant in conversation ${conversation.id}`,
    );
  }

  // Validate conversation ID matches.
  if (message.conversationId !== conversation.id) {
    throw new ProtocolError(
      `Message conversation ID "${message.conversationId}" does not match conversation "${conversation.id}"`,
    );
  }

  // Determine sender role.
  const senderRole = message.from === conversation.participants[0] ? 'initiator' : 'responder';

  // Find valid transition.
  const transitions = PROTOCOL_TRANSITIONS[conversation.protocol];
  const validTransition = transitions.find(
    (t) =>
      t.from === conversation.state &&
      t.messageType === message.type &&
      t.sender === senderRole,
  );

  if (!validTransition) {
    throw new ProtocolError(
      `Invalid transition: ${senderRole} cannot send "${message.type}" in state "${conversation.state}" (protocol: ${conversation.protocol})`,
    );
  }

  // Check IFC: message label must be compatible with existing conversation labels.
  if (conversation.messages.length > 0) {
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    if (message.label && lastMessage.label) {
      // The new message must be able to receive data from previous messages.
      // We check bidirectionally: the conversation context flows both ways.
      if (!canFlowTo(lastMessage.label, message.label) && !canFlowTo(message.label, lastMessage.label)) {
        throw new ProtocolError(
          `IFC violation: message label (trust:${message.label.trustLevel}, ${message.label.classification}) ` +
          `is incompatible with conversation context (trust:${lastMessage.label.trustLevel}, ${lastMessage.label.classification})`,
        );
      }
    }
  }

  // Apply transition.
  const newState = validTransition.to;
  const isTerminal = isTerminalState(conversation.protocol, newState);

  return {
    ...conversation,
    state: newState,
    messages: [...conversation.messages, message],
    completedAt: isTerminal ? new Date().toISOString() : conversation.completedAt,
  };
}

/**
 * Get the valid message types that can be sent in the current state.
 *
 * @param conversation - The current conversation
 * @param senderRole - Optional: filter by sender role ('initiator' or 'responder')
 * @returns Array of valid message types
 */
export function getValidTransitions(
  conversation: ProtocolConversation,
  senderRole?: 'initiator' | 'responder',
): ProtocolMessageType[] {
  if (isComplete(conversation)) {
    return [];
  }

  const transitions = PROTOCOL_TRANSITIONS[conversation.protocol];
  const valid = transitions.filter(
    (t) => t.from === conversation.state && (!senderRole || t.sender === senderRole),
  );

  // Deduplicate message types.
  return [...new Set(valid.map((t) => t.messageType))];
}

/**
 * Check if a conversation is in a terminal state. Terminality is per-protocol:
 * `human-approval` extends the shared {completed, failed} with `rejected` and
 * `timed_out`.
 */
export function isComplete(conversation: ProtocolConversation): boolean {
  return isTerminalState(conversation.protocol, conversation.state);
}

/**
 * Get the protocol transition definitions for a given protocol.
 */
export function getProtocolDefinition(protocol: ProtocolName): ProtocolTransition[] {
  return PROTOCOL_TRANSITIONS[protocol];
}

/**
 * Create a protocol message.
 */
export function createMessage(
  type: ProtocolMessageType,
  from: string,
  to: string,
  conversationId: string,
  content: string,
  label: SecurityLabel,
  metadata: Record<string, unknown> = {},
  inReplyTo?: string,
): ProtocolMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    from,
    to,
    conversationId,
    content,
    metadata,
    label,
    timestamp: new Date().toISOString(),
    inReplyTo,
  };
}

/**
 * Protocol-specific error.
 */
export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}
