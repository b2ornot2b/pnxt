---
title: Multi-Agent Coordination Patterns
description: "Phase 3 Research — Coordination patterns for multi-agent software development."
---

:::tip[Source Document]
This is a summary of [03-multi-agent-coordination-patterns.md](https://github.com/b2ornot2b/pnxt/blob/main/docs/research/phase-3/03-multi-agent-coordination-patterns.md). See the full document for complete detail.
:::

## Overview

ANP envisions not a single omniscient agent but an **ecosystem of specialized agents** collaborating on software development. A planning agent decomposes features. Implementation agents write code. A review agent evaluates changes. A testing agent verifies behavior. A deployment agent manages releases.

This multiplicity introduces coordination challenges: How do agents divide work? How do they communicate? How do they resolve disagreements?

---

## Topology Models

### Hierarchical (Orchestrator-Worker)

```
        ┌───────────────┐
        │  Orchestrator  │
        └───┬───┬───┬───┘
            │   │   │
     ┌──────┘   │   └──────┐
     ▼          ▼          ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│ Worker A │ │ Worker B │ │ Worker C │
└─────────┘ └─────────┘ └─────────┘
```

**Best for**: Well-defined tasks that decompose into independent subtasks. Clear authority, simple coordination, but single point of failure.

### Peer-to-Peer (Collaborative)

```
┌─────────┐     ┌─────────┐
│ Agent A  │◄───▶│ Agent B  │
└────┬─────┘     └────┬─────┘
     │    ┌─────────┐ │
     └───▶│ Agent C  │◀┘
          └─────────┘
```

**Best for**: Creative and exploratory tasks. No single point of failure, but coordination complexity grows quadratically.

### Hybrid

Combines hierarchical structure for task decomposition with peer communication for collaboration within subteams. This is the recommended topology for most real-world scenarios.

---

## Task Decomposition

The document catalogs strategies for breaking work into agent-assignable units:

- **Functional decomposition** — By module or feature boundary
- **Temporal decomposition** — By workflow phase (plan → implement → review → test)
- **Skill-based decomposition** — By agent specialization
- **Dependency-aware decomposition** — Minimizing cross-agent dependencies

---

## Communication Patterns

- **Request-Response** — Direct task delegation with results
- **Publish-Subscribe** — Broadcasting events (e.g., "file changed", "tests passed")
- **Shared Blackboard** — Common workspace for collaborative problem-solving
- **Negotiation** — Agents propose, counter-propose, and agree on approach

---

## Conflict Resolution

When agents disagree:

1. **Structural prevention** — Clear boundaries prevent most conflicts
2. **Automated resolution** — Merge strategies, version control
3. **Escalation** — Unresolvable conflicts escalate to orchestrator or human

---

## Key Contribution

> Match topology to task type, delegate completely to minimize coordination overhead, and prevent conflicts through clear boundaries rather than resolving them after the fact.
