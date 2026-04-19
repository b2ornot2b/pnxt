# Sprint 18: Node Catalog Expansion — llm-inference + Descriptor Metadata

> **Phase**: 8, Sprint 18 — "Node Catalog Expansion — llm-inference + Descriptor Metadata"
> **Priority**: P1 (unblocks Track 4 node browser; validates IFC labeling on external content)
> **Primary Advisors**: Myers (IFC labels on LLM output), Sutskever (LLM architecture), Liskov (descriptor type extension)
> **Milestone**: M7 — "First-Class LLM + Catalog Discovery"

---

## Summary

Sprint 18 implements **Track 3** of the pnxt-vs-Weft research plan: expanding the handler catalog from 8 utility operators to 9 by shipping `llm-inference`, the first research-leverage handler. The sprint simultaneously resolves two structural deficiencies exposed by the roadmap audit — the absence of catalog metadata on handler registrations (making a node browser impossible) and the "blind catalog" bug in the bridge grammar generator (allowing the LLM to hallucinate handler names that do not exist).

The primary research question this sprint unlocks is: **can the IFC system enforce label downgrade on LLM outputs?** LLM responses are canonical untrusted external oracles. Every byte returned by the Anthropic API must enter the VPIR graph labeled `{trustLevel: 1, classification: 'external'}` regardless of the label carried by the caller's input. Sprint 18 establishes that precedent in code, tests it in isolation, and validates it end-to-end through an extended weather benchmark.

Myers's noninterference theorem is the formal backbone: information labeled `external` must not flow to a `public` or higher-trust sink unless it passes through an explicit declassification node. This constraint is verified in the IFC test suite and is the primary advisory gap this sprint closes.

Sutskever's concern — that the LLM cannot express intent accurately when it does not know what handlers are available — is addressed by the prompt-assembly fix: `buildSystemPrompt()` now accepts the live `ToolRegistry` manifest and injects it into the system prompt before every API call.

Liskov's clean-abstraction requirement is met by keeping `uiMetadata` entirely optional on `ToolRegistration`. No existing handler is broken. The field carries zero runtime weight; it exists only to feed the Track 4 catalog UI.

---

## Deliverables

### 1. `ToolUIMetadata` Interface + `ToolRegistration` Extension

**File**: `src/types/aci.ts`

- New exported interface `ToolUIMetadata` inserted after the current `ToolRegistration` definition (after line 50 per roadmap audit):
  - `displayName: string` — human-readable label for UI display
  - `category: string` — grouping category (e.g., `'AI'`, `'Data'`, `'IO'`, `'Compute'`)
  - `icon?: string` — optional Lucide icon name
  - `tags?: string[]` — search and filter tags
  - `examples?: Array<{ label: string; input: Record<string, unknown> }>` — short catalog examples
- `uiMetadata?: ToolUIMetadata` added as an optional field on `ToolRegistration`
- `SideEffect` union extended with `'llm_call'` variant
- `SIDE_EFFECT_TRUST_REQUIREMENTS` map updated: `llm_call: 2`
- All changes are strictly non-breaking: `uiMetadata` is optional, existing callers of `makeRegistration` compile without modification, `discoverTools()` at `tool-registry.ts:153-173` does not inspect `uiMetadata`

### 2. `llm-inference` Handler

**File**: `src/aci/handler-library.ts`

- `llmInferenceRegistration: ToolRegistration` — follows the `makeRegistration` pattern at `handler-library.ts:86-114`
  - Input schema: `{ prompt: string; model?: string; maxTokens?: number; systemPrompt?: string }`
  - Output schema: `{ response: string; tokensUsed: number; model: string }`
  - Side effects: `['network', 'llm_call']`
  - `timeout: 60_000`, `retryable: true`, `idempotent: false`, `costCategory: 'expensive'`
  - `requiredTrustLevel: 2` (Collaborator)
- `llmInferenceHandler: ToolHandler` — calls Anthropic SDK via dynamic import (`@anthropic-ai/sdk` is already a project dependency, used by `src/bridge-grammar/`)
  - Default model: `claude-sonnet-4-20250514`
  - Default `maxTokens`: 1024
  - Returns `{ response, tokensUsed, model }` where `tokensUsed` sums `input_tokens + output_tokens`
  - IFC label enforcement (`trustLevel: 1, classification: 'external'`) is applied by the ACI gateway on any result carrying the `llm_call` side effect — not inside the handler — keeping the handler pure and the label policy inspectable in one place
- Entry added to `STANDARD_HANDLERS` array at `handler-library.ts:715`

### 3. `uiMetadata` Backfill — All 9 Handlers

**File**: `src/aci/handler-library.ts`

All 9 handler registrations (8 existing + `llm-inference`) receive `uiMetadata` blocks:

| Handler | displayName | category | tags (sample) |
|---|---|---|---|
| `http-fetch` | HTTP Fetch | IO | `['http', 'network', 'rest', 'api']` |
| `json-transform` | JSON Transform | Data | `['json', 'transform', 'jmespath', 'reshape']` |
| `file-read` | File Read | IO | `['file', 'read', 'filesystem']` |
| `file-write` | File Write | IO | `['file', 'write', 'filesystem']` |
| `string-format` | String Format | Compute | `['string', 'template', 'format']` |
| `math-eval` | Math Evaluator | Compute | `['math', 'arithmetic', 'expression']` |
| `data-validate` | Data Validator | Data | `['validate', 'schema', 'json-schema']` |
| `unit-convert` | Unit Converter | Compute | `['unit', 'convert', 'measurement']` |
| `llm-inference` | LLM Inference | AI | `['llm', 'claude', 'inference', 'ai', 'external']` |

Each registration also includes at least one `examples` entry illustrating a minimal valid input.

### 4. `getManifest()` on `ToolRegistry`

**File**: `src/aci/tool-registry.ts`

- `getManifest(): ToolManifestEntry[]` method added to `ToolRegistry`
- `ToolManifestEntry` type: `{ name: string; description: string; sideEffects: SideEffect[]; requiredTrustLevel: number; category?: string; tags?: string[] }`
- Sources data from `discoverTools()` output plus `uiMetadata` when present
- Used by `buildSystemPrompt()` in the bridge grammar generator; also usable by Track 4 catalog UI without coupling to handler internals

### 5. Prompt-Assembly Fix — Bridge Grammar Generator

**File**: `src/bridge-grammar/llm-vpir-generator.ts`

- The static `VPIR_SYSTEM_PROMPT` constant at lines 67-85 is refactored into two parts:
  - `VPIR_SYSTEM_PROMPT_BASE: string` — the unchanged static content (node types, graph rules, VPIR schema)
  - `buildSystemPrompt(availableHandlers: string[]): string` — appends an `Available action operations` stanza listing every registered handler by name
- Line 123 (the `client.messages.create()` call) changes from `system: VPIR_SYSTEM_PROMPT` to `system: buildSystemPrompt(registry.listTools())`
- Result: every newly registered handler is automatically visible to the LLM without touching the generator again; the "blind catalog" bug (LLM hallucinating handler names) is closed
- No change to the VPIR schema, node type list, or graph rules

### 6. Weather Benchmark Extension

**File**: `src/benchmarks/weather-benchmark.ts` (or integration scenario file)

- The existing weather pipeline (`http-fetch` → `json-transform` → response) is extended with an `llm-inference` stage that formats the weather data into a natural-language summary
- New pipeline shape: `http-fetch` → `json-transform` → `llm-inference` → output
- IFC label propagation is verified end-to-end: the `llm-inference` output must carry `classification: 'external'` even though the `http-fetch` input carried `classification: 'network'`
- The benchmark asserts that the composed label is not silently promoted to a higher trust level downstream

---

## Tests

### 6a. `src/aci/__tests__/llm-inference-handler.test.ts`

- Unit test with mocked Anthropic SDK (`jest.mock('@anthropic-ai/sdk')`)
- Cases:
  - Happy path: `prompt` provided → returns `{ response, tokensUsed, model }`
  - Default model applied when `model` omitted
  - Default `maxTokens` applied when omitted
  - Custom `systemPrompt` forwarded to API call
  - Throws when `prompt` is missing or non-string
  - `tokensUsed` correctly sums `input_tokens + output_tokens`
- IFC label case: verify that the ACI gateway wraps the handler result in `{trustLevel: 1, classification: 'external'}` when side effects include `llm_call`

### 6b. `src/bridge-grammar/__tests__/manifest-prompt.test.ts`

- Snapshot test: `buildSystemPrompt(['http-fetch', 'llm-inference'])` output matches expected string structure
- Regression test: `buildSystemPrompt([])` does not throw; produces prompt with empty handler list stanza
- Integration test: `LlmVpirGenerator` constructed with a populated `ToolRegistry` produces a system prompt that includes all registered handler names

### 6c. `src/aci/__tests__/tool-registry-manifest.test.ts`

- `getManifest()` returns an entry for every handler in `STANDARD_HANDLERS`
- Each entry has `name`, `description`, `sideEffects`, `requiredTrustLevel`
- Entries for handlers with `uiMetadata` include `category` and `tags`
- `getManifest()` is stable across multiple calls (no mutation side effects)

### 6d. IFC Flow Test

- Constructs a two-node VPIR graph: `action(llm-inference)` → `action(file-write)`
- Verifies that execution raises an IFC violation when the `file-write` sink has `classification: 'public'`
- Verifies that execution succeeds after inserting a declassification node between them
- This test lives in `src/aci/__tests__/llm-inference-ifc.test.ts`

### 6e. Weather Benchmark End-to-End

- Extends `src/benchmarks/weather-benchmark.ts` with the three-node pipeline
- Mocks the Anthropic API call for CI (environment flag `ANTHROPIC_API_KEY` absent → mock; present → real)
- Asserts IFC label on pipeline output is `classification: 'external'`

---

## Acceptance Criteria

| Criterion | Verification |
|---|---|
| `llm-inference` handler callable | `npm test -- llm-inference-handler` passes |
| Mocked Anthropic SDK in CI | `ANTHROPIC_API_KEY` absent → mock path exercised |
| Bridge grammar system prompt includes handler manifest | Snapshot test in `manifest-prompt.test.ts` |
| All 9 handlers have `uiMetadata` | `getManifest()` test asserts `category` present on all entries |
| IFC: LLM output cannot flow to `public` sink without declassification | `llm-inference-ifc.test.ts` passes |
| Backward compat: existing `ToolRegistration` consumers compile | `npm run typecheck` clean |
| `npm run ci` green | Full CI pipeline passes |

---

## Advisor Alignment

| Advisor | Gap Addressed | How |
|---|---|---|
| Myers (IFC) | LLM output labeling | `llm_call` side effect triggers forced `external` label in ACI gateway; IFC test verifies noninterference |
| Sutskever (LLM) | LLM as first-class handler; generator blindness | `llm-inference` ships; `buildSystemPrompt` injects live manifest |
| Liskov (Language) | Clean optional extension | `uiMetadata` optional on `ToolRegistration`; `getManifest()` provides well-typed summary |
| Voevodsky (HoTT) | Stable | No HoTT surface area touched |
| Church (Lambda) | Stable | Lambda denotations unaffected |
| Milner (Process) | Stable | DPN channels and bisimulation proofs unaffected |
| Agha (Actor) | Stable | Actor topology unaffected |
| de Moura (SMT) | Token cost as resource | `costCategory: 'expensive'` on `llm-inference`; future Z3 cost modeling now has a concrete subject |
| Pearl (Causal) | Stable | Causal impact analysis from Sprint 15 unaffected |
| Kay (Paradigm) | Catalog grows toward full coverage | First AI-category handler; pnxt can now express LLM-in-the-loop pipelines natively |

---

## Test Metrics

| Metric | Sprint 15 | Sprint 18 | Delta |
|---|---|---|---|
| Test Suites | 83 | 88 | +5 |
| Tests | 1485+ | 1545+ | +60 |
| Handlers | 8 | 9 | +1 |
| Handlers with `uiMetadata` | 0 | 9 | +9 |
| Bridge grammar: manifest-aware | No | Yes | fixed |

---

## New Files

- `src/aci/__tests__/llm-inference-handler.test.ts` — llm-inference unit tests (~20 tests)
- `src/aci/__tests__/llm-inference-ifc.test.ts` — IFC label flow tests (~8 tests)
- `src/aci/__tests__/tool-registry-manifest.test.ts` — `getManifest()` tests (~12 tests)
- `src/bridge-grammar/__tests__/manifest-prompt.test.ts` — system prompt snapshot + regression tests (~10 tests)
- `docs/sprints/sprint-18-node-catalog.md` — this document

## Modified Files

- `src/types/aci.ts` — `ToolUIMetadata` interface; `uiMetadata?` on `ToolRegistration`; `'llm_call'` in `SideEffect` union; `llm_call: 2` in trust requirements map
- `src/aci/handler-library.ts` — `llmInferenceRegistration`, `llmInferenceHandler`, `uiMetadata` on all 9 handler registrations, `llm-inference` entry in `STANDARD_HANDLERS`
- `src/aci/tool-registry.ts` — `getManifest()` method, `ToolManifestEntry` type
- `src/bridge-grammar/llm-vpir-generator.ts` — `VPIR_SYSTEM_PROMPT_BASE`, `buildSystemPrompt()`, updated `client.messages.create()` call at line 123
- `src/benchmarks/weather-benchmark.ts` — three-node pipeline with `llm-inference` stage and IFC label assertion
- `status.md` — Sprint 18 deliverables and M7 progress
- `docs/sprints/README.md` — S18 entry, Phase 8 sprint index

---

## Out of Scope

- `python-exec`, `sql-query`, `web-search` (Sprint 19+ per roadmap ranking)
- `cron-trigger`, `webhook-listener` (separate sprint; DPN event-driven entry points)
- Messaging platform integrations: Slack, Discord, Email (lowest research leverage — deferred indefinitely)
- UI / frontend component per handler (Track 4 — uses `uiMetadata` but does not ship in this sprint)
- Z3 cost-category constraint modeling for `llm_call` (identified as future work in roadmap Section 4)

---

## Dependencies

Sprint 18 can run in parallel with Sprint 16. If Sprint 16 ships first, `llm-inference` calls in the weather benchmark will be automatically journaled for durability via the Sprint 16 journaling infrastructure. If Sprint 18 ships first, the benchmark runs without journaling and the journal integration is wired in a follow-up commit when Sprint 16 merges.

No new npm dependencies are required: `@anthropic-ai/sdk` is already declared in `package.json` (used by `src/bridge-grammar/llm-vpir-generator.ts`).

---

## Sprint Review Protocol

1. Run `npm test` — all 1545+ tests pass
2. Run `npm run typecheck` — no type errors (verify `uiMetadata?: ToolUIMetadata` compiles cleanly with all existing `makeRegistration` call sites)
3. Run `npm run lint` — no violations
4. Advisory panel checkpoint: Myers on IFC label enforcement, Sutskever on LLM handler architecture, Liskov on `ToolUIMetadata` type design
5. Update `status.md` with Sprint 18 deliverables and M7 progress marker
6. Verify `getManifest()` output can be consumed by a hypothetical Track 4 catalog component (manual inspection sufficient — no UI shipped in this sprint)
