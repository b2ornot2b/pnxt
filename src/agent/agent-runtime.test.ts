import { InMemoryAgentRuntime } from './agent-runtime.js';
import type { AgentConfig } from '../types/agent.js';

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    type: 'coding',
    behavior: {
      uncertainty_response: 'ask',
      instructions: 'You are a test agent.',
    },
    capabilities: {
      tools: ['file.read', 'file.write'],
      concurrency: 1,
      token_budget: 10000,
      time_budget: 300,
    },
    memory: {
      preload_topics: [],
      working_memory_limit: 1000,
      persist_sessions: false,
    },
    trust_level: 2,
    ...overrides,
  };
}

describe('InMemoryAgentRuntime', () => {
  let runtime: InMemoryAgentRuntime;

  beforeEach(() => {
    runtime = new InMemoryAgentRuntime();
  });

  describe('register', () => {
    it('should register an agent in created state', async () => {
      const instance = await runtime.register(makeConfig());
      expect(instance.state).toBe('created');
      expect(instance.config.id).toBe('agent-1');
    });

    it('should throw on duplicate id', async () => {
      await runtime.register(makeConfig());
      await expect(runtime.register(makeConfig())).rejects.toThrow('Agent already registered');
    });
  });

  describe('getAgent', () => {
    it('should return registered agent', async () => {
      await runtime.register(makeConfig());
      expect(runtime.getAgent('agent-1')).toBeDefined();
    });

    it('should return undefined for unknown id', () => {
      expect(runtime.getAgent('nonexistent')).toBeUndefined();
    });
  });

  describe('listAgents', () => {
    it('should list all agents', async () => {
      await runtime.register(makeConfig({ id: 'a' }));
      await runtime.register(makeConfig({ id: 'b' }));
      expect(runtime.listAgents().length).toBe(2);
    });
  });

  describe('transition', () => {
    it('should follow valid lifecycle transitions', async () => {
      await runtime.register(makeConfig());

      await runtime.transition('agent-1', 'initializing');
      expect(runtime.getAgent('agent-1')?.state).toBe('initializing');

      await runtime.transition('agent-1', 'ready');
      expect(runtime.getAgent('agent-1')?.state).toBe('ready');

      await runtime.transition('agent-1', 'active');
      expect(runtime.getAgent('agent-1')?.state).toBe('active');

      await runtime.transition('agent-1', 'completing');
      expect(runtime.getAgent('agent-1')?.state).toBe('completing');

      await runtime.transition('agent-1', 'terminated');
      expect(runtime.getAgent('agent-1')?.state).toBe('terminated');
    });

    it('should reject invalid transitions', async () => {
      await runtime.register(makeConfig());
      await expect(runtime.transition('agent-1', 'active')).rejects.toThrow(
        'Invalid transition: created → active',
      );
    });

    it('should throw for unknown agent', async () => {
      await expect(runtime.transition('nonexistent', 'ready')).rejects.toThrow('Agent not found');
    });
  });

  describe('terminate', () => {
    it('should terminate an active agent', async () => {
      await runtime.register(makeConfig());
      await runtime.transition('agent-1', 'initializing');
      await runtime.transition('agent-1', 'ready');
      await runtime.transition('agent-1', 'active');

      await runtime.terminate('agent-1');
      expect(runtime.getAgent('agent-1')?.state).toBe('terminated');
    });

    it('should be idempotent for already terminated agents', async () => {
      await runtime.register(makeConfig());
      await runtime.transition('agent-1', 'initializing');
      await runtime.transition('agent-1', 'ready');
      await runtime.terminate('agent-1');
      await runtime.terminate('agent-1');
      expect(runtime.getAgent('agent-1')?.state).toBe('terminated');
    });

    it('should throw for unknown agent', async () => {
      await expect(runtime.terminate('nonexistent')).rejects.toThrow('Agent not found');
    });
  });
});
