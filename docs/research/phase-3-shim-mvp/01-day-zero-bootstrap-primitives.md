# Day-Zero Bootstrap Primitives

## 1. Design Philosophy

The full Agent-Native Programming stack — Homotopy Type Theory, Active Inference graph patching, Geometric Deep Learning over code knowledge graphs — requires years of foundational tooling. The Shim MVP asks a different question: **what is the minimum set of off-the-shelf primitives that can execute a typed dataflow graph today**, while preserving the architectural invariants that make the full system worth building?

The answer is a degraded but honest stack:

- HoTT degrades to **dependent types approximated by JSON Schema + runtime validation**
- VPIR degrades to **typed JSON DAG nodes with Z3-backed constraint certificates**
- DPN degrades to **async processes communicating via typed async queues**
- LLMbda Calculus IFC degrades to **two-label taint tracking (Trusted/Untrusted)**
- Active Inference degrades to **error-driven retry with structured fault reporting**
- Bridge Grammar degrades to **constrained LLM decoding via strict JSON Schema**

Each degradation is chosen so that the **interface contracts** match the full system. When a subsystem is upgraded (e.g., from JSON Schema to Lean 4 dependent types), only the implementation behind the interface changes — the graph topology, channel contracts, and IFC labels remain stable.

---

## 2. Primitive 1: The DPN Runtime

### 2.1 Core Abstractions

The Dataflow Process Network runtime requires exactly three primitives:

**Channel\<T\>**: A typed, bounded, asynchronous FIFO queue.

```typescript
interface Channel<T> {
  readonly id: string;
  readonly schema: JsonSchema;        // Type contract for T
  readonly label: SecurityLabel;       // IFC taint label
  read(): Promise<T>;                  // Blocks if empty
  write(value: T): Promise<void>;      // Blocks if full (backpressure)
  close(): void;
  inspect(): ChannelState<T>;          // For visual decompiler
}
```

**Process**: A named, typed actor with declared input/output ports.

```typescript
interface Process {
  readonly id: string;
  readonly kind: string;               // 'source' | 'transform' | 'sink' | 'gate'
  readonly inputPorts: Map<string, Channel<unknown>>;
  readonly outputPorts: Map<string, Channel<unknown>>;
  readonly properties: ProcessProperty[];  // ['pure', 'total', 'idempotent']
  fire(): Promise<void>;               // One execution step
  status(): ProcessStatus;             // For visual decompiler
}

type ProcessProperty = 'pure' | 'total' | 'idempotent' | 'effectful';
type ProcessStatus = 'idle' | 'blocked_read' | 'blocked_write' | 'firing' | 'error' | 'done';
```

**Network**: A registry of processes and channels forming a directed graph.

```typescript
interface Network {
  readonly id: string;
  readonly processes: Map<string, Process>;
  readonly channels: Map<string, Channel<unknown>>;
  readonly topology: Edge[];           // [{from: processId.port, to: processId.port}]
  run(): Promise<NetworkResult>;
  pause(): void;
  step(): Promise<StepResult>;         // Single-step for debugging
  snapshot(): NetworkSnapshot;          // Full state capture
}
```

### 2.2 Scheduling Strategy

For the Shim MVP, scheduling is **cooperative async** — each process is an `async` function that `await`s on channel reads. The host language's event loop (Node.js) acts as the scheduler. This eliminates the need for a custom scheduler while preserving the DPN execution semantics:

- Reads block (via `Promise`) → the process yields to the event loop
- Writes block when the channel is full (bounded buffer) → backpressure propagates
- Determinism is guaranteed for a given set of inputs and fixed channel capacities (Kahn's theorem)

No threads, no shared memory, no locks. Concurrency is structural.

### 2.3 Implementation Footprint

The core DPN runtime (Channel + Process + Network) requires approximately **150–200 lines of TypeScript**. The Channel is an async queue backed by a circular buffer with Promise-based blocking. This is the single most important primitive — everything else builds on top of it.

---

## 3. Primitive 2: VPIR Node Schema (Degraded)

### 3.1 Node Representation

Every process in the DPN corresponds to a VPIR node. In the full system, VPIR nodes carry HoTT type signatures and proof certificates. In the Shim MVP, they carry JSON Schema types and optional Z3 assertions.

```json
{
  "$schema": "https://anp.dev/vpir/node/v0.1.json",
  "id": "node_0a3f",
  "op": "math.fahrenheit_to_celsius",
  "version": "1.0.0",
  "type": {
    "input": {
      "ports": {
        "temperature_f": { "type": "number", "minimum": -459.67 }
      }
    },
    "output": {
      "ports": {
        "temperature_c": { "type": "number" }
      }
    }
  },
  "properties": ["pure", "total", "idempotent"],
  "constraints": [
    {
      "kind": "smt",
      "solver": "z3",
      "assertion": "(assert (= temperature_c (/ (* (- temperature_f 32) 5) 9)))"
    }
  ],
  "ifc_label": {
    "input_labels": { "temperature_f": "untrusted" },
    "output_labels": { "temperature_c": "untrusted" }
  },
  "edges_in": ["node_weather_fetch.output.temp_f"],
  "edges_out": ["node_db_write.input.temperature"]
}
```

### 3.2 Key Design Decisions

**Types as JSON Schema (degraded HoTT)**: In the full system, `type.input.ports.temperature_f` would be a dependent type `(f : ℝ | f ≥ -459.67)` expressed in HoTT. In the Shim, JSON Schema's `{"type": "number", "minimum": -459.67}` serves the same contract at validation time. The upgrade path is clear: replace JSON Schema validators with Lean 4 type checkers behind the same interface.

**Constraints as SMT-LIB2 strings**: Each node can declare constraints in SMT-LIB2 syntax, which are directly executable by Z3. For the Shim, constraints are **checked** (verified after computation), not **synthesized** (used to derive computation). The full system would use SMT for both.

**IFC labels are explicit**: Every port carries a security label. The label propagation rule is simple: `join(input_labels) → output_label`. A process cannot produce a `trusted` output from `untrusted` inputs without passing through an explicit `sanitize` gate process.

**Properties are declared and checkable**: `pure` means no side effects. `total` means the function terminates for all valid inputs. `idempotent` means `f(f(x)) = f(x)`. In the Shim, these are declared and spot-checked (e.g., `idempotent` is tested by running the process twice on sample data). In the full system, they would be proven.

---

## 4. Primitive 3: SMT Constraint Checking (Z3)

### 4.1 Integration Architecture

Z3 runs as a **verification sidecar** — not in the hot path of data flow, but invoked at channel boundaries and at network startup.

```
[Process A] → [Channel] → [Z3 Gate] → [Channel] → [Process B]
                              ↓
                        [Error Channel]
```

**Two modes of operation:**

1. **Static verification (network startup)**: When the network topology is loaded, Z3 checks that the declared constraints of connected nodes are mutually satisfiable. For example, if Process A declares `output.x : integer, x > 0` and Process B declares `input.y : integer, y > 0`, Z3 confirms compatibility. If Process B declared `input.y : integer, y < 0`, Z3 reports an unsatisfiable constraint — the network is malformed before any data flows.

2. **Runtime verification (channel transit)**: When a value passes through a channel, Z3 checks it against the receiving node's input constraints. This is the runtime type-checking layer. For simple constraints (range checks, type checks), Zod validation is used for performance. Z3 is reserved for cross-field and cross-node invariants.

### 4.2 Minimum Viable Z3 Integration

The Shim MVP uses the `z3-solver` npm package (WASM build, ~15MB). A single `ConstraintChecker` service is instantiated at network startup:

```typescript
interface ConstraintChecker {
  // Static: check if two nodes' constraints are compatible
  checkCompatibility(source: VPIRNode, target: VPIRNode): Promise<CompatResult>;

  // Runtime: check a value against a node's input constraints
  checkValue(value: unknown, node: VPIRNode, port: string): Promise<CheckResult>;

  // Batch: verify all network edges at startup
  verifyNetwork(network: Network): Promise<VerificationReport>;
}

type CompatResult = { sat: true } | { sat: false; conflict: string };
type CheckResult = { valid: true } | { valid: false; violation: string };
```

### 4.3 Performance Budget

For the Weather API benchmark (5 nodes, ~8 edges), Z3 static verification completes in <100ms. Runtime value checks for arithmetic constraints (temperature bounds) complete in <10ms per check. This is acceptable for a Shim MVP. At scale (1000+ nodes), Z3 calls would need to be cached and batched — but that's a Phase 4 concern.

---

## 5. Primitive 4: IFC Taint Tracking (Degraded LLMbda Calculus)

### 5.1 The Two-Label Lattice

The full LLMbda Calculus provides a rich label lattice with dynamic IFC. The Shim MVP uses a minimal **two-label integrity lattice**:

```
       Trusted
         |
      Untrusted
```

- **Untrusted**: Data originating from external sources (REST APIs, user input, LLM output)
- **Trusted**: Data originating from verified system components (hardcoded constants, validated configurations, sanitized values)

### 5.2 Label Propagation Rules

Every value flowing through a channel carries a label. The rules are:

1. **Source labeling**: External data enters as `Untrusted`. System constants enter as `Trusted`.
2. **Join on computation**: If a process consumes any `Untrusted` input, all outputs are `Untrusted`.
3. **Gate processes**: A special `sanitize` process type can upgrade `Untrusted → Trusted` if and only if:
   - The value passes Z3 constraint verification
   - The sanitization logic is itself `Trusted`
   - The gate is explicitly declared in the network topology (no implicit upgrades)
4. **Sink enforcement**: Processes that execute side effects (database writes, API calls, code execution) can declare a **minimum label requirement**. A database write process requiring `Trusted` input will reject `Untrusted` data at the channel boundary.

### 5.3 Implementation

Labels are carried as metadata on channel messages, not as wrapper types (to avoid runtime overhead in the Shim):

```typescript
interface LabeledMessage<T> {
  value: T;
  label: 'trusted' | 'untrusted';
  provenance: string[];  // Trace of process IDs that touched this value
}
```

The Channel enforces label propagation:

```typescript
class TypedChannel<T> implements Channel<T> {
  async write(msg: LabeledMessage<T>): Promise<void> {
    // Validate schema
    if (!this.validate(msg.value)) throw new SchemaViolation(...);
    // Enforce label floor
    if (this.minLabel === 'trusted' && msg.label === 'untrusted') {
      throw new IFCViolation(`Untrusted data rejected at channel ${this.id}`);
    }
    await this.buffer.enqueue(msg);
  }
}
```

### 5.4 Noninterference Guarantee (Degraded)

The full LLMbda Calculus guarantees mathematical noninterference. The Shim's two-label system provides a weaker but still useful property: **no untrusted data can reach a trusted sink without passing through an explicit, Z3-verified sanitization gate**. This is enforced structurally (the network topology is checked at startup) and dynamically (labels are checked at runtime). It does not prevent covert channels or timing attacks — those require the full IFC calculus.

---

## 6. Primitive 5: Bridge Grammar (Constrained LLM Output)

### 6.1 The Problem

The Bridge Layer (Phase 2) defines how an autoregressive LLM emits valid VPIR nodes rather than free-form text. The Shim MVP must work with existing LLMs (via API) without modifying their weights or decoding logic.

### 6.2 Strategy: Schema-Constrained Generation

The Shim uses a layered approach:

**Layer 1 — API-native structured output**: Use OpenAI's `response_format: { type: "json_schema", json_schema: <VPIR node schema> }` or Anthropic's tool-use with the VPIR node schema as the tool's input schema. This provides server-side constrained decoding for API-hosted models.

**Layer 2 — Local model constrained decoding**: For local models (via vLLM, llama.cpp), use **Outlines** to compile the VPIR JSON Schema into a finite-state machine (FSM) that masks invalid tokens at each decoding step. This guarantees 100% schema conformance with zero retries.

**Layer 3 — Validation fallback**: Regardless of generation method, every LLM-emitted VPIR node passes through Zod schema validation before entering the DPN. If validation fails, the node is rejected and the LLM is re-prompted with the validation error (up to 3 retries).

### 6.3 Bridge Schema (Simplified for Shim)

The full Bridge Grammar (Phase 2) maps to HoTT morphisms. The Shim uses a simplified JSON Schema that captures the essential structure:

```json
{
  "$id": "https://anp.dev/bridge/vpir-emit/v0.1.json",
  "type": "object",
  "required": ["nodes", "edges"],
  "properties": {
    "nodes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "op", "type", "properties"],
        "properties": {
          "id": { "type": "string", "pattern": "^node_[a-z0-9]{4,}$" },
          "op": { "type": "string", "pattern": "^[a-z][a-z0-9_.]+$" },
          "type": {
            "type": "object",
            "required": ["input", "output"],
            "properties": {
              "input": { "$ref": "#/$defs/portMap" },
              "output": { "$ref": "#/$defs/portMap" }
            }
          },
          "properties": {
            "type": "array",
            "items": { "enum": ["pure", "total", "idempotent", "effectful"] }
          },
          "constraints": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["kind", "assertion"],
              "properties": {
                "kind": { "enum": ["smt", "schema", "invariant"] },
                "solver": { "type": "string" },
                "assertion": { "type": "string" }
              }
            }
          },
          "ifc_label": { "$ref": "#/$defs/ifcSpec" }
        }
      }
    },
    "edges": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["from", "to"],
        "properties": {
          "from": { "type": "string", "pattern": "^node_[a-z0-9]+\\.[a-z_]+$" },
          "to": { "type": "string", "pattern": "^node_[a-z0-9]+\\.[a-z_]+$" }
        }
      }
    }
  },
  "$defs": {
    "portMap": {
      "type": "object",
      "required": ["ports"],
      "properties": {
        "ports": {
          "type": "object",
          "additionalProperties": { "$ref": "https://json-schema.org/draft/2020-12/schema" }
        }
      }
    },
    "ifcSpec": {
      "type": "object",
      "properties": {
        "input_labels": {
          "type": "object",
          "additionalProperties": { "enum": ["trusted", "untrusted"] }
        },
        "output_labels": {
          "type": "object",
          "additionalProperties": { "enum": ["trusted", "untrusted"] }
        }
      }
    }
  }
}
```

This schema is strict enough to be used as a constrained-decoding grammar (via Outlines FSM compilation) and loose enough to represent any VPIR subgraph.

---

## 6. Primitive 6: Error-Driven Recovery (Degraded Active Inference)

### 6.1 Degradation Rationale

Full Active Inference requires a generative model of the "healthy graph," variational inference over hidden fault states, and expected free energy minimization over candidate patches. This requires `pymdp` or equivalent and a trained model. For the Shim MVP, we degrade to a **structured error-recovery loop** that preserves the Active Inference interface contract.

### 6.2 Recovery Loop

```
[Observe] → [Classify] → [Propose] → [Verify] → [Apply or Escalate]
```

1. **Observe**: Collect errors from Z3 constraint checks, Zod schema validation failures, IFC violations, and process exceptions. Each error is a structured object:

```typescript
interface GraphError {
  kind: 'schema_violation' | 'constraint_failure' | 'ifc_violation' | 'process_error';
  location: { processId: string; port?: string; channelId?: string };
  details: string;
  value?: unknown;
}
```

2. **Classify**: Map error kind to recovery strategy. Schema violations → re-validate and retry upstream. Constraint failures → re-run with adjusted input or flag for human review. IFC violations → reject and log (never auto-remediate trust boundaries). Process errors → retry with exponential backoff, then escalate.

3. **Propose**: Generate candidate fixes. In the Shim, this is a lookup table of error-kind → fix-template. In the full system, this is where Active Inference proposes patches by minimizing expected free energy.

4. **Verify**: Before applying any fix, run Z3 to check that the proposed fix doesn't violate network constraints. This is the idempotency guarantee — applying a fix twice must be safe.

5. **Apply or Escalate**: If verified, apply the fix and resume the network. If verification fails or retries are exhausted, pause the network and surface the error to the Visual Node-Graph Decompiler for human intervention.

### 6.3 Upgrade Path to Active Inference

The recovery loop's interface (`observe → classify → propose → verify → apply`) is deliberately isomorphic to the Active Inference loop (`observe → infer → plan → act → learn`). When the full Active Inference engine is available:

- `classify` becomes Bayesian inference over fault states
- `propose` becomes expected free energy minimization over patch policies
- `verify` remains Z3-backed
- A `learn` step is added to update the generative model

No changes to the DPN runtime, channel contracts, or VPIR schema are required.

---

## 7. Primitive Summary

| # | Primitive | Full System | Shim MVP | Key Library |
|---|-----------|-------------|----------|-------------|
| 1 | DPN Runtime | Kahn Process Network with formal scheduling | Async processes + bounded async queues | Custom (~200 LOC TypeScript) |
| 2 | VPIR Nodes | HoTT-typed, proof-carrying | JSON Schema-typed, constraint-annotated | Zod + JSON Schema |
| 3 | SMT Verification | Z3 for synthesis + verification | Z3 for verification only | `z3-solver` (WASM, npm) |
| 4 | IFC Taint Tracking | Full LLMbda Calculus, rich label lattice | Two-label (Trusted/Untrusted), structural + runtime checks | Custom (~50 LOC TypeScript) |
| 5 | Bridge Grammar | Constrained decoding → HoTT morphisms | JSON Schema constrained output → VPIR JSON | Outlines (local) / API structured output |
| 6 | Self-Healing | Active Inference with generative model | Error-driven retry with structured fault reporting | Custom, Z3-backed verification |

### Total Bootstrap Footprint

- **Custom code**: ~500 lines of TypeScript (DPN runtime + IFC + error recovery)
- **Dependencies**: `z3-solver` (WASM), `zod`, `outlines` (Python, optional for local models)
- **No custom language, no custom compiler, no custom type checker**
- **Standard LLM APIs** for graph generation via Bridge Grammar

This is deliberately small. The Shim MVP proves that the *architecture* works — the typed channels, the IFC labels, the SMT gates, the separation of static logic from dynamic state — using tools that exist today. The sophistication comes later, but the structural contracts are established now.
