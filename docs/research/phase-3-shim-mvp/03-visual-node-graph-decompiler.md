# Visual Node-Graph Decompiler

## 1. The Problem

Dataflow Process Networks are massively concurrent. Multiple processes fire simultaneously, data flows through channels in parallel, and the system's state is distributed across dozens of channel buffers and process contexts. Traditional debugging tools assume imperative, sequential execution — stepping through lines of code, inspecting a single call stack, reading a single variable at a time.

**Attempting to flatten a concurrent DPN into imperative pseudocode is not just unhelpful — it is actively misleading.** A sequential trace of a concurrent system implies ordering relationships that don't exist, hides parallelism that is essential to understanding, and collapses distributed state into a single narrative that misrepresents the system's behavior.

The Visual Node-Graph Decompiler solves this by providing a **native representation** of concurrent dataflow: the graph itself, annotated with live state, localized pseudocode, and temporal navigation.

---

## 2. Design Principles

### 2.1 The Graph Is the Program

The visual representation is not a debugging overlay on top of source code. It **is** the program. The VPIR graph defines the computation. The visual decompiler renders that graph with runtime state annotations. There is no "source code" to go back to — the graph is the source of truth.

### 2.2 Localized State, Not Global Narrative

Each process node shows its own state, its own inputs and outputs, its own pseudocode. There is no attempt to create a global execution narrative. Users understand the system by inspecting individual nodes and the channels connecting them — the same way they would understand a circuit diagram.

### 2.3 Concurrency Is Visible, Not Hidden

Parallel execution paths are rendered as parallel visual paths. When two processes fire simultaneously, the user sees them both active at the same time. The visual representation makes concurrency a first-class concept, not an implementation detail to be abstracted away.

### 2.4 Time Is Navigable

The decompiler records a full execution trace. Users can scrub forward and backward through time, observing how data flows through the graph. This is temporal debugging — examining the system's evolution, not just its current state.

---

## 3. Visual Architecture

### 3.1 Canvas Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Toolbar]  ◀◀  ◀  ▶  ▶▶  │ t=3/6  │  🔍 Zoom │ 📊 Stats │     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐        ┌─────────────┐        ┌─────────────┐     │
│  │ ● Weather   │ ═══▶   │   Response  │ ═══▶   │    Temp     │     │
│  │   Fetch     │  ch1   │   Parser    │  ch2   │   Convert   │     │
│  │             │  [1]   │             │  [0]   │             │     │
│  │  ✅ done    │        │  ✅ done    │        │  🔄 firing  │     │
│  └─────────────┘        └─────────────┘        └──────┬──────┘     │
│                                                       │             │
│                                                      ch3 [0]       │
│                                                       │             │
│                                                ┌──────▼──────┐     │
│                              ┌────────────────▶│  Sanitize   │     │
│                              │  ch_loc [1]     │    Gate     │     │
│                              │                 │  ⏳ blocked  │     │
│                              │                 └──────┬──────┘     │
│                              │                        │             │
│                              │                       ch4 [0]       │
│                              │                        │             │
│                              │                 ┌──────▼──────┐     │
│                              │                 │  Database   │     │
│                              │                 │   Write     │     │
│                              │                 │  ⏳ idle     │     │
│                              │                 └─────────────┘     │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [Inspector Panel]                                                  │
│  Selected: node_temp_convert │ Status: firing                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Pseudocode:                                                    │ │
│  │   input temperature_f = 72.5  [untrusted]                     │ │
│  │   celsius = (72.5 - 32) × 5/9                                 │ │
│  │   output temperature_c = 22.5 [untrusted]                     │ │
│  │                                                                │ │
│  │ SMT: (= 22.5 (/ (* (- 72.5 32.0) 5.0) 9.0)) → SAT ✓        │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Component Hierarchy

The visual decompiler consists of four layers:

1. **Graph Canvas**: The primary view. Nodes (processes) and edges (channels) rendered as an interactive directed graph. Uses a force-directed layout with manual pinning.

2. **Toolbar**: Temporal controls (play, pause, step, scrub), zoom, statistics overlay toggle, and layout options.

3. **Inspector Panel**: Detail view for the selected node or channel. Shows pseudocode, types, constraints, IFC labels, and SMT verification results.

4. **Timeline Rail**: A horizontal strip below the canvas showing all events (fires, reads, writes, errors) on a time axis. Clicking an event navigates the canvas to that moment.

---

## 4. Node Rendering

### 4.1 Process Nodes

Each process node is rendered as a rounded rectangle containing:

```
┌─────────────────────────────┐
│ ● [status icon]  node_name  │  ← Header: status + name
│ op: math.fahrenheit_to_c    │  ← Operation type
├─────────────────────────────┤
│ ▸ temperature_f: 72.5 [U]   │  ← Input ports with current values + IFC label
├─────────────────────────────┤
│ ▸ temperature_c: 22.5 [U]   │  ← Output ports with current values + IFC label
├─────────────────────────────┤
│ pure │ total │ idempotent   │  ← Properties badges
└─────────────────────────────┘
```

**Status icons:**
- ⏳ `idle` — grey, waiting
- 🔄 `firing` — blue, animated pulse
- 🚫 `blocked_read` — yellow, waiting on input
- ⛔ `blocked_write` — orange, backpressure
- ✅ `done` — green, completed
- ❌ `error` — red, failed

**IFC labels** are color-coded:
- `[U]` (Untrusted) — red badge
- `[T]` (Trusted) — green badge

### 4.2 Gate Nodes (Special Rendering)

Sanitize gate nodes have a distinctive appearance — a diamond or hexagonal shape — to visually signal that this is where IFC label transitions happen:

```
       ╱‾‾‾‾‾‾‾‾‾‾‾‾‾╲
      ╱  Sanitize Gate  ╲
     ╱   [U] → [T]       ╲
     ╲   Z3: SAT ✓       ╱
      ╲                  ╱
       ╲________________╱
```

This visual distinctiveness ensures that trust boundaries are immediately apparent in any graph, regardless of complexity.

---

## 5. Channel (Edge) Rendering

### 5.1 Edge Appearance

Channels are rendered as directed edges (arrows) with:

- **Width** proportional to throughput (messages per second)
- **Color** indicating IFC label of the data flowing through:
  - Red: `Untrusted` data
  - Green: `Trusted` data
  - Grey: Empty / no data yet
- **Animation**: Particles (small dots) flow along the edge in the direction of data movement, speed proportional to throughput
- **Buffer indicator**: A small badge `[n]` showing current buffer occupancy (e.g., `[3/10]` = 3 messages in a buffer of size 10)

### 5.2 Channel Inspection

Clicking a channel edge opens the Inspector Panel with:

```
Channel: ch2
Schema: { temperature_f: number (>= -459.67) }
IFC: untrusted
Buffer: [0/10] (empty)
Throughput: 1 msg in last 5s
History:
  t=2: { temperature_f: 72.5 } [untrusted] ← (click to inspect)
```

The history shows all messages that passed through the channel, with timestamps, values, and labels. Clicking a historical message selects it and highlights the processes that produced and consumed it.

---

## 6. Localized State-Pseudocode

### 6.1 Why Pseudocode, Not Source Code

The VPIR graph has no source code. Processes are defined by their operation type, type signature, and constraints. But humans benefit from a natural-language-like description of what a process does. The **localized state-pseudocode** is generated per-node, showing the process's computation in context with its current runtime values.

### 6.2 Pseudocode Generation Rules

For each process, the decompiler generates pseudocode by:

1. **Reading the operation type** to determine the computation template
2. **Substituting current runtime values** into the template
3. **Annotating IFC labels** on each value
4. **Appending constraint verification results**

**Example — Temperature Convert (during firing):**

```
PROCESS: node_temp_convert
STATUS: firing

  READ temperature_f = 72.5  [untrusted]     ← from ch2
  COMPUTE celsius = (72.5 - 32) × 5 / 9
                  = 40.5 × 5 / 9
                  = 22.5
  VERIFY (Z3): (= 22.5 (/ (* (- 72.5 32.0) 5.0) 9.0))
           → SAT ✓  (0.8ms)
  WRITE temperature_c = 22.5  [untrusted]     → to ch3
```

**Example — Sanitize Gate (during firing):**

```
PROCESS: node_sanitize_gate
STATUS: firing

  READ temperature_c = 22.5  [untrusted]     ← from ch3
  READ location = "New York"  [untrusted]     ← from ch_loc
  VERIFY (Z3): (and (>= 22.5 -89.2) (<= 22.5 56.7))
           → SAT ✓  (0.5ms)
  VERIFY (Z3): (and (>= (str.len "New York") 1) (<= (str.len "New York") 200))
           → SAT ✓  (0.3ms)
  LABEL UPGRADE: untrusted → trusted
  WRITE temperature_c = 22.5  [trusted]       → to ch4
  WRITE location = "New York"  [trusted]       → to ch4
```

**Example — Process in error state:**

```
PROCESS: node_weather_fetch
STATUS: error (retry 2/3)

  CALL HTTP GET https://api.open-meteo.com/v1/forecast?...
  ERROR: ConnectionTimeout after 5000ms
  RECOVERY: exponential backoff, next retry in 4s
  PROVENANCE: [node_weather_fetch]
```

### 6.3 Key Properties

- Pseudocode is **localized**: it describes only one process, never the whole network
- Pseudocode is **stateful**: it shows current runtime values, not abstract types
- Pseudocode includes **IFC labels**: every value is annotated with its trust level
- Pseudocode includes **SMT results**: every verified constraint shows its result and timing
- Pseudocode includes **provenance**: the chain of processes that produced each input value

---

## 7. Temporal Navigation

### 7.1 Execution Recording

The DPN runtime records every event in an append-only log:

```typescript
interface ExecutionEvent {
  timestamp: number;          // Monotonic clock (not wall time)
  kind: 'fire' | 'read' | 'write' | 'error' | 'recover' | 'label_upgrade';
  processId: string;
  channelId?: string;
  value?: unknown;
  label?: SecurityLabel;
  smtResult?: { sat: boolean; duration_ms: number };
  details?: string;
}
```

### 7.2 Timeline Rail

The Timeline Rail at the bottom of the canvas displays events as colored markers on a horizontal axis:

```
t=0        t=1        t=2        t=3        t=4        t=5        t=6
|          |          |          |          |          |          |
○──────────●──────────●──────────●──────────◆──────────●──────────○
           P1:fire    P2:fire    P3:fire    P4:gate    P5:fire
           ch1:write  ch2:write  ch3:write  ch4:write  db:write
                                            [U→T]
```

- ○ = network start/end
- ● = process fire (colored by process)
- ◆ = label upgrade event (highlighted)
- Red markers = errors
- Clicking any marker navigates the canvas to that point in time

### 7.3 Time-Travel Debugging

The user can:

1. **Scrub**: Drag the playhead along the Timeline Rail. The canvas updates to show the network state at that timestamp — which processes are active, what values are in each channel, which constraints have been verified.

2. **Step forward**: Advance to the next event. The canvas animates the transition — a particle flows along the activated channel, the target process pulses, the pseudocode panel updates.

3. **Step backward**: Rewind to the previous event. The canvas reverses the transition.

4. **Play**: Auto-advance through events at a configurable speed.

5. **Breakpoints**: Set breakpoints on specific processes or channels. Playback pauses when the breakpoint is hit.

This is possible because the DPN is deterministic (for pure processes): given the same inputs and channel capacities, the execution trace is identical. Replaying the trace faithfully reconstructs the system state at any point.

---

## 8. Error Visualization

### 8.1 Error Highlighting

When an error occurs:

1. The affected process node turns **red** with a pulsing border
2. The channel where the error was detected shows a **red X** marker
3. The error channel (if routed) shows a **red dashed edge** animating toward the Error Handler
4. All downstream processes from the error point are **dimmed** (greyed out) to indicate they are blocked

### 8.2 Error Inspector

Clicking an error node shows:

```
ERROR: constraint_failure
Process: node_temp_convert
Time: t=3

Description:
  SMT assertion failed: output value does not satisfy conversion formula.

Assertion:
  (= 9999.0 (/ (* (- 72.5 32.0) 5.0) 9.0))
  Expected: 22.5
  Got: 9999.0
  Result: UNSAT

Input values:
  temperature_f = 72.5  [untrusted]  (from ch2, written at t=2)

Recovery status:
  Strategy: retry (idempotent process, safe to re-execute)
  Attempt: 1/3
  Next retry: immediate

Provenance:
  node_weather_fetch (t=1) → node_response_parser (t=2) → node_temp_convert (t=3) ✗
```

### 8.3 IFC Violation Highlighting

IFC violations receive special treatment because they indicate a **structural** problem (the graph itself is wrong, not just a data error):

1. The offending channel is rendered with a **bold red-and-yellow striped** pattern
2. A **shield icon** ⚠️ appears at the violation point
3. The Inspector shows the label mismatch: `Expected: trusted, Received: untrusted`
4. A **trace** highlights the path from the untrusted source to the violation point, showing exactly where the trust chain was broken

---

## 9. Statistics Overlay

When the Stats toggle is activated, the canvas overlays performance metrics on each node and edge:

**Node overlay:**
```
┌─────────────────────────────┐
│ node_temp_convert           │
│ Fires: 1  │  Avg: 2.3ms    │
│ Z3 calls: 1 │ Z3 avg: 0.8ms│
│ Errors: 0                   │
└─────────────────────────────┘
```

**Edge overlay:**
```
ch2 ──── [throughput: 0.2 msg/s] [avg latency: 1.1ms] [buffer: 0/10] ────▶
```

**Network-level stats** (top bar):
```
Processes: 5 │ Channels: 6 │ Total fires: 5 │ Total Z3 checks: 3
Elapsed: 342ms │ Errors: 0 │ IFC violations: 0 │ Label upgrades: 1
```

---

## 10. Implementation Technology

### 10.1 Recommended Stack

| Component | Technology | Rationale |
|---|---|---|
| Graph rendering | **React Flow** | Most mature React node-graph library. Custom node types, edge types, minimap, controls. Large ecosystem. |
| State management | **Zustand** | Lightweight store for graph state, execution events, and inspector state. |
| Pseudocode generation | Custom renderer | Template-based, reads VPIR node definition + runtime values. ~200 LOC. |
| Timeline rail | Custom component | Horizontal scrollable event list with playhead. Built on HTML Canvas or SVG. |
| Execution recording | Append-only array | In-memory for MVP. Serializable to JSON for export/replay. |
| WebSocket bridge | **ws** or native WebSocket | Connects browser UI to the DPN runtime (Node.js process). Streams execution events in real time. |

### 10.2 Communication Protocol

The Visual Decompiler connects to the DPN runtime via WebSocket. The protocol is:

**Runtime → Decompiler (events):**
```json
{ "type": "event", "data": { "timestamp": 3, "kind": "fire", "processId": "node_temp_convert", ... } }
```

**Decompiler → Runtime (commands):**
```json
{ "type": "command", "action": "pause" }
{ "type": "command", "action": "step" }
{ "type": "command", "action": "resume" }
{ "type": "command", "action": "snapshot" }
{ "type": "command", "action": "set_breakpoint", "target": "node_temp_convert" }
```

**Runtime → Decompiler (snapshots):**
```json
{
  "type": "snapshot",
  "data": {
    "timestamp": 3,
    "processes": { "node_temp_convert": { "status": "firing", "ports": {...} } },
    "channels": { "ch2": { "buffer": [], "label": "untrusted" } },
    "events": [ ... ]
  }
}
```

### 10.3 Implementation Footprint

| Component | Estimated LOC |
|---|---|
| React Flow graph canvas + custom nodes | ~400 |
| Inspector panel (pseudocode + details) | ~300 |
| Timeline rail | ~200 |
| WebSocket bridge + event handling | ~150 |
| State management (Zustand stores) | ~100 |
| **Total** | **~1,150** |

This is a focused, buildable component — not a theoretical specification. Combined with the ~500 LOC DPN runtime, the entire Shim MVP (runtime + visual decompiler) is under 2,000 lines of TypeScript.

---

## 11. What the Decompiler Does Not Do

To maintain scope for the Shim MVP, the Visual Decompiler explicitly **does not**:

- **Edit the graph**: The decompiler is read-only / debug-only. Graph editing is a Phase 4 concern.
- **Show source code**: There is no source code. The graph IS the program.
- **Flatten to imperative**: There is no "convert to Python" button. This is a deliberate design choice, not a limitation. Imperative flattening of concurrent graphs is always misleading.
- **Support remote/distributed debugging**: The Shim MVP assumes a single-machine DPN runtime. Distributed debugging is a Phase 4+ concern.
- **Provide AI-assisted explanations**: The pseudocode is template-generated, not LLM-generated. AI-assisted graph explanation is a future enhancement.

---

## 12. Relationship to the Full Active Inference Stack

In the full ANP system, the Visual Decompiler becomes the **human interface to the Active Inference loop**:

| Shim MVP | Full System |
|---|---|
| Human observes errors in the decompiler | Active Inference agent observes errors via the same event stream |
| Human decides on a fix | Active Inference minimizes expected free energy to propose a fix |
| Human manually restarts the network | Active Inference applies the patch and resumes automatically |
| Human reviews the execution trace | Active Inference updates its generative model based on the trace |

The decompiler's event protocol (WebSocket events + commands) is designed to serve both human and AI consumers. When the Active Inference engine is ready, it connects to the same WebSocket endpoint and receives the same execution events. The visual decompiler becomes a monitoring tool rather than the primary control interface — but its design remains unchanged.
