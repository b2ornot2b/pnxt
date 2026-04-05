# Sprint 1: Dataflow Process Networks + IFC Labels

> **Status**: Planned
> **Paradigm Pillars**: Dataflow Process Networks, Information Flow Control
> **Alignment Impact**: 3/10 → 5/10
> **Advisory Drivers**: Milner (concurrency), Agha (actors), Myers (IFC), Kay (paradigm shift)

---

## Objective

Transform the architecture from synchronous RPC to asynchronous dataflow by introducing typed channels and process primitives. Simultaneously add information flow labels to all data moving through the system, providing genuine noninterference at data boundaries.

---

## Deliverables

### 1. `Channel<T>` — Typed Async FIFO Channels

**File**: `src/dpn/channel.ts`

- Generic typed channel with configurable buffer size
- Async `send(value: T)` that blocks when buffer is full (backpressure)
- Async `receive(): T` that blocks when buffer is empty
- `close()` to signal no more values will be sent
- `isClosed` property for consumer termination detection
- Support for multiple readers/writers (fan-in, fan-out)

**Types**: `src/types/dpn.ts`

```typescript
interface Channel<T> {
  readonly id: string;
  readonly capacity: number;
  send(value: T): Promise<void>;
  receive(): Promise<T>;
  close(): void;
  readonly isClosed: boolean;
  readonly size: number;
}

interface ChannelConfig {
  id: string;
  capacity: number;  // 0 = unbounded
}
```

### 2. `Process` — Dataflow Process Definition

**File**: `src/dpn/process.ts`

- A process reads from input channels and writes to output channels
- Processes are the execution unit — they replace direct tool invocation
- Each process has an `execute()` function that runs until inputs are exhausted
- Processes are stateless between invocations (state lives in channels)

**Types**:

```typescript
interface ProcessDefinition {
  id: string;
  inputs: Record<string, Channel<unknown>>;
  outputs: Record<string, Channel<unknown>>;
  execute: (inputs: ProcessInputs, outputs: ProcessOutputs) => Promise<void>;
}

type ProcessStatus = 'idle' | 'running' | 'completed' | 'failed';
```

### 3. `DataflowGraph` — Process Composition

**File**: `src/dpn/dataflow-graph.ts`

- Register processes and wire channels between them
- `compose(processes)` validates that all channel types match
- `run()` executes all processes concurrently, respecting dataflow dependencies
- Detect and report deadlocks (all processes blocked, no progress)

**Types**:

```typescript
interface DataflowGraph {
  addProcess(process: ProcessDefinition): void;
  connect<T>(source: ProcessOutput<T>, target: ProcessInput<T>): Channel<T>;
  run(): Promise<DataflowResult>;
  cancel(): void;
}

interface DataflowResult {
  status: 'completed' | 'deadlocked' | 'cancelled' | 'failed';
  processResults: Record<string, ProcessStatus>;
  metrics: DataflowMetrics;
}
```

### 4. IFC Labels on Data

**File**: `src/ifc/label.ts`

- `Label` type representing trust-level provenance of data
- Labels attach to `MemoryRecord`, channel messages, and tool results
- `canFlowTo(source: Label, target: Label): boolean` — enforces lattice ordering
- `join(a: Label, b: Label): Label` — least upper bound (most restrictive)

**Types**: `src/types/ifc.ts`

```typescript
interface Label {
  trustLevel: TrustLevel;        // 0-4, from trust engine
  agentId: string;               // originating agent
  timestamp: number;             // when label was created
  provenance: string[];          // chain of agents that touched this data
}

// Lattice operations
function canFlowTo(source: Label, target: Label): boolean;
function join(a: Label, b: Label): Label;
function meet(a: Label, b: Label): Label;
```

### 5. Label-Aware Memory Service

**File**: Modify `src/memory/memory-service.ts`

- `store()` requires a `Label` parameter
- `query()` accepts a requester's trust level; results filtered by label
- `getRelated()` respects label boundaries
- Existing tests updated; new tests for label enforcement

### 6. Label-Aware Channels

- Channel messages carry labels: `LabeledValue<T> = { value: T; label: Label }`
- Receiving process must have sufficient trust to read the label
- Labels propagate through the dataflow graph automatically

---

## Integration with Existing Modules

| Existing Module | Integration Point |
|-----------------|-------------------|
| `AgentRuntime` | Agents become process hosts; `active` state means "process running" |
| `ACI Gateway` | Tool invocations wrapped as processes; results carry labels |
| `Trust Engine` | Trust levels feed into IFC label creation |
| `Capability Negotiation` | Capabilities gate which channels an agent can read/write |
| `Memory Service` | Labels added to store/query interface |

---

## Tests

### Unit Tests

- `channel.test.ts` — send/receive, backpressure, close semantics, fan-in/fan-out
- `process.test.ts` — execution lifecycle, input/output wiring, error handling
- `dataflow-graph.test.ts` — composition, concurrent execution, deadlock detection
- `label.test.ts` — lattice operations, canFlowTo, join, meet
- `memory-service.test.ts` — label-aware store/query, boundary enforcement

### Integration Tests

- Multi-process pipeline: source → transform → sink with label propagation
- Agent-as-process: agent registered in runtime, executing as DPN process
- Label enforcement: low-trust agent cannot read high-trust channel data

### Evaluation Scenarios

- Update `multi-agent-scenarios.ts` to use channels instead of scripted choreography
- Add a delegation scenario where label propagation prevents data leakage

---

## Acceptance Criteria

1. Two agents can communicate exclusively through typed channels (no direct function calls)
2. A dataflow graph of 3+ processes executes concurrently and completes correctly
3. An agent at trust level 1 cannot read data labeled at trust level 3
4. Labels propagate through a multi-step pipeline (A → B → C), with the final label reflecting all contributors
5. Deadlock detection reports when all processes are blocked
6. All existing tests continue to pass
7. CI green (typecheck + lint + test)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Backpressure complexity | Start with bounded buffers, simple block-on-full semantics |
| Deadlock in DPN | Implement timeout-based deadlock detection; report but don't auto-resolve |
| Label overhead on memory queries | Label filtering is a simple numeric comparison; benchmark to confirm negligible cost |
| Breaking existing module APIs | Add label parameters as optional initially; make required once all callers updated |
