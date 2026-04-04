# Trust, Safety, and Governance Framework

## Phase 3 Research — Enabling Reliable Agent Autonomy

---

## 1. Introduction

The central tension in Agent-Native Programming is between autonomy and control. Agents are most valuable when they can act independently — analyzing code, making changes, running tests, and resolving issues without constant human oversight. But unconstrained autonomy carries real risks: agents can introduce bugs, delete important code, expose secrets, or make architectural decisions that create long-term technical debt.

This document presents a comprehensive framework for managing this tension. The goal is not to eliminate risk (which would require eliminating autonomy) but to create a structured system where risks are proportional to safeguards and trust is earned incrementally.

---

## 2. The Trust Model

### 2.1 Trust as a Spectrum

Rather than a binary trusted/untrusted classification, ANP uses a graduated trust model where agents earn expanded autonomy through demonstrated reliability:

```
Level 0: Observer
  Can read code and documentation
  Cannot modify anything
  All actions are logged

Level 1: Contributor
  Can modify files within assigned scope
  Changes require review before commit
  Can run read-only tools (tests, linters)

Level 2: Collaborator
  Can commit changes to feature branches
  Can run side-effecting tools within sandbox
  Can interact with CI/CD systems
  Review required for merge to main

Level 3: Trusted Collaborator
  Can merge approved changes
  Can create/close issues and PRs
  Can modify project configuration
  Reduced review requirements for low-risk changes

Level 4: Autonomous Agent
  Can operate independently within defined boundaries
  Human review triggered only for high-impact actions
  Can delegate to other agents
  Subject to periodic audit rather than per-action review
```

### 2.2 Trust Dimensions

Trust is not monolithic. An agent may be highly trusted for one type of action but not another:

| Dimension | Description | Example |
|-----------|-------------|---------|
| **Scope trust** | Which files/modules the agent may modify | Trusted in `src/utils/`, not in `src/auth/` |
| **Action trust** | Which operations the agent may perform | Trusted to edit files, not to delete them |
| **Impact trust** | What blast radius of change is acceptable | Trusted for single-file changes, not cross-cutting refactors |
| **Domain trust** | Which technical domains the agent is competent in | Trusted for TypeScript, not for infrastructure-as-code |
| **Judgment trust** | Whether the agent can make subjective decisions | Trusted to fix clear bugs, not to redesign APIs |

Multi-dimensional trust enables fine-grained autonomy: an agent might autonomously fix a typo in documentation (low scope, low impact, low domain complexity) but require approval to restructure a database schema (high scope, high impact, high domain complexity).

### 2.3 Trust Calibration

Trust levels should be calibrated against observed agent performance:

**Trust increase triggers:**
- Consistent pattern of changes that pass review without revision
- Successful handling of edge cases and error scenarios
- Accurate self-assessment (agent correctly identifies when it's uncertain)
- Track record of appropriate escalation (asks for help at the right times)

**Trust decrease triggers:**
- Changes that introduce bugs or regressions
- Failure to follow project conventions despite correction
- Overconfidence (agent proceeds when it should have asked)
- Security violations or near-misses
- Inconsistency between claimed and actual actions

**Trust reset triggers:**
- Agent model update (new model version starts at baseline trust)
- Major project changes (new domain, new architecture)
- Security incident involving the agent
- Explicit human decision

---

## 3. Permission System

### 3.1 Capability-Based Permissions

Rather than role-based access control (which maps poorly to agent specialization), ANP uses **capability-based permissions**. Each agent holds a set of capabilities that explicitly enumerate what it can do:

```typescript
interface AgentCapability {
  // The operation this capability authorizes
  operation: string;  // e.g., 'file.write', 'git.commit', 'process.execute'

  // Constraints on the operation
  constraints: {
    // Path patterns (for file operations)
    paths?: string[];       // e.g., ['src/utils/**', 'tests/**']

    // Branch patterns (for git operations)
    branches?: string[];    // e.g., ['feature/*', 'fix/*']

    // Resource limits
    maxFiles?: number;      // Max files affected per operation
    maxLines?: number;      // Max lines changed per operation

    // Time constraints
    validUntil?: string;    // Capability expiry
    cooldown?: number;      // Minimum interval between uses
  };

  // Who granted this capability
  grantedBy: string;

  // When it was granted
  grantedAt: string;

  // Why it was granted (for audit)
  rationale: string;
}
```

**Key properties of capability-based permissions:**

- **Unforgeable**: Capabilities are issued by the system, not claimed by agents
- **Attenuatable**: When delegating to sub-agents, an agent can only pass capabilities equal to or more restricted than its own
- **Revocable**: Capabilities can be revoked at any time by the granting authority
- **Auditable**: Every capability grant, exercise, and revocation is logged

### 3.2 Permission Escalation

When an agent needs to perform an action beyond its current capabilities:

1. Agent requests capability escalation with justification
2. System evaluates the request against policy (some escalations may be auto-approved)
3. If auto-approval is not possible, a human is notified
4. Human approves or denies with optional scope modifications
5. If approved, a time-bounded capability is granted
6. The capability expires after use or timeout

This is analogous to `sudo` in Unix systems — temporary elevation of privileges for a specific purpose, with logging.

### 3.3 Permission Policies

Organizations define policies that govern automatic permission decisions:

```yaml
policies:
  - name: "Auto-approve test file modifications"
    condition:
      operation: "file.write"
      path_matches: "tests/**"
      agent_trust_level: ">= 1"
    action: "auto-approve"

  - name: "Require approval for config changes"
    condition:
      operation: "file.write"
      path_matches: "*.config.*"
    action: "require-human-approval"

  - name: "Block production deployment"
    condition:
      operation: "deploy"
      environment: "production"
    action: "deny"
    message: "Production deployments require manual execution"
```

---

## 4. Safety Mechanisms

### 4.1 Sandboxing

Agents operate within sandboxes that limit their interaction with the host system:

**File system sandbox:**
- Agents can only access files within the project directory
- Sensitive files (`.env`, credentials, private keys) are excluded by default
- Write access is further restricted by capability constraints

**Process sandbox:**
- Agent-initiated processes run with restricted permissions
- Network access is limited to approved endpoints
- Resource consumption (CPU, memory, disk) is bounded
- Process execution time is limited

**Git sandbox:**
- Agents work on isolated branches
- Force-push is prohibited
- Pushing to protected branches requires elevated capability
- Commit authorship is attributed to the agent

### 4.2 Pre-Action Validation

Before an agent action is executed, the system validates:

1. **Authorization**: Does the agent have the required capability?
2. **Scope**: Is the action within the declared scope of the current task?
3. **Impact assessment**: How many files/lines/dependencies are affected?
4. **Safety checks**: Does the action modify sensitive files? Delete data? Change security configurations?
5. **Convention compliance**: Does the action follow project conventions (naming, formatting, structure)?

Actions that fail validation are blocked, and the agent receives structured feedback explaining why.

### 4.3 Post-Action Verification

After an agent action completes:

1. **Syntax check**: Does the modified code parse correctly?
2. **Type check**: Do type constraints still hold? (for typed languages)
3. **Test execution**: Do existing tests still pass?
4. **Lint check**: Does the code meet style requirements?
5. **Security scan**: Does the change introduce known vulnerability patterns?

Failed verification triggers automatic rollback and notification to the agent. The agent can then fix the issue and retry.

### 4.4 Circuit Breakers

When an agent enters a failure loop (repeatedly attempting and failing an action), circuit breakers prevent wasted resources and potential damage:

- **Consecutive failure limit**: After N consecutive failures on the same operation, the agent must escalate or change approach
- **Error rate threshold**: If the agent's error rate exceeds a threshold over a time window, its capabilities are temporarily reduced
- **Cost circuit breaker**: If the agent's token/API consumption exceeds budget, operations are suspended

---

## 5. Human-in-the-Loop Patterns

### 5.1 Approval Workflows

Different actions require different levels of human oversight:

| Change Type | Review Requirement |
|-------------|-------------------|
| Documentation fixes (typos, formatting) | Auto-approve at trust level >= 2 |
| Test additions | Auto-approve at trust level >= 2 |
| Bug fixes (single file, <50 lines) | Single reviewer |
| Feature implementation | Standard code review |
| Architectural changes | Senior reviewer + design review |
| Security-sensitive changes | Security reviewer required |
| Dependency updates | Automated vulnerability check + reviewer |
| Configuration changes | Ops reviewer |
| Database migrations | DBA review + tested rollback plan |

### 5.2 Approval UX

Human reviewers should be presented with:

- **Summary**: What the agent is requesting and why
- **Impact assessment**: What will change, what might break
- **Risk assessment**: The system's evaluation of the risk level
- **Agent's confidence**: The agent's self-assessed confidence in the action
- **Context**: Relevant history, related decisions, and precedents
- **Options**: Approve, deny, approve with modifications, request more information

The review interface should be optimized for speed — most approvals should take seconds, not minutes. This means good defaults, clear diffs, and one-click approval for low-risk actions.

### 5.3 Asynchronous Collaboration

Not all human input is blocking approval. Agents should support:

- **Non-blocking questions**: Agent posts a question and continues with other work
- **Preference learning**: Agent observes human behavior and adapts without explicit instruction
- **Checkpoint reviews**: Agent produces work in stages, receiving feedback at natural checkpoints
- **Steering corrections**: Human provides direction changes without detailed implementation instructions

---

## 6. Audit and Accountability

### 6.1 Audit Log

Every agent action is recorded in an immutable audit log:

```typescript
interface AuditEntry {
  // What happened
  timestamp: string;
  agentId: string;
  action: string;
  parameters: Record<string, unknown>;
  result: 'success' | 'failure' | 'blocked';

  // Why it happened
  taskId: string;            // The task that motivated this action
  reasoning: string;         // Agent's stated reasoning
  capabilityUsed: string;    // Which capability authorized this action

  // What changed
  stateChange: {
    before: string;          // Hash of state before action
    after: string;           // Hash of state after action
    diff: string;            // Human-readable diff
  };

  // Who was involved
  approvedBy?: string;       // Human approver, if applicable
  delegatedBy?: string;      // Parent agent, if delegated
}
```

### 6.2 Accountability Chain

For every change in the codebase, there is a clear accountability chain:

```
Change: Modified src/auth/login.ts
  └── Committed by: Agent-B (trust level 2)
      └── Task: Implement OAuth2 login
          └── Delegated by: Agent-Orchestrator
              └── Requested by: Human (Alice)
                  └── Motivated by: Issue #42
```

This chain ensures that every change can be traced back to a human decision, even if the execution was fully automated.

### 6.3 Periodic Review

Beyond per-action auditing, regular aggregate reviews assess agent behavior patterns:

- **Weekly**: Review of agent actions, error rates, and escalation patterns
- **Monthly**: Assessment of trust level appropriateness and capability scope
- **Per-incident**: Post-mortem of any security or quality incidents involving agents
- **Per-model-update**: Re-evaluation of agent capabilities after model changes

---

## 7. Failure Modes and Recovery

### 7.1 Agent Failure Taxonomy

| Failure Mode | Description | Severity | Recovery |
|-------------|-------------|----------|----------|
| **Hallucinated action** | Agent claims to have done something it didn't | Medium | Verify all actions independently |
| **Scope creep** | Agent makes changes beyond its assigned task | Medium | Pre-action scope validation |
| **Confidence miscalibration** | Agent is overconfident about incorrect changes | High | Independent verification, diverse review |
| **Cascading failure** | Agent error triggers errors in dependent agents | High | Circuit breakers, isolation boundaries |
| **Data loss** | Agent deletes or overwrites important data | Critical | Backup before destructive operations, rollback capability |
| **Security breach** | Agent exposes secrets or creates vulnerabilities | Critical | Security scanning, sandboxing, immediate revocation |
| **Infinite loop** | Agent enters an unproductive retry cycle | Medium | Iteration limits, circuit breakers |

### 7.2 Recovery Strategies

**Rollback**: Revert all changes made by the failed agent. This is the safest recovery but may discard useful partial work. Git makes file changes easily reversible; system state changes (database migrations, deployed services) are harder to roll back.

**Partial rollback**: Identify which specific changes are problematic and revert only those, preserving valid work. Requires understanding of the agent's change set and its effects.

**Retry with correction**: Fix the underlying issue (update the agent's context, provide missing information, adjust constraints) and retry the task. Appropriate when the failure was due to missing information rather than fundamental incapability.

**Reassignment**: Assign the task to a different agent, possibly with a different specialization or trust level. Appropriate when the failure reflects a mismatch between agent capability and task requirements.

**Human takeover**: A human completes the remaining work manually. The ultimate fallback, used when automated recovery is not feasible or not trustworthy.

---

## 8. Ethical Considerations

### 8.1 Transparency

Agents must be transparent about:
- **Identity**: Never impersonate humans. All agent-produced artifacts are clearly attributed.
- **Uncertainty**: When the agent is unsure, it must say so rather than presenting guesses as facts.
- **Limitations**: Agents should be forthcoming about what they cannot do.
- **Reasoning**: When asked, agents should explain their decision-making process.

### 8.2 Fairness

Agents should not:
- Encode biases in code (e.g., hardcoded assumptions about users)
- Systematically favor one team member's contributions over another's
- Make decisions based on factors unrelated to code quality (e.g., the identity of the author)

### 8.3 Environmental Impact

Multi-agent systems consume significant computational resources. The governance framework should include:
- Token budgets that prevent runaway consumption
- Efficiency metrics that track resource usage per task
- Periodic evaluation of whether agent assistance is cost-effective for each task type

---

## 9. Implementation Roadmap

### Phase A: Foundation (Minimal Viable Safety)

1. Implement file system sandboxing
2. Add basic capability grants (read, write with path restrictions)
3. Create audit log for all agent actions
4. Implement human approval workflow for write operations
5. Add automatic rollback on test failure

### Phase B: Graduated Trust

1. Implement trust levels and multi-dimensional trust scoring
2. Add trust calibration based on agent performance metrics
3. Create permission policies with auto-approval rules
4. Implement capability escalation protocol
5. Add circuit breakers for failure loops

### Phase C: Multi-Agent Governance

1. Implement capability attenuation for delegation
2. Add distributed tracing for multi-agent workflows
3. Create aggregate audit reports and dashboards
4. Implement periodic review automation
5. Add adversarial testing for safety mechanisms

### Phase D: Advanced Autonomy

1. Implement predictive risk assessment for proposed changes
2. Add continuous trust calibration with anomaly detection
3. Create automated incident response for agent failures
4. Implement cross-project governance policies
5. Build trust portability across projects (with appropriate scoping)

---

## 10. Summary

Trust, safety, and governance are not obstacles to agent autonomy — they are the foundation that makes meaningful autonomy possible. Without structured safeguards, agents cannot be given the freedom to work independently because the risks are too high. With them, agents can operate with genuine autonomy within well-defined boundaries, earning expanded trust as they demonstrate reliability.

The framework presented here is deliberately incremental. It starts with minimal safety mechanisms and builds toward sophisticated, multi-dimensional trust management. This mirrors how human organizations grant autonomy: new employees have limited authority, earn trust through demonstrated competence, and are given increasing independence over time.

The ultimate goal is not a world where agents are perfectly controlled, but a world where agents and humans have sufficient mutual trust to collaborate effectively — each contributing their strengths, each compensating for the other's limitations.
