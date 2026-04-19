/**
 * Natural Language Protocol types.
 *
 * Defines formalized agent-to-agent communication patterns over DPN channels.
 * Each protocol is a state machine with typed message transitions, enabling
 * structured negotiation, delegation, and coordination.
 */

import type { SecurityLabel } from './ifc.js';

/**
 * Types of messages in a protocol conversation.
 */
export type ProtocolMessageType =
  | 'request'    // Ask another agent to do something
  | 'propose'    // Suggest a plan or approach
  | 'accept'     // Agree to a proposal/request
  | 'reject'     // Decline with reason
  | 'inform'     // Share information
  | 'delegate'   // Transfer responsibility
  | 'confirm'    // Acknowledge completion
  | 'query'      // Ask for information
  | 'escalate';  // Raise to higher trust level

/**
 * A message in a protocol conversation.
 */
export interface ProtocolMessage {
  /** Unique message identifier. */
  id: string;

  /** Message type (determines valid transitions). */
  type: ProtocolMessageType;

  /** Sender agent ID. */
  from: string;

  /** Receiver agent ID. */
  to: string;

  /** Conversation this message belongs to. */
  conversationId: string;

  /** Natural language content. */
  content: string;

  /** Arbitrary metadata (e.g., task parameters, capability descriptors). */
  metadata: Record<string, unknown>;

  /** IFC security label for information flow control. */
  label: SecurityLabel;

  /** When this message was created (ISO 8601). */
  timestamp: string;

  /** ID of the message this replies to. */
  inReplyTo?: string;
}

/**
 * Named protocol definitions.
 */
export type ProtocolName =
  | 'task-delegation'
  | 'capability-negotiation'
  | 'conflict-resolution'
  | 'human-approval';   // Sprint 17 / M6

/**
 * State of a protocol conversation.
 *
 * The last three states (awaiting_human, rejected, timed_out) are terminal
 * only for `human-approval`; see TERMINAL_STATES_BY_PROTOCOL in
 * src/protocol/nl-protocol.ts.
 */
export type ProtocolState =
  | 'initiated'
  | 'negotiating'
  | 'agreed'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'awaiting_human'
  | 'rejected'
  | 'timed_out';

/**
 * A protocol conversation between agents.
 */
export interface ProtocolConversation {
  /** Unique conversation identifier. */
  id: string;

  /** Which protocol governs this conversation. */
  protocol: ProtocolName;

  /** Current conversation state. */
  state: ProtocolState;

  /** Agent IDs participating in this conversation. */
  participants: string[];

  /** Ordered list of messages exchanged. */
  messages: ProtocolMessage[];

  /** When the conversation started (ISO 8601). */
  startedAt: string;

  /** When the conversation completed (ISO 8601). */
  completedAt?: string;
}

/**
 * A transition rule in the protocol state machine.
 */
export interface ProtocolTransition {
  /** Current state. */
  from: ProtocolState;

  /** Message type that triggers the transition. */
  messageType: ProtocolMessageType;

  /** Next state. */
  to: ProtocolState;

  /** Which participant role can send this message ('initiator' or 'responder'). */
  sender: 'initiator' | 'responder';
}
