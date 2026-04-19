# Sprint 16: Durable VPIR Execution

> **Phase**: 8, Sprint 16 — "Durable VPIR Execution"
> **Priority**: P1 (unblocks HITL + scheduled triggers)
> **Primary Advisors**: Milner (process calculi), Myers (IFC), Agha (actor model)
> **Score Target**: 9.5 → 9.55+
> **Milestone**: M5 — "Crash-Safe Execution" (Phase 8, first milestone)

---

## Summary

Sprint 16 opens Phase 8 ("Operational Maturity") by introducing crash-safe execution for the VPIR interpreter and partial checkpointing for the DPN runtime. All execution state currently lives in a single in-memory `Map<string, Map<string, unknown>>` (`nodeOutputs`, `src/vpir/vpir-interpreter.ts:45`) that is discarded on process exit or unhandled rejection. This sprint wraps `executeGraph()` with a journal that appends one entry per completed node, enabling `resumeFromCheckpoint()` to reconstruct `nodeOutputs` without re-executing settled nodes.

The decision to use a bespoke `VPIRJournal` backed by the existing `FileStorageBackend` (`src/memory/storage-backend.ts:57-93`) — rather than adopting Restate or Temporal — is documented in `docs/decisions/ADR-001-durable-vpir-execution.md`. That ADR is promoted from Proposed to Accepted at sprint close.

Three constraints from the codebase drive the design:

- **IFC label preservation** — `checkIFCFlow` (`src/vpir/vpir-interpreter.ts:507-525`) enforces lattice ordering at every data-flow boundary. Each `JournalEntry` stores the `SecurityLabel` of its node so that replay can re-validate `canFlowTo` against the persisted label rather than a re-derived one.
- **Z3 verification integrity** — 21 properties are checked once at graph load (`src/verification/z3-graph-verifier.ts:311-329`). The journal stores the graph's content hash at checkpoint creation; replay rejects mismatches.
- **DPN bisimulation containment** — Channel buffers and `ProcessState` (`src/channel/process.ts:22`) remain volatile this sprint. The journal covers interpreter-path outputs only; `getSnapshot()` / `restore()` on channels and processes provide a foundation for future full-DPN replay without breaking causal ordering.

The weather-API benchmark (`src/benchmarks/weather-api-shim.ts`) is the primary integration target: a SIGKILL mid-graph followed by a clean restart must produce identical final outputs.

---

## Deliverables

### 1. `VPIRJournal` Interface and `FileStorageBackend`-Backed Implementation

**File**: `src/vpir/vpir-journal.ts`

- `VPIRJournal` interface — three methods:
  - `append(entry: JournalEntry): Promise<void>` — persists one node-completion record
  - `replay(checkpointId: string): Promise<Map<string, Map<string, unknown>>>` — reconstructs `nodeOutputs` up to the named checkpoint
  - `latestCheckpoint(graphId: string): Promise<string | null>` — returns the most recent valid checkpoint identifier for a graph, or `null` if none exists

- `JournalEntry` type:
  ```typescript
  interface JournalEntry {
    graphId: string;
    nodeId: string;
    inputs: Record<string, unknown>;
    outputs: Record<string, unknown>;
    label: SecurityLabel;
    schemaVersion: number;
    timestamp: number;
  }
  ```
  The `label` field satisfies the IFC replay constraint. `schemaVersion` guards against replaying entries produced by a different interpreter build (hazard 1 in ADR-001).

- `FileBackedJournal` class — implements `VPIRJournal` using `FileStorageBackend.append()` (`src/memory/storage-backend.ts:82-86`). Checkpoints are emitted after each `assertion` node that passes, since assertions are the semantic boundaries where partial graph state is meaningful.

- `graphContentHash(graph: VPIRGraph): string` — SHA-256 of the serialised graph structure, stored in every checkpoint entry. Replay rejects if the current graph hash differs (hazard 2 in ADR-001).

- No new runtime dependencies. `FileStorageBackend` already uses `node:fs/promises`; the journal is the same mechanism.

**Known limitation** (accepted per ADR-001): `FileStorageBackend.append()` re-reads the full JSON file on every call. Acceptable for the weather benchmark (~5 nodes). A follow-on sprint should replace with newline-delimited JSON append-only writes.

---

### 2. Journal Integration in `executeGraph()`

**File**: `src/vpir/vpir-interpreter.ts` (modification, not rewrite)

- Add optional `journal?: VPIRJournal` parameter to `executeGraph()`. When absent the function behaves identically to Sprint 15.
- After each `nodeOutputs.set(nodeId, outputs)` in the topological walk (starting at line 72), call `journal.append(entry)` with the node's inputs, outputs, and resolved `SecurityLabel`.
- Add `resumeFromCheckpoint(graphId: string, journal: VPIRJournal): Promise<ExecutionState>` — reads the latest checkpoint via `journal.latestCheckpoint()`, calls `journal.replay()` to reconstruct `nodeOutputs`, then returns an `ExecutionState` that `executeGraph()` can consume to skip already-settled nodes.
- Checkpoint emission: after each `assertion` node passes, write a checkpoint entry containing the graph content hash and the list of completed node IDs.
- IFC path: replay calls `checkIFCFlow` with the stored `label` from `JournalEntry`. If the stored `schemaVersion` does not match the current interpreter constant, replay throws `JournalSchemaVersionError` rather than silently accepting a stale label.
- Z3 path: `verifyGraphProperties()` is still called once at graph load before any node executes. The journal does not interact with Z3 verification — this is preserved from the pre-sprint behaviour.

**Interfaces added**:
```typescript
interface ExecutionState {
  nodeOutputs: Map<string, Map<string, unknown>>;
  completedNodes: Set<string>;
  checkpointId: string;
}
```

---

### 3. Channel and Process Snapshot/Restore

**Files**: `src/channel/channel.ts`, `src/channel/process.ts`

These methods do not provide full DPN replay this sprint (that is out of scope). They establish the interface contract so that a future companion DPN channel log can implement them without breaking causal ordering (hazard 3 in ADR-001).

**`src/channel/channel.ts`**

- `getSnapshot(): ChannelSnapshot` — captures the current buffer contents and `bufferSize` (`src/channel/channel.ts:49`) at a named point in time. Returns:
  ```typescript
  interface ChannelSnapshot {
    channelId: string;
    buffer: unknown[];
    bufferSize: number;
    timestamp: number;
  }
  ```
- `restore(snapshot: ChannelSnapshot): void` — replaces the internal buffer with the snapshot contents. Validates that `snapshot.bufferSize === this.bufferSize`; throws `ChannelSnapshotMismatchError` otherwise.

**`src/channel/process.ts`**

- `getSnapshot(): ProcessSnapshot` — captures the current `ProcessState` (`src/channel/process.ts:22`), the process identifier, and the timestamp. Returns:
  ```typescript
  interface ProcessSnapshot {
    processId: string;
    state: ProcessState;
    timestamp: number;
  }
  ```
- `restore(snapshot: ProcessSnapshot): void` — replaces `ProcessState` with the snapshot value. Validates that `processId` matches; throws `ProcessSnapshotMismatchError` otherwise.

**Design note**: `FileStorageBackend` is documented as not safe for concurrent access (`src/memory/storage-backend.ts:55`). Multi-process or multi-agent scenarios must not share a journal file. This constraint is unchanged by the snapshot methods.

---

### 4. Kill-and-Restart Test in the Weather Benchmark

**File**: `src/benchmarks/weather-api-shim.ts` (extension)

- Add `runDurabilityScenario()` — a three-phase test exercising the full crash-resume path:
  1. **Run phase** — start `executeGraph()` with a `FileBackedJournal` on the weather graph. After the first `assertion` node completes (checkpoint written), send SIGKILL to the worker process via `child_process`.
  2. **Resume phase** — start a fresh process, call `resumeFromCheckpoint(graphId, journal)`, then call `executeGraph()` with the recovered `ExecutionState`. The interpreter skips all nodes whose IDs appear in `completedNodes`.
  3. **Verify phase** — compare the final `nodeOutputs` map of the fresh run against a reference run (no crash). Assert deep equality across all node output keys.

- `compareOutputMaps(a, b): ComparisonResult` — utility that enumerates mismatched keys and values, used in the verify phase and in the property-based tests.

The weather graph has approximately 5 nodes (confirmed in ADR-001). The checkpoint is expected to be written after the first assertion node, leaving 2–3 nodes to be resumed.

---

### 5. Tests

#### `src/vpir/__tests__/vpir-journal.test.ts`

Unit tests for `FileBackedJournal` and the journal integration in `executeGraph()`.

| Test | Coverage |
|------|----------|
| `append then replay round-trip` | Writes N entries, reads back identical `nodeOutputs` map |
| `latestCheckpoint returns null on empty journal` | Guard for first-run case |
| `checkpoint written after assertion node` | Confirms checkpoint entry is emitted at the correct semantic boundary |
| `replay rejects schema version mismatch` | `JournalSchemaVersionError` thrown when `schemaVersion` differs |
| `replay rejects graph hash mismatch` | Rejection when graph structure changed between crash and restart |
| `IFC label preserved through replay` | `checkIFCFlow` receives stored label, not re-derived label |
| `resumeFromCheckpoint skips completed nodes` | Topological walk does not re-execute nodes in `completedNodes` |
| `executeGraph without journal is unchanged` | No regression when `journal` parameter is omitted |
| `property: random graph → journal → replay → same outputs` | 20 random VPIR graphs; all replay to identical `nodeOutputs` |

#### `src/channel/__tests__/channel-snapshot.test.ts`

Unit tests for `getSnapshot()` / `restore()` on `Channel` and `Process`.

| Test | Coverage |
|------|----------|
| `channel snapshot captures buffer contents` | Buffer order is preserved |
| `channel restore replaces buffer` | Post-restore reads return snapshot values |
| `restore throws on bufferSize mismatch` | `ChannelSnapshotMismatchError` |
| `process snapshot captures ProcessState` | All `ProcessState` fields present |
| `process restore sets state` | Post-restore state matches snapshot |
| `restore throws on processId mismatch` | `ProcessSnapshotMismatchError` |
| `snapshot of empty channel is valid` | Empty buffer is a legal snapshot |
| `sequential snapshot/restore preserves FIFO order` | Verifies causal ordering is not broken by snapshot round-trip |

---

### 6. ADR-001 Promotion

**File**: `docs/decisions/ADR-001-durable-vpir-execution.md`

At sprint close, update the `Status` field from `Proposed` to `Accepted` and append an "Implementation Notes" section recording:

- The `schemaVersion` constant chosen and where it lives in the codebase.
- The graph content hash algorithm (`SHA-256` of serialised adjacency list).
- Observed journal file size for the weather benchmark (expected: < 10 KB).
- Confirmation that `FileStorageBackend.append()` read-modify-write is acceptable at current graph scale, with a forward reference to the follow-on sprint that should introduce append-only writes.

---

## Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| AC-1 | Journal appends one entry per node output before `executeGraph()` proceeds to the next node | `vpir-journal.test.ts` — `append then replay round-trip` |
| AC-2 | `resumeFromCheckpoint(graphId)` reconstructs the same `nodeOutputs` map as a full fresh run | `vpir-journal.test.ts` — round-trip and property tests |
| AC-3 | Kill test: SIGKILL mid-graph in weather benchmark, restart, identical final output | `weather-api-shim.ts` — `runDurabilityScenario()` |
| AC-4 | 21 Z3 properties remain verified after replay (no silent skip) | Confirmed by `verifyGraphProperties()` running at graph load in resume phase |
| AC-5 | IFC flow-checks produce identical results on replay (stored label used, not re-derived) | `vpir-journal.test.ts` — `IFC label preserved through replay` |
| AC-6 | `npm run ci` green | CI pipeline |
| AC-7 | No new runtime dependencies added to `package.json` | `git diff package.json` shows no new entries in `dependencies` |
| AC-8 | `Channel.restore()` and `Process.restore()` preserve FIFO ordering | `channel-snapshot.test.ts` — `sequential snapshot/restore preserves FIFO order` |
| AC-9 | ADR-001 status updated to Accepted | `docs/decisions/ADR-001-durable-vpir-execution.md` — `Status: Accepted` |

---

## Test Plan

The test plan addresses the four hazards identified in ADR-001 and the four test categories required by the sprint brief.

### Unit: Journal Append/Replay Round-Trip

**Target**: `src/vpir/__tests__/vpir-journal.test.ts`

Construct a minimal `VPIRGraph` with 3–5 nodes. Append entries manually via `FileBackedJournal.append()`, then call `replay()` and assert that the returned `nodeOutputs` map is deep-equal to the directly-constructed reference. Verify that the `SecurityLabel` in each replayed entry matches what was appended (IFC hazard 1).

Also test the graph hash check: mutate one edge in the graph between append and replay, assert `JournalGraphHashError` is thrown (IFC hazard 2).

### Unit: Channel Snapshot/Restore Preserves Order

**Target**: `src/channel/__tests__/channel-snapshot.test.ts`

Push N items into a `Channel`, call `getSnapshot()`, drain the channel, call `restore(snapshot)`, then drain again and verify that items emerge in the original FIFO order. This guards against the causal ordering break described in ADR-001 hazard 3.

Test boundary: restoring a snapshot with a mismatched `bufferSize` must throw `ChannelSnapshotMismatchError` rather than silently truncating or expanding the buffer.

### Integration: Mid-Graph Crash and Resume on Weather Benchmark

**Target**: `src/benchmarks/weather-api-shim.ts` — `runDurabilityScenario()`

1. Start a child process running the weather graph with a `FileBackedJournal` writing to a temp directory.
2. Wait for the checkpoint signal (first `assertion` node completion, journal file non-empty).
3. SIGKILL the child process.
4. Start a second child process that calls `resumeFromCheckpoint()`, then `executeGraph()` with the recovered state.
5. Compare the second process's final `nodeOutputs` against a reference run (no crash) using `compareOutputMaps()`.
6. Assert zero mismatched keys and values.

This test is deterministic because the weather benchmark uses a fixed mock HTTP response and a fixed mock LLM response (no real external effects, per ADR-001 scope).

### Property: Random VPIR Graph → Journal → Replay → Same Outputs

**Target**: `src/vpir/__tests__/vpir-journal.test.ts` — property test

Generate 20 random valid `VPIRGraph` instances (using the existing graph builder infrastructure from Sprint 14). For each:

1. Execute with `FileBackedJournal`.
2. Replay from the latest checkpoint.
3. Assert deep equality of `nodeOutputs`.

Cover graphs with 1 node (boundary), 5 nodes (weather-scale), and 15 nodes (stress). All must pass with `schemaVersion` matching and graph hash matching.

---

## Out of Scope

- **Restate SDK integration** — deferred per ADR-001. The `VPIRJournal` interface is designed so that a `RestateJournal` adapter can implement it later without modifying `executeGraph()`.
- **Exactly-once semantics for external side effects** — the weather benchmark uses mocks only. If an `action` node crashes after invoking the ACI tool but before the journal entry is written, the tool may be invoked twice on replay. This is documented in ADR-001 and deferred.
- **HITL suspension and resumption** — planned for Sprint 17.
- **Distributed execution** — multi-process or multi-agent journal sharing requires a concurrent-safe backend (e.g., a database or an append-only log service). `FileStorageBackend` is explicitly not safe for concurrent access (`src/memory/storage-backend.ts:55`).
- **Full DPN replay** — `getSnapshot()` / `restore()` on `Channel` and `Process` are interfaces only this sprint. A complete DPN channel log that restores causal message ordering across all actors is a future sprint.
- **Append-only journal writes** — `FileStorageBackend.append()` performs a full read-modify-write per entry. Replacing this with newline-delimited JSON appends is a follow-on task noted in ADR-001.

---

## Dependencies

None. Sprint 16 is the first sprint of Phase 8 and has no prerequisite sprints from Phase 8. All referenced infrastructure is from Phase 5–7:

| Dependency | Sprint Introduced | Used In |
|------------|-------------------|---------|
| `FileStorageBackend` | Phase 4 | `FileBackedJournal` backend |
| `VPIRGraph`, `executeGraph()` | Phase 5 | Journal integration |
| `checkIFCFlow`, `SecurityLabel` | Phase 5 | IFC label replay |
| `z3-graph-verifier.ts` | Phase 5 | Z3 property check at graph load |
| `Channel<T>`, `Process<TIn, TOut>` | Phase 5 | Snapshot/restore methods |
| `weather-api-shim.ts` | Phase 6 | Kill-and-restart integration test |
| `GraphTransaction` (snapshot + rollback) | Sprint 14 | Related but distinct; not modified |

---

## Advisory Panel Alignment

| Advisor | Domain | Relevance to Sprint 16 |
|---------|--------|------------------------|
| Milner (process calculi) | Bisimulation under replay | The journal-only approach (interpreter path, not full DPN replay) is justified by bisimulation: restarting actors from scratch with a correct `nodeOutputs` seed produces the same observable behaviour as uninterrupted execution, provided channel buffers are empty at resume points. `getSnapshot()` / `restore()` preserve the foundation for future bisimulation-correct full replay. |
| Myers (IFC) | Label preservation across journal | `JournalEntry.label` carries the `SecurityLabel` through the crash boundary. Replay calls `canFlowTo` on the stored label, guaranteeing that the lattice check result is identical to the original execution. `schemaVersion` prevents silent acceptance of a stale label from a prior interpreter build. |
| Agha (actor model) | Channel checkpointing | `Channel.getSnapshot()` and `Process.getSnapshot()` follow the actor model principle that actor state is private and inspectable only through defined interfaces. The `ChannelSnapshot` and `ProcessSnapshot` types make state transfer explicit rather than relying on shared memory. |
| de Moura (SMT) | Z3 verification caching | Z3 runs once at graph load; the journal does not re-run or skip it. The graph content hash stored in each checkpoint ensures that a structurally-changed graph cannot be resumed against properties verified on the original. |
| Voevodsky (HoTT) | Transport across crash boundary | The `resumeFromCheckpoint` path is a form of transport: completed node outputs (proofs, in the HoTT reading) are carried across the crash boundary without re-derivation, provided the graph structure (the type) has not changed. |

---

## References

- `docs/decisions/ADR-001-durable-vpir-execution.md` — Decision record for this sprint; source of hazard analysis and option comparison.
- `src/vpir/vpir-interpreter.ts` — `executeGraph()` at line 37; `nodeOutputs` at line 45; `checkIFCFlow` at line 507.
- `src/vpir/vpir-transaction.ts` — `GraphTransaction` at line 51; related but distinct from the journal.
- `src/memory/storage-backend.ts` — `FileStorageBackend` at line 57; `append()` at line 82; concurrent-access warning at line 55.
- `src/channel/channel.ts` — `Channel<T>` bounded FIFO buffer at line 29; `bufferSize` at line 49.
- `src/channel/process.ts` — `Process<TIn, TOut>` at line 20; volatile `ProcessState` at line 22.
- `src/verification/z3-graph-verifier.ts` — `verifyGraphProperties()` at line 311; 21-property result aggregation at line 327.
- `src/benchmarks/weather-api-shim.ts` — primary integration target.
- `QuickStart.md:134` — source for "21 formally verified Z3 properties" claim.

---

## New Files

- `src/vpir/vpir-journal.ts` — `VPIRJournal` interface, `JournalEntry` type, `FileBackedJournal` implementation
- `src/vpir/__tests__/vpir-journal.test.ts` — Journal unit + property tests (~9 test cases)
- `src/channel/__tests__/channel-snapshot.test.ts` — Channel and process snapshot tests (~8 test cases)

## Modified Files

- `src/vpir/vpir-interpreter.ts` — `executeGraph()` journal hooks; `resumeFromCheckpoint()`; `ExecutionState` type
- `src/channel/channel.ts` — `getSnapshot()`, `restore()`, `ChannelSnapshot` type
- `src/channel/process.ts` — `getSnapshot()`, `restore()`, `ProcessSnapshot` type
- `src/benchmarks/weather-api-shim.ts` — `runDurabilityScenario()`, `compareOutputMaps()`
- `docs/decisions/ADR-001-durable-vpir-execution.md` — Status: Proposed → Accepted; Implementation Notes section
- `docs/sprints/sprint-16-durable-vpir.md` — This document
