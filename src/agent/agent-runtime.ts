/**
 * Agent Runtime — manages agent lifecycle and execution.
 *
 * Implements the runtime described in:
 * - docs/research/phase-3/06-implementation-reference-architecture.md
 */

import type { AgentConfig, AgentState } from '../types/agent.js';
import type { ChannelConfig } from '../types/channel.js';
import { Channel } from '../channel/channel.js';

export interface AgentInstance {
  config: AgentConfig;
  state: AgentState;
  createdAt: string;
  updatedAt: string;
  /** Named channels for inter-agent communication. */
  channels: Map<string, Channel<unknown>>;
}

export interface AgentRuntime {
  register(config: AgentConfig): Promise<AgentInstance>;

  getAgent(id: string): AgentInstance | undefined;

  listAgents(): AgentInstance[];

  transition(id: string, to: AgentState): Promise<void>;

  terminate(id: string): Promise<void>;

  /**
   * Create a typed channel between two agents.
   * Returns the channel, which is also stored on both agent instances.
   */
  createChannel<T>(
    channelName: string,
    fromAgentId: string,
    toAgentId: string,
    config?: Partial<ChannelConfig>,
  ): Channel<T>;
}

const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  created: ['initializing'],
  initializing: ['ready'],
  ready: ['active', 'terminated'],
  active: ['completing', 'suspended'],
  completing: ['terminated'],
  suspended: ['active', 'terminated'],
  terminated: [],
};

/**
 * In-memory Agent Runtime for prototyping and testing.
 */
export class InMemoryAgentRuntime implements AgentRuntime {
  private agents = new Map<string, AgentInstance>();

  async register(config: AgentConfig): Promise<AgentInstance> {
    if (this.agents.has(config.id)) {
      throw new Error(`Agent already registered: ${config.id}`);
    }

    const now = new Date().toISOString();
    const instance: AgentInstance = {
      config,
      state: 'created',
      createdAt: now,
      updatedAt: now,
      channels: new Map(),
    };

    this.agents.set(config.id, instance);
    return instance;
  }

  getAgent(id: string): AgentInstance | undefined {
    return this.agents.get(id);
  }

  listAgents(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  async transition(id: string, to: AgentState): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }

    const allowed = VALID_TRANSITIONS[agent.state];
    if (!allowed.includes(to)) {
      throw new Error(`Invalid transition: ${agent.state} → ${to}`);
    }

    agent.state = to;
    agent.updatedAt = new Date().toISOString();
  }

  async terminate(id: string): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }

    if (agent.state === 'terminated') {
      return;
    }

    const allowed = VALID_TRANSITIONS[agent.state];
    if (!allowed.includes('terminated')) {
      // Force-transition through completing first
      if (VALID_TRANSITIONS[agent.state].includes('completing')) {
        agent.state = 'completing';
      }
    }

    agent.state = 'terminated';
    agent.updatedAt = new Date().toISOString();

    // Close all channels on termination.
    for (const channel of agent.channels.values()) {
      channel.close();
    }
  }

  createChannel<T>(
    channelName: string,
    fromAgentId: string,
    toAgentId: string,
    config?: Partial<ChannelConfig>,
  ): Channel<T> {
    const fromAgent = this.agents.get(fromAgentId);
    const toAgent = this.agents.get(toAgentId);

    if (!fromAgent) throw new Error(`Agent not found: ${fromAgentId}`);
    if (!toAgent) throw new Error(`Agent not found: ${toAgentId}`);

    const channelId = config?.id ?? `ch_${fromAgentId}_${toAgentId}_${channelName}`;
    const channel = new Channel<T>({
      id: channelId,
      dataType: config?.dataType ?? 'unknown',
      bufferSize: config?.bufferSize ?? 16,
    });

    // Store on both agents under the channel name.
    fromAgent.channels.set(channelName, channel as Channel<unknown>);
    toAgent.channels.set(channelName, channel as Channel<unknown>);

    return channel;
  }
}
