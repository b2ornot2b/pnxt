import { InMemoryACIGateway } from './aci-gateway.js';
import type { ToolRegistration, ToolInvocation } from '../types/aci.js';

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
        makeRegistration({ ops: { timeout: 5000, retryable: true, idempotent: false, costCategory: 'moderate' } }),
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
        makeRegistration({ ops: { timeout: 50, retryable: false, idempotent: false, costCategory: 'expensive' } }),
        async () => new Promise((resolve) => setTimeout(resolve, 200)),
      );

      const result = await gateway.invoke(makeInvocation());

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timed out');
    }, 10000);
  });
});
