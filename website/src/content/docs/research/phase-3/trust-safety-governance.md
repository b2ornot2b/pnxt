---
title: Trust, Safety & Governance
description: "Phase 3 Research — A comprehensive framework for managing agent autonomy and control."
---

:::tip[Source Document]
This is a summary of [04-trust-safety-governance.md](https://github.com/b2ornot2b/pnxt/blob/main/docs/research/phase-3/04-trust-safety-governance.md). See the full document for complete detail.
:::

## Overview

The central tension in Agent-Native Programming is between **autonomy and control**. Agents are most valuable when they can act independently, but unconstrained autonomy carries real risks: bugs, deleted code, exposed secrets, or poor architectural decisions.

This framework manages that tension with a system where **risks are proportional to safeguards** and trust is earned incrementally.

---

## Graduated Trust Model

Rather than binary trusted/untrusted, ANP uses a five-level graduated trust model:

### Trust Levels

| Level | Role | Capabilities |
|-------|------|-------------|
| **0** | Observer | Read code and docs. Cannot modify anything. |
| **1** | Contributor | Modify files within scope. Changes require review. Read-only tools. |
| **2** | Collaborator | Commit to feature branches. Run tools in sandbox. Use CI/CD. |
| **3** | Trusted Collaborator | Merge approved changes. Create/close issues and PRs. Reduced review for low-risk changes. |
| **4** | Autonomous Agent | Operate independently within boundaries. Human review only for high-impact actions. Can delegate to other agents. |

Agents **earn** higher trust levels through demonstrated reliability, mirroring how human organizations grant authority.

---

## Capability-Based Permissions

Instead of role-based access control, ANP uses capability tokens:

- Each capability grants a specific, scoped permission
- Capabilities can be time-limited, scope-limited, or usage-limited
- Agents request capabilities; the trust engine grants or denies based on trust level
- All capability grants are logged for audit

---

## Sandboxing

Agent actions operate within sandboxes that limit blast radius:

- **File system sandboxing** — Agents can only access designated project directories
- **Process sandboxing** — Commands execute in isolated environments
- **Network sandboxing** — Controlled access to external services
- **Resource sandboxing** — CPU, memory, and time limits

---

## Human-in-the-Loop Patterns

The framework defines when and how humans are involved:

- **Pre-approval** — Agent proposes, human approves before execution
- **Post-review** — Agent executes, human reviews outcome
- **Exception-based** — Agent operates autonomously, human notified only for anomalies
- **Periodic audit** — Scheduled review of agent actions and decisions

The appropriate pattern depends on the agent's trust level and the action's risk.

---

## Audit & Accountability

Every agent action is:
- **Logged** with full context (who, what, when, why)
- **Traceable** to the decision chain that led to it
- **Attributable** to a specific agent identity
- **Reviewable** by humans at any time

---

## Key Contribution

> Trust is not binary but a multi-dimensional spectrum. Agents earn autonomy incrementally through demonstrated reliability, mirroring how human organizations grant authority.
