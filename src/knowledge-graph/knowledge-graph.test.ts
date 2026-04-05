/**
 * Tests for Knowledge Graph.
 */

import {
  createKnowledgeGraph,
  addNode,
  addEdge,
  removeNode,
  getNeighbors,
  query,
  findPaths,
  subgraph,
  toHoTTCategory,
} from './knowledge-graph.js';
import type { KGNode, KGEdge } from '../types/knowledge-graph.js';

function makeNode(id: string, kind: KGNode['kind'] = 'function', name?: string): KGNode {
  return { id, kind, name: name ?? id, metadata: {} };
}

function makeEdge(id: string, source: string, target: string, relation: KGEdge['relation'] = 'calls'): KGEdge {
  return { id, source, target, relation };
}

describe('KnowledgeGraph', () => {
  describe('createKnowledgeGraph', () => {
    it('should create an empty graph', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      expect(graph.id).toBe('kg1');
      expect(graph.nodes.size).toBe(0);
      expect(graph.edges.size).toBe(0);
    });
  });

  describe('addNode', () => {
    it('should add a node', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      addNode(graph, makeNode('n1'));
      expect(graph.nodes.size).toBe(1);
    });

    it('should throw on duplicate node', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      addNode(graph, makeNode('n1'));
      expect(() => addNode(graph, makeNode('n1'))).toThrow("Node 'n1' already exists");
    });

    it('should support nodes with security labels', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      const node: KGNode = {
        id: 'n1',
        kind: 'module',
        name: 'main',
        metadata: { path: 'src/main.ts' },
        securityLabel: {
          owner: 'agent-1',
          trustLevel: 3,
          classification: 'confidential',
          createdAt: new Date().toISOString(),
        },
      };
      addNode(graph, node);
      expect(graph.nodes.get('n1')?.securityLabel?.classification).toBe('confidential');
    });
  });

  describe('addEdge', () => {
    it('should add an edge between existing nodes', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      addNode(graph, makeNode('n1'));
      addNode(graph, makeNode('n2'));
      addEdge(graph, makeEdge('e1', 'n1', 'n2'));
      expect(graph.edges.size).toBe(1);
    });

    it('should throw if source node is missing', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      addNode(graph, makeNode('n2'));
      expect(() => addEdge(graph, makeEdge('e1', 'n1', 'n2'))).toThrow(
        "Source node 'n1' not found",
      );
    });

    it('should throw if target node is missing', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      addNode(graph, makeNode('n1'));
      expect(() => addEdge(graph, makeEdge('e1', 'n1', 'n2'))).toThrow(
        "Target node 'n2' not found",
      );
    });

    it('should throw on duplicate edge', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      addNode(graph, makeNode('n1'));
      addNode(graph, makeNode('n2'));
      addEdge(graph, makeEdge('e1', 'n1', 'n2'));
      expect(() => addEdge(graph, makeEdge('e1', 'n1', 'n2'))).toThrow(
        "Edge 'e1' already exists",
      );
    });
  });

  describe('removeNode', () => {
    it('should remove node and cascading edges', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      addNode(graph, makeNode('n1'));
      addNode(graph, makeNode('n2'));
      addNode(graph, makeNode('n3'));
      addEdge(graph, makeEdge('e1', 'n1', 'n2'));
      addEdge(graph, makeEdge('e2', 'n2', 'n3'));

      removeNode(graph, 'n2');
      expect(graph.nodes.size).toBe(2);
      expect(graph.edges.size).toBe(0); // Both edges connected to n2 removed
    });

    it('should throw if node does not exist', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      expect(() => removeNode(graph, 'n1')).toThrow("Node 'n1' not found");
    });
  });

  describe('getNeighbors', () => {
    it('should get outbound neighbors', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      addNode(graph, makeNode('n1'));
      addNode(graph, makeNode('n2'));
      addNode(graph, makeNode('n3'));
      addEdge(graph, makeEdge('e1', 'n1', 'n2'));
      addEdge(graph, makeEdge('e2', 'n1', 'n3'));

      const neighbors = getNeighbors(graph, 'n1', 'outbound');
      expect(neighbors).toHaveLength(2);
    });

    it('should get inbound neighbors', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      addNode(graph, makeNode('n1'));
      addNode(graph, makeNode('n2'));
      addEdge(graph, makeEdge('e1', 'n1', 'n2'));

      const neighbors = getNeighbors(graph, 'n2', 'inbound');
      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].id).toBe('n1');
    });

    it('should filter by relation', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      addNode(graph, makeNode('n1'));
      addNode(graph, makeNode('n2'));
      addNode(graph, makeNode('n3'));
      addEdge(graph, makeEdge('e1', 'n1', 'n2', 'calls'));
      addEdge(graph, makeEdge('e2', 'n1', 'n3', 'imports'));

      const callNeighbors = getNeighbors(graph, 'n1', 'outbound', 'calls');
      expect(callNeighbors).toHaveLength(1);
      expect(callNeighbors[0].id).toBe('n2');
    });
  });

  describe('query', () => {
    it('should query all nodes of a kind', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      addNode(graph, makeNode('f1', 'function'));
      addNode(graph, makeNode('f2', 'function'));
      addNode(graph, makeNode('m1', 'module'));

      const result = query(graph, { kind: 'function' });
      expect(result.nodes).toHaveLength(2);
    });

    it('should traverse from a start node', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      addNode(graph, makeNode('n1'));
      addNode(graph, makeNode('n2'));
      addNode(graph, makeNode('n3'));
      addEdge(graph, makeEdge('e1', 'n1', 'n2'));
      addEdge(graph, makeEdge('e2', 'n2', 'n3'));

      const result = query(graph, { startNodeId: 'n1', maxDepth: 2 });
      expect(result.nodes.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty for non-existent start node', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      const result = query(graph, { startNodeId: 'missing' });
      expect(result.nodes).toHaveLength(0);
    });

    it('should filter traversal by relation', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      addNode(graph, makeNode('n1'));
      addNode(graph, makeNode('n2'));
      addNode(graph, makeNode('n3'));
      addEdge(graph, makeEdge('e1', 'n1', 'n2', 'calls'));
      addEdge(graph, makeEdge('e2', 'n1', 'n3', 'imports'));

      const result = query(graph, { startNodeId: 'n1', relation: 'calls', maxDepth: 1 });
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].relation).toBe('calls');
    });
  });

  describe('findPaths', () => {
    it('should find a direct path', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      addNode(graph, makeNode('n1'));
      addNode(graph, makeNode('n2'));
      addEdge(graph, makeEdge('e1', 'n1', 'n2'));

      const paths = findPaths(graph, 'n1', 'n2');
      expect(paths).toHaveLength(1);
      expect(paths[0]).toHaveLength(2);
    });

    it('should find multi-hop paths', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      addNode(graph, makeNode('n1'));
      addNode(graph, makeNode('n2'));
      addNode(graph, makeNode('n3'));
      addEdge(graph, makeEdge('e1', 'n1', 'n2'));
      addEdge(graph, makeEdge('e2', 'n2', 'n3'));

      const paths = findPaths(graph, 'n1', 'n3');
      expect(paths).toHaveLength(1);
      expect(paths[0]).toHaveLength(3);
    });

    it('should return empty for unreachable nodes', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      addNode(graph, makeNode('n1'));
      addNode(graph, makeNode('n2'));
      // No edges

      const paths = findPaths(graph, 'n1', 'n2');
      expect(paths).toHaveLength(0);
    });

    it('should respect max depth', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      addNode(graph, makeNode('n1'));
      addNode(graph, makeNode('n2'));
      addNode(graph, makeNode('n3'));
      addNode(graph, makeNode('n4'));
      addEdge(graph, makeEdge('e1', 'n1', 'n2'));
      addEdge(graph, makeEdge('e2', 'n2', 'n3'));
      addEdge(graph, makeEdge('e3', 'n3', 'n4'));

      const paths = findPaths(graph, 'n1', 'n4', 2);
      expect(paths).toHaveLength(0); // 3 hops required, but maxDepth is 2
    });
  });

  describe('subgraph', () => {
    it('should extract induced subgraph', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      addNode(graph, makeNode('n1'));
      addNode(graph, makeNode('n2'));
      addNode(graph, makeNode('n3'));
      addEdge(graph, makeEdge('e1', 'n1', 'n2'));
      addEdge(graph, makeEdge('e2', 'n2', 'n3'));
      addEdge(graph, makeEdge('e3', 'n1', 'n3'));

      const sub = subgraph(graph, new Set(['n1', 'n2']));
      expect(sub.nodes.size).toBe(2);
      expect(sub.edges.size).toBe(1); // Only e1 (n1→n2) is induced
    });
  });

  describe('toHoTTCategory', () => {
    it('should convert a knowledge graph to a HoTT category', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      addNode(graph, makeNode('mod', 'module', 'main'));
      addNode(graph, makeNode('fn', 'function', 'handler'));
      addNode(graph, makeNode('ty', 'type', 'Request'));
      addEdge(graph, makeEdge('e1', 'mod', 'fn', 'contains'));
      addEdge(graph, makeEdge('e2', 'fn', 'ty', 'references'));

      const category = toHoTTCategory(graph);
      expect(category.objects.size).toBe(3);
      expect(category.morphisms.size).toBe(2);

      // Check object kind mapping
      expect(category.objects.get('mod')?.kind).toBe('context');   // module → context
      expect(category.objects.get('fn')?.kind).toBe('term');       // function → term
      expect(category.objects.get('ty')?.kind).toBe('type');       // type → type
    });

    it('should preserve security labels in conversion', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      const node: KGNode = {
        id: 'n1',
        kind: 'function',
        name: 'test',
        metadata: {},
        securityLabel: {
          owner: 'agent-1',
          trustLevel: 3,
          classification: 'confidential',
          createdAt: new Date().toISOString(),
        },
      };
      addNode(graph, node);
      const category = toHoTTCategory(graph);
      expect(category.objects.get('n1')?.securityLabel?.classification).toBe('confidential');
    });

    it('should map edge relations to morphism labels', () => {
      const graph = createKnowledgeGraph('kg1', 'Test');
      addNode(graph, makeNode('n1'));
      addNode(graph, makeNode('n2'));
      addEdge(graph, makeEdge('e1', 'n1', 'n2', 'calls'));

      const category = toHoTTCategory(graph);
      const morphism = category.morphisms.get('e1');
      expect(morphism?.label).toBe('calls');
    });
  });
});
