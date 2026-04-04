# Weather API Benchmark Workflow

## 1. Purpose

The Weather API benchmark is the canonical "first program" for the Agent-Native Programming Shim MVP. Unlike a "Hello World" (which tests nothing meaningful), this benchmark exercises every primitive in the stack:

| Capability | How the Benchmark Tests It |
|---|---|
| DPN execution | 5 processes connected by typed channels, running concurrently |
| External FFI | REST API call to a weather service (legacy Web2 interop) |
| SMT verification | Mathematical verification of F→C temperature conversion |
| IFC taint tracking | External API data enters as `Untrusted`, must be sanitized before DB write |
| Typed channels | Schema validation at every channel boundary |
| Error recovery | Handles API failures, malformed responses, constraint violations |
| Visual decompilation | The full graph is observable in the Node-Graph Decompiler |

---

## 2. Network Topology

The benchmark DPN consists of 5 processes and 6 channels:

```
                                         ┌──────────────┐
                                         │  [P5] Error  │
                                         │   Handler    │
                                         └──────┬───────┘
                                                ▲
                              error channels ───┘ (from P2, P3, P4)

┌──────────┐    ch1     ┌──────────┐    ch2     ┌──────────┐    ch3     ┌──────────┐    ch4     ┌──────────┐
│ [P1]     │──────────→ │ [P2]     │──────────→ │ [P3]     │──────────→ │ [P4]     │──────────→ │ [P5]     │
│ Weather  │            │ Response │            │ Temp     │            │ Sanitize │            │ Database │
│ Fetch    │            │ Parser   │            │ Convert  │            │ Gate     │            │ Write    │
│ (source) │            │(transform)│           │(transform)│           │  (gate)  │            │  (sink)  │
└──────────┘            └──────────┘            └──────────┘            └──────────┘            └──────────┘
  effectful                pure                    pure                   pure                   effectful
  untrusted→              untrusted→              untrusted→             untrusted→trusted       trusted→
```

### Process Descriptions

**P1 — Weather Fetch (Source, Effectful)**
- Calls a weather REST API (e.g., Open-Meteo, wttr.in)
- Emits raw JSON response
- IFC: output labeled `Untrusted` (external data)
- FFI boundary: this is where the pure DPN touches the legacy Web2 world

**P2 — Response Parser (Transform, Pure)**
- Extracts `temperature_fahrenheit` from the raw API response
- Validates the response schema (Zod)
- IFC: input `Untrusted` → output `Untrusted` (no label upgrade)

**P3 — Temperature Convert (Transform, Pure, Idempotent)**
- Computes `celsius = (fahrenheit - 32) × 5/9`
- Z3 constraint: verifies the output satisfies the conversion formula
- IFC: input `Untrusted` → output `Untrusted`
- This is the core SMT-verified computation

**P4 — Sanitize Gate (Gate, Pure)**
- Validates the converted temperature against domain constraints:
  - `celsius >= -89.2` (lowest recorded Earth temperature)
  - `celsius <= 56.7` (highest recorded Earth temperature)
- If constraints pass (Z3-verified), upgrades label: `Untrusted → Trusted`
- If constraints fail, routes to Error Handler
- This is the **only** process that can upgrade IFC labels

**P5 — Database Write (Sink, Effectful)**
- Writes `{ location, temperature_c, timestamp }` to a database
- Requires input labeled `Trusted` (enforced by channel `ch4`)
- FFI boundary: DPN touches legacy storage

---

## 3. VPIR Graph Definition

The complete benchmark expressed as a VPIR graph (the JSON that an LLM would emit via the Bridge Grammar):

```json
{
  "graph_id": "weather_benchmark_v1",
  "version": "0.1.0",
  "nodes": [
    {
      "id": "node_weather_fetch",
      "op": "io.http_get",
      "type": {
        "input": {
          "ports": {
            "url": { "type": "string", "format": "uri" },
            "params": {
              "type": "object",
              "properties": {
                "location": { "type": "string" }
              },
              "required": ["location"]
            }
          }
        },
        "output": {
          "ports": {
            "response_body": { "type": "object" },
            "status_code": { "type": "integer", "minimum": 100, "maximum": 599 }
          }
        }
      },
      "properties": ["effectful"],
      "constraints": [
        {
          "kind": "invariant",
          "assertion": "status_code >= 200 AND status_code < 300 implies response_body is valid JSON"
        }
      ],
      "ifc_label": {
        "input_labels": { "url": "trusted", "params": "trusted" },
        "output_labels": { "response_body": "untrusted", "status_code": "untrusted" }
      }
    },
    {
      "id": "node_response_parser",
      "op": "transform.extract_field",
      "type": {
        "input": {
          "ports": {
            "response_body": { "type": "object" }
          }
        },
        "output": {
          "ports": {
            "temperature_f": { "type": "number" },
            "location": { "type": "string" }
          }
        }
      },
      "properties": ["pure", "total"],
      "constraints": [
        {
          "kind": "schema",
          "assertion": "response_body must contain a numeric temperature field"
        }
      ],
      "ifc_label": {
        "input_labels": { "response_body": "untrusted" },
        "output_labels": { "temperature_f": "untrusted", "location": "untrusted" }
      }
    },
    {
      "id": "node_temp_convert",
      "op": "math.fahrenheit_to_celsius",
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
          "assertion": "(assert (= temperature_c (/ (* (- temperature_f 32.0) 5.0) 9.0)))"
        }
      ],
      "ifc_label": {
        "input_labels": { "temperature_f": "untrusted" },
        "output_labels": { "temperature_c": "untrusted" }
      }
    },
    {
      "id": "node_sanitize_gate",
      "op": "gate.range_validate",
      "type": {
        "input": {
          "ports": {
            "temperature_c": { "type": "number" },
            "location": { "type": "string" }
          }
        },
        "output": {
          "ports": {
            "temperature_c": { "type": "number", "minimum": -89.2, "maximum": 56.7 },
            "location": { "type": "string", "minLength": 1, "maxLength": 200 }
          }
        }
      },
      "properties": ["pure"],
      "constraints": [
        {
          "kind": "smt",
          "solver": "z3",
          "assertion": "(assert (and (>= temperature_c (- 89.2)) (<= temperature_c 56.7)))"
        },
        {
          "kind": "smt",
          "solver": "z3",
          "assertion": "(assert (and (>= (str.len location) 1) (<= (str.len location) 200)))"
        }
      ],
      "ifc_label": {
        "input_labels": { "temperature_c": "untrusted", "location": "untrusted" },
        "output_labels": { "temperature_c": "trusted", "location": "trusted" }
      }
    },
    {
      "id": "node_db_write",
      "op": "io.database_insert",
      "type": {
        "input": {
          "ports": {
            "temperature_c": { "type": "number" },
            "location": { "type": "string" },
            "timestamp": { "type": "string", "format": "date-time" }
          }
        },
        "output": {
          "ports": {
            "success": { "type": "boolean" },
            "record_id": { "type": "string" }
          }
        }
      },
      "properties": ["effectful"],
      "constraints": [
        {
          "kind": "invariant",
          "assertion": "All input values must be labeled trusted"
        }
      ],
      "ifc_label": {
        "input_labels": {
          "temperature_c": "trusted",
          "location": "trusted",
          "timestamp": "trusted"
        },
        "output_labels": { "success": "trusted", "record_id": "trusted" }
      }
    }
  ],
  "edges": [
    { "from": "node_weather_fetch.response_body", "to": "node_response_parser.response_body" },
    { "from": "node_response_parser.temperature_f", "to": "node_temp_convert.temperature_f" },
    { "from": "node_response_parser.location", "to": "node_sanitize_gate.location" },
    { "from": "node_temp_convert.temperature_c", "to": "node_sanitize_gate.temperature_c" },
    { "from": "node_sanitize_gate.temperature_c", "to": "node_db_write.temperature_c" },
    { "from": "node_sanitize_gate.location", "to": "node_db_write.location" }
  ]
}
```

---

## 4. Execution Trace

### 4.1 Happy Path

```
t=0    Network starts. All processes idle.
t=1    P1 fires: HTTP GET to weather API.
       → ch1 receives: { response_body: {...}, status_code: 200 }
       → Label: untrusted

t=2    P2 fires: Extracts temperature_f=72.5, location="New York"
       → ch2 receives: { temperature_f: 72.5 }
       → Zod validates: ✓ (number, >= -459.67)
       → Label: untrusted

t=3    P3 fires: celsius = (72.5 - 32) × 5/9 = 22.5
       → Z3 checks: (= 22.5 (/ (* (- 72.5 32.0) 5.0) 9.0)) → SAT ✓
       → ch3 receives: { temperature_c: 22.5 }
       → Label: untrusted

t=4    P4 fires (sanitize gate):
       → Z3 checks: (and (>= 22.5 -89.2) (<= 22.5 56.7)) → SAT ✓
       → Label upgrade: untrusted → trusted
       → ch4 receives: { temperature_c: 22.5, location: "New York" }
       → Label: trusted

t=5    P5 fires: INSERT INTO temperatures (location, celsius, timestamp)
       → Channel ch4 label check: trusted ✓ (meets minimum requirement)
       → Database write succeeds
       → Output: { success: true, record_id: "rec_abc123" }

t=6    Network complete. All channels drained. 0 errors.
```

### 4.2 Error Path: API Failure

```
t=0    Network starts.
t=1    P1 fires: HTTP GET fails (network timeout).
       → P1 emits to error channel: { kind: 'process_error', processId: 'node_weather_fetch' }
       → Recovery loop: retry with exponential backoff (2s, 4s, 8s)
       → After 3 retries: escalate to Visual Decompiler (human intervention)
       → Network paused at P1.
```

### 4.3 Error Path: Constraint Violation

```
t=0-2  Normal execution through P2.
t=3    P3 fires: celsius = (72.5 - 32) × 5/9 = 22.5
       → But suppose a bug produces 9999.0 instead.
       → Z3 checks: (= 9999.0 (/ (* (- 72.5 32.0) 5.0) 9.0)) → UNSAT ✗
       → Value rejected at ch3.
       → Error: { kind: 'constraint_failure', processId: 'node_temp_convert',
                   details: 'SMT assertion failed: output 9999.0 does not satisfy conversion formula' }
       → Recovery: retry P3 (idempotent, safe to re-execute).
       → If retry fails: escalate. Network paused at P3.
```

### 4.4 Error Path: IFC Violation

```
t=0-3  Normal execution through P3.
t=4    Suppose P4 (sanitize gate) is bypassed — a malicious graph edit
       routes ch3 directly to ch4 (the trusted channel for P5).
       → Channel ch4 receives value with label: untrusted
       → Channel enforcement: minLabel='trusted', received='untrusted'
       → IFCViolation thrown. Value rejected.
       → P5 never fires. Database never receives untrusted data.
       → Error: { kind: 'ifc_violation', channelId: 'ch4',
                   details: 'Untrusted data rejected at trusted channel' }
       → This error cannot be auto-remediated (IFC violations require human review).
```

---

## 5. FFI Boundary Specification

The benchmark has two FFI boundaries where the DPN touches legacy systems:

### 5.1 REST API FFI (P1 — Weather Fetch)

**Problem**: The DPN is a pure, typed, deterministic dataflow system. HTTP calls are impure, untyped, and nondeterministic.

**Solution**: The FFI boundary wraps the HTTP call in a DPN-compatible process with:

1. **Type contract**: The process declares its output schema (JSON Schema for the expected response body). The raw HTTP response is validated against this schema before entering the channel.

2. **IFC labeling**: All data crossing the FFI boundary enters as `Untrusted`, regardless of the source. This is a structural rule — no API is trusted by default.

3. **Determinism isolation**: The HTTP call is effectful and nondeterministic (different results on different calls). The DPN runtime marks this process as `effectful` and excludes it from determinism guarantees. The rest of the network remains deterministic — given the same data from P1, the output is always the same.

4. **Error containment**: HTTP errors (timeouts, 4xx, 5xx) are caught inside P1 and routed to the error channel. They never propagate as unhandled exceptions through the DPN.

```typescript
// FFI wrapper for HTTP calls
class HttpFetchProcess implements Process {
  readonly properties = ['effectful'] as const;

  async fire(): Promise<void> {
    const { url, params } = await this.readInputs();
    try {
      const response = await fetch(buildUrl(url, params));
      const body = await response.json();
      // Validate against declared output schema
      const validated = this.outputSchema.parse(body);
      // Label as untrusted and emit
      await this.emit({
        value: { response_body: validated, status_code: response.status },
        label: 'untrusted',
        provenance: [this.id],
      });
    } catch (error) {
      await this.emitError({
        kind: 'process_error',
        location: { processId: this.id },
        details: error.message,
      });
    }
  }
}
```

### 5.2 Database FFI (P5 — Database Write)

**Problem**: Same as REST API — impure, side-effectful, nondeterministic (write could fail).

**Solution**: Same FFI wrapper pattern, with one critical addition: **the channel feeding P5 requires `Trusted` input**. This means the database FFI boundary is protected by the IFC system. Untrusted data physically cannot reach the database without passing through the sanitize gate.

```typescript
class DatabaseWriteProcess implements Process {
  readonly properties = ['effectful'] as const;

  async fire(): Promise<void> {
    const msg = await this.readInput('ch4');
    // IFC check is already enforced by the channel — this is defense in depth
    if (msg.label !== 'trusted') {
      throw new IFCViolation('Database write requires trusted input');
    }
    const { temperature_c, location } = msg.value;
    const timestamp = new Date().toISOString(); // System-generated, trusted
    const result = await db.insert('temperatures', { temperature_c, location, timestamp });
    await this.emit({
      value: { success: true, record_id: result.id },
      label: 'trusted',
      provenance: [...msg.provenance, this.id],
    });
  }
}
```

### 5.3 Noninterference at FFI Boundaries

The FFI mechanism preserves a degraded noninterference property: **changing the untrusted inputs (API response data) cannot change the trusted system behavior (which processes run, which channels are connected, which gates exist)**. The network topology is immutable at runtime. Only the data flowing through the topology is dynamic. This is the Shim's approximation of the full LLMbda Calculus noninterference guarantee.

---

## 6. What the Benchmark Proves

If the Weather API benchmark executes successfully, it demonstrates:

1. **DPN execution works**: 5 concurrent processes coordinated purely through typed channels, no shared state.
2. **SMT verification works**: Z3 verified the temperature conversion formula at runtime.
3. **IFC taint tracking works**: External API data was labeled `Untrusted`, sanitized through a gate, and only `Trusted` data reached the database.
4. **FFI boundaries are safe**: Two legacy system interactions (HTTP API, database) were wrapped in DPN-compatible processes without breaking type safety or IFC guarantees.
5. **The Bridge Grammar works**: The entire VPIR graph could be emitted by an LLM via constrained JSON output.
6. **Error recovery works**: API failures, constraint violations, and IFC violations are all caught, classified, and either recovered or escalated.
7. **The Visual Decompiler has something to show**: The graph has enough structure (concurrent paths, a fan-out from P2, a convergence at P4) to demonstrate meaningful visual debugging.

This is not a toy. It is the smallest possible program that exercises the full ANP stack.
