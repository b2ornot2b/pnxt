# Implementation Reference Architecture

## Phase 3 Research — From Theory to Practice

---

## 1. Introduction

The preceding research documents describe the Agent-Native Programming paradigm in conceptual terms: what agents are, how they communicate, what they remember, how trust is managed. This document bridges concept to implementation by describing a reference architecture — a concrete system design that realizes the ANP principles.

This is not a specification for a specific product but a reference design that implementors can adapt. The architecture is deliberately modular: teams can adopt individual components incrementally rather than requiring an all-or-nothing commitment.

---

## 2. System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        Human Interface                            │
│  (IDE extensions, CLI, web dashboard, chat interface)             │
├──────────────────────────────────────────────────────────────────┤
│                     Agent Orchestration Layer                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ Task Manager  │  │ Coordination │  │ Trust Engine  │           │
│  │              │  │ Service      │  │              │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
├──────────────────────────────────────────────────────────────────┤
│                      Agent Runtime Layer                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Agent A  │  │ Agent B  │  │ Agent C  │  │ Agent N  │       │
│  │(Planning)│  │(Coding)  │  │(Review)  │  │(Testing) │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
├──────────────────────────────────────────────────────────────────┤
│                      Platform Services                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Memory   │  │ ACI      │  │ Audit    │  │ Security │       │
│  │ Service  │  │ Gateway  │  │ Service  │  │ Service  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
├──────────────────────────────────────────────────────────────────┤
│                      External Systems                             │
│  (Git, CI/CD, Issue Tracker, Package Registry, Cloud Services)   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Agent Runtime

### 3.1 Agent Lifecycle

An agent instance progresses through a defined lifecycle:

```
Created → Initializing → Ready → Active → Completing → Terminated
                                   │                        ▲
                                   └── Suspended ───────────┘
```

**Created**: Agent definition loaded, resources allocated.

**Initializing**: Agent loads its memory, connects to required services, negotiates capabilities. This phase includes loading relevant semantic memories and establishing the working context.

**Ready**: Agent is idle, waiting for task assignment or event triggers.

**Active**: Agent is executing a task. This is the primary state where agents reason, use tools, and produce output.

**Completing**: Agent is wrapping up — consolidating memories, updating status, releasing resources.

**Suspended**: Agent is paused (waiting for human approval, blocked on a dependency, or resource-constrained). State is preserved for resumption.

**Terminated**: Agent instance is destroyed. Memory is persisted; resources are released.

### 3.2 Agent Configuration

Each agent is defined by a configuration that specifies its behavior:

```typescript
interface AgentConfig {
  // Identity
  id: string;
  name: string;
  type: 'planning' | 'coding' | 'review' | 'testing' | 'deployment' | 'custom';

  // Behavioral profile
  behavior: {
    // How the agent approaches problems
    style: 'cautious' | 'balanced' | 'exploratory';

    // How much the agent communicates
    verbosity: 'minimal' | 'normal' | 'detailed';

    // How the agent handles uncertainty
    uncertainty_response: 'ask' | 'best_effort' | 'refuse';

    // Agent-specific system prompt or instructions
    instructions: string;
  };

  // Capabilities
  capabilities: {
    // Tools the agent can use
    tools: string[];

    // Maximum concurrent operations
    concurrency: number;

    // Token budget per task
    token_budget: number;

    // Time budget per task (seconds)
    time_budget: number;
  };

  // Memory configuration
  memory: {
    // Which semantic memory topics to load at initialization
    preload_topics: string[];

    // Maximum working memory size
    working_memory_limit: number;

    // Whether to persist session memory
    persist_sessions: boolean;
  };

  // Trust level
  trust_level: 0 | 1 | 2 | 3 | 4;
}
```

### 3.3 Agent Instantiation Strategies

**Long-lived agents**: Persist across sessions, accumulating context. Best for agents with specialized roles (the project's "architect agent" or "security reviewer agent"). Trade-off: higher resource cost, richer context.

**Task-scoped agents**: Created for a specific task, terminated when complete. Best for parallelizable work (implement function A, implement function B). Trade-off: lower resource cost, no persistent context.

**Pool-based agents**: A pool of generic agents serves incoming tasks. The runtime selects an appropriate agent based on task requirements and agent specialization. Trade-off: better resource utilization, less specialization.

---

## 4. Memory Service

### 4.1 Architecture

The Memory Service implements the three-layer memory model:

```
┌─────────────────────────────────────────────┐
│              Memory Service API               │
│  store() | query() | update() | forget()     │
├────────────────┬────────────────┬────────────┤
│ Working Memory │ Semantic Memory│ Episodic   │
│ (In-process)   │ (Graph + Vector)│ Memory    │
│                │                │ (Event Log)│
├────────────────┴────────────────┴────────────┤
│             Storage Backend                    │
│  (PostgreSQL + pgvector, or SQLite + ext)     │
└─────────────────────────────────────────────┘
```

### 4.2 Memory API

```typescript
interface MemoryService {
  // Store a new memory
  store(entry: MemoryEntry): Promise<string>;

  // Query memories by semantic similarity
  query(params: {
    text: string;               // Natural language query
    memory_type?: MemoryType;   // Filter by type
    recency_weight?: number;    // Weight recent memories (0-1)
    limit?: number;             // Max results
    min_relevance?: number;     // Minimum relevance score
  }): Promise<MemoryResult[]>;

  // Update an existing memory
  update(id: string, updates: Partial<MemoryEntry>): Promise<void>;

  // Mark a memory as obsolete
  forget(id: string, reason: string): Promise<void>;

  // Get memories related to a specific entity
  getRelated(entityId: string, relationship?: string): Promise<MemoryResult[]>;

  // Consolidate recent episodic memories into semantic knowledge
  consolidate(params: {
    since?: string;             // Consolidate episodes after this timestamp
    topic?: string;             // Focus consolidation on this topic
  }): Promise<ConsolidationReport>;
}

interface MemoryEntry {
  type: 'semantic' | 'episodic';
  content: string;
  metadata: {
    source: string;            // Where this memory came from
    confidence: number;        // How confident we are (0-1)
    topics: string[];          // Memory topics for pub-sub
    entities: string[];        // Referenced entities (files, functions, etc.)
    timestamp: string;
  };
}

interface MemoryResult {
  id: string;
  entry: MemoryEntry;
  relevance: number;           // Relevance score for the query (0-1)
  accessCount: number;         // How often this memory has been retrieved
  lastAccessed: string;
}
```

### 4.3 Memory Indexing

For efficient retrieval, the Memory Service maintains multiple indexes:

- **Vector index**: Embeddings of memory content for similarity search
- **Entity index**: Mapping from entity identifiers (file paths, function names) to related memories
- **Topic index**: Mapping from topic tags to memories, supporting the pub-sub model
- **Temporal index**: Chronological ordering for recency-biased queries
- **Relationship index**: Graph of relationships between memory entries

---

## 5. ACI Gateway

### 5.1 Role

The ACI Gateway mediates all agent interactions with external systems. It serves as:
- **Single point of enforcement**: All capability checks happen here
- **Audit point**: All operations are logged
- **Translation layer**: Converts between agent-native ACI messages and system-specific APIs
- **Rate limiter**: Prevents resource exhaustion

### 5.2 Tool Registration

External tools are registered with the ACI Gateway using structured definitions:

```typescript
interface ToolRegistration {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  sideEffects: SideEffect[];
  handler: ToolHandler;

  // Operational characteristics
  ops: {
    timeout: number;           // Max execution time (ms)
    retryable: boolean;        // Whether transient failures can be retried
    idempotent: boolean;       // Whether repeated calls are safe
    costCategory: 'cheap' | 'moderate' | 'expensive';
  };
}
```

### 5.3 Built-in Tool Categories

The reference architecture provides these built-in tool categories:

**File operations**: `file.read`, `file.write`, `file.edit`, `file.delete`, `file.search`, `file.glob`

**Git operations**: `git.status`, `git.diff`, `git.commit`, `git.branch`, `git.log`, `git.merge`

**Build operations**: `build.run`, `build.test`, `build.lint`, `build.typecheck`

**Search operations**: `search.code`, `search.files`, `search.symbols`, `search.references`

**Communication**: `comm.post_comment`, `comm.create_issue`, `comm.update_status`

Each tool has a registered handler, schema, and operational characteristics. New tools can be added by implementing the `ToolHandler` interface and registering with the gateway.

---

## 6. Task Manager

### 6.1 Task Model

```typescript
interface Task {
  id: string;
  title: string;
  description: string;

  // Task structure
  parent?: string;             // Parent task ID (for subtasks)
  dependencies: string[];      // Tasks that must complete before this one
  subtasks: string[];          // Child tasks

  // Assignment
  assignee?: string;           // Agent ID
  requiredCapabilities: string[]; // Capabilities needed

  // Status
  status: 'pending' | 'assigned' | 'in_progress' | 'blocked'
        | 'review' | 'completed' | 'failed' | 'cancelled';

  // Resources
  budget: {
    tokens: number;
    time: number;              // Seconds
    files: number;             // Max files to modify
  };

  // Context
  context: {
    objectives: string[];
    constraints: string[];
    acceptanceCriteria: string[];
    relatedMemories: string[]; // Memory IDs providing context
  };

  // Results
  result?: {
    summary: string;
    filesChanged: string[];
    testsRun: number;
    testsPassed: number;
    reviewStatus: 'pending' | 'approved' | 'changes_requested';
  };
}
```

### 6.2 Task Scheduling

The Task Manager schedules tasks based on:

1. **Dependencies**: Tasks with satisfied dependencies are eligible
2. **Priority**: Higher priority tasks are scheduled first
3. **Agent availability**: Tasks are assigned to available agents with matching capabilities
4. **Resource constraints**: Token and time budgets are checked before assignment
5. **Trust requirements**: Task risk level is matched against agent trust level

### 6.3 Task Decomposition

The Task Manager supports automatic decomposition through a planning agent:

1. Human creates a high-level task ("Implement user authentication")
2. Task Manager assigns it to a planning agent
3. Planning agent decomposes into subtasks with dependencies
4. Task Manager validates the decomposition and schedules subtasks
5. Subtasks are assigned to implementation agents

---

## 7. Trust Engine

### 7.1 Architecture

```
┌─────────────────────────────────────────────┐
│              Trust Engine                     │
├──────────────┬──────────────┬───────────────┤
│ Trust Store  │ Policy Engine │ Calibration   │
│ (Agent trust │ (Permission  │ Service       │
│  profiles)   │  evaluation) │ (Performance  │
│              │              │  tracking)    │
└──────────────┴──────────────┴───────────────┘
```

### 7.2 Trust Evaluation Flow

When an agent requests an action:

```
Agent requests action
    │
    ▼
Trust Engine checks:
    1. Does agent have required capability? ──No──▶ DENIED
    2. Is action within scope constraints? ──No──▶ DENIED
    3. Does action match trust level? ──No──▶ ESCALATE to human
    4. Does policy auto-approve? ──Yes──▶ APPROVED
    5. Else ──▶ QUEUE for human review
```

### 7.3 Calibration

The Trust Engine continuously calibrates agent trust levels based on outcomes:

```typescript
interface TrustCalibration {
  agentId: string;

  // Performance metrics
  metrics: {
    tasksCompleted: number;
    tasksSuccessful: number;        // Passed review without revision
    tasksRequiringRevision: number;
    tasksFailed: number;

    changesIntroducingBugs: number;
    changesPassingTests: number;

    escalationAccuracy: number;     // % of escalations that were warranted
    confidenceCalibration: number;  // Correlation between stated and actual confidence
  };

  // Trust score computation
  trustScore: number;              // 0-100
  recommendedLevel: 0 | 1 | 2 | 3 | 4;
  currentLevel: 0 | 1 | 2 | 3 | 4;

  // If recommended differs from current
  adjustmentReason?: string;
}
```

---

## 8. Audit Service

### 8.1 What Gets Logged

Every significant event is captured:

- Agent actions (tool use, file modifications, git operations)
- Permission checks (grants, denials, escalations)
- Human interactions (approvals, rejections, steering corrections)
- Agent communication (inter-agent messages, human-agent messages)
- System events (agent lifecycle, service health, errors)
- Memory operations (stores, queries, updates, deletions)

### 8.2 Log Structure

```typescript
interface AuditEvent {
  id: string;
  timestamp: string;
  category: 'action' | 'permission' | 'communication' | 'system' | 'memory';

  // Who
  actor: {
    type: 'agent' | 'human' | 'system';
    id: string;
  };

  // What
  event: string;
  details: Record<string, unknown>;

  // Context
  sessionId: string;
  taskId?: string;
  traceId: string;

  // Outcome
  result: 'success' | 'failure' | 'blocked' | 'escalated';
  resultDetails?: string;
}
```

### 8.3 Retention and Access

- Audit logs are append-only (immutable)
- Retention period is configurable (default: 90 days for detail, 1 year for summaries)
- Access to audit logs requires elevated permissions
- Audit logs themselves are audited (access logging)

---

## 9. Deployment Topologies

### 9.1 Local Development (Single Developer)

```
Developer Machine
├── IDE with ANP Extension
├── Agent Runtime (embedded)
│   ├── Single coding agent
│   └── Single review agent
├── Memory Service (SQLite)
├── ACI Gateway (in-process)
└── Audit Log (local file)
```

**Characteristics**: Minimal infrastructure. Agents run as processes on the developer's machine. Memory is stored locally. Suitable for individual productivity enhancement.

### 9.2 Team Development (Small Team)

```
Shared Infrastructure
├── Agent Runtime Service
│   ├── Planning agent
│   ├── Coding agents (pool)
│   ├── Review agent
│   └── Testing agent
├── Memory Service (PostgreSQL)
├── ACI Gateway (centralized)
├── Trust Engine
└── Audit Service

Developer Machines
├── IDE with ANP Extension (thin client)
└── Local agent for immediate tasks
```

**Characteristics**: Shared agents and memory enable cross-developer collaboration. Centralized trust and audit provide governance. Developers interact through IDE extensions.

### 9.3 Enterprise (Large Organization)

```
Platform Layer
├── Agent Runtime Cluster (Kubernetes)
│   ├── Agent pools per team
│   ├── Shared specialist agents (security, architecture)
│   └── Auto-scaling based on demand
├── Memory Service Cluster
│   ├── Per-team memory partitions
│   ├── Organization-wide shared memory
│   └── Cross-team memory sharing (controlled)
├── ACI Gateway Cluster
├── Trust Engine (centralized policy)
├── Audit Service (centralized logging)
└── Dashboard and Admin UI

Team Infrastructure
├── Team-specific agent configurations
├── Team memory partitions
└── Team-specific trust policies
```

**Characteristics**: Multi-tenant with isolation. Organization-wide policies with team-level customization. Shared specialist agents (security reviewer, architecture advisor) serve multiple teams.

---

## 10. Migration Strategy

### 10.1 Phase 1: Augmentation

Introduce agents as assistants within existing workflows:
- Add a coding assistant agent to the IDE
- Add a review agent to the PR process
- No changes to existing architecture or processes
- Agents operate at trust level 0-1 (read-only to supervised writes)

**Effort**: Low. **Risk**: Low. **Value**: Immediate productivity improvement.

### 10.2 Phase 2: Integration

Deepen agent integration into development processes:
- Deploy Memory Service for persistent project knowledge
- Configure trust levels and permission policies
- Agents participate in task management (creating issues, updating status)
- Agents operate at trust level 1-2

**Effort**: Medium. **Risk**: Low-medium. **Value**: Agents become genuinely useful team members.

### 10.3 Phase 3: Automation

Agents handle routine tasks autonomously:
- Multi-agent coordination for feature implementation
- Automated code review with human approval for merges
- Agents manage their own task decomposition and scheduling
- Agents operate at trust level 2-3

**Effort**: Medium-high. **Risk**: Medium. **Value**: Significant reduction in routine development work.

### 10.4 Phase 4: Collaboration

Agents and humans work as peers:
- Agents contribute to design discussions and architectural decisions
- Cross-agent collaboration on complex tasks
- Agents mentor junior developers (code review, best practice guidance)
- Agents operate at trust level 3-4

**Effort**: High. **Risk**: Medium-high. **Value**: Qualitative improvement in development capability.

---

## 11. Technology Recommendations

### 11.1 Agent Runtime

- **Language model backend**: Claude, GPT-4, or equivalent reasoning model
- **Runtime framework**: Custom runtime or adaptation of existing agent frameworks (LangGraph, CrewAI, Autogen)
- **Process management**: For production, containerized agents with orchestration (Kubernetes)

### 11.2 Memory Storage

- **Development**: SQLite with sqlite-vss or sqlite-vec for vector search
- **Production**: PostgreSQL with pgvector extension
- **Large scale**: Dedicated vector database (Qdrant, Weaviate) alongside PostgreSQL for relational data

### 11.3 Communication

- **Internal**: gRPC or WebSocket for low-latency agent-to-agent communication
- **External**: REST APIs for integration with existing tools
- **Events**: Message queue (Redis Streams, NATS) for event distribution

### 11.4 Observability

- **Tracing**: OpenTelemetry for distributed tracing
- **Metrics**: Prometheus for operational metrics
- **Logging**: Structured JSON logging with correlation IDs
- **Dashboard**: Grafana for visualization

---

## 12. Summary

This reference architecture provides a concrete foundation for implementing the Agent-Native Programming paradigm. Its modular design allows incremental adoption — teams can start with a single coding agent and local memory, then grow into multi-agent coordination with enterprise governance as their needs and trust mature.

The key architectural decisions are:

1. **Layered architecture**: Clean separation between human interface, orchestration, agent runtime, platform services, and external systems
2. **Memory as a first-class service**: Not an afterthought but a core component with its own API, storage, and lifecycle
3. **Trust as infrastructure**: Permission evaluation, calibration, and audit are system services, not application logic
4. **Modular tool integration**: New tools are added through registration, not code modification
5. **Flexible deployment**: Same architecture scales from single developer to enterprise

The architecture is intentionally opinionated about structure but flexible about implementation choices. Teams should adapt the reference design to their specific technology stack, team size, and maturity level.
