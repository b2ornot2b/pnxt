---
title: Semantic Memory Architecture
description: "Phase 3 Research — Deep dive into Pillar 2: persistent, evolving memory for agent-native systems."
---

:::tip[Source Document]
This is a summary of [02-semantic-memory-architecture.md](https://github.com/b2ornot2b/pnxt/blob/main/docs/research/phase-3/02-semantic-memory-architecture.md). See the full document for complete detail.
:::

## Overview

Memory is what separates an agent from a stateless function call. A language model without memory treats every interaction as isolated — it cannot learn from yesterday's mistakes, recall why a design decision was made, or build a cumulative understanding of a codebase.

The Semantic Memory Architecture provides the persistent, queryable, and evolving knowledge substrate that makes true agent-native programming possible.

---

## What Agents Need to Remember

| Category | Examples |
|----------|----------|
| **Factual knowledge** | Project structure, module boundaries, API contracts, config conventions |
| **Procedural knowledge** | Build processes, review conventions, deployment procedures |
| **Episodic knowledge** | Design decisions, rejected approaches, fragile code areas |
| **Meta-knowledge** | Self-calibration, effective tools, learned heuristics |

---

## Three-Layer Memory Model

Drawing from cognitive science (Atkinson-Shiffrin, Tulving, Baddeley):

### Working Memory

- **Scope**: Current session context, active task state
- **Capacity**: Limited (analogous to human working memory)
- **Lifetime**: Session-scoped
- **Purpose**: Holds the agent's current focus, recent observations, and in-progress reasoning

### Semantic Memory

- **Scope**: Facts, patterns, relationships, learned skills
- **Capacity**: Large
- **Lifetime**: Long-term, persists across sessions
- **Purpose**: The agent's accumulated knowledge about the codebase, tools, and domain

### Episodic Memory

- **Scope**: Events, interactions, decisions, outcomes
- **Capacity**: Large
- **Lifetime**: Long-term, with decay for irrelevant episodes
- **Purpose**: Historical record enabling learning from experience

---

## Memory Properties

| Property | Description |
|----------|-------------|
| **Persistence** | Survives session boundaries and system restarts |
| **Queryability** | Retrieval by semantic similarity, not just exact key match |
| **Evolvability** | Knowledge updates as codebase changes; stale memories retire |
| **Contextuality** | Retrieval is sensitive to current task and context |
| **Efficiency** | Memory operations don't dominate response latency |
| **Transparency** | Humans can inspect what the agent remembers and why |

---

## Memory Lifecycle

The document details the full memory lifecycle:

1. **Acquisition** — How new memories are formed from agent observations and actions
2. **Consolidation** — How working memory items are promoted to long-term storage
3. **Retrieval** — How relevant memories are recalled based on current context
4. **Decay** — How outdated or irrelevant memories are gradually retired

---

## Cross-Agent Memory

When multiple agents collaborate, memory sharing becomes critical:

- **Shared semantic memory** — Common knowledge about the project
- **Private episodic memory** — Each agent's unique interaction history
- **Memory governance** — Who can read/write what, privacy boundaries
- **Conflict resolution** — When agents have contradictory memories

---

## Key Contribution

> Memory is not just storage — it is an active, evolving system that requires curation, consolidation, and governance. A well-designed memory architecture makes an agent more valuable in its hundredth session than its first.
