/**
 * Protocol-Channel Integration — NL protocol conversations over DPN channels.
 *
 * Binds protocol state machines to typed async FIFO channels, enabling
 * agent-to-agent conversations with backpressure, IFC enforcement, and
 * async iteration. Each session wraps a ProtocolConversation with a
 * bidirectional channel pair, validating transitions on every send.
 */

import type { ProtocolMessage, ProtocolName, ProtocolConversation } from '../types/protocol.js';
import type { ProtocolChannelConfig, ProtocolChannelPair } from '../types/protocol-channel.js';
import type { SecurityLabel } from '../types/ifc.js';
import { canFlowTo } from '../types/ifc.js';
import { Channel, ChannelClosedError } from '../channel/channel.js';
import {
  createConversation,
  sendMessage,
  isComplete,
  createMessage,
  ProtocolError,
} from './nl-protocol.js';

/**
 * Create a bidirectional protocol channel pair.
 *
 * Returns two channels — one per direction — for transporting protocol
 * messages between an initiator and a responder.
 */
export function createProtocolChannel(config: ProtocolChannelConfig): ProtocolChannelPair {
  const bufferSize = config.bufferSize ?? 8;

  const toResponder = new Channel<ProtocolMessage>({
    id: `${config.conversationId}-to-responder`,
    dataType: 'ProtocolMessage',
    bufferSize,
    label: config.label,
  });

  const toInitiator = new Channel<ProtocolMessage>({
    id: `${config.conversationId}-to-initiator`,
    dataType: 'ProtocolMessage',
    bufferSize,
    label: config.label,
  });

  return {
    conversationId: config.conversationId,
    protocol: config.protocol,
    toResponder,
    toInitiator,
    close() {
      toResponder.close();
      toInitiator.close();
    },
  };
}

/**
 * A protocol session that manages conversation state and channel transport.
 *
 * Provides role-specific send/receive with automatic transition validation
 * and IFC enforcement. Messages sent through a session are validated against
 * the protocol state machine before being written to the channel.
 */
export class ProtocolChannelSession {
  private _conversation: ProtocolConversation;
  readonly channels: ProtocolChannelPair;
  readonly role: 'initiator' | 'responder';
  readonly agentId: string;
  readonly peerId: string;

  constructor(
    protocol: ProtocolName,
    channels: ProtocolChannelPair,
    role: 'initiator' | 'responder',
    agentId: string,
    peerId: string,
  ) {
    this._conversation = createConversation(
      protocol,
      role === 'initiator' ? agentId : peerId,
      role === 'responder' ? agentId : peerId,
    );
    // Override the auto-generated conversation ID with the channel pair's ID.
    this._conversation = { ...this._conversation, id: channels.conversationId };
    this.channels = channels;
    this.role = role;
    this.agentId = agentId;
    this.peerId = peerId;
  }

  /** The current conversation state (read-only snapshot). */
  get conversation(): ProtocolConversation {
    return this._conversation;
  }

  /** The outbound channel for this role. */
  private get outbound(): Channel<ProtocolMessage> {
    return (this.role === 'initiator'
      ? this.channels.toResponder
      : this.channels.toInitiator) as Channel<ProtocolMessage>;
  }

  /** The inbound channel for this role. */
  private get inbound(): Channel<ProtocolMessage> {
    return (this.role === 'initiator'
      ? this.channels.toInitiator
      : this.channels.toResponder) as Channel<ProtocolMessage>;
  }

  /**
   * Send a protocol message.
   *
   * Validates the transition against the protocol state machine and
   * IFC label constraints, then writes the message to the outbound channel.
   *
   * @param type - Message type (must be a valid transition)
   * @param content - Natural language message content
   * @param label - IFC security label for the message
   * @param metadata - Optional metadata
   * @returns The sent message
   * @throws ProtocolError if the transition is invalid
   * @throws ProtocolError if IFC labels are incompatible
   */
  async send(
    type: ProtocolMessage['type'],
    content: string,
    label: SecurityLabel,
    metadata: Record<string, unknown> = {},
  ): Promise<ProtocolMessage> {
    // Check IFC: message label must be compatible with channel label.
    if (this.channels.toResponder.label) {
      const channelLabel = this.channels.toResponder.label;
      if (!canFlowTo(label, channelLabel)) {
        throw new ProtocolError(
          `IFC violation: message label (trust:${label.trustLevel}, ${label.classification}) ` +
          `cannot flow to channel label (trust:${channelLabel.trustLevel}, ${channelLabel.classification})`,
        );
      }
    }

    const message = createMessage(
      type,
      this.agentId,
      this.peerId,
      this.channels.conversationId,
      content,
      label,
      metadata,
    );

    // Validate transition via protocol state machine.
    this._conversation = sendMessage(this._conversation, message);

    // Write to outbound channel.
    await this.outbound.send(message);

    return message;
  }

  /**
   * Receive the next protocol message from the peer.
   *
   * Reads from the inbound channel and applies the message to the
   * conversation state machine. Blocks until a message is available.
   *
   * @returns The received message
   * @throws ProtocolError if the received message has an invalid transition
   * @throws ChannelClosedError if the channel is closed
   */
  async receive(): Promise<ProtocolMessage> {
    const message = await this.inbound.receive();

    // Apply to conversation state machine.
    this._conversation = sendMessage(this._conversation, message);

    return message;
  }

  /**
   * Async iterator over inbound messages with automatic state tracking.
   *
   * Yields messages until the conversation reaches a terminal state
   * or the channel is closed.
   */
  async *messages(): AsyncGenerator<ProtocolMessage, void, undefined> {
    while (!isComplete(this._conversation)) {
      try {
        const message = await this.receive();
        yield message;

        // Stop if conversation reached terminal state.
        if (isComplete(this._conversation)) {
          return;
        }
      } catch (e) {
        if (e instanceof ChannelClosedError) {
          return;
        }
        throw e;
      }
    }
  }

  /** Whether the conversation has reached a terminal state. */
  get isComplete(): boolean {
    return isComplete(this._conversation);
  }

  /** Close the underlying channel pair. */
  close(): void {
    this.channels.close();
  }
}

/**
 * Create a matched pair of protocol sessions — one for each participant.
 *
 * This is a convenience function for creating both ends of a protocol
 * conversation with shared channels.
 */
export function createProtocolSessionPair(
  protocol: ProtocolName,
  initiatorId: string,
  responderId: string,
  label?: SecurityLabel,
  bufferSize?: number,
): { initiator: ProtocolChannelSession; responder: ProtocolChannelSession } {
  const conversationId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const channels = createProtocolChannel({
    conversationId,
    protocol,
    initiatorId,
    responderId,
    label,
    bufferSize,
  });

  const initiator = new ProtocolChannelSession(
    protocol,
    channels,
    'initiator',
    initiatorId,
    responderId,
  );

  const responder = new ProtocolChannelSession(
    protocol,
    channels,
    'responder',
    responderId,
    initiatorId,
  );

  return { initiator, responder };
}
