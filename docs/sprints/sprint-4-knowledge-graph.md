# Sprint 4: Graph-Based Memory + Entity Relationships

> **Status**: Planned
> **Paradigm Pillars**: Tree-sitter DKB Knowledge Graph, P-ASP (partial)
> **Alignment Impact**: 7/10 → 8/10
> **Advisory Drivers**: Pearl (causal reasoning), Voevodsky (categorical structure), Liskov (usable abstractions)
> **Depends on**: Sprint 1 (IFC labels on graph nodes), Sprint 2 (VPIR types for graph schema)

---

## Objective

Replace the flat `MemoryRecord` storage with a typed knowledge graph supporting entity-relationship modeling, multi-hop traversal, and causal structure. This transforms memory from a document store into the non-Euclidean graph the research vision describes — where code entities, agent decisions, and reasoning chains have structural relationships that inform future computation.

---

## Deliverables

### 1. Graph Node & Edge Types

**File**: `src/types/knowledge-graph.ts`

```typescript
interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  content: unknown;             // typed payload
  type: VPIRType;               // from Sprint 2
  label: Label;                 // IFC label from Sprint 1
  metadata: GraphNodeMetadata;
}

type GraphNodeKind =
  | 'entity'          // a thing (agent, tool, concept, code element)
  | 'event'           // something that happened (invocation, decision, failure)
  | 'assertion'       // a claimed fact (verified or unverified)
  | 'reasoning'       // a reasoning step (links to VPIR node)
  | 'memory'          // episodic or semantic memory entry
  | 'code';           // code-level entity (function, type, module)

interface GraphEdge {
  id: string;
  source: string;               // source node ID
  target: string;               // target node ID
  relation: EdgeRelation;
  weight: number;               // 0-1 confidence/strength
  label: Label;                 // IFC label
  metadata: GraphEdgeMetadata;
}

type EdgeRelation =
  | 'causes'          // causal relationship (Pearl)
  | 'contains'        // structural containment
  | 'references'      // non-causal reference
  | 'depends_on'      // dependency relationship
  | 'derived_from'    // provenance chain
  | 'contradicts'     // conflicting information
  | 'supports'        // corroborating information
  | 'instance_of'     // type-instance relationship
  | 'equivalent_to'   // equivalence (Voevodsky)
  | 'precedes'        // temporal ordering
  | 'delegates_to'    // agent delegation chain
  | 'produced_by';    // agent that created this node

interface GraphNodeMetadata {
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  lastAccessed: number;
  confidence: number;           // 0-1, how certain we are about this node
  source: string;               // which agent/process created it
  verificationStatus: 'unverified' | 'verified' | 'contradicted';
}
```

### 2. Knowledge Graph Service

**File**: `src/knowledge-graph/graph-service.ts`

The core graph service replacing flat memory storage.

```typescript
interface KnowledgeGraphService {
  // Node operations
  addNode(node: Omit<GraphNode, 'id'>): GraphNode;
  getNode(id: string): GraphNode | undefined;
  updateNode(id: string, update: Partial<GraphNode>): GraphNode;
  removeNode(id: string): void;

  // Edge operations
  addEdge(edge: Omit<GraphEdge, 'id'>): GraphEdge;
  getEdge(id: string): GraphEdge | undefined;
  removeEdge(id: string): void;

  // Traversal
  neighbors(nodeId: string, direction: 'in' | 'out' | 'both'): GraphNode[];
  traverse(start: string, query: TraversalQuery): TraversalResult;
  shortestPath(from: string, to: string): GraphNode[];

  // Queries
  query(query: GraphQuery): GraphNode[];
  findByRelation(relation: EdgeRelation, nodeId: string): GraphNode[];
  subgraph(nodeIds: string[]): KnowledgeSubgraph;

  // Causal reasoning (Pearl)
  causalChain(from: string, to: string): GraphEdge[];
  causalAncestors(nodeId: string): GraphNode[];
  causalDescendants(nodeId: string): GraphNode[];

  // IFC enforcement
  labeledQuery(query: GraphQuery, requesterLabel: Label): GraphNode[];

  // Persistence
  save(): Promise<void>;
  load(): Promise<void>;
}
```

### 3. Traversal Engine

**File**: `src/knowledge-graph/traversal.ts`

Multi-hop graph traversal with filtering and IFC enforcement.

```typescript
interface TraversalQuery {
  maxDepth: number;                    // maximum hops
  direction: 'in' | 'out' | 'both';
  relationFilter?: EdgeRelation[];     // only follow these edge types
  nodeKindFilter?: GraphNodeKind[];    // only visit these node kinds
  minWeight?: number;                  // minimum edge weight to follow
  requesterLabel?: Label;              // IFC: filter out nodes above trust level
  limit?: number;                      // max results
}

interface TraversalResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  paths: GraphPath[];                  // all paths found
  metrics: TraversalMetrics;
}

interface GraphPath {
  nodes: string[];                     // ordered node IDs
  edges: string[];                     // ordered edge IDs
  totalWeight: number;                 // product of edge weights
  maxLabelLevel: number;               // highest IFC label encountered
}
```

### 4. Memory Service Adapter

**File**: `src/knowledge-graph/memory-adapter.ts`

Backwards-compatible adapter that wraps the knowledge graph in the existing `MemoryService` interface, ensuring all existing code continues to work.

```typescript
interface MemoryGraphAdapter {
  // Implements existing MemoryService interface
  store(entry: MemoryEntry, label: Label): Promise<MemoryRecord>;
  query(query: MemoryQuery, requesterLabel: Label): Promise<MemoryRecord[]>;
  update(id: string, update: Partial<MemoryEntry>): Promise<MemoryRecord>;
  forget(id: string): Promise<void>;
  getRelated(id: string, requesterLabel: Label): Promise<MemoryRecord[]>;
  consolidate(): Promise<ConsolidationResult>;

  // Enhanced: returns the underlying graph for direct access
  readonly graph: KnowledgeGraphService;
}
```

### 5. Semantic Consolidation

**File**: `src/knowledge-graph/consolidation.ts`

Actual consolidation logic (addressing the advisory review's concern about the stub implementation):

- **Pattern extraction**: Find recurring subgraph patterns in episodic memories → create semantic nodes
- **Contradiction detection**: Find `contradicts` edges and flag for resolution
- **Confidence decay**: Reduce confidence of nodes that haven't been accessed or reinforced
- **Causal strengthening**: Increase edge weight for causal chains that are repeatedly confirmed
- **Garbage collection**: Remove low-confidence, unconnected nodes past a TTL

```typescript
interface ConsolidationEngine {
  consolidate(graph: KnowledgeGraphService): Promise<ConsolidationReport>;
}

interface ConsolidationReport {
  patternsExtracted: number;
  contradictionsFound: number;
  nodesDecayed: number;
  edgesStrengthened: number;
  nodesRemoved: number;
  newSemanticNodes: GraphNode[];
}
```

### 6. Graph Storage Backend

**File**: `src/knowledge-graph/storage.ts`

Pluggable persistence for the graph:

- **`InMemoryGraphStorage`** — for testing
- **`FileGraphStorage`** — JSON file persistence (consistent with existing `FileStorageBackend` pattern)
- Graph serialization/deserialization with node and edge integrity checks

```typescript
interface GraphStorageBackend {
  saveGraph(nodes: GraphNode[], edges: GraphEdge[]): Promise<void>;
  loadGraph(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
  clear(): Promise<void>;
}
```

---

## Integration with Existing Modules

| Module | Integration Point |
|--------|-------------------|
| Memory Service | `MemoryGraphAdapter` provides backwards-compatible wrapper |
| IFC Labels (Sprint 1) | Nodes and edges carry labels; `labeledQuery` enforces flow |
| DPN (Sprint 1) | Processes can read/write to the knowledge graph via channels |
| VPIR (Sprint 2) | `reasoning` nodes link to VPIR nodes; verification results stored as graph |
| SMT (Sprint 2) | Graph invariants expressible as SMT constraints |
| Bridge Grammar (Sprint 3) | LLM-emitted VPIR graphs stored in knowledge graph |
| Trust Engine | Trust events become `event` nodes with causal edges |
| Agent Runtime | Agent state changes become graph events |

---

## Tests

### Unit Tests

- `graph-service.test.ts` — node/edge CRUD, duplicate detection, removal cascading
- `traversal.test.ts` — BFS/DFS traversal, depth limits, relation filtering, IFC enforcement
- `consolidation.test.ts` — pattern extraction, contradiction detection, confidence decay
- `memory-adapter.test.ts` — backwards compatibility with existing memory service tests
- `storage.test.ts` — serialization round-trip, integrity checks

### Integration Tests

- Build a graph from multi-agent scenario events; verify causal chains
- Store VPIR reasoning chain as graph; traverse from conclusion back to premises
- Label-enforced query: agent at trust level 2 queries graph containing level 4 nodes
- Consolidation: insert 50 episodic memories, consolidate, verify semantic patterns emerge

### Property-Based Tests

- Graph invariant: every edge connects two existing nodes
- Traversal invariant: result depth never exceeds `maxDepth`
- IFC invariant: no node in `labeledQuery` result has label above requester level
- Causal invariant: `causalChain` result is acyclic

---

## Acceptance Criteria

1. Knowledge graph stores nodes and edges with typed payloads and IFC labels
2. Multi-hop traversal returns correct results up to configurable depth
3. Causal chain extraction follows `causes` edges transitively
4. IFC enforcement filters out nodes above requester's trust level in all query paths
5. `MemoryGraphAdapter` passes all existing memory service tests unchanged
6. Consolidation extracts at least one semantic pattern from 20+ episodic memories
7. Contradiction detection identifies conflicting `contradicts` edges
8. Graph persistence round-trips correctly (save → load → identical graph)
9. All existing tests continue to pass

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Graph query performance at scale | Index by node kind and relation type; benchmark with 10K+ nodes |
| Consolidation heuristics too naive | Start with simple frequency-based pattern extraction; iterate based on evaluation |
| Memory adapter impedance mismatch | Adapter is a thin layer; complex queries go directly to graph service |
| Serialization size for large graphs | Lazy loading of node content; metadata-only mode for traversal |
| Breaking existing memory service consumers | Adapter ensures 100% API compatibility; migration is transparent |

---

## Open Questions (to resolve during sprint)

1. **Should the graph support versioning?** If a node is updated, keep the old version as a separate node with a `derived_from` edge? This enables reasoning about how knowledge evolved.
2. **How should confidence scores compose across edges?** Product (strict), minimum (conservative), or weighted average?
3. **Should consolidation be automatic or triggered?** Periodic background process vs. explicit `consolidate()` calls vs. threshold-based triggers.
4. **What's the indexing strategy?** For the in-memory implementation, simple maps suffice. For persistence, should we plan for a graph database backend (e.g., Neo4j) or keep it file-based?
