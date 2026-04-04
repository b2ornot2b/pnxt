import { InMemoryACIGateway, InMemoryAuditLogger } from './aci-gateway.js';
import type { TrustResolver } from './aci-gateway.js';
import type { ToolRegistration, ToolInvocation } from '../types/aci.js';
import type { TrustLevel } from '../types/agent.js';

function makeRegistration(overrides: Partial<ToolRegistration> = {}): ToolRegistration {
  return {
    name: 'test.echo',
    description: 'Echoes input back',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    sideEffects: ['none'],
    ops: {
      timeout: 5000,
      retryable: false,
      idempotent: true,
      costCategory: 'cheap',
    },
    ...overrides,
  };
}

function makeInvocation(overrides: Partial<ToolInvocation> = {}): ToolInvocation {
  return {
    toolName: 'test.echo',
    input: { message: 'hello' },
    agentId: 'agent-1',
    requestId: 'req-1',
    ...overrides,
  };
}

describe('InMemoryACIGateway', () => {
  let gateway: InMemoryACIGateway;

  beforeEach(() => {
    gateway = new InMemoryACIGateway();
  });

  describe('registerTool', () => {
    it('should register a tool', () => {
      gateway.registerTool(makeRegistration(), async (input) => input);
      expect(gateway.hasTool('test.echo')).toBe(true);
    });

    it('should throw on duplicate registration', () => {
      gateway.registerTool(makeRegistration(), async (input) => input);
      expect(() => gateway.registerTool(makeRegistration(), async (input) => input)).toThrow(
        'Tool already registered',
      );
    });
  });

  describe('listTools', () => {
    it('should list all registered tools', () => {
      gateway.registerTool(makeRegistration({ name: 'tool.a' }), async () => null);
      gateway.registerTool(makeRegistration({ name: 'tool.b' }), async () => null);

      const tools = gateway.listTools();
      expect(tools.map((t) => t.name)).toEqual(['tool.a', 'tool.b']);
    });
  });

  describe('invoke', () => {
    it('should invoke a registered tool and return result', async () => {
      gateway.registerTool(makeRegistration(), async (input) => ({ echoed: input }));

      const result = await gateway.invoke(makeInvocation());

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ echoed: { message: 'hello' } });
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should return error for unknown tool', async () => {
      const result = await gateway.invoke(makeInvocation({ toolName: 'unknown' }));

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TOOL_NOT_FOUND');
    });

    it('should handle tool execution errors', async () => {
      gateway.registerTool(
        makeRegistration({
          ops: { timeout: 5000, retryable: true, idempotent: false, costCategory: 'moderate' },
        }),
        async () => {
          throw new Error('Something went wrong');
        },
      );

      const result = await gateway.invoke(makeInvocation());

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Something went wrong');
      expect(result.error?.retryable).toBe(true);
    });

    it('should timeout long-running tools', async () => {
      gateway.registerTool(
        makeRegistration({
          ops: { timeout: 50, retryable: false, idempotent: false, costCategory: 'expensive' },
        }),
        async () => new Promise((resolve) => setTimeout(resolve, 200)),
      );

      const result = await gateway.invoke(makeInvocation());

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timed out');
    }, 10000);
  });

  describe('trust checking', () => {
    let trustLevels: Map<string, TrustLevel>;
    let trustResolver: TrustResolver;
    let auditLogger: InMemoryAuditLogger;

    beforeEach(() => {
      trustLevels = new Map<string, TrustLevel>();
      trustResolver = (agentId: string) => trustLevels.get(agentId);
      auditLogger = new InMemoryAuditLogger();
      gateway = new InMemoryACIGateway({ trustResolver, auditLogger });
    });

    it('should allow invocation when agent trust meets requirement', async () => {
      trustLevels.set('agent-1', 2);
      gateway.registerTool(
        makeRegistration({ sideEffects: ['git'] }),
        async (input) => input,
      );

      const result = await gateway.invoke(makeInvocation());
      expect(result.success).toBe(true);
    });

    it('should block invocation when agent trust is insufficient', async () => {
      trustLevels.set('agent-1', 0);
      gateway.registerTool(
        makeRegistration({ sideEffects: ['file_write'] }),
        async (input) => input,
      );

      const result = await gateway.invoke(makeInvocation());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INSUFFICIENT_TRUST');
    });

    it('should block invocation for unknown agents', async () => {
      gateway.registerTool(
        makeRegistration({ sideEffects: ['file_write'] }),
        async (input) => input,
      );

      const result = await gateway.invoke(makeInvocation({ agentId: 'unknown-agent' }));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('AGENT_NOT_FOUND');
    });

    it('should use requiredTrustLevel override when specified', async () => {
      trustLevels.set('agent-1', 3);
      gateway.registerTool(
        makeRegistration({ sideEffects: ['none'], requiredTrustLevel: 4 }),
        async (input) => input,
      );

      const result = await gateway.invoke(makeInvocation());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INSUFFICIENT_TRUST');
    });

    it('should allow read-only tools for level 0 agents', async () => {
      trustLevels.set('agent-1', 0);
      gateway.registerTool(
        makeRegistration({ sideEffects: ['none', 'file_read'] }),
        async (input) => input,
      );

      const result = await gateway.invoke(makeInvocation());
      expect(result.success).toBe(true);
    });

    it('should require level 3 for process side effects', async () => {
      trustLevels.set('agent-1', 2);
      gateway.registerTool(
        makeRegistration({ sideEffects: ['process'] }),
        async (input) => input,
      );

      const result = await gateway.invoke(makeInvocation());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INSUFFICIENT_TRUST');
    });
  });

  describe('audit logging', () => {
    let auditLogger: InMemoryAuditLogger;

    beforeEach(() => {
      auditLogger = new InMemoryAuditLogger();
      const trustLevels = new Map<string, TrustLevel>([['agent-1', 4 as TrustLevel]]);
      gateway = new InMemoryACIGateway({
        trustResolver: (id) => trustLevels.get(id),
        auditLogger,
      });
    });

    it('should log successful invocations', async () => {
      gateway.registerTool(makeRegistration(), async (input) => input);
      await gateway.invoke(makeInvocation());

      const events = auditLogger.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].result).toBe('success');
      expect(events[0].event).toBe('invoke:test.echo');
    });

    it('should log failed invocations', async () => {
      gateway.registerTool(makeRegistration(), async () => {
        throw new Error('boom');
      });
      await gateway.invoke(makeInvocation());

      const events = auditLogger.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].result).toBe('failure');
      expect(events[0].resultDetails).toBe('boom');
    });

    it('should log trust denials', async () => {
      const trustLevels = new Map<string, TrustLevel>([['agent-1', 0 as TrustLevel]]);
      gateway = new InMemoryACIGateway({
        trustResolver: (id) => trustLevels.get(id),
        auditLogger,
      });

      gateway.registerTool(
        makeRegistration({ sideEffects: ['file_write'] }),
        async (input) => input,
      );
      await gateway.invoke(makeInvocation());

      const events = auditLogger.getEvents({ category: 'permission' });
      expect(events.length).toBe(1);
      expect(events[0].result).toBe('blocked');
    });

    it('should filter events by agentId', async () => {
      gateway.registerTool(makeRegistration(), async (input) => input);
      await gateway.invoke(makeInvocation({ agentId: 'agent-1', requestId: 'r1' }));

      const events = auditLogger.getEvents({ agentId: 'agent-1' });
      expect(events.length).toBe(1);
      expect(events[0].actor.id).toBe('agent-1');

      const empty = auditLogger.getEvents({ agentId: 'agent-99' });
      expect(empty.length).toBe(0);
    });

    it('should log tool-not-found as failure', async () => {
      await gateway.invoke(makeInvocation({ toolName: 'missing' }));

      const events = auditLogger.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].result).toBe('failure');
    });
  });
});
