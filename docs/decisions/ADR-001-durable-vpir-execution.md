# ADR-001: Durable Execution for VPIR Interpreter and DPN Runtime

**Status**: Proposed
**Date**: 2026-04-19
**Deciders**: pnxt research team

---

## Context

The VPIR interpreter (`src/vpir/vpir-interpreter.ts`) builds all execution state in a single in-memory `Map<string, Map<string, unknown>>` called `nodeOutputs` (line 45). This map is local to each `executeGraph()` call and is discarded on return or crash. The DPN runtime (`src/channel/dpn-runtime.ts`) instantiates `Process` actors whose state (`ProcessState`, `src/channel/process.ts:22`) and `Channel` buffers (`src/channel/channel.ts:34`) are equally volatile. A process crash — JVM OOM, SIGKILL, unhandled rejection — loses the full graph walk. The weather-API benchmark (`src/benchmarks/weather-api-shim.ts`) is the primary integration target for durability experiments.

Three cross-cutting constraints make durability non-trivial for pnxt specifically:

1. **IFC label preservation** — `checkIFCFlow` (`src/vpir/vpir-interpreter.ts:507-525`) enforces lattice ordering at every data-flow boundary via `canFlowTo`. A replayed node must present the same `SecurityLabel` as the original execution or the lattice check may produce a different result.
2. **Z3 verification caching** — 21 properties are formally verified at graph-load time (`src/verification/z3-graph-verifier.ts:319-329`). Replay must not silently skip re-verification when the resumed graph differs from the verified snapshot.
3. **DPN bisimulation** — Channels are bounded FIFO buffers with backpressure (`src/channel/channel.ts:46-55`). Selective process replay can violate causal message ordering, breaking bisimulation equivalence with the pre-crash execution.

The existing `GraphTransaction` (`src/vpir/vpir-transaction.ts:51-75`) provides snapshot + diff + inverse-diff rollback for *graph structure* mutations, not for interpreter execution state. It is a related but distinct concern.

---

## Decision Drivers

- Zero new runtime dependencies during the research phase.
- VPIR execution semantics (IFC, Z3, bisimulation) must be preserved under replay.
- The interface must be stable enough that a production-grade backend (Restate, Temporal) can replace it later without touching interpreter logic.
- External effects today are limited to: one mock LLM call and one mock HTTP call. Exactly-once delivery is not yet required.

---

## Options Considered

### Option 1: Restate SDK Integration

Restate journals every function invocation and guarantees exactly-once side effects via a durable execution log stored outside the process. This is the approach taken by Weft (WeaveMindAI/weft), which wraps its agent steps in Restate virtual objects.

**Pros**
- Exactly-once semantics for external calls — relevant once pnxt integrates real LLM or HTTP calls.
- Restate's journal is content-addressed, so replay is deterministic by construction.
- Production-grade durability without building storage.

**Cons**
- Requires a running Restate server (Docker image or managed service) — a new operational dependency.
- The `executeGraph()` signature would need to be wrapped in a Restate handler, coupling the interpreter to the framework's programming model.
- IFC labels and Z3 verification results are opaque to Restate's journal; the framework cannot enforce lattice checks during replay without explicit integration code.
- Premature: pnxt has no real external effects today.

---

### Option 2: Temporal

Temporal provides workflow durability through a server-side event log and worker-side replay of deterministic workflow functions.

**Pros**
- Mature ecosystem, strong TypeScript SDK.
- Workflow history provides a complete audit trail.

**Cons**
- Heavier operational footprint than Restate (Temporal server + worker process model).
- Temporal's determinism constraints (no `Date.now()`, no random, no async I/O outside activities) conflict with how `executeGraph()` currently calls `performance.now()` and `Math.random()` for trace timing and transaction IDs (`src/vpir/vpir-transaction.ts:101`).
- Same IFC/Z3 opacity problem as Restate.
- No advantage over Restate at the research scale.

---

### Option 3: Bespoke journal on `FileStorageBackend` (Recommended)

Extend `FileStorageBackend` (`src/memory/storage-backend.ts:57-93`) — which already implements `load()`, `save()`, `append()`, and `remove()` over a JSON file — with a `VPIRJournal` interface. The journal appends one entry per executed node immediately after `nodeOutputs.set(nodeId, outputs)` inside `executeGraph()`. On restart, `replay()` reads the journal and reconstructs `nodeOutputs` up to a named checkpoint, then resumes the topological walk from the first un-journaled node.

**Interface sketch**

```typescript
interface VPIRJournal {
  append(entry: JournalEntry): Promise<void>;
  replay(checkpointId: string): Promise<Map<string, Map<string, unknown>>>;
  latestCheckpoint(graphId: string): Promise<string | null>;
}

interface JournalEntry {
  graphId: string;
  nodeId: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  label: SecurityLabel;
  timestamp: number;
}
```

`label` is stored per entry so that `checkIFCFlow` can re-validate the lattice during replay without re-executing the node's handler. A checkpoint is a named flush point (e.g., after each `assertion` node passes) that delimits safe resume positions.

**Pros**
- Zero new dependencies. `FileStorageBackend` already uses `node:fs/promises`; the journal is the same mechanism.
- IFC labels travel with the journal entry — replay can re-run `canFlowTo` against the stored label rather than trusting a re-derived one.
- Z3 verification happens once at graph load, before any node executes; the journal does not interact with the verified snapshot. The existing `z3-diff-verifier.ts` `PreservationResult` (`src/verification/z3-diff-verifier.ts:65-78`) already tracks which properties are affected by a diff; the journal leaves that path unchanged.
- DPN bisimulation risk is contained: the journal records *interpreter-path* outputs, not channel buffer contents. Full DPN replay (re-running actors) is out of scope for this option; the journal enables interpreter-level resume only.
- The `VPIRJournal` interface is small enough that a `RestateJournal` or `TemporalActivity` adapter can implement it later without touching `executeGraph()`.

**Cons**
- `FileStorageBackend.append()` (line 82-86) re-reads the full file on every call — suitable for research workloads but not for high-throughput production use.
- Does not solve exactly-once external effects. If an `action` node crashes after invoking the ACI tool but before the journal entry is written, the tool may be invoked twice on replay. Acceptable today; must be addressed before production.
- DPN process state (channel buffers, `ProcessState`) is not journaled. Crash mid-DPN-execution still requires a full graph restart, with interpreter-level resume providing partial savings only.

---

### Option 4: No Durability (Status Quo)

Keep the current behavior: all state is lost on crash. The benchmark is re-run from the beginning.

**Pros**
- No implementation cost.

**Cons**
- Unacceptable for long-running graph executions (multi-step LLM chains) once real LLM calls are integrated.
- Disqualifies pnxt from the research comparison with Weft, which already has durable execution.

---

## Decision

**Adopt Option 3.** Implement `VPIRJournal` backed by `FileStorageBackend`. Journal entries are appended inside `executeGraph()` at `src/vpir/vpir-interpreter.ts` after each node's output is stored in `nodeOutputs` (line 45 and the per-node `nodeOutputs.set` calls in the sequential loop starting at line 72). Checkpoints are emitted after each `assertion` node that passes, since assertions are the semantic boundaries where partial graph state is meaningful.

Restate (Option 1) is the target for a future sprint once: (a) the `VPIRJournal` interface is stable and exercised by the weather benchmark, and (b) real external effects are introduced. A `RestateJournal` adapter will implement `VPIRJournal` without modifying interpreter internals.

---

## Consequences

**Positive**
- Crash-safe resume for the interpreter path at zero dependency cost.
- IFC label fidelity across replay is guaranteed by the stored `label` field in `JournalEntry`.
- The `VPIRJournal` interface acts as an abstraction boundary, keeping durability concerns out of interpreter logic.

**Negative / Accepted**
- `FileStorageBackend.append()` performs a full read-modify-write on every node completion. For the weather-API benchmark (small graph, ~5 nodes) this is acceptable. A future sprint should replace this with an append-only write using newline-delimited JSON.
- DPN actor state remains volatile. The DPN runtime is not in scope for this ADR.
- Exactly-once external effects remain unresolved. The research comparison with Weft must note this gap explicitly.

---

## Hazards and Open Questions

1. **IFC label replay divergence.** If the stored `label` in a `JournalEntry` differs from what the source node would produce on re-execution (e.g., due to a code change between crash and restart), `checkIFCFlow` will silently accept the stale label. Mitigation: include a `schemaVersion` field in `JournalEntry` and reject replays where the version does not match the current interpreter build.

2. **Z3 verification invalidation.** The 21 verified properties are checked against the graph structure at load time (`src/verification/z3-graph-verifier.ts:311-329`). If the journal is replayed against a *modified* graph (graph structure changed between crash and restart), properties verified against the original structure no longer hold. Mitigation: store the graph's content hash in the checkpoint and reject mismatches.

3. **DPN bisimulation under partial resume.** If the interpreter-level journal resumes mid-graph but the DPN runtime is restarted from scratch, the channel messages already consumed by completed processes are gone. This breaks causal ordering for the remaining processes. The journal must be treated as interpreter-only until a companion DPN channel log is designed.

4. **Concurrent access.** `FileStorageBackend` is documented as "not designed for concurrent access" (`src/memory/storage-backend.ts:55`). Multi-process or multi-agent scenarios must not share a journal file.

---

## References

- `src/vpir/vpir-interpreter.ts` — `executeGraph()` at line 37, `nodeOutputs` declaration at line 45, `checkIFCFlow` at line 507.
- `src/vpir/vpir-transaction.ts` — `GraphTransaction` (snapshot + rollback) at line 51; `beginTransaction` at line 99.
- `src/channel/dpn-runtime.ts` — DPN actor execution model; `DPNExecutionResult` at line 73.
- `src/channel/channel.ts` — `Channel<T>` bounded FIFO buffer at line 29; `bufferSize` at line 49.
- `src/channel/process.ts` — `Process<TIn, TOut>` actor at line 20; volatile `ProcessState` at line 22.
- `src/memory/storage-backend.ts` — `StorageBackend` interface at line 18; `FileStorageBackend` at line 57; `append()` read-modify-write at line 82.
- `src/verification/z3-graph-verifier.ts` — `verifyGraphProperties()` checking 4 properties at line 311; result aggregation at line 327.
- `src/verification/z3-diff-verifier.ts` — `PreservationResult` tracking transported vs. re-verified properties at line 65.
- `src/benchmarks/weather-api-shim.ts` — primary integration target for durability spike.
- `QuickStart.md:134` — source for "21 formally verified Z3 properties" claim.
