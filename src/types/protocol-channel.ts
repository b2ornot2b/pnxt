/**
 * Protocol-Channel integration types.
 *
 * Binds NL protocol conversations to DPN channel transport, enabling
 * structured agent-to-agent communication over typed async FIFO channels
 * with backpressure and IFC enforcement.
 */

import type { SecurityLabel } from './ifc.js';
import type { ProtocolName, ProtocolMessage, ProtocolConversation } from './protocol.js';
import type { ReadableChannel, WritableChannel } from './channel.js';

/**
 * Configuration for creating a protocol-bound channel pair.
 */
export interface ProtocolChannelConfig {
  /** Unique conversation identifier. */
  conversationId: string;

  /** Which protocol governs this channel pair. */
  protocol: ProtocolName;

  /** Agent ID of the conversation initiator. */
  initiatorId: string;

  /** Agent ID of the responder. */
  responderId: string;

  /** Optional IFC security label for the channels. */
  label?: SecurityLabel;

  /** Buffer size for the underlying channels. Default: 8. */
  bufferSize?: number;
}

/**
 * A bidirectional protocol channel pair.
 *
 * Wraps two underlying Channel<ProtocolMessage> instances — one per direction.
 * The initiator writes to `toResponder` and reads from `toInitiator`.
 * The responder writes to `toInitiator` and reads from `toResponder`.
 */
export interface ProtocolChannelPair {
  /** Conversation identifier this channel pair serves. */
  conversationId: string;

  /** Protocol governing message transitions. */
  protocol: ProtocolName;

  /** Channel carrying messages from initiator to responder. */
  toResponder: ReadableChannel<ProtocolMessage> & WritableChannel<ProtocolMessage> & { readonly label?: SecurityLabel };

  /** Channel carrying messages from responder to initiator. */
  toInitiator: ReadableChannel<ProtocolMessage> & WritableChannel<ProtocolMessage> & { readonly label?: SecurityLabel };

  /** Close both channels. */
  close(): void;
}

/**
 * A protocol session binding a conversation state machine to a channel pair.
 * Provides role-specific send/receive with automatic transition validation.
 */
export interface ProtocolSession {
  /** The underlying conversation state. */
  readonly conversation: ProtocolConversation;

  /** The channel pair used for transport. */
  readonly channels: ProtocolChannelPair;

  /** Role of the local agent in this session. */
  readonly role: 'initiator' | 'responder';
}
