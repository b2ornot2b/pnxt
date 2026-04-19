# Node Catalog Roadmap

**Classification: ROADMAP — future work. All baseline claims verified against code.**

---

## 1. Baseline: Verified Handlers Today

The complete handler catalog is defined in `src/aci/handler-library.ts:715-724` (the `STANDARD_HANDLERS` array). There are exactly 8 handlers. Zero references to postgres, sqlite, discord, slack, telegram, whatsapp, cron, webhook, or python subprocess exist anywhere in `src/`.

| Handler | File:Line | Side Effects | Min Trust Level | Idempotent |
|---|---|---|---|---|
| `http-fetch` | `handler-library.ts:149-173` | `network` | 2 (Collaborator) | false |
| `json-transform` | `handler-library.ts:236-252` | `none` | 0 (Observer) | true |
| `file-read` | `handler-library.ts:269-290` | `file_read` | 0 (Observer) | true |
| `file-write` | `handler-library.ts:310-332` | `file_write` | 1 (Contributor) | true |
| `string-format` | `handler-library.ts:354-374` | `none` | 0 (Observer) | true |
| `math-eval` | `handler-library.ts:480-500` | `none` | 0 (Observer) | true |
| `data-validate` | `handler-library.ts:567-602` | `none` | 0 (Observer) | true |
| `unit-convert` | `handler-library.ts:679-702` | `none` | 0 (Observer) | true |

Trust level semantics are defined at `src/types/aci.ts:25-32` via `SIDE_EFFECT_TRUST_REQUIREMENTS`. The `SideEffect` union at `src/types/aci.ts:13` is currently: `'file_read' | 'file_write' | 'network' | 'process' | 'git' | 'none'`.

The only platform integration today is generic HTTP via `http-fetch`. Everything else is pure computation.

---

## 2. Descriptor Extension (Prerequisite)

Before new handlers ship, `ToolRegistration` should gain an optional `uiMetadata` sub-object. This is non-breaking: the field is optional (`?`), the existing `makeRegistration` helper at `handler-library.ts:86-114` does not need to change, and `discoverTools()` at `tool-registry.ts:153-173` does not inspect it.

**Exact TypeScript diff for `src/types/aci.ts` after line 50:**

```typescript
// Insert after the closing brace of ToolRegistration (after line 50)

export interface ToolUIMetadata {
  /** Human-readable label for UI display. */
  displayName: string;
  /** Grouping category (e.g., 'AI', 'Data', 'IO', 'Compute'). */
  category: string;
  /** Optional icon identifier (e.g., Lucide icon name). */
  icon?: string;
  /** Search and filter tags. */
  tags?: string[];
  /** Short example invocations shown in a catalog. */
  examples?: Array<{ label: string; input: Record<string, unknown> }>;
}

// Add to ToolRegistration interface:
  /** Optional UI presentation metadata. No runtime behavior. */
  uiMetadata?: ToolUIMetadata;
```

The field carries zero runtime weight: the ACI gateway (`src/aci/`) does not read it, the trust engine ignores it, and the bridge grammar validator does not reference it. It exists solely to feed a future catalog UI without coupling that concern to the execution path.

---

## 3. Prompt-Assembly Fix (Prerequisite)

The LLM generator at `src/bridge-grammar/llm-vpir-generator.ts` is currently blind to the handler catalog. The system prompt (`VPIR_SYSTEM_PROMPT`, assembled at lines 67-85) lists node types and graph rules, but says nothing about which `action` operations are available. The LLM can and will hallucinate operation names that `discoverTools()` will subsequently mark as missing.

The fix is to inject a compact manifest derived from `ToolRegistry` before the system prompt is passed to the API call at line 123. The correct insertion site is lines 67-85, where `VPIR_SYSTEM_PROMPT` is built. Change it from a static string constant to a function that accepts the registry's tool names and appends a stanza:

```typescript
// Proposed replacement (src/bridge-grammar/llm-vpir-generator.ts:67)
function buildSystemPrompt(availableHandlers: string[]): string {
  const handlerList = availableHandlers.map(h => `  - "${h}"`).join('\n');
  return `${VPIR_SYSTEM_PROMPT_BASE}

Available action operations (use ONLY these for action nodes):
${handlerList}`;
}
```

`VPIR_SYSTEM_PROMPT_BASE` is the current static string. `availableHandlers` is sourced from `ToolRegistry.listTools()` at call time, so every newly registered handler is automatically visible to the LLM without touching the generator again. This is a one-line change to line 123: replace `system: VPIR_SYSTEM_PROMPT` with `system: buildSystemPrompt(registry.listTools())`.

Neither prerequisite (uiMetadata extension, prompt-assembly fix) requires a schema migration or a breaking change to any existing test.

---

## 4. Ranked Handler Roadmap

Ranking criterion: research leverage — what the handler forces the verification stack to prove, not what users can do with it.

### Rank 1: `llm-inference` — Ship First

**What it unlocks:** An LLM call is the canonical "untrusted external oracle." Shipping this handler makes it possible to run noninterference experiments where data flows from an LLM output into subsequent VPIR nodes. The IFC system (`src/memory/`) must label the output `classification: 'external'` regardless of the caller's label — this is the first real test of label monotonicity under composition. It also puts a live token-consuming operation under Z3 constraint modeling, stress-testing cost-category reasoning.

| Dimension | Value |
|---|---|
| Input | `{ prompt: string; model?: string; maxTokens?: number; systemPrompt?: string }` |
| Output | `{ response: string; tokensUsed: number; model: string }` |
| IFC label behavior | Output forced to `trustLevel: 1, classification: 'external'` regardless of input label |
| Side effects | `['network', 'llm_call']` — `'llm_call'` is a new variant (see Section 5) |
| Required trust | 2 (Collaborator) |
| Research question unblocked | Can the IFC system enforce label downgrade on LLM outputs? Can Z3 reason about token cost as a resource constraint? |

### Rank 2: `python-exec` (sandboxed subprocess)

**What it unlocks:** This introduces the "I/O effect with unverifiable code" category — a side-effecting handler where the formal verifier cannot inspect the executed logic. The research question is whether the sandboxing boundary (a subprocess with restricted file descriptors) is a sufficient substitute for formal proof, or whether VPIR must wrap the call in an assertion node. Pits runtime sandboxing against symbolic verification directly.

| Dimension | Value |
|---|---|
| Input | `{ code: string; stdin?: string; timeoutMs?: number; allowedPaths?: string[] }` |
| Output | `{ stdout: string; stderr: string; exitCode: number }` |
| IFC label behavior | Output inherits `process` side-effect label; must be explicitly declassified by a human-in-the-loop node |
| Side effects | `['process']` |
| Required trust | 3 (Trusted) |
| Research question unblocked | Where does formal verification end and runtime sandboxing begin? |

### Rank 3: `sql-query` (SQLite embedded, then Postgres)

**What it unlocks:** Persistent state is the hardest category for VPIR to reason about. A query result at time T₁ is not the same as a query result at time T₂ if another VPIR graph wrote between them. This forces the verification layer to model world-state effects, which is the core challenge of applying Z3 to stateful action nodes. SQLite first (embedded, no network) keeps the dependency minimal while exercising the same reasoning demands as Postgres.

| Dimension | Value |
|---|---|
| Input | `{ query: string; params?: unknown[]; database?: string }` |
| Output | `{ rows: unknown[]; rowCount: number; duration: number }` |
| IFC label behavior | Rows inherit the database's classification; joins across labels must be explicitly approved |
| Side effects | `['file_read']` (SQLite) / `['network']` (Postgres) |
| Required trust | 0 read / 1 write (SQLite); 2 write (Postgres) |
| Research question unblocked | Can Z3 model query effects on world-state across concurrent VPIR graphs? |

### Rank 4: `web-search`

**What it unlocks:** A tainted data source at the boundary of the known-world assumption. Search results are unstructured, externally controlled, and have no schema the verifier can inspect. This is the maximal stress test for IFC label propagation: every field of every search result must enter the graph labeled `external/untrusted` and the researcher must track whether that label is correctly propagated through json-transform and inference nodes downstream.

| Dimension | Value |
|---|---|
| Input | `{ query: string; maxResults?: number; safeSearch?: boolean }` |
| Output | `{ results: Array<{ title: string; url: string; snippet: string }>; totalResults: number }` |
| IFC label behavior | All output fields labeled `classification: 'external'`; must not flow to file-write without an assertion node |
| Side effects | `['network']` |
| Required trust | 2 (Collaborator) |
| Research question unblocked | Does IFC label propagation survive multi-hop data flow from an unstructured external source? |

### Rank 5: `cron-trigger`

**What it unlocks:** All five handlers above are invoked within a request-scoped VPIR graph. `cron-trigger` is the first non-request-scoped entry point: a DPN process that fires on a schedule, not in response to an agent invocation. This forces the DPN runtime (`src/channel/`) to support event-driven start conditions — graphs with no explicit root inputs. The research question is whether the DPN bisimulation proofs hold for graphs that begin from a temporal predicate rather than a data token.

| Dimension | Value |
|---|---|
| Input | `{ schedule: string; timezone?: string }` (cron expression) |
| Output | `{ firedAt: string; nextFire: string }` |
| IFC label behavior | Trigger events labeled `classification: 'system'`; downstream graphs inherit until declassified |
| Side effects | `['none']` (the trigger itself); downstream effects vary |
| Required trust | 2 (Collaborator) — scheduling is a privileged operation |
| Research question unblocked | Do DPN bisimulation proofs generalize from data-driven to time-driven graph entry? |

### Rank 6: `webhook-listener`

**What it unlocks:** The second non-request-scoped entry point, but with an external caller rather than a timer. Unlike cron, a webhook carries a payload from an uncontrolled origin, combining the label concerns of `web-search` with the DPN concerns of `cron-trigger`. Tests capability negotiation (`src/capability/`) for external callers: the 3-phase handshake must authenticate and label the inbound payload before the graph can proceed.

| Dimension | Value |
|---|---|
| Input | `{ port: number; path: string; secret?: string }` |
| Output | `{ headers: Record<string, string>; body: unknown; timestamp: string }` |
| IFC label behavior | Inbound body labeled `classification: 'external'`; HMAC verification can promote to `'verified-external'` |
| Side effects | `['network', 'process']` |
| Required trust | 3 (Trusted) |
| Research question unblocked | Does the capability negotiation handshake correctly label and gate external-origin payloads? |

### Rank 7: Messaging Platforms (Slack, Discord, Email) — Deferred

These have the lowest research leverage of any category. Slack and Discord are HTTP APIs with structured schemas; they introduce no verification dimension that `http-fetch` + `llm-inference` does not already cover. Email adds MIME parsing complexity. None of them stress IFC, DPN, or Z3 in ways the ranked handlers above do not already address. Defer until a specific experiment requires them.

---

## 5. Prototype: `llm-inference`

This is the exact `ToolRegistration` to add, following the `makeRegistration` pattern at `handler-library.ts:86-114`:

```typescript
// src/aci/handler-library.ts — add after unitConvertRegistration

// Extend SideEffect union first in src/types/aci.ts:
// export type SideEffect = 'file_read' | 'file_write' | 'network' | 'process' | 'git' | 'llm_call' | 'none';
// Add to SIDE_EFFECT_TRUST_REQUIREMENTS: llm_call: 2

export const llmInferenceRegistration: ToolRegistration = makeRegistration(
  'llm-inference',
  'Call an LLM (default: Claude) and return the text response. Output is always labeled external/untrusted.',
  {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'User message to send to the model' },
      model: { type: 'string', description: 'Model identifier (default: claude-sonnet-4-20250514)' },
      maxTokens: { type: 'number', description: 'Maximum tokens in the response (default: 1024)' },
      systemPrompt: { type: 'string', description: 'Optional system prompt' },
    },
    required: ['prompt'],
  },
  {
    type: 'object',
    properties: {
      response: { type: 'string', description: 'Model text output' },
      tokensUsed: { type: 'number', description: 'Total tokens consumed (prompt + completion)' },
      model: { type: 'string', description: 'Model identifier used' },
    },
    required: ['response', 'tokensUsed', 'model'],
  },
  ['network', 'llm_call'],
  {
    timeout: 60_000,
    retryable: true,
    idempotent: false,
    costCategory: 'expensive',
    requiredTrustLevel: 2,
  },
);

export const llmInferenceHandler: ToolHandler = async (input: unknown): Promise<unknown> => {
  const { prompt, model, maxTokens, systemPrompt } = input as {
    prompt: string;
    model?: string;
    maxTokens?: number;
    systemPrompt?: string;
  };

  if (!prompt || typeof prompt !== 'string') {
    throw new Error('llm-inference: "prompt" is required and must be a string');
  }

  // Import Anthropic SDK — already a project dependency (bridge-grammar uses it)
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();

  const response = await client.messages.create({
    model: model ?? 'claude-sonnet-4-20250514',
    max_tokens: maxTokens ?? 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find(
    (b): b is import('@anthropic-ai/sdk').TextBlock => b.type === 'text',
  );

  return {
    response: textBlock?.text ?? '',
    tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    model: response.model,
  };
};
```

The IFC label enforcement — forcing output to `trustLevel: 1, classification: 'external'` — is applied by the ACI gateway when it sees the `llm_call` side effect, not inside the handler itself. This keeps the handler pure and makes the label policy inspectable in one place.

Add to `STANDARD_HANDLERS` array at `handler-library.ts:715`:

```typescript
{ name: 'llm-inference', registration: llmInferenceRegistration, handler: llmInferenceHandler },
```

---

## 6. Decision Points Before Handler #2 Ships

The following questions must be resolved before `python-exec` (Rank 2) begins implementation:

1. **Is `uiMetadata` approved and merged?** The field should land in `src/types/aci.ts` and be backfilled for all 8 existing handlers before new handlers are added, to avoid a retroactive update across 9 registration objects.

2. **Is the prompt-assembly change in place?** Without injecting the handler manifest into the bridge-grammar system prompt, the LLM will be able to name `python-exec` as an action operation even before the handler is registered, creating misleading test results.

3. **Has IFC labeling of LLM outputs been reviewed by the advisory panel?** The `llm-inference` handler establishes the precedent for how external-oracle outputs are labeled. `python-exec` inherits the same pattern (untrusted output, explicit declassification required). The advisory panel review should happen after `llm-inference` is live and before `python-exec` design begins, while the label behavior is fresh and empirically observable.

---

## 7. Non-Goals

pnxt is not trying to match Weft's catalog breadth. Weft ships approximately 25 specialized nodes; pnxt will ship the smallest catalog that exercises every verification dimension.

The verification thesis requires exactly one example of each of the following categories:

- A pure LLM oracle (covered by `llm-inference`)
- An unverifiable-code executor (covered by `python-exec`)
- A persistent-state handler (covered by `sql-query`)
- An unstructured external data source (covered by `web-search`)
- A time-driven DPN entry point (covered by `cron-trigger`)
- An external-caller DPN entry point (covered by `webhook-listener`)

Once each category has one representative, adding more handlers in the same category (a second LLM provider, a second database engine, a second messaging platform) yields no new verification data. That work belongs to a later phase, after the formal verification claims have been established on the minimal catalog.
