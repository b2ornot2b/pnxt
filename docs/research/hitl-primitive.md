# Human-in-the-Loop (HITL) VPIR Primitive

**Status**: Proposal — not implemented  
**Depends on**: Track 1 Durability (VPIRJournal, not yet implemented)  
**Comparison motivation**: Weft (WeaveMindAI/weft) programs pause for days awaiting a human response through the same code path as an LLM call. pnxt has no equivalent.

---

## 1. Problem Statement

The human is a first-class actor in pnxt's type system. `src/types/aci.ts:86` declares `actor.type: 'agent' | 'human' | 'system'` in `AuditEvent`. The trust engine (`src/types/agent.ts:20`) defines `TrustLevel = 0 | 1 | 2 | 3 | 4`. The capability system (`src/capability/capability-negotiation.ts:4`) implements a 3-phase handshake. The NL protocol layer (`src/protocol/nl-protocol.ts:10-12`) defines three built-in protocols: `task-delegation`, `capability-negotiation`, and `conflict-resolution` — all synchronous, advancing through states `initiated → negotiating → agreed → executing → completed | failed` with no suspend point (`src/types/protocol.ts:68-74`).

Despite this type-level presence, the human has zero runtime footprint:

- No VPIR node type can yield execution pending human input. The five current node types (`src/types/vpir.ts:20-25`) are `inference`, `observation`, `action`, `assertion`, `composition` — all machine-executable.
- The `VPIRExecutionContext` (`src/types/vpir-execution.ts:26-62`) has no `humanGateway` slot. The node dispatcher at `src/vpir/vpir-interpreter.ts:277-295` throws `Unknown node type` for anything outside the five types.
- No audit event with `actor.type: 'human'` is produced anywhere in `src/`. Searching confirms the string `'human'` appears only in the type declaration at `src/types/aci.ts:86`.
- The agent runtime (`src/agent/agent-runtime.ts:48-50`) allows a `suspended` lifecycle state, but nothing in the VPIR layer triggers it.

Approvals, reviews, and corrections today require external orchestration that lives entirely outside pnxt's verifiable reasoning chain, breaking provenance.

---

## 2. Design

### 2.1 New Node Type

Extend `VPIRNodeType` in `src/types/vpir.ts:20-25`:

```typescript
export type VPIRNodeType =
  | 'inference'
  | 'observation'
  | 'action'
  | 'assertion'
  | 'composition'
  | 'human';          // NEW: suspends until a human responds
```

A node of type `'human'` differs from `'action'` in one critical way: it does not invoke a tool through the ACI gateway. It suspends the graph, persists state to the journal, and resumes only when a human has provided a response through a `HumanGateway`.

### 2.2 HumanGateway Interface

Define a new interface alongside the existing `VPIRExecutionContext` in `src/types/vpir-execution.ts`:

```typescript
export interface HumanGatewayRequest {
  promptId: string;
  message: string;
  context: Record<string, unknown>;
  requesterLabel: SecurityLabel;
  timeout?: number;           // milliseconds; undefined = wait indefinitely
}

export interface HumanGatewayResponse {
  response: unknown;
  humanId: string;            // identifier for the responding human
  respondedAt: number;        // Unix timestamp ms
}

export interface HumanGateway {
  prompt(req: HumanGatewayRequest): Promise<HumanGatewayResponse>;
}
```

The `Promise` returned by `prompt()` resolves only when the human acts. For long waits the Track 1 journal checkpoints the suspended graph so the process can restart without losing state.

### 2.3 VPIRExecutionContext Extension

Add an optional field to `VPIRExecutionContext` in `src/types/vpir-execution.ts:26-62`:

```typescript
export interface VPIRExecutionContext {
  agentId: string;
  label: SecurityLabel;
  handlers: Map<string, InferenceHandler>;
  assertionHandlers?: Map<string, AssertionHandler>;
  aciGateway?: { invoke(...): Promise<...> };
  humanGateway?: HumanGateway;   // NEW
  timeout?: number;
  subGraphResolver?: (graphId: string) => Promise<VPIRGraph | undefined>;
}
```

Optional for backwards compatibility: existing graphs without `'human'` nodes never touch this field.

### 2.4 executeHuman()

Add a new case to the `executeNode` switch at `src/vpir/vpir-interpreter.ts:277-295`:

```typescript
case 'human':
  return executeHuman(node, inputs, context);
```

```typescript
async function executeHuman(
  node: VPIRNode,
  inputs: Map<string, unknown>,
  context: VPIRExecutionContext,
): Promise<unknown> {
  if (!context.humanGateway) {
    throw new Error(`Node ${node.id}: humanGateway required for 'human' node type`);
  }

  // Checkpoint the graph state to the journal before suspending.
  // (Requires Track 1 VPIRJournal — not yet implemented.)
  await context.journal?.checkpoint(node.id, inputs);

  const result = await context.humanGateway.prompt({
    promptId: node.id,
    message: node.operation,
    context: Object.fromEntries(inputs),
    requesterLabel: node.label,
    timeout: node.metadata?.timeout as number | undefined,
  });

  // The human response becomes the node's output with a fresh label.
  return result;
}
```

The journal dependency is acknowledged as unimplemented (Track 1). The `humanGateway.prompt()` call is the natural suspension point: the `await` holds the async call stack for the duration. For multi-hour or multi-day waits, the journal persists the suspended frame so the runtime can restart and resume.

---

## 3. NL Protocol Extension

The existing `ProtocolName` union in `src/types/protocol.ts:63` is:

```typescript
export type ProtocolName =
  | 'task-delegation'
  | 'capability-negotiation'
  | 'conflict-resolution';
```

Add `'human-approval'`:

```typescript
export type ProtocolName =
  | 'task-delegation'
  | 'capability-negotiation'
  | 'conflict-resolution'
  | 'human-approval';   // NEW
```

State machine:

```
initiated → awaiting_human → completed
                           → rejected
                           → timed_out
```

Transition table (extends `PROTOCOL_TRANSITIONS` in `src/protocol/nl-protocol.ts:29`):

| From            | Message type | Sender   | To              |
|-----------------|-------------|----------|-----------------|
| `initiated`     | `request`   | initiator| `awaiting_human`|
| `awaiting_human`| `accept`    | human    | `completed`     |
| `awaiting_human`| `reject`    | human    | `rejected`      |
| `awaiting_human`| `propose`   | human    | `awaiting_human`| (modification, loops back)
| `awaiting_human`| `inform`    | system   | `timed_out`     |

The current `ProtocolState` union (`src/types/protocol.ts:68-74`) must be extended with `'awaiting_human'`, `'rejected'`, and `'timed_out'`. These are terminal for `human-approval` but not for the other three protocols, so the `TERMINAL_STATES` array in `src/protocol/nl-protocol.ts:65` would be split per-protocol rather than shared — a small but necessary refactor.

---

## 4. Trust Model

Humans are assigned `TrustLevel 4` by default when registered with the trust engine (`src/trust/trust-engine.ts`). This is the ceiling of the 5-level model (`TrustLevel = 0 | 1 | 2 | 3 | 4`, `src/types/agent.ts:20`) and reflects the design principle that human judgment overrides automated reasoning.

Per-dimension overrides (`src/types/trust.ts:34`, `DimensionTrust`) allow scoping: a human reviewer may hold level 4 on `judgment` and `action` dimensions but only level 2 on `domain` for a specialized technical decision, preventing blanket elevation.

Every human response must produce an audit event satisfying the existing `AuditEvent` shape in `src/types/aci.ts:85-86`, with `actor.type: 'human'`. As verified above, no code currently emits such an event. The `executeHuman()` function is the natural place to emit it after `humanGateway.prompt()` resolves.

### New Capability: human.attention

Before any `'human'` node executes, the caller must hold a negotiated grant for operation `human.attention`. This integrates with the existing `CapabilityNegotiationService` (`src/capability/capability-negotiation.ts:142`) without changes to the 3-phase handshake structure. A missing grant causes `executeHuman()` to throw before the gateway is contacted, preserving the principle that capabilities gate all side effects.

---

## 5. IFC Label Rules

The existing `SecurityLabel` interface (`src/types/ifc.ts:39`) carries `owner`, `trustLevel`, and `classification`. The `canFlowTo` rule (`src/types/ifc.ts:74`) is:

```
L1 can flow to L2 iff L1.trustLevel <= L2.trustLevel
                    AND classification(L1) <= classification(L2)
```

For a human node the label assigned to the response is:

```typescript
const responseLabel: SecurityLabel = {
  owner: result.humanId,
  trustLevel: 4,
  classification: node.label.classification,  // inherits context classification
};
```

**The provenance check problem.** A naive implementation allows a trust-4 human response to launder low-trust inputs: an agent feeds a `trustLevel: 0` observation into a `'human'` node; the human's response emerges at trust 4; downstream nodes see a high-trust label on data whose lineage is untrustworthy.

The fix: **the human must explicitly approve the provenance chain, not just the value.** Before presenting the prompt to the human, `executeHuman()` computes `joinLabels` over all input labels (`src/types/ifc.ts:86-99`) and includes the result in the `context` field of `HumanGatewayRequest`. The gateway surface (CLI, webhook) must render this to the human as "this decision is based on data classified at level X from sources Y, Z." The human's approval is recorded as covering that provenance. The output label is then the join of the human's label and the joined input label — not a simple override:

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

This preserves the lattice monotonicity guarantee: a human approval of low-trust inputs does not produce a high-trust output, it produces a human-attested output whose classification reflects the worst input in the provenance chain.

---

## 6. Verification Implications

### 6.1 Non-Determinism and verifiable: false

`VPIRNode.verifiable: boolean` exists at `src/types/vpir.ts:86`. All `'human'` nodes must set `verifiable: false`. Human responses are non-deterministic: replaying the graph does not reproduce the same response. The VPIR validator (`src/vpir/`) should enforce this by rejecting human nodes with `verifiable: true`.

### 6.2 Z3 Treatment

Graphs submitted to the Z3 verification layer (`src/verification/`) that contain human nodes are partially verifiable. The human node's output is modelled as an uninterpreted function `f_human(inputs)` with a single constraint: its label satisfies the provenance join rule from Section 5. Properties that depend only on machine nodes remain fully decidable. Properties that flow through a human node produce Z3 `unknown` unless the human output is subsequently constrained by an `assertion` node that the human has agreed to satisfy as part of the approval.

### 6.3 DPN Bisimulation

The channel/process layer (`src/channel/`) is built on Dataflow Process Networks with bisimulation equivalence as the semantic foundation. Human nodes break bisimulation: two runs of a graph are not bisimilar if one waits and the other doesn't, or if the human produces different values. Rather than weakening bisimulation, the correct approach is to treat HITL as a **reactive layer** above the pure DPN core. The DPN graph terminates at the `'human'` node boundary; the human-approval protocol (Section 3) handles the asynchronous exchange outside DPN semantics; resumption re-enters the DPN with a concrete value. This is architecturally consistent with how Weft treats human calls as opaque externals that the runtime wraps in its durability substrate without making them part of the formal dataflow model.

---

## 7. Delivery Surfaces

Ranked by implementation priority:

1. **CLI prompt** — reads from `stdin`, writes to `stdout`. Integrates immediately with `npm test` and the weather benchmark (`src/benchmarks/`). A human node running in CI blocks the test runner, printing the message and waiting for keyboard input. Useful for interactive approval workflows in development. First implementation target.

2. **HTTP webhook** — the runtime POSTs the `HumanGatewayRequest` to a configured URL and polls (or holds a long-lived connection) for a response. Enables web forms, approval dashboards, and Slack/email integrations without coupling them to pnxt internals. Second implementation target, contingent on Track 1 journal for durability across the wait.

3. **Slack/Discord** — message sent via bot, response parsed from thread reply. Higher engineering cost, lower priority. Deferred.

The `HumanGateway` interface is the seam: swapping delivery surfaces requires only a new implementation of `prompt()`, not changes to the VPIR interpreter or protocol layer.

---

## 8. Open Questions

**Is `human.attention` itself a negotiated capability, or a precondition?** Treating it as a negotiated capability aligns with the existing 3-phase handshake and makes capability audits complete. The alternative — a simple runtime check — is simpler but bypasses the formal negotiation record. Recommendation: negotiated capability, so the ACI audit trail captures when attention was granted and to whom.

**Routing with multiple humans.** The current design assumes a single human identified by `humanId`. Team-of-humans workflows (e.g., majority-vote approval, round-robin assignment) require either: (a) the `HumanGateway` implementation absorbs routing and returns a single synthesized response, or (b) the protocol layer is extended with a multi-party `human-approval` variant. Option (a) is simpler and keeps pnxt's type system stable. The open question is whether the provenance label should record all contributing `humanId` values — it should, and `SecurityLabel.owner` would need to become `owner: string | string[]` or a separate `owners` field.

**Can a human node produce a VPIRDiff?** `VPIRDiff` is defined at `src/types/vpir.ts:190` and the patch mechanism exists. A human reviewer could reject not just a value but a subgraph, returning a diff that rewires or removes nodes. This closes the loop with Sprint 14/15's self-modification work. The `HumanGatewayResponse.response` field typed as `unknown` leaves this open. Formalising it requires specifying when a diff-valued response is legal (only from trust-4 humans, only on non-verified subgraphs, only before downstream nodes have consumed the node's output) — a natural follow-on design task once the basic scalar-response case is working.
