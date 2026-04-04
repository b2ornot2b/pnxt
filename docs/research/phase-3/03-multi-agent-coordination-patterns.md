# Multi-Agent Coordination Patterns

## Phase 3 Research — Agent Collaboration and Orchestration

---

## 1. Introduction

The Agent-Native Programming paradigm envisions not a single omniscient agent but an ecosystem of specialized agents collaborating on software development tasks. A planning agent decomposes features into tasks. Implementation agents write code for different modules. A review agent evaluates changes against project standards. A testing agent verifies behavior. A deployment agent manages releases.

This multiplicity introduces coordination challenges that don't exist in single-agent systems: How do agents divide work? How do they communicate? How do they resolve disagreements? How do we prevent them from interfering with each other?

This document catalogs the coordination patterns that emerge in multi-agent software development and provides guidance for their implementation.

---

## 2. Agent Topology Models

### 2.1 Hierarchical (Orchestrator-Worker)

```
        ┌───────────────┐
        │  Orchestrator  │
        │    Agent       │
        └───┬───┬───┬───┘
            │   │   │
     ┌──────┘   │   └──────┐
     ▼          ▼          ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│ Worker  │ │ Worker  │ │ Worker  │
│ Agent A │ │ Agent B │ │ Agent C │
└─────────┘ └─────────┘ └─────────┘
```

**Structure**: A single orchestrator agent decomposes tasks, assigns them to worker agents, monitors progress, and aggregates results.

**Strengths:**
- Clear authority and responsibility
- Simple coordination logic (orchestrator decides everything)
- Natural fit for decomposable tasks (implement feature X across modules A, B, C)
- Easy to reason about and debug

**Weaknesses:**
- Orchestrator is a single point of failure and bottleneck
- Workers cannot coordinate directly — all communication flows through orchestrator
- Orchestrator must understand all worker domains well enough to decompose tasks correctly
- Doesn't scale well to large numbers of workers

**Best for**: Well-defined tasks that decompose cleanly into independent subtasks. Feature implementation where the architecture is understood and the interfaces between subtasks are clear.

### 2.2 Peer-to-Peer (Collaborative)

```
┌─────────┐     ┌─────────┐
│ Agent A  │◄───▶│ Agent B  │
└────┬─────┘     └────┬─────┘
     │                │
     │    ┌─────────┐ │
     └───▶│ Agent C  │◀┘
          └─────────┘
```

**Structure**: Agents communicate directly with each other, negotiating task allocation and resolving conflicts through consensus protocols.

**Strengths:**
- No single point of failure
- Agents can leverage each other's expertise directly
- Scales better for collaborative tasks (code review, design discussion)
- Enables emergent coordination patterns

**Weaknesses:**
- Coordination complexity grows quadratically with agent count
- Reaching consensus can be slow
- Risk of circular dependencies and deadlocks
- Harder to reason about system behavior

**Best for**: Creative and exploratory tasks where the solution path is not predetermined. Design discussions, brainstorming, and collaborative debugging.

### 2.3 Hybrid (Hierarchical with Peer Communication)

```
        ┌───────────────┐
        │  Orchestrator  │
        └───┬───┬───┬───┘
            │   │   │
     ┌──────┘   │   └──────┐
     ▼          ▼          ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│ Agent A  │◄┤ Agent B  │◄┤ Agent C  │
│          ├▶│          ├▶│          │
└─────────┘ └─────────┘ └─────────┘
```

**Structure**: An orchestrator handles task decomposition and high-level coordination, but workers can communicate directly for fine-grained collaboration.

**Strengths:**
- Combines clear authority with flexible collaboration
- Orchestrator handles strategy; workers handle tactics
- Direct worker communication reduces latency for tightly coupled tasks
- Most natural fit for software development workflows

**Weaknesses:**
- Most complex to implement correctly
- Must carefully define what decisions workers can make autonomously vs. what requires orchestrator involvement
- Potential for workers to bypass orchestrator coordination, causing inconsistencies

**Best for**: Most real-world software development scenarios, where tasks have both decomposable and collaborative aspects.

---

## 3. Task Decomposition and Delegation

### 3.1 Decomposition Strategies

**Functional decomposition**: Divide by system component or module. Agent A handles the API layer, Agent B handles the database layer, Agent C handles the UI.

**Temporal decomposition**: Divide by workflow phase. Agent A handles planning, Agent B handles implementation, Agent C handles testing.

**Skill-based decomposition**: Divide by required expertise. The security-specialist agent handles authentication code, the performance-specialist agent handles optimization, the UI-specialist agent handles component design.

**Risk-based decomposition**: Critical or risky tasks go to more capable or more carefully supervised agents. Routine tasks go to faster, less supervised agents.

### 3.2 Delegation Protocol

When an orchestrator delegates a task to a worker:

```typescript
interface TaskDelegation {
  // What to do
  task: {
    description: string;      // Natural language description
    objectives: string[];     // Measurable success criteria
    constraints: string[];    // Boundaries and limitations
    context: string[];        // Background information
  };

  // How to do it
  resources: {
    capabilities: string[];   // ACI capabilities granted
    memory_access: string[];  // Memory topics accessible
    time_budget: number;      // Maximum time allocation
    token_budget: number;     // Maximum token allocation
  };

  // How to report
  reporting: {
    checkpoints: string[];    // When to report progress
    escalation_triggers: string[];  // When to ask for help
    completion_criteria: string[];  // How to know when done
  };
}
```

**Key principle: Delegation should be complete.** A worker should not need to make round-trips to the orchestrator for information that was available at delegation time. This reduces coordination overhead and enables parallel execution.

### 3.3 Task Dependencies

Some tasks have dependencies: "Implement the API endpoint" must complete before "Write the integration test for the API endpoint." The orchestrator must model these dependencies and schedule accordingly:

```
Task A: Define API types          ──┐
Task B: Implement API endpoint    ──┤──▶ Task D: Write integration tests
Task C: Set up test fixtures      ──┘
```

**Dependency types:**
- **Hard dependency**: Task B cannot start until Task A completes (data dependency)
- **Soft dependency**: Task B could start before Task A completes but would benefit from A's output (information dependency)
- **Resource dependency**: Tasks A and B need exclusive access to the same resource (contention)

The orchestrator should maximize parallelism by starting independent tasks concurrently and only serializing where hard dependencies exist.

---

## 4. Communication Patterns

### 4.1 Direct Messaging

Agent-to-agent communication for specific, targeted information exchange:

```
Agent A ──── "What type does the UserService.create method return?" ────▶ Agent B
Agent A ◀─── "Promise<User>, defined in src/types/user.ts:15" ──────── Agent B
```

**When to use**: Known recipient, specific question, synchronous response expected.

### 4.2 Broadcast

One agent communicates to all agents:

```
Agent A ──── "Breaking: I'm renaming the User type to Account" ────▶ All Agents
```

**When to use**: Information that affects multiple agents, such as interface changes, convention updates, or blocking issues.

### 4.3 Publish-Subscribe

Agents subscribe to topics of interest and receive messages published to those topics:

```
Agent A publishes to "api-changes": "Added new endpoint POST /users/bulk"
Agent B (subscribed to "api-changes"): receives notification
Agent C (not subscribed): does not receive
```

**When to use**: Decoupled information flow where producers don't know or care about specific consumers.

### 4.4 Blackboard

A shared workspace where agents read and write information:

```
┌──────────────────────────────────────┐
│           Blackboard                  │
│                                      │
│  api_design: { ... }    (Agent A)    │
│  db_schema: { ... }     (Agent B)    │
│  test_plan: { ... }     (Agent C)    │
│  open_questions: [...]  (Any agent)  │
│                                      │
└──────────────────────────────────────┘
```

**When to use**: Collaborative tasks where agents build on each other's work incrementally, such as design documents, architectural decisions, or shared plans.

---

## 5. Conflict Resolution

### 5.1 Types of Conflicts

**Resource conflicts**: Multiple agents want to modify the same file simultaneously.

**Design conflicts**: Agents disagree about the best approach (e.g., one agent proposes a microservices architecture, another proposes a monolith).

**Convention conflicts**: Agents apply different conventions (e.g., one uses camelCase, another uses snake_case).

**Priority conflicts**: Agents disagree about which task should be prioritized.

### 5.2 Resolution Mechanisms

**Locking**: For resource conflicts, pessimistic or optimistic locking prevents concurrent modification. Pessimistic locking (acquire before modify) is simpler but reduces parallelism. Optimistic locking (detect conflicts at write time) allows more parallelism but requires merge or retry logic.

**Authority-based**: Designated authority agents make final decisions in their domain. The architecture agent decides design questions. The style agent decides convention questions. The product agent decides priority questions.

**Voting**: For peer-to-peer topologies, agents vote on disputed decisions. Requires an odd number of voters or a tiebreaking mechanism.

**Escalation to human**: When agents cannot resolve a conflict, they escalate to a human decision-maker. This is the ultimate fallback and should be reserved for genuinely ambiguous situations — excessive escalation defeats the purpose of automation.

**Merge**: For resource conflicts on text files, standard three-way merge algorithms can often resolve conflicts automatically. When automatic merge fails, the conflict is escalated.

### 5.3 Conflict Prevention

Better than resolving conflicts is preventing them:

- **Clear boundaries**: Assign agents to non-overlapping domains where possible
- **Interface contracts**: Define stable interfaces between agent domains so changes are isolated
- **Convention enforcement**: Shared conventions reduce the space for disagreement
- **Communication before action**: Agents announce intended changes before making them, giving others a chance to object

---

## 6. Patterns for Common Scenarios

### 6.1 Feature Implementation

```
Orchestrator: Decomposes feature into tasks
    │
    ├──▶ Agent A: Implement data model
    ├──▶ Agent B: Implement API endpoints (waits for A)
    ├──▶ Agent C: Implement UI components (waits for A's types)
    │
    ├──▶ Agent D: Write tests (waits for A, B)
    │
    └──▶ Review Agent: Review all changes
         │
         └──▶ Agents A-D: Address review feedback
```

**Pattern**: Hierarchical with dependency-aware scheduling. The orchestrator manages the overall workflow while workers execute their assigned tasks independently.

### 6.2 Bug Investigation

```
Orchestrator: Assigns bug to investigator
    │
    └──▶ Investigator Agent:
            1. Reproduce the bug
            2. Identify root cause
            3. Propose fix options
            │
            ├──▶ If fix is straightforward:
            │       Implement and test
            │
            └──▶ If fix affects multiple components:
                    Escalate to orchestrator for
                    multi-agent coordination
```

**Pattern**: Single-agent with escalation. Most bugs are localized and don't require multi-agent coordination. The investigator escalates only when the fix has broad impact.

### 6.3 Code Review

```
Review Agent receives PR
    │
    ├──▶ Parallel review passes:
    │       ├── Correctness check
    │       ├── Style/convention check
    │       ├── Security scan
    │       ├── Performance analysis
    │       └── Test coverage check
    │
    └──▶ Synthesize findings into review
            │
            └──▶ Peer discussion with author agent
                    (resolve ambiguities before publishing review)
```

**Pattern**: Fan-out for parallel analysis, fan-in for synthesis, followed by peer discussion. The review is more thorough than a single-pass review and faster than sequential checking.

### 6.4 Architectural Decision

```
All Agents contribute to Blackboard:
    │
    ├── Agent A: Proposes Option 1 with analysis
    ├── Agent B: Proposes Option 2 with analysis
    ├── Agent C: Evaluates both options against requirements
    │
    └── Human: Makes final decision based on agent analysis
        │
        └── Decision recorded in shared memory
            for future reference
```

**Pattern**: Blackboard with human arbitration. Agents provide analysis and recommendations but humans make the final call on architectural decisions that have long-term consequences.

---

## 7. Anti-Patterns

### 7.1 The Chatty Agents Problem

**Symptom**: Agents exchange excessive messages for simple coordination, spending more time communicating than working.

**Cause**: Insufficiently complete task delegation, requiring workers to make frequent round-trips for information.

**Fix**: Include complete context in task delegations. If workers frequently ask the same types of questions, enrich the delegation protocol.

### 7.2 The Hero Agent Problem

**Symptom**: One agent does most of the work while others sit idle or do trivial tasks.

**Cause**: Poor task decomposition that creates one large task and several tiny ones, or an agent that takes on additional tasks beyond its assignment.

**Fix**: Invest in better task decomposition. Set explicit scope boundaries for each agent.

### 7.3 The Echo Chamber Problem

**Symptom**: Agents reinforce each other's mistakes rather than catching them. Agent A writes buggy code, Agent B reviews it and misses the bug because its analysis is primed by Agent A's reasoning.

**Cause**: Shared context creates correlated failures. All agents operate from the same information and may share the same blind spots.

**Fix**: Introduce adversarial agents that explicitly look for problems. Use diverse agent configurations (different prompts, different specializations) to reduce correlation. Include human review checkpoints.

### 7.4 The Deadlock Problem

**Symptom**: Agent A waits for Agent B's output, while Agent B waits for Agent A's output. Both stall indefinitely.

**Cause**: Circular dependencies in task assignments, or agents blocking on resources held by each other.

**Fix**: Detect circular dependencies during task decomposition. Use timeouts on all blocking waits. Implement deadlock detection and recovery (one agent yields).

### 7.5 The Split Brain Problem

**Symptom**: Agents develop divergent models of the system state because memory updates don't propagate quickly enough or are applied in different orders.

**Cause**: Eventual consistency in shared memory without adequate conflict detection.

**Fix**: Use stronger consistency guarantees for critical shared state. Implement version vectors or logical clocks to detect divergence. Reconcile before proceeding with dependent work.

---

## 8. Scalability Considerations

### 8.1 Communication Overhead

As the number of agents grows, communication overhead can dominate:

| Topology | Communication Complexity | Practical Limit |
|----------|------------------------|-----------------|
| Hierarchical (star) | O(n) — all messages go through orchestrator | ~10-20 workers before orchestrator bottleneck |
| Full mesh (peer-to-peer) | O(n^2) — every agent can talk to every other | ~5-8 agents before message flood |
| Pub-sub | O(k*m) — k publishers, m subscribers per topic | Scales well with appropriate topic design |
| Hierarchical with subgroups | O(n log n) — tree structure | ~50-100 agents with appropriate tree depth |

### 8.2 State Synchronization

More agents means more concurrent mutations to shared state:

- **Optimistic concurrency** scales better than pessimistic locking but requires conflict resolution
- **Partitioned state** (each agent owns a subset of state) eliminates most conflicts but limits collaboration
- **Event sourcing** (state derived from ordered event log) provides consistency but adds latency

### 8.3 Cost Management

Multi-agent systems multiply the computational cost of AI inference:

- **Token budgets**: Each agent has a token budget; the orchestrator manages the total budget
- **Task prioritization**: Not all tasks justify multi-agent coordination; simple tasks should use a single agent
- **Early termination**: If a task is resolved before all agents complete, cancel remaining work
- **Result caching**: When multiple agents need the same information, cache the result rather than computing it multiple times

---

## 9. Observability and Debugging

### 9.1 Distributed Tracing

Multi-agent workflows should be traceable end-to-end:

```
Trace: feature-123-implementation
├── Orchestrator: task_decomposition (120ms)
├── Agent A: implement_data_model (45s)
│   ├── read_file: src/types/user.ts (12ms)
│   ├── edit_file: src/types/user.ts (340ms)
│   └── run_tests: src/types/ (3.2s)
├── Agent B: implement_api (62s) [started after A]
│   ├── read_file: src/api/users.ts (15ms)
│   └── ...
└── Review Agent: review_changes (28s) [started after A, B]
```

Each operation carries a trace ID that links it to the overall workflow, enabling:
- End-to-end latency analysis
- Bottleneck identification
- Failure root cause analysis
- Cost attribution

### 9.2 Agent State Visualization

For debugging multi-agent issues, operators need visibility into each agent's state:
- Current task and progress
- Working memory contents
- Pending messages and blocked waits
- Resource locks held
- Recent actions and their outcomes

### 9.3 Replay and Simulation

The ability to replay multi-agent workflows from recorded traces is invaluable for debugging:
- Reproduce intermittent coordination failures
- Test changes to orchestration logic without running real agents
- Evaluate alternative task decompositions against historical workloads

---

## 10. Summary

Multi-agent coordination in ANP is not merely a technical problem of message passing and synchronization — it is a design challenge of creating effective collaboration structures that leverage specialization while managing the inherent complexity of distributed decision-making.

The key principles are:
1. **Match topology to task**: Hierarchical for well-decomposed tasks, peer-to-peer for collaborative tasks, hybrid for complex real-world scenarios
2. **Delegate completely**: Include enough context in task delegations to minimize coordination round-trips
3. **Prevent conflicts over resolving them**: Clear boundaries, stable interfaces, and announced intentions reduce conflict frequency
4. **Observe everything**: Distributed tracing, state visualization, and replay capabilities are essential for operating multi-agent systems
5. **Scale deliberately**: Multi-agent coordination has real costs; use it where the benefits justify the overhead
