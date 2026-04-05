/**
 * Tests for Tree-sitter TypeScript Parser.
 *
 * Validates that real TypeScript source code is correctly parsed into
 * Knowledge Graph nodes and edges with proper relationships.
 */

import { parseFile, parseDirectory, initParser, cleanupParser } from './ts-parser.js';
import type { KGNode, KGEdge } from '../types/knowledge-graph.js';

// Initialize parser once before all tests
beforeAll(async () => {
  await initParser();
}, 30000);

afterAll(() => {
  cleanupParser();
});

// --- Helper utilities ---

function findNodeByName(
  nodes: Map<string, KGNode>,
  name: string,
): KGNode | undefined {
  for (const node of nodes.values()) {
    if (node.name === name) return node;
  }
  return undefined;
}

function findEdgesByRelation(
  edges: Map<string, KGEdge>,
  relation: string,
): KGEdge[] {
  return Array.from(edges.values()).filter((e) => e.relation === relation);
}

function findEdge(
  edges: Map<string, KGEdge>,
  sourceId: string,
  targetId: string,
  relation?: string,
): KGEdge | undefined {
  for (const edge of edges.values()) {
    if (edge.source === sourceId && edge.target === targetId) {
      if (!relation || edge.relation === relation) return edge;
    }
  }
  return undefined;
}

// --- Tests ---

describe('Tree-sitter TypeScript Parser', () => {
  describe('parseFile', () => {
    it('should parse an empty file', async () => {
      const result = await parseFile('', 'empty.ts');
      expect(result.nodeCount).toBe(1); // Just the module node
      expect(result.edgeCount).toBe(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should extract function declarations', async () => {
      const source = `
function greet(name: string): string {
  return 'Hello, ' + name;
}

function add(a: number, b: number): number {
  return a + b;
}
`;
      const result = await parseFile(source, 'functions.ts');

      expect(result.nodeCount).toBeGreaterThanOrEqual(3); // module + 2 functions
      const greetNode = findNodeByName(result.graph.nodes, 'greet');
      expect(greetNode).toBeDefined();
      expect(greetNode!.kind).toBe('function');
      expect(greetNode!.metadata.line).toBe(2);
      expect(greetNode!.metadata.parameters).toEqual(['name']);

      const addNode = findNodeByName(result.graph.nodes, 'add');
      expect(addNode).toBeDefined();
      expect(addNode!.kind).toBe('function');
      expect(addNode!.metadata.parameters).toEqual(['a', 'b']);
    });

    it('should extract class declarations with methods', async () => {
      const source = `
class UserService {
  getUser(id: string): User {
    return this.db.find(id);
  }

  deleteUser(id: string): void {
    this.db.remove(id);
  }
}
`;
      const result = await parseFile(source, 'service.ts');

      const classNode = findNodeByName(result.graph.nodes, 'UserService');
      expect(classNode).toBeDefined();
      expect(classNode!.kind).toBe('class');

      const getUser = findNodeByName(result.graph.nodes, 'UserService.getUser');
      expect(getUser).toBeDefined();
      expect(getUser!.kind).toBe('function');

      const deleteUser = findNodeByName(result.graph.nodes, 'UserService.deleteUser');
      expect(deleteUser).toBeDefined();

      // Methods should be contained by the class
      const containsEdges = findEdgesByRelation(result.graph.edges, 'contains');
      const classContainsMethod = containsEdges.some(
        (e) => e.source === classNode!.id && e.target === getUser!.id,
      );
      expect(classContainsMethod).toBe(true);
    });

    it('should extract interface declarations', async () => {
      const source = `
interface User {
  id: string;
  name: string;
  email: string;
}

interface Admin extends User {
  role: string;
}
`;
      const result = await parseFile(source, 'types.ts');

      const userNode = findNodeByName(result.graph.nodes, 'User');
      expect(userNode).toBeDefined();
      expect(userNode!.kind).toBe('interface');

      const adminNode = findNodeByName(result.graph.nodes, 'Admin');
      expect(adminNode).toBeDefined();
      expect(adminNode!.kind).toBe('interface');
    });

    it('should extract type alias declarations', async () => {
      const source = `
type Status = 'active' | 'inactive' | 'pending';
type UserId = string;
`;
      const result = await parseFile(source, 'aliases.ts');

      const statusNode = findNodeByName(result.graph.nodes, 'Status');
      expect(statusNode).toBeDefined();
      expect(statusNode!.kind).toBe('type');

      const userIdNode = findNodeByName(result.graph.nodes, 'UserId');
      expect(userIdNode).toBeDefined();
      expect(userIdNode!.kind).toBe('type');
    });

    it('should extract variable declarations', async () => {
      const source = `
const MAX_RETRIES = 3;
let counter = 0;
`;
      const result = await parseFile(source, 'vars.ts');

      const maxRetries = findNodeByName(result.graph.nodes, 'MAX_RETRIES');
      expect(maxRetries).toBeDefined();
      expect(maxRetries!.kind).toBe('variable');

      const counterNode = findNodeByName(result.graph.nodes, 'counter');
      expect(counterNode).toBeDefined();
      expect(counterNode!.kind).toBe('variable');
    });

    it('should identify arrow functions as function kind', async () => {
      const source = `
const processData = (data: string[]) => {
  return data.map(d => d.trim());
};
`;
      const result = await parseFile(source, 'arrow.ts');

      const processData = findNodeByName(result.graph.nodes, 'processData');
      expect(processData).toBeDefined();
      expect(processData!.kind).toBe('function');
      expect(processData!.metadata.isArrowFunction).toBe(true);
    });

    it('should extract import statements', async () => {
      const source = `
import { readFile, writeFile } from 'fs';
import path from 'path';
`;
      const result = await parseFile(source, 'imports.ts');

      const readFileNode = findNodeByName(result.graph.nodes, 'readFile');
      expect(readFileNode).toBeDefined();
      expect(readFileNode!.kind).toBe('import');
      expect(readFileNode!.metadata.importSource).toBe('fs');

      const writeFileNode = findNodeByName(result.graph.nodes, 'writeFile');
      expect(writeFileNode).toBeDefined();
      expect(writeFileNode!.kind).toBe('import');
    });

    it('should extract exported declarations', async () => {
      const source = `
export function publicFn(): void {}
export class PublicClass {}
export interface PublicInterface {}
export type PublicType = string;
`;
      const result = await parseFile(source, 'exports.ts');

      const publicFn = findNodeByName(result.graph.nodes, 'publicFn');
      expect(publicFn).toBeDefined();
      expect(publicFn!.metadata.exported).toBe(true);

      const publicClass = findNodeByName(result.graph.nodes, 'PublicClass');
      expect(publicClass).toBeDefined();
      expect(publicClass!.metadata.exported).toBe(true);
    });

    it('should detect function call relationships', async () => {
      const source = `
function validate(input: string): boolean {
  return input.length > 0;
}

function process(data: string): string {
  if (validate(data)) {
    return data.toUpperCase();
  }
  return '';
}
`;
      const result = await parseFile(source, 'calls.ts');

      const validateNode = findNodeByName(result.graph.nodes, 'validate');
      const processNode = findNodeByName(result.graph.nodes, 'process');
      expect(validateNode).toBeDefined();
      expect(processNode).toBeDefined();

      // process calls validate
      const callEdge = findEdge(
        result.graph.edges,
        processNode!.id,
        validateNode!.id,
        'calls',
      );
      expect(callEdge).toBeDefined();
    });

    it('should create contains edges from module to declarations', async () => {
      const source = `
function foo() {}
class Bar {}
interface Baz {}
`;
      const result = await parseFile(source, 'module.ts');

      const containsEdges = findEdgesByRelation(result.graph.edges, 'contains');
      // Module contains foo, Bar, Baz
      expect(containsEdges.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle complex real-world TypeScript', async () => {
      const source = `
import type { SecurityLabel } from './ifc.js';

export type KGNodeKind = 'module' | 'function' | 'type';

export interface KGNode {
  id: string;
  kind: KGNodeKind;
  name: string;
  metadata: Record<string, unknown>;
  securityLabel?: SecurityLabel;
}

export function createKnowledgeGraph(id: string, name: string): KGNode {
  return { id, kind: 'module', name, metadata: {} };
}

export function addNode(graph: KGNode[], node: KGNode): void {
  graph.push(node);
}

function internalHelper(): void {
  addNode([], createKnowledgeGraph('test', 'test'));
}
`;
      const result = await parseFile(source, 'real-world.ts');

      // Should have module + import + type + interface + 3 functions
      expect(result.nodeCount).toBeGreaterThanOrEqual(6);

      // internalHelper should call addNode and createKnowledgeGraph
      const helperNode = findNodeByName(result.graph.nodes, 'internalHelper');
      const addNodeFn = findNodeByName(result.graph.nodes, 'addNode');
      const createFn = findNodeByName(result.graph.nodes, 'createKnowledgeGraph');

      expect(helperNode).toBeDefined();
      expect(addNodeFn).toBeDefined();
      expect(createFn).toBeDefined();

      const callsAddNode = findEdge(
        result.graph.edges,
        helperNode!.id,
        addNodeFn!.id,
        'calls',
      );
      expect(callsAddNode).toBeDefined();

      const callsCreate = findEdge(
        result.graph.edges,
        helperNode!.id,
        createFn!.id,
        'calls',
      );
      expect(callsCreate).toBeDefined();
    });
  });

  describe('parseDirectory', () => {
    it('should parse multiple files into a unified graph', async () => {
      const files = new Map<string, string>([
        [
          'types.ts',
          `
export interface User {
  id: string;
  name: string;
}
export type UserStatus = 'active' | 'inactive';
`,
        ],
        [
          'service.ts',
          `
import { User } from './types.js';

export function getUser(id: string): User {
  return { id, name: 'test' };
}
`,
        ],
      ]);

      const result = await parseDirectory(files);

      // Should have 2 module nodes + interface + type + import + function
      expect(result.nodeCount).toBeGreaterThanOrEqual(6);

      // Both modules should exist
      const typesModule = findNodeByName(result.graph.nodes, 'types.ts');
      const serviceModule = findNodeByName(result.graph.nodes, 'service.ts');
      expect(typesModule).toBeDefined();
      expect(serviceModule).toBeDefined();
    });

    it('should handle empty file map', async () => {
      const result = await parseDirectory(new Map());
      expect(result.nodeCount).toBe(0);
      expect(result.edgeCount).toBe(0);
    });
  });

  describe('Knowledge Graph integration', () => {
    it('should produce a graph compatible with toHoTTCategory', async () => {
      const { toHoTTCategory } = await import('./knowledge-graph.js');
      const { validateCategory } = await import('../hott/category.js');

      const source = `
function processData(input: string): string {
  return transform(input);
}

function transform(data: string): string {
  return data.toUpperCase();
}
`;
      const result = await parseFile(source, 'pipeline.ts');
      const category = toHoTTCategory(result.graph);
      const validation = validateCategory(category);

      expect(category.objects.size).toBe(result.nodeCount);
      expect(category.morphisms.size).toBe(result.edgeCount);
      expect(validation.valid).toBe(true);
    });
  });
});
