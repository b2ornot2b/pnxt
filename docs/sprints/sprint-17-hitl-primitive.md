# Sprint 17: Human-in-the-Loop Primitive

> **Phase**: 8, Sprint 17 — "Human-in-the-Loop Primitive"
> **Priority**: P1
> **Primary Advisors**: Liskov (language design), Myers (IFC), Agha (actor model), Pearl (causal provenance)
> **Milestone**: M6 — Human-in-the-Loop
> **Blocks on**: Sprint 16 (durable VPIRJournal — hard prerequisite)

---

## Summary

Sprint 17 introduces Track 2 of the pnxt-vs-Weft research plan: a `'human'` VPIR node type that makes human judgment a first-class, formally tracked participant in the verifiable reasoning chain. Today the human appears in the type system (`actor.type: 'human'` at `src/types/aci.ts:86`, `TrustLevel 4` at `src/types/agent.ts:20`) but has zero runtime footprint — no VPIR node can suspend pending human input, no audit event with `actor.type: 'human'` is ever emitted, and approvals live outside pnxt's verifiable chain entirely.

Sprint 17 closes this gap end-to-end. A `'human'` node suspends VPIR execution, checkpoints state to Sprint 16's durable journal, and resumes only when a `HumanGateway` implementation returns a response. IFC label rules prevent low-trust inputs from being laundered through a high-trust human approval. Z3 verification treats human nodes as uninterpreted functions and continues to verify all 21 properties on the surrounding machine-executable subgraph. A `CLIHumanGateway` reference implementation enables interactive approval workflows in development and the weather benchmark gains a mandatory operator-approval gate before committing its final action.

The design is grounded in `docs/research/hitl-primitive.md` (moved to Accepted-and-Implemented status by this sprint). Agha's insight — that HITL breaks DPN bisimulation and should be treated as a reactive layer above the pure DPN core rather than a DPN node — is the key architectural decision.

---

## Deliverables

### 1. VPIRNodeType extension

**File**: `src/types/vpir.ts`

- Add `'human'` to the `VPIRNodeType` union (currently `'inference' | 'observation' | 'action' | 'assertion' | 'composition'` at `src/types/vpir.ts:20-25`)
- Extend `VPIRNode` with an optional `humanPromptSpec` field:
  - `message: string` — prompt text shown to the human
  - `timeout?: number` — milliseconds to wait; `undefined` means wait indefinitely
  - `requiresExplicitProvenance?: boolean` — when `true`, the gateway surface must surface the joined input label to the operator before accepting a response
- All `'human'` nodes must set `verifiable: false`; the validator (`src/vpir/`) rejects `human` nodes with `verifiable: true`

### 2. HumanGateway types and VPIRExecutionContext extension

**File**: `src/types/vpir-execution.ts`

Define three new exported interfaces adjacent to `VPIRExecutionContext` (`src/types/vpir-execution.ts:26-62`):

- `HumanGatewayRequest` — `promptId`, `message`, `context`, `requesterLabel`, `timeout?`
- `HumanGatewayResponse` — `response: unknown`, `humanId: string`, `respondedAt: number`
- `HumanGateway` — single method `prompt(req: HumanGatewayRequest): Promise<HumanGatewayResponse>`

Add optional field to `VPIRExecutionContext`:

```typescript
humanGateway?: HumanGateway;
```

Optional preserves backwards compatibility: existing graphs without `'human'` nodes never touch the field.

### 3. HumanGateway interface + CLIHumanGateway

**File**: `src/vpir/human-gateway.ts`

- Re-export `HumanGateway`, `HumanGatewayRequest`, `HumanGatewayResponse` from `src/types/vpir-execution.ts`
- `CLIHumanGateway` class — reference implementation:
  - `prompt()` writes `promptId`, `message`, and a rendered provenance summary to `stdout`
  - Reads response from `stdin` via `readline`
  - Returns a `HumanGatewayResponse` with the current Unix timestamp as `respondedAt`
  - `humanId` defaults to `process.env.HUMAN_ID ?? 'operator'`
- `NoopHumanGateway` — test double that auto-resolves with a configurable `response` value after an optional delay; used in unit and integration tests to avoid blocking `stdin`

The `HumanGateway` interface is the seam: swapping delivery surfaces (HTTP webhook, Slack, email) requires only a new `prompt()` implementation, not changes to the interpreter or protocol layer.

### 4. VPIR interpreter: executeHuman()

**File**: `src/vpir/vpir-interpreter.ts`

Add a `case 'human':` branch to the `executeNode` switch at `src/vpir/vpir-interpreter.ts:277-295`:

```typescript
case 'human':
  return executeHuman(node, inputs, context);
```

`executeHuman()` logic:

1. Throw immediately if `context.humanGateway` is absent (capability guard: `'human.attention'` must also be held — see Deliverable 7)
2. Compute `inputJoin` — `joinLabels` over all input node labels (`src/types/ifc.ts:86-99`)
3. Checkpoint the suspended frame to `context.journal` before awaiting the gateway (Sprint 16 dependency)
4. Call `context.humanGateway.prompt({ promptId: node.id, message, context: inputs, requesterLabel: node.label, timeout })`
5. On resolution, derive `responseLabel` as `joinLabels(humanLabel, inputJoin)` — the provenance join rule (see IFC section below)
6. Emit `AuditEvent` with `actor.type: 'human'`, `actor.id: result.humanId`, `timestamp: result.respondedAt`
7. Return `{ value: result.response, label: responseLabel }`

The journal checkpoint at step 3 enables crash recovery: if the process restarts between prompt-issued and response-received, the journal provides the suspended frame and execution can resume the `await` without re-issuing the prompt.

### 5. NL Protocol: human-approval

**File**: `src/protocol/nl-protocol.ts`

Extend `ProtocolName` in `src/types/protocol.ts:63`:

```typescript
export type ProtocolName =
  | 'task-delegation'
  | 'capability-negotiation'
  | 'conflict-resolution'
  | 'human-approval';   // NEW
```

Extend `ProtocolState` in `src/types/protocol.ts:68-74` with three new states: `'awaiting_human'`, `'rejected'`, `'timed_out'`. These are terminal for `human-approval` only.

State machine:

```
initiated → awaiting_human → completed
                           → rejected
                           → timed_out
```

Transition table added to `PROTOCOL_TRANSITIONS` in `src/protocol/nl-protocol.ts:29`:

| From             | Message type | Sender    | To               |
|------------------|-------------|-----------|------------------|
| `initiated`      | `request`   | initiator | `awaiting_human` |
| `awaiting_human` | `accept`    | human     | `completed`      |
| `awaiting_human` | `reject`    | human     | `rejected`       |
| `awaiting_human` | `propose`   | human     | `awaiting_human` |
| `awaiting_human` | `inform`    | system    | `timed_out`      |

The `TERMINAL_STATES` array (`src/protocol/nl-protocol.ts:65`) is refactored from a single shared list to a per-protocol map so that `'rejected'` and `'timed_out'` are terminal only for `human-approval`, not for the three existing protocols.

### 6. ACI audit event with actor.type: 'human'

**File**: `src/types/aci.ts`

No type change required — `actor.type: 'human'` already exists at `src/types/aci.ts:86`.

The change is behavioral: `executeHuman()` (Deliverable 4) is the first site in `src/` that emits an `AuditEvent` satisfying this type. The event is emitted after `humanGateway.prompt()` resolves, carrying:

- `actor.type: 'human'`
- `actor.id: result.humanId`
- `timestamp: result.respondedAt`
- `operation: node.operation`
- `nodeId: node.id`
- `label: responseLabel` (provenance-joined, see Deliverable 8 IFC rules)

### 7. Capability: human.attention

**File**: `src/capability/capability-negotiation.ts`

Register a `'human.attention'` capability in the `CapabilityNegotiationService` (`src/capability/capability-negotiation.ts:142`):

- Default grant: `denied` — callers must negotiate before any human node executes
- Scope: per-agent, per-session
- `executeHuman()` checks for a current grant before contacting the gateway; a missing grant causes an immediate throw, preserving the principle that capabilities gate all side effects
- The negotiation record appears in the ACI audit trail, so capability audits capture when human attention was granted and to whom

No changes to the 3-phase handshake structure are required.

### 8. Z3 verifier: human nodes as uninterpreted

**File**: `src/verification/z3-graph-verifier.ts`

When the Z3 verifier encounters a `'human'` node:

- Model the node's output as an uninterpreted function `f_human(inputs)`
- Apply a single constraint: the output label satisfies the provenance join rule (Section IFC below)
- Mark the node in the verification report as `status: 'uninterpretable'` with reason `'human-node'`
- Properties that flow only through machine nodes remain fully decidable
- Properties that flow through a human node produce Z3 `unknown` unless a downstream `assertion` node constrains the output value

All 21 existing Z3 properties continue to pass on graphs that contain no human nodes (regression requirement). The verifier logs a structured note for each skipped human node so the verification report is auditable.

### 9. Tests + weather benchmark extension

**Test files**:

- `src/vpir/human-gateway.test.ts` — `CLIHumanGateway` and `NoopHumanGateway` unit tests; prompt/response round-trip
- `src/vpir/vpir-interpreter.test.ts` additions — `'human'` node executes; missing gateway throws; crash-resume scenario using `NoopHumanGateway` and a mock journal
- `src/protocol/nl-protocol.test.ts` additions — `human-approval` state machine: valid transitions, terminal states, invalid transitions rejected
- `src/verification/z3-graph-verifier.test.ts` additions — graphs with human nodes: 21 properties still pass on machine subgraph; human node marked `uninterpretable`
- `src/types/ifc.test.ts` additions — trust-4-launders-trust-0 is rejected; provenance join produces correct composite label

**Weather benchmark** (`src/benchmarks/`):

Add an operator-approval gate before the step that commits the final weather alert action. The gate uses `NoopHumanGateway` with `response: 'approved'` in automated CI runs. The benchmark documents how to swap in `CLIHumanGateway` for interactive development use.

### 10. Design doc status update

**File**: `docs/research/hitl-primitive.md`

Update the status header from:

```
**Status**: Proposal — not implemented
```

to:

```
**Status**: Accepted and Implemented — Sprint 17
```

Add a cross-reference section at the bottom listing the files modified and the sprint document.

---

## IFC Label Rules

The existing `canFlowTo` rule (`src/types/ifc.ts:74`) is:

```
L1 can flow to L2 iff L1.trustLevel <= L2.trustLevel
                    AND classification(L1) <= classification(L2)
```

For a human node, a naive implementation allows a trust-4 human response to launder low-trust inputs. The fix — specified in the design doc and enforced in Sprint 17 — is that human approval covers the provenance chain, not just the value.

`executeHuman()` computes `joinLabels` over all inputs before presenting the prompt. The human's response label is:

```typescript
const inputJoin = inputs.reduce(
  (acc, [, v]) => joinLabels(acc, labelOf(v)),
  { owner: context.agentId, trustLevel: 4, classification: 'public' },
);
const responseLabel = joinLabels(
  { owner: result.humanId, trustLevel: 4, classification: node.label.classification },
  inputJoin,
);
```

This preserves lattice monotonicity: a human approval of trust-0 inputs does not produce a trust-4 output. It produces a human-attested output whose `trustLevel` reflects the worst input in the provenance chain. The IFC test "trust-4-launders-trust-0 is rejected" covers this case directly.

Per-dimension overrides (`src/types/trust.ts:34`, `DimensionTrust`) allow scoping: a reviewer may hold trust-4 on `judgment` and `action` but only trust-2 on `domain` for specialized decisions. Sprint 17 does not change the dimension model but verifies that `executeHuman()` respects dimension constraints when they are present.

---

## DPN Architecture Note

Per Agha's analysis in the design doc (`docs/research/hitl-primitive.md:§6.3`): human nodes break DPN bisimulation — two runs of a graph are not bisimilar if one waits and the other does not. Rather than weakening bisimulation guarantees for the DPN core, Sprint 17 treats HITL as a **reactive layer above** the pure DPN. The DPN graph terminates at the `'human'` node boundary. The `human-approval` NL protocol (Deliverable 5) handles the asynchronous exchange outside DPN semantics. Resumption re-enters the DPN with a concrete value. This mirrors how Weft treats human calls as opaque externals wrapped in its durability substrate without making them part of the formal dataflow model.

---

## Alignment Impact

| Advisor | Gap Addressed | How |
|---------|--------------|-----|
| Liskov (Language) | New node type well-typed | `'human'` extends `VPIRNodeType`; `humanPromptSpec` is a typed optional field; clean abstraction boundary at `HumanGateway` |
| Myers (IFC) | Provenance join prevents laundering | `responseLabel = joinLabels(humanLabel, inputJoin)` enforces lattice monotonicity on human outputs |
| Agha (Actor) | HITL above DPN, not inside it | Human node terminates DPN boundary; `human-approval` protocol handles async exchange outside bisimulation |
| Pearl (Causal) | Human approval tracks provenance | `inputJoin` computed before prompt; human response is causally linked to its input lineage in the audit record |
| de Moura (SMT) | Z3 still verifies 21 properties | Human nodes modelled as uninterpreted functions; machine subgraph fully decidable |
| Voevodsky (HoTT) | Stable | No transport changes; `verifiable: false` correctly excludes human nodes from proof transport |
| Milner (Process) | Stable | DPN bisimulation preserved by keeping human outside pure DPN core |
| Sutskever (LLM) | LLM + human in same chain | `'human'` node slots into VPIR alongside inference nodes; LLM and human share a provenance record |
| Kay (Paradigm) | Human is a first-class participant | Human judgment formally tracked in the verifiable reasoning chain for the first time |

---

## Test Metrics

| Metric | Sprint 16 | Sprint 17 | Delta |
|--------|-----------|-----------|-------|
| Test Suites | 83 | 88 | +5 |
| Tests | 1485+ | 1580+ | +95 |
| Z3 Properties | 21 | 21 | +0 |
| Benchmarks | 10 | 11 | +1 |
| Modules | 33 | 36 | +3 |

---

## Acceptance Criteria

- `'human'` node type is executable end-to-end with `CLIHumanGateway`
- Crash between prompt-issued and response-received: Sprint 16 journal checkpoints the suspended frame; resumed execution continues the wait without re-issuing the prompt
- IFC: human response labeled with provenance join over inputs + human trust level; test `trust-4-launders-trust-0 is rejected` passes
- 21 Z3 properties still verified; human nodes skipped with explicit `status: 'uninterpretable'` marker in verification report
- Weather benchmark includes an operator-approval gate before committing the final action
- `'human.attention'` capability must be negotiated before any human node executes; missing grant throws before gateway is contacted
- First `AuditEvent` with `actor.type: 'human'` emitted from `src/`
- `npm run ci` green

---

## Out of Scope

- Slack / Discord / email delivery surfaces (Sprint 18+)
- HTTP webhook gateway (Sprint 18, requires Track 1 journal for multi-hour waits)
- Multi-human routing, majority-vote approval, or round-robin assignment
- Human-driven graph mutation via `VPIRDiff` (design doc §8 open question — deferred)
- `SecurityLabel.owner` becoming `string | string[]` for multi-human provenance records

---

## New Files

- `src/vpir/human-gateway.ts` — `HumanGateway` interface + `CLIHumanGateway` + `NoopHumanGateway`
- `src/vpir/human-gateway.test.ts` — gateway unit tests
- `docs/sprints/sprint-17-hitl-primitive.md` — this document

## Modified Files

- `src/types/vpir.ts` — add `'human'` to `VPIRNodeType`; add `humanPromptSpec` to `VPIRNode`
- `src/types/vpir-execution.ts` — add `HumanGatewayRequest`, `HumanGatewayResponse`, `HumanGateway`; add `humanGateway?` to `VPIRExecutionContext`
- `src/types/protocol.ts` — add `'human-approval'` to `ProtocolName`; add `'awaiting_human'`, `'rejected'`, `'timed_out'` to `ProtocolState`
- `src/vpir/vpir-interpreter.ts` — add `case 'human':`; implement `executeHuman()`
- `src/protocol/nl-protocol.ts` — register `human-approval` transitions; refactor `TERMINAL_STATES` to per-protocol map
- `src/capability/capability-negotiation.ts` — register `'human.attention'` capability
- `src/verification/z3-graph-verifier.ts` — handle human nodes as uninterpreted; emit `uninterpretable` markers
- `src/vpir/index.ts` — export `HumanGateway`, `CLIHumanGateway`, `NoopHumanGateway`
- `src/benchmarks/` — weather benchmark operator-approval gate
- `docs/research/hitl-primitive.md` — status updated to Accepted and Implemented
- `status.md` — Sprint 17 deliverables and M6 milestone entry
