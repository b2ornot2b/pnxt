# Sprint 10: Handler Library + Tool Registry

> **Phase**: 7, Sprint 10 — "Handler Library + Tool Registry"
> **Priority**: P0
> **Primary Advisors**: Kay, Liskov, Milner
> **Score Target**: 9.2 → 9.25
> **Milestone**: M2 foundation

---

## Summary

Sprint 10 builds the foundation for milestone M2 (External Task Expression) by creating the infrastructure that allows VPIR graphs to perform real work without TypeScript. It delivers a standard handler library, declarative tool registry, DPN supervisor, and tool registry integration into the DPN runtime.

---

## Deliverables

### 1. Standard Handler Library

**File**: `src/aci/handler-library.ts`

8 pre-built tool handlers, each with a matching `ToolRegistration`:

| Handler | Description | Side Effects | Trust |
|---------|-------------|-------------|-------|
| `http-fetch` | HTTP requests via fetch API | network | 2 |
| `json-transform` | Pick, filter, flatten, keys/values/entries | none | 0 |
| `file-read` | Read files from filesystem | file_read | 0 |
| `file-write` | Write content to files | file_write | 1 |
| `string-format` | Template `{{key}}` interpolation | none | 0 |
| `math-eval` | Safe arithmetic expression evaluator | none | 0 |
| `data-validate` | Validate data against type/range/pattern rules | none | 0 |
| `unit-convert` | Convert temperature, length, weight, data units | none | 0 |

The `math-eval` handler uses a safe recursive-descent parser (no `eval()`), supporting `+`, `-`, `*`, `/`, `%`, `**`, parentheses, and named variables.

### 2. Declarative Tool Registry

**File**: `src/aci/tool-registry.ts`

- `ToolRegistry` class with register/resolve/unregister operations
- Alias support: multiple operation names can map to one handler
- `registerStandardHandlers()`: auto-registers all 8 standard tools
- `discoverTools(graph)`: inspects VPIR action nodes, reports available/missing tools
- `validateTrust(graph, agentTrust)`: pre-validates trust levels before execution
- `createStandardRegistry()`: factory for pre-populated registry

### 3. DPN Supervisor

**File**: `src/channel/dpn-supervisor.ts`

- `DPNSupervisor` class implementing the supervisor actor pattern
- Supervision strategies: `one-for-one` (restart only failed) and `all-for-one` (restart all)
- Bounded restarts with configurable `maxRestarts` and `restartWindow`
- `PriorityMailbox` class: dequeues high > normal > low priority messages
- Full event log for observability (started, completed, failed, restarted, max-restarts)

### 4. DPN Runtime Tool Registry Integration

**File**: `src/channel/dpn-runtime.ts` (modified)

- Added optional `toolRegistry` field to `DPNRuntimeOptions`
- Inference nodes: check `context.handlers` first, fall back to tool registry
- Action nodes: check tool registry first, fall back to ACI gateway
- Fully backward compatible — existing code without a registry works as before

---

## Alignment Impact

| Advisor | Gap Addressed | How |
|---------|--------------|-----|
| Kay | "When does pnxt eat its own dog food?" | VPIR graphs can now invoke real operations via registry |
| Liskov | "Where is the Hello World?" | Handler library enables complete tasks as VPIR graphs |
| Milner | "DPN as general-purpose actor framework" | Supervisor pattern + registry resolution elevates DPN |

---

## Test Metrics

| Metric | Sprint 9 | Sprint 10 | Delta |
|--------|----------|-----------|-------|
| Test Suites | 55 | 58 | +3 |
| Tests | 974+ | 1073+ | +99 |
| Z3 Properties | 17 | 17 | 0 |
| Benchmarks | 3 | 3 | 0 |
| Modules | 19 | 20 | +1 (aci/tool-registry) |

---

## New Files

- `src/aci/handler-library.ts` — Standard handler library (8 handlers + registrations)
- `src/aci/handler-library.test.ts` — Handler library tests
- `src/aci/tool-registry.ts` — Declarative tool registry
- `src/aci/tool-registry.test.ts` — Tool registry tests
- `src/channel/dpn-supervisor.ts` — DPN supervisor with priority mailbox
- `src/channel/dpn-supervisor.test.ts` — Supervisor tests

## Modified Files

- `src/channel/dpn-runtime.ts` — Tool registry integration
