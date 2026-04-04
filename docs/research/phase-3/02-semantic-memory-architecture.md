# Semantic Memory Architecture for Agent-Native Systems

## Phase 3 Research — Deep Dive into Pillar 2

---

## 1. Introduction

Memory is what separates an agent from a stateless function call. A language model without memory treats every interaction as isolated — it cannot learn from yesterday's mistakes, recall why a design decision was made, or build a cumulative understanding of a codebase. The Semantic Memory Architecture described here provides the persistent, queryable, and evolving knowledge substrate that makes true agent-native programming possible.

This document analyzes the memory requirements of ANP agents, proposes a layered architecture for memory storage and retrieval, and addresses the hard problems of memory consistency, privacy, and cross-agent sharing.

---

## 2. Memory Requirements Analysis

### 2.1 What Agents Need to Remember

Analysis of agent behavior in software development reveals several distinct categories of knowledge that benefit from persistent memory:

**Factual knowledge about the codebase:**
- Project structure and file organization
- Module boundaries and dependency relationships
- API contracts and type signatures
- Configuration conventions and environment requirements

**Procedural knowledge about workflows:**
- How to build, test, and deploy the project
- Code review conventions and approval processes
- Release procedures and versioning schemes
- Incident response playbooks

**Episodic knowledge about history:**
- Why specific design decisions were made
- What approaches were tried and rejected
- Which areas of the code are fragile or frequently changed
- Past interactions with specific team members and their preferences

**Meta-knowledge about itself:**
- Which tools and approaches work well for this project
- Calibration data: where the agent tends to make mistakes
- Learned heuristics from past successes and failures

### 2.2 Memory Properties

Effective agent memory must exhibit several properties:

| Property | Description |
|----------|-------------|
| **Persistence** | Survives session boundaries and system restarts |
| **Queryability** | Relevant memories are retrievable by semantic similarity, not just exact key match |
| **Evolvability** | Knowledge updates as the codebase changes; stale memories are retired |
| **Contextuality** | Retrieval is sensitive to the agent's current task and context |
| **Efficiency** | Memory operations don't dominate agent response latency |
| **Transparency** | Humans can inspect what the agent remembers and why |

---

## 3. Three-Layer Memory Model

Drawing from cognitive science models of human memory (Atkinson-Shiffrin, Tulving's episodic-semantic distinction, and Baddeley's working memory model), we propose a three-layer architecture:

```
┌─────────────────────────────────────────────┐
│  Working Memory                              │
│  (Current session context, active task state) │
│  Capacity: Limited | Lifetime: Session       │
├─────────────────────────────────────────────┤
│  Semantic Memory                             │
│  (Facts, patterns, relationships, skills)    │
│  Capacity: Large | Lifetime: Long-term       │
├─────────────────────────────────────────────┤
│  Episodic Memory                             │
│  (Events, interactions, decisions, outcomes)  │
│  Capacity: Large | Lifetime: Long-term       │
└─────────────────────────────────────────────┘
```

### 3.1 Working Memory

Working memory holds the agent's active context: the current task, recent tool outputs, conversation history, and intermediate reasoning state. It is analogous to the context window of a language model, but the architecture extends it with structured storage.

**Characteristics:**
- Bounded capacity (analogous to human working memory limits)
- Fast access (sub-millisecond latency)
- Session-scoped (cleared or archived when the session ends)
- Includes both explicit content (user messages, tool outputs) and implicit state (current goals, active hypotheses)

**Key design challenge: Context management.** Working memory capacity is limited by the language model's context window. The architecture must decide what to keep in active context and what to offload to long-term memory. This is the **memory management problem** — analogous to virtual memory in operating systems, but operating over semantic content rather than memory pages.

Strategies for context management:
- **Relevance scoring**: Prioritize context items by relevance to the current task
- **Summarization**: Compress older context into summaries that preserve essential information
- **Lazy loading**: Keep references to long-term memories and load full content on demand
- **Hierarchical context**: Maintain a tree of context levels (project → module → file → function) and expand as needed

### 3.2 Semantic Memory

Semantic memory stores the agent's accumulated knowledge about the world — facts, relationships, patterns, and skills that persist across sessions.

**Storage model: Knowledge graph with vector embeddings**

The hybrid approach combines the precision of structured knowledge graphs with the flexibility of vector similarity search:

```
Knowledge Graph Layer:
  - Nodes: Entities (files, functions, types, decisions, people)
  - Edges: Relationships (depends_on, authored_by, decided_in, tested_by)
  - Properties: Attributes on nodes and edges (confidence, timestamp, source)

Vector Embedding Layer:
  - Dense vector representations of knowledge items
  - Enables semantic similarity search across the knowledge base
  - Supports fuzzy queries ("things related to authentication")
```

**Why both?** Knowledge graphs excel at precise, relational queries ("What depends on UserService?") but struggle with fuzzy, similarity-based retrieval ("What have we done before that's similar to this problem?"). Vector embeddings handle similarity naturally but lose relational structure. The hybrid model provides both.

**Knowledge categories in semantic memory:**

| Category | Examples | Update Frequency |
|----------|----------|-----------------|
| Codebase structure | File layout, module boundaries, dependency graph | On every significant code change |
| Design decisions | Architecture choices, technology selections, trade-off rationales | On decision events |
| Coding patterns | Naming conventions, error handling idioms, testing patterns | Learned over time, updated gradually |
| Domain knowledge | Business rules, domain terminology, user personas | Updated when domain understanding deepens |
| Team conventions | Review preferences, communication norms, scheduling patterns | Updated on observation |

### 3.3 Episodic Memory

Episodic memory records specific events and interactions — the "what happened" complement to semantic memory's "what is true." Each episode is a structured record of an event with context:

```typescript
interface Episode {
  // Unique identifier
  id: string;

  // When this episode occurred
  timestamp: string;

  // The type of event
  eventType: 'task_completion' | 'decision' | 'error' | 'interaction'
            | 'discovery' | 'review' | 'deployment';

  // Structured summary of what happened
  summary: string;

  // The context in which this episode occurred
  context: {
    task: string;          // What the agent was trying to do
    trigger: string;       // What initiated the event
    participants: string[]; // Who was involved
    files: string[];       // What files were touched
  };

  // The outcome
  outcome: {
    success: boolean;
    result: string;        // What happened
    lessons: string[];     // What was learned
  };

  // Links to related episodes and semantic memories
  references: Reference[];

  // Embedding for similarity search
  embedding: number[];
}
```

**Episodic memory serves several critical functions:**

1. **Precedent recall**: "We tried this approach before on the auth module and it caused problems because..." This prevents agents from repeating mistakes.

2. **Decision provenance**: "This configuration was chosen because of requirement X discussed in session Y." This enables understanding the rationale behind the current state.

3. **Learning signal**: Patterns across episodes inform updates to semantic memory. If an agent repeatedly encounters a particular type of error in a particular module, that pattern is consolidated into semantic memory as knowledge about that module's fragility.

4. **Accountability**: Episodes provide an audit trail of agent actions and decisions, supporting the trust framework.

---

## 4. Memory Lifecycle

### 4.1 Acquisition

New memories enter the system through several channels:

- **Direct observation**: The agent observes tool outputs, code changes, and system events
- **Explicit learning**: Humans tell the agent something it should remember
- **Inference**: The agent derives new knowledge from existing memories and observations
- **Import**: Knowledge is ingested from external sources (documentation, existing codebases)

Each acquisition event creates a candidate memory with metadata about its source, confidence, and relevance.

### 4.2 Consolidation

Not every observation deserves a permanent memory. The consolidation process filters, refines, and integrates new information:

1. **Deduplication**: Is this genuinely new, or a repeat of existing knowledge?
2. **Conflict resolution**: Does this contradict existing memories? If so, which is more reliable?
3. **Abstraction**: Can specific episodes be generalized into semantic knowledge?
4. **Integration**: How does this connect to existing knowledge? What references should be created?

Consolidation is inspired by the biological process of memory consolidation during sleep — a periodic batch process that reviews recent memories and integrates them into the long-term store. In practice, consolidation runs:
- **Immediately** for high-confidence, high-relevance memories
- **At session boundaries** for accumulated session memories
- **Periodically** for pattern extraction across episodes

### 4.3 Retrieval

Memory retrieval is the most performance-critical operation. The retrieval system must balance:
- **Recall**: Finding all relevant memories (avoiding false negatives)
- **Precision**: Returning only relevant memories (avoiding noise)
- **Latency**: Operating within interactive response time budgets
- **Context-sensitivity**: Ranking results by relevance to the current task

**Retrieval strategies:**

| Strategy | Mechanism | Best For |
|----------|-----------|----------|
| **Key-based** | Exact match on structured fields | Known entities ("What do we know about UserService?") |
| **Semantic search** | Vector similarity on embeddings | Fuzzy queries ("Something similar to this error") |
| **Graph traversal** | Follow relationships in knowledge graph | Relational queries ("What depends on this module?") |
| **Temporal** | Filter by recency and frequency | Recent context ("What did we do yesterday?") |
| **Composite** | Combine multiple strategies with re-ranking | Complex queries requiring multiple dimensions |

### 4.4 Decay and Archival

Memories that are never retrieved gradually lose relevance. Rather than permanent deletion (which risks losing important but rarely-accessed knowledge), the system uses a tiered approach:

- **Active tier**: Frequently accessed memories, kept in fast storage with full fidelity
- **Warm tier**: Infrequently accessed memories, kept with reduced embedding precision
- **Archive tier**: Rarely accessed memories, kept as compressed summaries with original content available on demand
- **Tombstone tier**: Memories explicitly marked as obsolete (e.g., about deleted code), retained only for provenance

The decay rate is adjusted based on memory type: design decisions decay slowly (they remain relevant long after the code they concern has changed), while specific tool output details decay quickly.

---

## 5. Cross-Agent Memory Sharing

### 5.1 The Sharing Problem

In multi-agent environments, agents may need to share knowledge:
- An agent that debugged a module shares its understanding with an agent tasked with extending that module
- A code review agent shares its style observations with a code generation agent
- A planning agent shares its architectural decisions with implementation agents

Naive sharing (giving all agents access to all memories) creates problems:
- **Information overload**: Agents receive irrelevant memories that pollute their context
- **Conflicting perspectives**: Different agents may have formed contradictory models
- **Privacy violations**: Some memories may contain sensitive information not appropriate for all agents
- **Consistency hazards**: Concurrent updates to shared memory create race conditions

### 5.2 Shared Memory Architecture

We propose a **publish-subscribe model** for memory sharing:

```
Agent A                  Shared Memory Bus                Agent B
┌──────┐                 ┌──────────────┐                ┌──────┐
│      │───publishes────▶│  Topic:       │───subscribes──▶│      │
│      │                 │  "auth-module" │                │      │
│      │◀──subscribes────│  "api-design"  │───publishes──▶│      │
│      │                 │  "test-patterns"│               │      │
└──────┘                 └──────────────┘                └──────┘
```

- Agents **publish** memories to named topics based on their domain
- Agents **subscribe** to topics relevant to their current task
- A **consistency layer** handles conflicts when multiple agents update related knowledge
- An **access control layer** enforces visibility rules

### 5.3 Conflict Resolution

When agents produce contradictory memories, the system must resolve conflicts:

1. **Timestamp-based**: More recent observations supersede older ones (suitable for factual knowledge about mutable state)
2. **Confidence-weighted**: Higher-confidence memories take precedence (suitable for uncertain inferences)
3. **Source-authority**: Memories from agents with domain expertise take precedence (suitable for specialized knowledge)
4. **Human-arbitrated**: Conflicts are flagged for human resolution (suitable for ambiguous design decisions)
5. **Preserved divergence**: Both perspectives are retained with their provenance (suitable when disagreement is informative)

---

## 6. Privacy and Access Control

### 6.1 Memory Classification

Not all memories should be equally accessible:

| Classification | Access | Examples |
|---------------|--------|----------|
| **Public** | All agents and humans | Codebase structure, build commands, coding conventions |
| **Team** | Agents and humans in the same team | Design decisions, sprint planning, team preferences |
| **Private** | Single agent only | Working hypotheses, calibration data, intermediate reasoning |
| **Sensitive** | Restricted access with audit | Security configurations, credentials encountered, vulnerability analysis |

### 6.2 Right to Forget

Humans may request that specific memories be deleted:
- Agent must comply with memory deletion requests
- Deletion must propagate to all derived memories (inferences, summaries)
- Deletion must be logged (the fact of deletion, not the deleted content)
- Deletion is irreversible — there is no undo

This is both a privacy requirement and a trust-building measure. Humans who know they can control what agents remember are more likely to share information openly.

---

## 7. Implementation Considerations

### 7.1 Storage Backend Options

| Backend | Strengths | Weaknesses | Best For |
|---------|-----------|------------|----------|
| **SQLite + vector extension** | Simple, embedded, no dependencies | Limited scalability, basic vector search | Single-agent, local development |
| **PostgreSQL + pgvector** | Mature, relational + vector, ACID | Operational complexity | Small team, moderate scale |
| **Neo4j + vector index** | Native graph, good traversal | Specialized, less mature vector support | Graph-heavy workloads |
| **Dedicated vector DB (Qdrant, Weaviate)** | Optimized vector ops, good at scale | Another system to operate, no native graph | Large-scale similarity search |
| **Hybrid (PostgreSQL + vector DB)** | Best of both worlds | Operational complexity, consistency across systems | Production multi-agent systems |

### 7.2 Embedding Strategy

The choice of embedding model and strategy significantly impacts retrieval quality:

- **Code-specific embeddings** (e.g., models trained on code) for codebase knowledge
- **General-purpose embeddings** for natural language memories (decisions, conversations)
- **Chunking strategy**: Memory items should be embedded at multiple granularities (full document, paragraph, sentence) with appropriate metadata
- **Re-embedding**: As embedding models improve, the system should support re-embedding existing memories without losing metadata

### 7.3 Performance Budget

Memory operations must fit within the agent's response time budget:

| Operation | Target Latency | Approach |
|-----------|---------------|----------|
| Working memory read/write | < 1ms | In-process data structure |
| Semantic memory query | < 100ms | Pre-built index, connection pooling |
| Episodic memory query | < 200ms | Vector search with pre-filtering |
| Memory consolidation | < 5s | Background process, not on critical path |
| Full re-indexing | Minutes to hours | Offline batch process |

### 7.4 Memory Observability

Humans need visibility into agent memory for trust and debugging:

- **Memory browser**: UI for exploring what the agent knows, with search and filtering
- **Memory diff**: View changes to memory over time, similar to git diff for code
- **Retrieval explanation**: For each agent action, show which memories influenced the decision
- **Memory health metrics**: Staleness ratio, conflict rate, retrieval hit rate, storage utilization

---

## 8. Relationship to Retrieval-Augmented Generation (RAG)

The semantic memory architecture described here is related to but distinct from standard RAG approaches:

**Standard RAG:**
- External documents are chunked and embedded
- Retrieval is triggered by the current query
- Retrieved chunks are inserted into the prompt
- No persistent memory — each interaction starts fresh

**ANP Semantic Memory:**
- Knowledge is actively curated, not passively ingested
- Retrieval considers task context, not just query similarity
- Memory evolves through consolidation, not just accumulation
- Episodes and semantic knowledge are distinct layers with different retrieval strategies
- Cross-agent sharing adds a social dimension absent from single-user RAG

The ANP memory system can use RAG as a building block (particularly for codebase indexing) but adds the lifecycle management, cross-agent coordination, and active curation that distinguish a memory system from a retrieval system.

---

## 9. Open Research Questions

1. **Optimal consolidation frequency**: How often should episodic memories be consolidated into semantic knowledge? Too frequent wastes resources; too infrequent risks losing patterns.

2. **Memory capacity limits**: Should there be explicit limits on memory size, and if so, what eviction policies work best? LRU, relevance-based, or hybrid?

3. **Adversarial memory**: How do we protect against memory poisoning — deliberate injection of false memories by malicious actors or compromised systems?

4. **Memory transfer**: When an agent is replaced or upgraded, how should its memories be transferred? Full transfer risks inheriting biases; no transfer loses valuable knowledge.

5. **Forgetting as feature**: In human cognition, forgetting serves important functions (generalization, noise reduction). Should agent memory systems implement intentional forgetting beyond simple decay?

6. **Grounding**: How do we ensure that agent memories remain grounded in reality as the codebase evolves? A memory about code that no longer exists in its remembered form is potentially misleading.

---

## 10. Summary

The Semantic Memory Architecture provides the persistent knowledge substrate that transforms stateless language model interactions into coherent, learning agent experiences. By separating working, semantic, and episodic memory layers — each with appropriate storage, retrieval, and lifecycle characteristics — we enable agents that genuinely accumulate expertise over time.

The critical insight is that **memory is not just storage — it is an active, evolving system** that requires curation, consolidation, and governance. A well-designed memory architecture is what makes an agent more valuable in its hundredth session than in its first.
