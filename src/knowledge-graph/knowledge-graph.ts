/**
 * Knowledge Graph — typed graph for code entity representation.
 *
 * Implements the Tree-sitter DKB Knowledge Graph pillar: codebases are
 * stored as graphs with typed nodes (code entities) and directed edges
 * (relationships). Supports multi-hop traversal, subgraph extraction,
 * and conversion to HoTT categories.
 *
 * Based on:
 * - docs/research/original-prompt.md (Tree-sitter DKB Graph DB)
 * - Advisory Review 2026-04-05 (Judea Pearl — causal reasoning, graph memory)
 */

import type {
  KGEdge,
  KGNode,
  KGNodeKind,
  KGQuery,
  KGQueryResult,
  KGRelation,
  KnowledgeGraphDefinition,
} from '../types/knowledge-graph.js';
import type { Category, HoTTObject, Morphism } from '../types/hott.js';

/**
 * Mapping from KG relation types to HoTT morphism labels.
 */
const RELATION_TO_MORPHISM_LABEL: Record<KGRelation, string> = {
  defines: 'defines',
  imports: 'imports',
  calls: 'calls',
  extends: 'extends',
  implements: 'implements',
  depends_on: 'depends_on',
  contains: 'contains',
  references: 'references',
};

/**
 * Create a new empty knowledge graph.
 */
export function createKnowledgeGraph(id: string, name: string): KnowledgeGraphDefinition {
  return {
    id,
    name,
    nodes: new Map(),
    edges: new Map(),
  };
}

/**
 * Add a node to the knowledge graph.
 * @throws If a node with the same ID already exists.
 */
export function addNode(graph: KnowledgeGraphDefinition, node: KGNode): void {
  if (graph.nodes.has(node.id)) {
    throw new Error(`Node '${node.id}' already exists in graph '${graph.id}'`);
  }
  graph.nodes.set(node.id, node);
}

/**
 * Add an edge to the knowledge graph.
 * @throws If source or target nodes don't exist, or edge ID is duplicate.
 */
export function addEdge(graph: KnowledgeGraphDefinition, edge: KGEdge): void {
  if (graph.edges.has(edge.id)) {
    throw new Error(`Edge '${edge.id}' already exists in graph '${graph.id}'`);
  }
  if (!graph.nodes.has(edge.source)) {
    throw new Error(`Source node '${edge.source}' not found in graph '${graph.id}'`);
  }
  if (!graph.nodes.has(edge.target)) {
    throw new Error(`Target node '${edge.target}' not found in graph '${graph.id}'`);
  }
  graph.edges.set(edge.id, edge);
}

/**
 * Remove a node and all its connected edges.
 * @throws If the node doesn't exist.
 */
export function removeNode(graph: KnowledgeGraphDefinition, nodeId: string): void {
  if (!graph.nodes.has(nodeId)) {
    throw new Error(`Node '${nodeId}' not found in graph '${graph.id}'`);
  }
  graph.nodes.delete(nodeId);

  // Remove all edges connected to this node
  for (const [edgeId, edge] of graph.edges) {
    if (edge.source === nodeId || edge.target === nodeId) {
      graph.edges.delete(edgeId);
    }
  }
}

/**
 * Get immediate neighbors of a node.
 */
export function getNeighbors(
  graph: KnowledgeGraphDefinition,
  nodeId: string,
  direction: 'outbound' | 'inbound' | 'both' = 'outbound',
  relation?: KGRelation,
): KGNode[] {
  const neighborIds = new Set<string>();

  for (const edge of graph.edges.values()) {
    if (relation && edge.relation !== relation) continue;

    if ((direction === 'outbound' || direction === 'both') && edge.source === nodeId) {
      neighborIds.add(edge.target);
    }
    if ((direction === 'inbound' || direction === 'both') && edge.target === nodeId) {
      neighborIds.add(edge.source);
    }
  }

  return Array.from(neighborIds)
    .map((id) => graph.nodes.get(id))
    .filter((n): n is KGNode => n !== undefined);
}

/**
 * Query the knowledge graph with configurable traversal.
 */
export function query(graph: KnowledgeGraphDefinition, q: KGQuery): KGQueryResult {
  const maxDepth = q.maxDepth ?? 1;
  const direction = q.direction ?? 'outbound';

  // If no start node, filter all nodes by kind
  if (!q.startNodeId) {
    const nodes = q.kind
      ? Array.from(graph.nodes.values()).filter((n) => n.kind === q.kind)
      : Array.from(graph.nodes.values());
    return { nodes, edges: [], paths: [] };
  }

  const startNode = graph.nodes.get(q.startNodeId);
  if (!startNode) {
    return { nodes: [], edges: [], paths: [] };
  }

  // BFS traversal from start node
  const visitedNodes = new Map<string, KGNode>();
  const collectedEdges = new Map<string, KGEdge>();
  const allPaths: KGNode[][] = [];

  interface BFSEntry {
    nodeId: string;
    depth: number;
    path: KGNode[];
  }

  const queue: BFSEntry[] = [{ nodeId: q.startNodeId, depth: 0, path: [startNode] }];
  const visited = new Set<string>([q.startNodeId]);
  visitedNodes.set(q.startNodeId, startNode);

  while (queue.length > 0) {
    const { nodeId, depth, path } = queue.shift()!;
    if (depth >= maxDepth) {
      if (path.length > 1) allPaths.push(path);
      continue;
    }

    let foundNeighbor = false;
    for (const edge of graph.edges.values()) {
      if (q.relation && edge.relation !== q.relation) continue;

      let neighborId: string | undefined;
      if ((direction === 'outbound' || direction === 'both') && edge.source === nodeId) {
        neighborId = edge.target;
      }
      if ((direction === 'inbound' || direction === 'both') && edge.target === nodeId) {
        neighborId = edge.source;
      }

      if (neighborId === undefined) continue;

      const neighbor = graph.nodes.get(neighborId);
      if (!neighbor) continue;
      if (q.kind && neighbor.kind !== q.kind) continue;

      collectedEdges.set(edge.id, edge);
      visitedNodes.set(neighborId, neighbor);

      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        foundNeighbor = true;
        queue.push({
          nodeId: neighborId,
          depth: depth + 1,
          path: [...path, neighbor],
        });
      }
    }

    if (!foundNeighbor && path.length > 1) {
      allPaths.push(path);
    }
  }

  return {
    nodes: Array.from(visitedNodes.values()),
    edges: Array.from(collectedEdges.values()),
    paths: allPaths,
  };
}

/**
 * Find all paths between two nodes using BFS.
 */
export function findPaths(
  graph: KnowledgeGraphDefinition,
  fromId: string,
  toId: string,
  maxDepth: number = 5,
): KGNode[][] {
  const fromNode = graph.nodes.get(fromId);
  if (!fromNode || !graph.nodes.has(toId)) return [];

  const results: KGNode[][] = [];

  interface SearchEntry {
    nodeId: string;
    path: KGNode[];
  }

  const queue: SearchEntry[] = [{ nodeId: fromId, path: [fromNode] }];

  while (queue.length > 0) {
    const { nodeId, path } = queue.shift()!;
    if (path.length > maxDepth + 1) continue;

    for (const edge of graph.edges.values()) {
      if (edge.source !== nodeId) continue;

      const neighbor = graph.nodes.get(edge.target);
      if (!neighbor) continue;

      // Avoid cycles
      if (path.some((n) => n.id === neighbor.id)) continue;

      const newPath = [...path, neighbor];
      if (neighbor.id === toId) {
        results.push(newPath);
      } else if (newPath.length <= maxDepth) {
        queue.push({ nodeId: neighbor.id, path: newPath });
      }
    }
  }

  return results;
}

/**
 * Extract an induced subgraph from a set of node IDs.
 */
export function subgraph(
  graph: KnowledgeGraphDefinition,
  nodeIds: Set<string>,
): KnowledgeGraphDefinition {
  const sub: KnowledgeGraphDefinition = {
    id: `${graph.id}_sub`,
    name: `${graph.name} (subgraph)`,
    nodes: new Map(),
    edges: new Map(),
  };

  for (const nodeId of nodeIds) {
    const node = graph.nodes.get(nodeId);
    if (node) sub.nodes.set(nodeId, node);
  }

  for (const [edgeId, edge] of graph.edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      sub.edges.set(edgeId, edge);
    }
  }

  return sub;
}

/**
 * Convert a knowledge graph to a HoTT Category.
 *
 * Nodes become HoTTObjects, edges become Morphisms. This bridge
 * demonstrates that the knowledge graph has categorical structure.
 */
export function toHoTTCategory(graph: KnowledgeGraphDefinition): Category {
  const category: Category = {
    id: `cat_${graph.id}`,
    name: `Category(${graph.name})`,
    objects: new Map(),
    morphisms: new Map(),
    paths: new Map(),
  };

  // Nodes → Objects
  for (const [nodeId, node] of graph.nodes) {
    const obj: HoTTObject = {
      id: nodeId,
      kind: nodeKindToObjectKind(node.kind),
      label: node.name,
      securityLabel: node.securityLabel,
      metadata: node.metadata,
    };
    category.objects.set(nodeId, obj);
  }

  // Edges → Morphisms
  for (const [edgeId, edge] of graph.edges) {
    const morphism: Morphism = {
      id: edgeId,
      sourceId: edge.source,
      targetId: edge.target,
      label: RELATION_TO_MORPHISM_LABEL[edge.relation],
      properties: [],
    };
    category.morphisms.set(edgeId, morphism);
  }

  return category;
}

/**
 * Map KG node kinds to HoTT object kinds.
 */
function nodeKindToObjectKind(kind: KGNodeKind): 'type' | 'term' | 'context' {
  switch (kind) {
    case 'type':
    case 'interface':
    case 'class':
      return 'type';
    case 'function':
    case 'variable':
    case 'import':
    case 'export':
      return 'term';
    case 'module':
      return 'context';
  }
}
