---
title: Agent-Computer Interface Specification
description: "Phase 3 Research — Deep dive into Pillar 1: the protocol architecture for agent-system communication."
---

:::tip[Source Document]
This is a summary of [01-agent-computer-interface-specification.md](https://github.com/b2ornot2b/pnxt/blob/main/docs/research/phase-3/01-agent-computer-interface-specification.md). See the full document for complete detail.
:::

## Overview

The Agent-Computer Interface (ACI) is the foundational communication layer that enables AI agents to interact with computing resources in a structured, reliable, and secure manner. Unlike natural language interfaces designed for human consumption, ACIs are engineered for precision, composability, and machine-level reliability while retaining the flexibility needed for intelligent agent behavior.

---

## Design Principles

### Structured Affordance over Raw Capability

A common mistake in agent-system design is exposing raw system capabilities and relying on agent intelligence for correct usage. The ACI inverts this: **the interface makes correct usage easy and misuse difficult**.

- **Operations are semantic, not mechanical** — `edit_file(path, old_content, new_content)` instead of `write_bytes(path, data)`
- **Affordances are discoverable** — Agents query available operations and constraints
- **Guardrails are structural** — Safety embedded in the interface definition

### Composability

ACI operations compose cleanly:
- Independent operations execute in parallel
- Dependent operations chain with explicit data flow
- Related operations bundle into atomic transactions
- Operations nest within higher-level workflows

### Observability

Every interaction is introspectable:
- Structured results (not just success/failure)
- Declared side effects
- Execution traces for debugging and audit
- Measurable performance characteristics

### Graceful Degradation

Failures produce:
- Structured error information
- Retryable vs. terminal error classification
- Corrective action suggestions
- Preserved system invariants

---

## Protocol Architecture

The ACI protocol is organized into four layers:

### Layer 1: Transport

Handles message delivery mechanics:
- JSON-based messages with type discriminators
- At-least-once delivery with idempotency keys
- Multiple concurrent operations over a single connection

### Layer 2: Session

Manages conversation state:
- Session establishment and teardown
- Context management (current project, active files, task state)
- Transaction boundaries for atomic operation groups

### Layer 3: Capability

Defines what agents can do:
- Tool registration and discovery
- Versioned capability contracts
- Permission boundaries per agent/trust level
- Dynamic capability negotiation

### Layer 4: Semantic

Domain-specific operations:
- High-level workflows (e.g., "refactor module X")
- Composed from lower-layer primitives
- Project-specific and extensible

---

## Key Contribution

> The principle that interfaces should encode knowledge about correct usage, reducing cognitive burden on agents while enabling structural safety guarantees.

This contrasts with approaches like raw shell access or unstructured API exposure, where the agent bears full responsibility for correct usage. In ANP, the interface itself is a safety mechanism.

---

## Comparison with Existing Interfaces

The document compares ACI with:
- **Language Server Protocol (LSP)** — Similar structured communication, but LSP is designed for IDE features, not agent autonomy
- **Model Context Protocol (MCP)** — Closer in spirit, but MCP focuses on context provision rather than full agent-system interaction
- **Unix Shell** — Maximum flexibility but zero structural safety
