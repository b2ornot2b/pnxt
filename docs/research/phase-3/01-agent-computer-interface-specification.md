# Agent-Computer Interface (ACI) Specification

## Phase 3 Research — Deep Dive into Pillar 1

---

## 1. Overview

The Agent-Computer Interface (ACI) is the foundational communication layer that enables AI agents to interact with computing resources in a structured, reliable, and secure manner. Unlike natural language interfaces designed for human consumption, ACIs are engineered for precision, composability, and machine-level reliability while retaining the flexibility needed for intelligent agent behavior.

This document specifies the design principles, protocol architecture, and implementation patterns for ACIs within the Agent-Native Programming paradigm.

---

## 2. Design Principles

### 2.1 Structured Affordance over Raw Capability

A common mistake in agent-system design is exposing raw system capabilities (shell access, unrestricted file I/O) and relying on the agent's intelligence to use them correctly. The ACI principle inverts this: **the interface should be designed to make correct usage easy and misuse difficult**, much as a well-designed API does for human programmers.

This means:
- **Operations are semantic, not mechanical.** Instead of exposing `write_bytes(path, data)`, expose `edit_file(path, old_content, new_content)` — an operation that carries intent and enables validation.
- **Affordances are discoverable.** Agents can query the interface to learn what operations are available, what parameters they accept, and what constraints apply.
- **Guardrails are structural.** Permission boundaries, validation rules, and safety constraints are embedded in the interface definition, not delegated to agent self-discipline.

### 2.2 Composability

ACI operations must compose cleanly. An agent should be able to:
- Execute multiple independent operations in parallel
- Chain dependent operations with explicit data flow
- Bundle related operations into atomic transactions where needed
- Nest operations within higher-level workflows

### 2.3 Observability

Every ACI interaction must be introspectable:
- Operations produce structured results, not just success/failure signals
- Side effects are declared, not implicit
- Execution traces enable debugging and audit
- Performance characteristics are measurable

### 2.4 Graceful Degradation

When operations fail, the ACI should:
- Return structured error information, not opaque failures
- Distinguish between retryable and terminal errors
- Suggest corrective actions where possible
- Preserve system invariants even during partial failures

---

## 3. Protocol Architecture

### 3.1 Layer Model

The ACI protocol is organized into four layers, each with distinct responsibilities:

```
┌─────────────────────────────────────────────┐
│  Layer 4: Semantic Layer                     │
│  (Domain-specific operations and workflows)  │
├─────────────────────────────────────────────┤
│  Layer 3: Capability Layer                   │
│  (Tool definitions, permissions, discovery)  │
├─────────────────────────────────────────────┤
│  Layer 2: Session Layer                      │
│  (Context management, state, transactions)   │
├─────────────────────────────────────────────┤
│  Layer 1: Transport Layer                    │
│  (Message encoding, delivery, framing)       │
└─────────────────────────────────────────────┘
```

#### Layer 1: Transport

The transport layer handles the mechanics of message delivery between agents and systems. It is deliberately simple and protocol-agnostic:

- **Message framing**: JSON-based messages with type discriminators
- **Delivery guarantees**: At-least-once delivery with idempotency keys
- **Multiplexing**: Multiple concurrent operations over a single connection
- **Backpressure**: Flow control when either party is overwhelmed

The transport layer does not interpret message content — it ensures reliable delivery of opaque payloads to higher layers.

#### Layer 2: Session

The session layer manages stateful interactions:

- **Session establishment**: Authentication, capability negotiation, context initialization
- **State management**: Persistent context across multiple operations within a session
- **Transaction support**: Grouping operations into atomic units with commit/rollback semantics
- **Lifecycle management**: Session timeout, renewal, and graceful termination

A critical design decision: sessions are **explicit, not implicit**. Agents must establish sessions before performing operations, and sessions carry explicit context that influences how operations are interpreted.

#### Layer 3: Capability

The capability layer defines what operations are available and under what constraints:

- **Tool definitions**: Structured schemas describing available operations, their parameters, return types, and side effects
- **Permission model**: What the agent is authorized to do within the current session
- **Discovery protocol**: How agents learn about available capabilities at runtime
- **Version negotiation**: How agents and systems agree on compatible capability versions

#### Layer 4: Semantic

The semantic layer provides domain-specific operations built on lower layers:

- **File operations**: Read, write, edit, search, with semantic understanding of file types
- **Version control**: Commit, branch, merge, with awareness of project conventions
- **Build and test**: Compilation, test execution, with structured result interpretation
- **Communication**: Issue tracking, code review, with workflow awareness

### 3.2 Message Taxonomy

All ACI messages fall into four categories:

| Category | Direction | Purpose | Example |
|----------|-----------|---------|---------|
| **Command** | Agent → System | Request an action with side effects | `edit_file`, `run_tests` |
| **Query** | Agent → System | Request information without side effects | `read_file`, `search_code` |
| **Event** | System → Agent | Notify of state changes | `file_changed`, `test_completed` |
| **Response** | System → Agent | Return results of a Command or Query | `edit_result`, `search_results` |

Commands and Queries are **request messages** initiated by the agent. Events and Responses are **reply messages** from the system. This asymmetry is deliberate: agents are active participants that drive interactions, while systems are reactive services.

### 3.3 Message Structure

Every ACI message conforms to this envelope structure:

```typescript
interface ACIMessage {
  // Unique message identifier for correlation and idempotency
  id: string;

  // Message category: 'command' | 'query' | 'event' | 'response'
  type: MessageType;

  // The specific operation or event name
  name: string;

  // Operation-specific parameters
  params: Record<string, unknown>;

  // Metadata: timestamps, session ID, correlation IDs, trace context
  metadata: MessageMetadata;
}

interface MessageMetadata {
  sessionId: string;
  timestamp: string;       // ISO 8601
  correlationId?: string;  // Links responses to requests
  traceId?: string;        // Distributed tracing
  idempotencyKey?: string; // For safe retries
}
```

---

## 4. Capability Definition and Discovery

### 4.1 Tool Schema

Each ACI capability is defined by a structured schema that serves as both documentation and contract:

```typescript
interface ToolDefinition {
  // Unique tool identifier
  name: string;

  // Human-readable description (used by agents for tool selection)
  description: string;

  // JSON Schema for input parameters
  inputSchema: JSONSchema;

  // JSON Schema for output
  outputSchema: JSONSchema;

  // Declared side effects
  sideEffects: SideEffect[];

  // Required permissions
  requiredPermissions: Permission[];

  // Whether this operation is idempotent
  idempotent: boolean;

  // Estimated cost/latency category
  costCategory: 'cheap' | 'moderate' | 'expensive';
}

type SideEffect =
  | { type: 'file_write'; scope: string }
  | { type: 'network_request'; destination: string }
  | { type: 'process_execution'; description: string }
  | { type: 'state_mutation'; scope: string };
```

The `sideEffects` declaration is particularly important. It enables the system to:
- Warn agents before destructive operations
- Enforce approval workflows for high-impact actions
- Optimize execution by parallelizing side-effect-free operations
- Maintain accurate audit trails

### 4.2 Discovery Protocol

Agents discover available capabilities through a negotiation protocol at session establishment:

1. **Agent connects** and presents its identity and requested capability set
2. **System responds** with the available capabilities that match, including any restrictions
3. **Agent acknowledges** the capability set and begins operations

This three-phase handshake ensures both parties have a shared understanding of what is possible within the session. Capabilities can be renegotiated mid-session if the agent's needs change or if the system's state evolves.

### 4.3 Capability Versioning

Capabilities evolve over time. The ACI uses semantic versioning for capability definitions:

- **Patch** (1.0.x): Bug fixes, documentation improvements — backward compatible
- **Minor** (1.x.0): New optional parameters, additional response fields — backward compatible
- **Major** (x.0.0): Breaking changes to parameters, semantics, or behavior — requires migration

Agents declare the capability versions they support, and the system negotiates the highest compatible version. This enables gradual evolution without breaking existing agents.

---

## 5. Error Handling and Recovery

### 5.1 Error Classification

ACI errors are classified along two dimensions:

**By retryability:**
- **Transient**: Temporary failures that may resolve on retry (network timeout, resource contention)
- **Persistent**: Failures that will recur unless conditions change (permission denied, invalid input)
- **Terminal**: Failures that indicate fundamental incompatibility (unsupported operation, session expired)

**By scope:**
- **Operation-level**: Affecting a single operation (file not found, validation error)
- **Session-level**: Affecting the entire session (authentication failure, quota exceeded)
- **System-level**: Affecting all sessions (system maintenance, catastrophic failure)

### 5.2 Structured Error Responses

```typescript
interface ACIError {
  // Machine-readable error code
  code: string;

  // Human-readable error message
  message: string;

  // Error classification
  retryability: 'transient' | 'persistent' | 'terminal';
  scope: 'operation' | 'session' | 'system';

  // Structured details for programmatic handling
  details: Record<string, unknown>;

  // Suggested corrective actions
  suggestions: ErrorSuggestion[];
}

interface ErrorSuggestion {
  action: string;       // What to do
  description: string;  // Why it might help
  automated: boolean;   // Whether the agent can take this action automatically
}
```

The `suggestions` field is a distinctive ACI feature. Rather than leaving error recovery entirely to the agent's reasoning, the system provides structured guidance. This reduces hallucinated recovery attempts and enables faster resolution.

### 5.3 Recovery Patterns

**Retry with backoff**: For transient errors, agents should use exponential backoff with jitter. The ACI response includes a `retryAfter` hint when the system knows the expected recovery time.

**Corrective action**: For persistent errors with suggestions, agents should evaluate and apply the suggested corrections. For example, a "permission denied" error might suggest requesting elevated permissions.

**Graceful degradation**: When a capability is unavailable, agents should fall back to alternative approaches rather than failing entirely. The capability discovery protocol enables agents to know what alternatives exist.

**Transaction rollback**: For failures within a transaction, the session layer ensures all changes are reverted atomically, leaving the system in a consistent state.

---

## 6. Comparison with Existing Interfaces

### 6.1 Language Server Protocol (LSP)

LSP provides a standardized protocol for IDE-language server communication. The ACI draws inspiration from LSP's capability negotiation and message taxonomy but differs fundamentally:

| Aspect | LSP | ACI |
|--------|-----|-----|
| **Participant** | Passive tool | Active agent |
| **Initiative** | Server responds to IDE events | Agent drives interactions |
| **State** | Stateless (mostly) | Stateful sessions |
| **Operations** | Read-only analysis + limited edits | Full CRUD + workflow |
| **Adaptability** | Fixed capability set | Dynamic capability negotiation |

LSP was designed for a world where the human makes decisions and the tool provides information. ACI is designed for a world where the agent makes decisions and the system provides capabilities.

### 6.2 Model Context Protocol (MCP)

MCP represents a significant step toward standardized agent-system interfaces. The ACI builds on MCP's ideas while extending them:

- **MCP** focuses on providing context and tools to language models during inference
- **ACI** extends this to cover the full agent lifecycle: session management, transactions, multi-agent coordination, and workflow orchestration
- **MCP** is primarily request-response; **ACI** adds event-driven communication for reactive workflows
- **MCP** treats tools as stateless functions; **ACI** models tools as stateful capabilities with side effect declarations

The ACI can be viewed as a superset of MCP, adding the session, transaction, and coordination layers needed for agents that operate autonomously over extended periods.

### 6.3 Unix Philosophy and Shell Interfaces

The Unix shell provides a powerful, composable interface for human operators. Agents can and do use shell interfaces effectively. However, shell interfaces have significant limitations for agent use:

- **Output parsing**: Shell output is unstructured text requiring brittle parsing
- **Error handling**: Exit codes provide minimal information about failure modes
- **Side effects**: Commands have implicit, undeclared side effects
- **Discoverability**: Available operations and their parameters must be learned from documentation

The ACI preserves Unix composability while adding the structure, safety, and discoverability that agents need.

---

## 7. Security Considerations

### 7.1 Principle of Least Capability

Agents should be granted only the capabilities they need for their current task. The ACI supports this through:

- **Scoped sessions**: Sessions are created with a declared purpose, and capabilities are restricted accordingly
- **Graduated permissions**: Agents earn expanded permissions through demonstrated reliability
- **Time-bounded access**: Capabilities expire and must be renewed

### 7.2 Capability Attenuation

When an agent delegates work to a sub-agent, it can only pass along a subset of its own capabilities. This prevents privilege escalation through delegation chains.

### 7.3 Audit Trail

Every ACI operation is logged with:
- The requesting agent's identity
- The operation and its parameters
- The result (including errors)
- The session context and authorization basis
- Timestamps and correlation IDs for trace reconstruction

This audit trail serves both security (detecting misuse) and quality (understanding agent behavior patterns).

---

## 8. Implementation Guidance

### 8.1 For System Implementors

When implementing an ACI-compliant system:

1. **Start with tool definitions.** Define your capability schemas before implementing them. This forces clarity about what each tool does, what it requires, and what effects it has.
2. **Declare side effects honestly.** Under-declaring side effects erodes trust and undermines the safety guarantees of the system.
3. **Return structured errors.** Invest in error taxonomy early. The quality of error responses directly determines agent effectiveness.
4. **Support capability discovery.** Agents should be able to learn what your system offers without external documentation.

### 8.2 For Agent Implementors

When building agents that consume ACI:

1. **Use capability discovery.** Don't hardcode tool knowledge. Query the system for available capabilities at session start.
2. **Respect side effect declarations.** Use them to plan operation ordering and parallelism.
3. **Handle errors structurally.** Use error codes and suggestions before falling back to reasoning about error messages.
4. **Maintain session hygiene.** Close sessions when done. Don't hold resources longer than needed.

### 8.3 For Protocol Designers

When extending the ACI protocol:

1. **Preserve backward compatibility.** Use minor version bumps for additive changes. Reserve major versions for genuine breaking changes.
2. **Keep the transport layer thin.** Resist adding intelligence to the transport. Complex behavior belongs in higher layers.
3. **Favor explicit over implicit.** If something matters, make it a first-class protocol element rather than a convention.

---

## 9. Open Questions

Several design questions remain open for community input:

1. **Streaming operations**: How should the ACI handle long-running operations that produce incremental results? A streaming protocol extension is needed but introduces complexity.
2. **Multi-system coordination**: When an agent needs to coordinate operations across multiple ACI-compliant systems, who manages the distributed transaction?
3. **Capability composition**: Can capabilities be composed declaratively, or must composition always be procedural (agent code)?
4. **Natural language fallback**: When structured operations fail, should the ACI support a natural-language fallback channel for describing intent?
5. **Performance contracts**: Should tool definitions include performance guarantees (latency bounds, throughput limits), and how should violations be handled?

---

## 10. Summary

The Agent-Computer Interface is the foundation upon which reliable, safe, and effective agent-system interactions are built. By providing structured affordances, explicit capability negotiation, and robust error handling, the ACI enables agents to operate with confidence while maintaining the safety guarantees that production systems demand.

The key insight driving the ACI design is that **the interface should encode knowledge about correct usage**, reducing the cognitive burden on agents and enabling the system to enforce invariants that agents alone cannot guarantee. This is the same principle that drives good API design for human developers, extended to the unique needs of autonomous agents.
