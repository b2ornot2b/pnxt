import { ToolRegistry, createStandardRegistry } from './tool-registry.js';
import type { ToolRegistration } from '../types/aci.js';
import type { VPIRGraph, VPIRNode, VPIRRef } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import { STANDARD_HANDLERS } from './handler-library.js';

function makeRegistration(name: string, overrides: Partial<ToolRegistration> = {}): ToolRegistration {
  return {
    name,
    description: `Test tool: ${name}`,
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

function makeLabel(trustLevel: number = 1): SecurityLabel {
  return {
    owner: 'test',
    trustLevel: trustLevel as 0 | 1 | 2 | 3 | 4,
    classification: 'public',
  };
}

function makeNode(
  id: string,
  type: VPIRNode['type'],
  operation: string,
  inputs: VPIRRef[] = [],
): VPIRNode {
  return {
    id,
    type,
    operation,
    inputs,
    outputs: [{ port: 'result', dataType: 'unknown' }],
    evidence: [],
    label: makeLabel(),
    agentId: 'test-agent',
  };
}

function makeGraph(nodes: VPIRNode[]): VPIRGraph {
  const nodeMap = new Map<string, VPIRNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }
  return {
    id: 'test-graph',
    name: 'Test Graph',
    nodes: nodeMap,
    metadata: {
      createdAt: new Date().toISOString(),
      version: '1.0',
    },
  };
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('register', () => {
    it('should register a tool', () => {
      const handler = async () => null;
      registry.register(makeRegistration('test-tool'), handler);
      expect(registry.has('test-tool')).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('should throw on duplicate registration', () => {
      const handler = async () => null;
      registry.register(makeRegistration('test-tool'), handler);
      expect(() => registry.register(makeRegistration('test-tool'), handler)).toThrow(
        'already registered',
      );
    });

    it('should register with aliases', () => {
      const handler = async () => null;
      registry.register(makeRegistration('test-tool'), handler, ['alias-1', 'alias-2']);
      expect(registry.has('alias-1')).toBe(true);
      expect(registry.has('alias-2')).toBe(true);
    });

    it('should throw on conflicting alias', () => {
      const handler = async () => null;
      registry.register(makeRegistration('tool-a'), handler, ['shared-alias']);
      expect(() =>
        registry.register(makeRegistration('tool-b'), handler, ['shared-alias']),
      ).toThrow('already mapped');
    });
  });

  describe('resolve', () => {
    it('should resolve by canonical name', () => {
      const handler = async () => 'result';
      registry.register(makeRegistration('my-tool'), handler);
      const resolved = registry.resolve('my-tool');
      expect(resolved).toBeDefined();
      expect(resolved!.registration.name).toBe('my-tool');
    });

    it('should resolve by alias', () => {
      const handler = async () => 'result';
      registry.register(makeRegistration('canonical'), handler, ['my-alias']);
      const resolved = registry.resolve('my-alias');
      expect(resolved).toBeDefined();
      expect(resolved!.registration.name).toBe('canonical');
    });

    it('should return undefined for unknown operation', () => {
      expect(registry.resolve('nonexistent')).toBeUndefined();
    });

    it('should return a functional handler', async () => {
      const handler = async (input: unknown) => ({ echo: input });
      registry.register(makeRegistration('echo'), handler);
      const resolved = registry.resolve('echo');
      const result = await resolved!.handler('hello');
      expect(result).toEqual({ echo: 'hello' });
    });
  });

  describe('listTools', () => {
    it('should list all registered tool names', () => {
      registry.register(makeRegistration('tool-a'), async () => null);
      registry.register(makeRegistration('tool-b'), async () => null);
      expect(registry.listTools()).toEqual(['tool-a', 'tool-b']);
    });

    it('should return empty list when no tools registered', () => {
      expect(registry.listTools()).toEqual([]);
    });
  });

  describe('listRegistrations', () => {
    it('should return all registrations', () => {
      registry.register(makeRegistration('tool-a'), async () => null);
      registry.register(makeRegistration('tool-b'), async () => null);
      const regs = registry.listRegistrations();
      expect(regs).toHaveLength(2);
      expect(regs.map((r) => r.name)).toEqual(['tool-a', 'tool-b']);
    });
  });

  describe('unregister', () => {
    it('should remove a registered tool', () => {
      registry.register(makeRegistration('tool-a'), async () => null, ['alias-a']);
      expect(registry.unregister('tool-a')).toBe(true);
      expect(registry.has('tool-a')).toBe(false);
      expect(registry.has('alias-a')).toBe(false);
      expect(registry.size).toBe(0);
    });

    it('should return false for unknown tool', () => {
      expect(registry.unregister('nonexistent')).toBe(false);
    });
  });

  describe('registerStandardHandlers', () => {
    it('should register all standard handlers', () => {
      registry.registerStandardHandlers();
      expect(registry.size).toBe(STANDARD_HANDLERS.length);
      for (const { name } of STANDARD_HANDLERS) {
        expect(registry.has(name)).toBe(true);
      }
    });

    it('should be idempotent (skip already registered)', () => {
      registry.registerStandardHandlers();
      registry.registerStandardHandlers(); // Should not throw
      expect(registry.size).toBe(STANDARD_HANDLERS.length);
    });
  });

  describe('discoverTools', () => {
    beforeEach(() => {
      registry.registerStandardHandlers();
    });

    it('should find all available tools for a graph', () => {
      const graph = makeGraph([
        makeNode('n1', 'action', 'math-eval'),
        makeNode('n2', 'action', 'string-format', [{ nodeId: 'n1', port: 'result', dataType: 'unknown' }]),
      ]);

      const result = registry.discoverTools(graph);
      expect(result.allAvailable).toBe(true);
      expect(result.available).toHaveLength(2);
      expect(result.missing).toHaveLength(0);
    });

    it('should report missing tools', () => {
      const graph = makeGraph([
        makeNode('n1', 'action', 'math-eval'),
        makeNode('n2', 'action', 'unknown-tool'),
      ]);

      const result = registry.discoverTools(graph);
      expect(result.allAvailable).toBe(false);
      expect(result.missing).toContain('unknown-tool');
      expect(result.available).toHaveLength(1);
    });

    it('should ignore non-action nodes', () => {
      const graph = makeGraph([
        makeNode('n1', 'observation', 'capture-data'),
        makeNode('n2', 'inference', 'compute-stuff'),
        makeNode('n3', 'action', 'math-eval', [{ nodeId: 'n2', port: 'result', dataType: 'unknown' }]),
      ]);

      const result = registry.discoverTools(graph);
      expect(result.allAvailable).toBe(true);
      expect(result.available).toHaveLength(1);
    });

    it('should handle graph with no action nodes', () => {
      const graph = makeGraph([
        makeNode('n1', 'observation', 'observe'),
        makeNode('n2', 'inference', 'infer'),
      ]);

      const result = registry.discoverTools(graph);
      expect(result.allAvailable).toBe(true);
      expect(result.available).toHaveLength(0);
      expect(result.missing).toHaveLength(0);
    });
  });

  describe('validateTrust', () => {
    beforeEach(() => {
      registry.registerStandardHandlers();
    });

    it('should pass when agent has sufficient trust', () => {
      const graph = makeGraph([
        makeNode('n1', 'action', 'math-eval'), // no side effects, trust 0
        makeNode('n2', 'action', 'string-format'),
      ]);

      const result = registry.validateTrust(graph, 2);
      expect(result.sufficient).toBe(true);
      expect(result.insufficientTools).toHaveLength(0);
    });

    it('should fail when agent lacks trust for network tools', () => {
      const graph = makeGraph([
        makeNode('n1', 'action', 'http-fetch'), // requires trust 2
      ]);

      const result = registry.validateTrust(graph, 1);
      expect(result.sufficient).toBe(false);
      expect(result.insufficientTools).toHaveLength(1);
      expect(result.insufficientTools[0].toolName).toBe('http-fetch');
      expect(result.insufficientTools[0].requiredTrust).toBe(2);
    });

    it('should ignore non-action nodes', () => {
      const graph = makeGraph([
        makeNode('n1', 'inference', 'high-trust-inference'),
      ]);

      const result = registry.validateTrust(graph, 0);
      expect(result.sufficient).toBe(true);
    });

    it('should ignore missing tools (handled by discoverTools)', () => {
      const graph = makeGraph([
        makeNode('n1', 'action', 'nonexistent-tool'),
      ]);

      const result = registry.validateTrust(graph, 0);
      expect(result.sufficient).toBe(true); // Can't check trust for unknown tool
    });
  });
});

describe('createStandardRegistry', () => {
  it('should create a registry with all standard handlers', () => {
    const registry = createStandardRegistry();
    expect(registry.size).toBe(STANDARD_HANDLERS.length);
    expect(registry.has('http-fetch')).toBe(true);
    expect(registry.has('math-eval')).toBe(true);
  });

  it('should resolve standard handlers', async () => {
    const registry = createStandardRegistry();
    const resolved = registry.resolve('math-eval');
    expect(resolved).toBeDefined();
    const result = await resolved!.handler({ expression: '1 + 1' });
    expect(result).toEqual({ result: 2 });
  });
});
