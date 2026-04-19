# Sprint 20: Bridge-Grammar Retry Telemetry

> **Phase**: 8, Sprint 20 — "Bridge-Grammar Retry Telemetry"
> **Priority**: P3 (research, not blocking)
> **Primary Advisors**: Church (lambda calculus), Sutskever (LLM training/decoding), de Moura (SMT and what types would require), Liskov (abstraction design)
> **Milestone**: M9 — "Type-System Decision Data"

---

## Summary

Sprint 20 implements **Track 5** of the pnxt-vs-Weft research plan: not a type-system extension, but the retry-telemetry instrumentation that feeds the eventual Hindley-Milner decision. The position paper `docs/research/lambda-type-system.md` concludes: "Defer HM extensions until the retry telemetry data arrives." This sprint executes the "measure first" step prescribed by that paper's Section 7 decision framework.

The immediate motivation is a structural gap in the bridge-grammar retry loop. `src/bridge-grammar/llm-vpir-generator.ts:161-167` currently accumulates failure information as an unstructured string:

```typescript
const attemptErrors = validationResult.errors.map(
  (e) => `[${e.code}] ${e.path}: ${e.message}`,
);
errors.push(`Attempt ${attempt + 1}: Validation failed — ${attemptErrors.join('; ')}`);
```

The structured error codes (`BridgeErrorCategory`, `src/bridge-grammar/bridge-errors.ts:18-31`) are present and already correctly typed — but they are serialized into a string and discarded after the retry loop. There is no persistent record, no cross-session aggregation, and no way to answer the empirical question the paper poses: does `type_mismatch` dominate, or does `schema_violation` dominate? Without that answer, the HM decision is a prior, not a finding.

This sprint instruments the loop, persists structured events, and provides an offline analysis CLI. After N≥100 retry events accumulate in production-like runs, the advisory panel convenes to triage the distribution and decide whether Sprint 21+ should extend LLMbda with HM features.

---

## Position Paper Alignment

`docs/research/lambda-type-system.md` Section 7 ("Decision Framework") specifies three decision buckets:

| Bucket | Content | Sprint 21+ Response |
|--------|---------|---------------------|
| (a) `SCHEMA` / `TOPOLOGY` / `TRUNCATION` | Structural errors the Bridge Grammar already catches | Tighten JSON schema; HM not indicated |
| (b) Type-level mismatches (`type_mismatch`) | Argument-count, shape, nullable — errors HM would prevent | HM extension well-motivated |
| (c) Semantic errors | Wrong handler, wrong prompt interpretation, missing domain context | Prompt engineering / retrieval augmentation, not HM |
| (d) Other | IFC violations, uncategorizable | IFC-specific response; not HM |

The paper's Section 9 states explicitly: "The type-system spike requires changes to the type language, the type-checker, the Z3 encoding, and the Bridge Grammar schema. The telemetry spike requires changes to one function in `src/bridge-grammar/llm-vpir-generator.ts`. The telemetry spike provides the data needed to justify or reject the type-system spike."

Sprint 20 is that telemetry spike.

---

## Deliverables

### 1. `RetryEvent` Type

**File**: `src/types/bridge-telemetry.ts`

Defines the wire format for a single retry event. Every field is intentionally flat — no nested objects — so the persisted JSON is readable by simple CLI tools and the offline analysis script.

- `timestamp` — ISO 8601 string (from `new Date().toISOString()`)
- `attemptNumber` — 1-based integer (0 = first attempt)
- `rejectionReason` — human-readable summary string (from `validationResult.errors`)
- `errorCategory` — one of the five telemetry categories (see Deliverable 3)
- `promptHash` — SHA-256 hex of the task description, truncated to 16 chars; no PII
- `responseExcerpt` — first 200 characters of `rawResponse`; truncated before persistence to prevent API-key leakage

Privacy invariant: `responseExcerpt` is hard-capped at 200 characters before any persistence call. No full LLM responses are stored. No API keys can appear in a 200-character excerpt of a JSON tool-call payload.

### 2. `RetryCategorizer`

**File**: `src/bridge-grammar/retry-categorizer.ts`

Maps a validation failure onto one of five telemetry categories. Uses the existing `BridgeErrorCategory` enum (`src/bridge-grammar/bridge-errors.ts:18-31`) as input — the categorizer does not re-parse error strings, it reads the already-structured `BridgeError.category` field.

Five output categories:

| Telemetry category | Maps from `BridgeErrorCategory` | Paper bucket |
|--------------------|---------------------------------|-------------|
| `schema_violation` | `SCHEMA` | (a) |
| `type_mismatch` | `SEMANTIC` + specific codes (`LABEL_MISMATCH`, `WRONG_EVIDENCE_TYPE`) | (b) |
| `semantic_error` | `SEMANTIC` (remainder) + `HANDLER` + `CONFIDENCE` | (c) |
| `ifc_violation` | `SEMANTIC/LABEL_MISMATCH` elevated by trust-level delta ≥ 2 | (d) |
| `other` | `TOPOLOGY`, `TRUNCATION`, unknown | (d) |

`ifc_violation` is distinguished from `type_mismatch` by checking whether the rejection involved a `SecurityLabel` trust-level crossing. This requires inspecting the error path for `label` segments. When the path contains `label` and the error code is `LABEL_MISMATCH` or `TRUST_INSUFFICIENT`, the category is `ifc_violation` rather than `type_mismatch`.

Accuracy target: ≥ 90% on a hand-labeled sample of 20 retries (acceptance criterion). The hand-labeling exercise is performed during integration testing by constructing 20 synthetic failures — 4 per category — and asserting that `categorize()` maps each one correctly.

**Implementation note**: The categorizer is a pure function `categorize(errors: BridgeError[]): TelemetryCategory`. It does not call the LLM, does not read files, and has no side effects. This makes it independently testable.

### 3. `RetryTelemetryCollector`

**File**: `src/bridge-grammar/retry-telemetry.ts`

Wraps the retry loop in `src/bridge-grammar/llm-vpir-generator.ts`. Collects one `RetryEvent` per failed attempt and persists the batch to `FileStorageBackend` under a dedicated namespace.

Key design decisions:

- **Namespace isolation**: All telemetry records are stored under the key prefix `bridge-telemetry:`. This separates telemetry from memory service records without introducing a new storage mechanism.
- **Append-only**: Each event is appended immediately after the retry fails, not buffered until the end of the generation call. If the process crashes mid-generation, completed events are not lost.
- **Non-blocking persistence**: The `append` call is `await`-ed but wrapped in a `try/catch` that logs and continues. A telemetry write failure must not abort a generation attempt.
- **Configurable output path**: Constructor accepts a `logPath` string; defaults to `logs/bridge-telemetry.jsonl`. The JSONL format (one JSON object per line) is chosen for easy streaming and CLI processing.

**Reuse of `FileStorageBackend`**: `src/memory/storage-backend.ts:57` implements `FileStorageBackend` with `load()`, `save()`, `append()`, and `remove()`. The telemetry collector instantiates `FileStorageBackend` with its own file path and uses only `append()`. No new storage infrastructure is introduced.

### 4. Instrumented `llm-vpir-generator.ts`

**File**: `src/bridge-grammar/llm-vpir-generator.ts` (modification)

The retry loop at lines 113-168 is instrumented to call the collector on every validation failure. The existing error-string accumulation (lines 161-167) is preserved unchanged — the instrumentation is additive, not replacing the existing behavior.

Instrumented path (pseudocode, not replacing existing logic):

```
// At the point where validationResult.valid is false (line ~160):
if (collector) {
  const errors = classifyErrors(validationResult.errors);  // using bridge-errors.ts classifyError()
  const category = categorize(errors);                     // retry-categorizer.ts
  await collector.record({
    timestamp: new Date().toISOString(),
    attemptNumber: attempt + 1,
    rejectionReason: attemptErrors.join('; '),
    errorCategory: category,
    promptHash: hashTaskDescription(taskDescription),
    responseExcerpt: (rawResponse ?? '').slice(0, 200),
  });
}
```

The `collector` is injected through `VPIRGeneratorOptions` as an optional field. When absent (the default), no telemetry is recorded and behavior is identical to the pre-Sprint-20 implementation. This preserves backward compatibility for all existing tests.

### 5. Offline Analysis CLI

**File**: `scripts/analyze-retries.ts`

Reads the telemetry JSONL file and produces a category histogram plus the top 10 rejection reasons. Intended for human inspection after accumulating N≥100 events, and for use during the post-sprint advisory panel triage session.

Output format (stdout):

```
Bridge-Grammar Retry Telemetry Analysis
========================================
Log: logs/bridge-telemetry.jsonl
Events: 143

Category Histogram
------------------
schema_violation   72  (50.3%)
type_mismatch      38  (26.6%)
semantic_error     19  (13.3%)
ifc_violation       8   (5.6%)
other               6   (4.2%)

Top 10 Rejection Reasons
------------------------
1. [MISSING_FIELD] /nodes/0/evidence: evidence array is empty  (23 occurrences)
2. [INVALID_ENUM] /nodes/1/type: invalid node type             (17 occurrences)
...
```

Usage: `npx ts-node scripts/analyze-retries.ts [--log <path>] [--top <n>]`

The histogram is the primary artifact for the M9 milestone. The distribution determines the Sprint 21+ decision per the paper's Section 7 framework.

### 6. Tests

**File**: `src/bridge-grammar/__tests__/retry-telemetry.test.ts`

Test coverage:

**Unit — categorizer:**
- Hand-constructed `BridgeError` arrays of each type; assert correct telemetry category
- `ifc_violation` correctly distinguished from `type_mismatch` when path contains `label` and code is `LABEL_MISMATCH`
- `other` for `TOPOLOGY` and `TRUNCATION` errors
- Empty error array returns `other` (defensive)

**Unit — collector:**
- `record()` calls `FileStorageBackend.append()` with a correctly shaped record
- `responseExcerpt` is always ≤ 200 characters, even when `rawResponse` is 10,000 characters
- `promptHash` is 16 hex characters
- Persistence failure (mocked `append` throwing) does not propagate; generation continues

**Unit — privacy:**
- Asserts `responseExcerpt` does not contain a string matching a known secret pattern (`sk-ant-`, `Bearer `, API key heuristics)
- Asserts `responseExcerpt.length <= 200` unconditionally

**Integration — instrumented generator:**
- Run `generateVPIRGraph` with a deliberately malformed task description that triggers at least one retry
- Assert that `collector.events` contains one event per failed attempt
- Assert event fields are populated: `timestamp`, `attemptNumber`, `errorCategory`, `promptHash`
- Uses a mock `Anthropic` client that returns invalid tool-use output on the first call, valid on the second

**Integration — categorization accuracy:**
- 20 hand-labeled synthetic failures (4 per category)
- Assert categorizer accuracy ≥ 90% (18/20 correct)
- Labeled set documented as a `const` array in the test file for reproducibility

### 7. Documentation update

**File**: `docs/research/lambda-type-system.md` (modification, post-sprint)

A "Telemetry Infrastructure" section is added after Section 9 ("Open Questions") when the sprint lands. It documents:
- `src/types/bridge-telemetry.ts` — `RetryEvent` type definition
- `src/bridge-grammar/retry-categorizer.ts` — five-category taxonomy and mapping from `BridgeErrorCategory`
- `src/bridge-grammar/retry-telemetry.ts` — `RetryTelemetryCollector`; persistence via `FileStorageBackend`
- `src/bridge-grammar/llm-vpir-generator.ts` — instrumentation point (former lines 161-167)
- `scripts/analyze-retries.ts` — how to run the offline analysis
- Trigger condition for Sprint 21+: if `type_mismatch` exceeds 40% after N≥100 events

---

## Acceptance Criteria

| Criterion | Verification |
|-----------|-------------|
| Every retry in `llm-vpir-generator.ts` produces a categorized telemetry event | Integration test: mock client triggers retry; assert `collector.events.length === 1` |
| Events persisted to `FileStorageBackend` under dedicated namespace | Unit test: assert `append` called with key matching `bridge-telemetry:` prefix |
| `scripts/analyze-retries.ts` runs on sample data and produces a category histogram | Manual: `npx ts-node scripts/analyze-retries.ts --log test-fixtures/sample-telemetry.jsonl` |
| 5 categories distinguishable (schema / type / semantic / ifc / other) | Unit: all 5 arms of categorizer exercised in test suite |
| Categorization accuracy ≥ 90% on 20 hand-labeled retries | Integration: labeled accuracy test asserts ≥ 18/20 |
| `npm run ci` green | CI: no new failures; backward compat preserved via optional `collector` field |
| No PII leakage: `responseExcerpt` truncated to 200 chars, no API keys | Unit: privacy assertion tests |

---

## Test Plan

### Unit tests

**Categorizer correctness** (`retry-categorizer.test.ts` sub-suite):
- Construct a `BridgeError` with `category: BridgeErrorCategory.SCHEMA` → assert `schema_violation`
- Construct a `BridgeError` with `category: BridgeErrorCategory.SEMANTIC`, `code: 'LABEL_MISMATCH'`, `path: '/nodes/0/label'` → assert `ifc_violation`
- Construct a `BridgeError` with `category: BridgeErrorCategory.SEMANTIC`, `code: 'WRONG_EVIDENCE_TYPE'` → assert `type_mismatch`
- Construct a `BridgeError` with `category: BridgeErrorCategory.TOPOLOGY` → assert `other`
- Construct a `BridgeError` with `category: BridgeErrorCategory.TRUNCATION` → assert `other`

**Collector privacy** (`retry-telemetry.test.ts` sub-suite):
- Pass `rawResponse` of length 10,000 → assert `responseExcerpt.length === 200`
- Pass `rawResponse` containing `'sk-ant-abc123'` → assert excerpt does not contain that string (because it will only include the first 200 chars of a tool-call JSON, which starts with `{"nodes":`)
- Assert `promptHash` matches `/^[0-9a-f]{16}$/`

### Integration tests

**Instrumented generator** (`retry-telemetry.test.ts` sub-suite):
1. Instantiate `RetryTelemetryCollector` backed by `InMemoryStorageBackend`
2. Construct a mock Anthropic client that returns a response with no `tool_use` block on attempt 1, a valid VPIR graph on attempt 2
3. Call `generateVPIRGraph` with the mock client and the collector injected via `options`
4. Assert `collector.events.length === 1` (one failed attempt before success)
5. Assert `collector.events[0].attemptNumber === 1`
6. Assert `collector.events[0].errorCategory === 'other'` (no `tool_use` block maps to `TRUNCATION/NO_TOOL_USE` → `other`)

**Categorization accuracy** (labeled set, 20 failures):
- 4 `schema_violation` failures: `MISSING_FIELD` on `/nodes/0/evidence`, `INVALID_ENUM` on `/nodes/0/type`, `INVALID_TYPE` on `/nodes/0/verifiable`, `EMPTY_ARRAY` on `/nodes`
- 4 `type_mismatch` failures: `WRONG_EVIDENCE_TYPE` on `/nodes/0/evidence/0`, `ACTION_NOT_VERIFIABLE` on `/nodes/0`, `OBSERVATION_HAS_INPUTS` on `/nodes/1`, `MISSING_EVIDENCE` on `/nodes/2`
- 4 `semantic_error` failures: `UNKNOWN_HANDLER` on `/nodes/0/operation`, `CONFIDENCE` category, `LABEL_MISMATCH` on path without `label` segment, `MISSING_EVIDENCE` co-occurring with `UNKNOWN_HANDLER`
- 4 `ifc_violation` failures: `LABEL_MISMATCH` on `/nodes/0/label`, `TRUST_INSUFFICIENT` on `/nodes/1/label`, `LABEL_MISMATCH` on `/nodes/0/label` with trust delta ≥ 2, `LABEL_MISMATCH` on `/edges/0/label`
- 4 `other` failures: `CYCLE_DETECTED`, `DANGLING_REF`, `INCOMPLETE_JSON`, `NO_TOOL_USE`

Accuracy target: ≥ 18 / 20 correct.

### Privacy test

Asserts that `responseExcerpt` never exceeds 200 characters and never matches a pattern list including `sk-ant-`, `Bearer `, `x-api-key`, and `Authorization:`. The 200-character hard cap makes API key inclusion structurally near-impossible in practice, but the pattern check is kept as an explicit safety net.

---

## Out of Scope

- **Any HM extension to LLMbda calculus** — per the position paper, this decision awaits N≥100 retry events. The data does not yet exist. Sprint 20 creates the means to collect it.
- **Retry strategy changes** — fewer/more retries, different feedback prompts, self-healing repair. Sprint 20 observes the existing strategy without changing it. Changing the strategy invalidates the baseline being measured.
- **Dashboard UI** — telemetry is viewable through `scripts/analyze-retries.ts` only. A web dashboard is not implemented and is not planned for Phase 8.
- **Real-time streaming** — events are persisted at retry time via `append()`, but the CLI reads the log offline. No streaming pipeline or pub/sub mechanism is introduced.
- **Sprint 16-19 dependencies** — Sprint 20 is independent of Sprints 16-19. It benefits from Sprint 18's `llm-inference` handler (more realistic retry patterns to measure), but it does not require Sprint 18 to be complete. The collector works with any `VPIRGeneratorOptions`-compatible invocation.

---

## Advisor Alignment

| Advisor | Relevance | How This Sprint Addresses It |
|---------|-----------|------------------------------|
| Church (Lambda) | The HM decision directly concerns the LLMbda calculus | Sprint 20 defers the decision in the spirit of minimal-sufficient calculi; Church's lambda calculus was also parsimonious |
| Sutskever (LLM decoding) | Retry telemetry measures the empirical failure modes of constrained decoding | The five telemetry categories directly correspond to Sutskever's concern: "Bridge Grammar is the hardest problem" (advisory review 2026-04-05) |
| de Moura (SMT) | HM types with universal quantification would require first-order quantifier logic in Z3 | The paper documents this cost (`docs/research/lambda-type-system.md` Section 6); telemetry data determines whether the cost is worth paying |
| Liskov (Abstraction) | `RetryTelemetryCollector` is injected via `VPIRGeneratorOptions`; `RetryCategorizer` is a pure function | Liskov substitution principle: `InMemoryStorageBackend` and `FileStorageBackend` both satisfy the `StorageBackend` interface; tests use the in-memory variant |

---

## Dependencies

- `src/bridge-grammar/bridge-errors.ts` — `BridgeErrorCategory` enum and `classifyError()` function are the upstream source for `RetryCategorizer` input. No changes to this file in Sprint 20.
- `src/memory/storage-backend.ts` — `FileStorageBackend` and `InMemoryStorageBackend` are reused as-is. No changes to this file in Sprint 20.
- `src/bridge-grammar/llm-vpir-generator.ts` — instrumented at the validation-failure path. The `VPIRGeneratorOptions` interface gains one optional field: `collector?: RetryTelemetryCollector`.

---

## Post-Sprint Milestone: M9

After N≥100 retry events accumulated in production-like runs (weather benchmark, multi-agent delegation benchmark, manual explorations):

1. Run `npx ts-node scripts/analyze-retries.ts` to produce the category histogram.
2. Convene the advisory panel for a triage round-table (Church, Sutskever, de Moura, Liskov).
3. Apply the decision framework from `docs/research/lambda-type-system.md` Section 7:
   - `type_mismatch` > 40%: HM extension is the lever. Sprint 21 scopes the extension.
   - `schema_violation` + `other` dominant: Bridge Grammar JSON schema needs tightening. Sprint 21 is a schema-hardening sprint.
   - `semantic_error` dominant: Prompt engineering and handler documentation are the lever. Sprint 21 is a handler-documentation and retrieval-augmentation sprint.
   - `ifc_violation` > 20%: IFC label propagation in generation is the problem. Sprint 21 investigates label-aware prompting.

The distribution determines the roadmap. M9 is complete when the histogram is available and the panel triage is recorded in `docs/research/lambda-type-system.md`.

---

## New Files

- `src/types/bridge-telemetry.ts` — `RetryEvent` type and `TelemetryCategory` union
- `src/bridge-grammar/retry-categorizer.ts` — `RetryCategorizer` pure function
- `src/bridge-grammar/retry-telemetry.ts` — `RetryTelemetryCollector` class
- `src/bridge-grammar/__tests__/retry-telemetry.test.ts` — unit and integration tests
- `scripts/analyze-retries.ts` — offline analysis CLI
- `docs/sprints/sprint-20-bridge-grammar-telemetry.md` — this document

## Modified Files

- `src/bridge-grammar/llm-vpir-generator.ts` — `VPIRGeneratorOptions` gains optional `collector` field; retry failure path calls `collector.record()`
- `docs/research/lambda-type-system.md` — "Telemetry Infrastructure" section added (post-sprint, when implementation lands)
- `status.md` — Sprint 20 deliverables and M9 status
- `docs/sprints/README.md` — S20 entry

---

## Referenced Code Locations

| Claim | File | Lines |
|-------|------|-------|
| Retry loop — full extent | `src/bridge-grammar/llm-vpir-generator.ts` | 113-168 |
| Retry error string serialization (no persistent telemetry) | `src/bridge-grammar/llm-vpir-generator.ts` | 161-167 |
| `BridgeErrorCategory` enum | `src/bridge-grammar/bridge-errors.ts` | 18-31 |
| `BridgeError` interface | `src/bridge-grammar/bridge-errors.ts` | 38-51 |
| `classifyError()` — maps `BridgeGrammarError` to `BridgeError` | `src/bridge-grammar/bridge-errors.ts` | 223-235 |
| `SCHEMA_ERRORS`, `SEMANTIC_ERRORS`, `HANDLER_ERRORS`, etc. | `src/bridge-grammar/bridge-errors.ts` | 72-110 |
| `FileStorageBackend` — file-based JSON storage | `src/memory/storage-backend.ts` | 57+ |
| `StorageBackend` interface — `load`, `save`, `append`, `remove` | `src/memory/storage-backend.ts` | 18-26 |
| `VPIRGeneratorOptions` — options interface for generator | `src/bridge-grammar/llm-vpir-generator.ts` | 24-42 |
| Paper decision framework | `docs/research/lambda-type-system.md` | §7 (lines 137-165) |
| Paper tentative recommendation | `docs/research/lambda-type-system.md` | §8 (lines 169-181) |
| Paper — telemetry as the correct next step | `docs/research/lambda-type-system.md` | §9 (line 187) |
