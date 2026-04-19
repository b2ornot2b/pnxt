# Dual Representation for VPIR Programs

**Status**: Design document — not implemented  
**Date**: 2026-04-19  
**Scope**: Dense-code surface syntax + interactive graph viewer over a shared VPIR IR

---

## 1. Problem

VPIR programs are human-inaccessible today. When the bridge grammar generates a graph
(`src/bridge-grammar/llm-vpir-generator.ts:98-176`), the output follows one of two paths:
inspection as ASCII text (`src/vpir/vpir-renderer.ts:53-91`) or immediate execution. There
is no intermediate step where a human can read, inspect, edit, or approve the graph before it
runs. `generateVPIRGraph` returns the parsed `VPIRGraph` directly after `parseVPIRGraph()`
succeeds — there is no review gate in the current pipeline.

Three concrete gaps follow from this:

1. **No authoring surface.** Humans cannot write or compose VPIR programs directly. The only
   entry point is natural language to the LLM generator.
2. **No inspection surface.** The ASCII renderer (`renderGraph` at `vpir-renderer.ts:53`) is
   useful for debugging but is not interactive and does not encode IFC labels, trust levels,
   or verification status visually.
3. **No review gate.** Once the LLM emits a valid graph, execution begins. There is no
   built-in pause for human-in-the-loop approval, even for high-trust or side-effecting nodes
   (`verifiable: false` in the node spec).

---

## 2. The Two Surfaces

The design introduces two complementary views over the same underlying IR. Neither is
primary; both are projections of the `VPIRGraph` object defined in `src/types/vpir.ts`.

### Dense code

A textual surface syntax that round-trips losslessly to the VPIR JSON IR. Each token in the
dense-code line is drawn from the categorical vocabulary defined in
`src/experiments/categorical-tokenizer.ts:49-253`. The vocabulary has seven categories
(`observation`, `inference`, `action`, `assertion`, `composition`, `dataflow`, `security`)
and twenty-five morphism rules governing legal token adjacency (lines 55-85). A dense-code
line is a morphism chain; a program is a category graph.

Dense code is bidirectional: parsing a line produces VPIR nodes and edges; serializing a
`VPIRGraph` produces dense-code lines by reversing the tokenizer's `tokenize` function
(lines 332-379).

### Interactive graph

A web-based node-edge view driven by `exportGraphToJSON` (`src/vpir/vpir-graph-export.ts:45-95`).
The export already produces the exact shape required by Cytoscape.js:

- Nodes: `{id, type, label, position: {layer, index}, securityLabel?, verifiable?}` (lines 59-66)
- Edges: `{id, source, target, label, dataType}` (lines 72-82)
- Metadata: graph name, node/edge counts, roots, terminals (lines 85-94)

Topological layer ordering is pre-computed by `computeLayers` (lines 250-300) using BFS from
roots. This means Cytoscape's `dagre` layout can use `position.layer` directly as a rank
hint, avoiding a redundant layout pass.

Editing the graph view produces a `VPIRDiff` that is applied through the transaction
pipeline. Editing the dense-code view re-parses the line into VPIR nodes and synthesizes the
equivalent diff. Both paths converge on the same `executeTransaction` call.

---

## 3. Minimum Viable Viewer (MVV) — Non-Editing

The first shippable piece is a view-only graph renderer hosted inside the existing Astro
site. No editing. No pipeline integration. The goal is to make a generated VPIR graph
visible to a human for the first time.

### File layout

```
website/src/content/docs/playground/viewer.astro   ← Astro page (route)
website/src/components/VPIRGraphViewer.tsx          ← React island (client:load)
website/src/fixtures/sample-vpir-graph.json         ← Static fixture from vpir-graph-export
```

The Astro site (`website/astro.config.mjs`) currently has no React integration. Adding it
requires one dependency and one config change:

```bash
npx astro add react
# adds @astrojs/react to astro.config.mjs integrations[]
```

### Cytoscape.js integration

The `VPIRGraphJSON` shape exported by `exportGraphToJSON` maps directly to Cytoscape
elements with no transformation:

```tsx
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import type { VPIRGraphJSON } from '../../../src/types/visualization';

cytoscape.use(dagre);

function toCytoscapeElements(graph: VPIRGraphJSON) {
  const nodes = graph.nodes.map((n) => ({
    data: {
      id: n.id,
      label: n.label,
      type: n.type,                        // drives color
      trustLevel: n.securityLabel?.trustLevel,
      classification: n.securityLabel?.classification,
      verifiable: n.verifiable,
    },
    position: { x: n.position.index * 180, y: n.position.layer * 120 },
  }));

  const edges = graph.edges.map((e) => ({
    data: {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      dataType: e.dataType,
    },
  }));

  return [...nodes, ...edges];
}
```

`position.layer` (from `computeLayers`, `vpir-graph-export.ts:250`) maps to the Y axis;
`position.index` (counter per layer, line 56) maps to X. No additional layout computation is
needed for an initial render.

### Visual encoding

| Attribute | Encoding |
|-----------|----------|
| `node.type` | Fill color: `observation`=blue, `inference`=amber, `action`=red, `assertion`=green, `composition`=purple |
| `securityLabel.trustLevel` | Border width: level 1=1px, level 5=4px |
| `securityLabel.classification` | Border color: `public`=grey, `internal`=yellow, `confidential`=orange, `restricted`=red |
| `verifiable` | Node shape: `true`=rectangle, `false`=diamond |
| Edge `dataType` | Edge label |

Tooltips on hover show the full `securityLabel` object and `verifiable` flag.

### No editing in MVV

The viewer is read-only. There are no edit controls, no diff generation, and no calls to the
transaction pipeline. This constraint keeps the first ship small and independently testable.

---

## 4. Bidirectional Editing (Phase 2)

Once the viewer ships, editing can be layered on top using the transaction infrastructure
that already exists in `src/vpir/vpir-transaction.ts`.

### Edit → diff → transaction

A node drag, label change, or edge addition in the graph UI produces a `VPIRDiff` (type
defined in `src/types/vpir.ts`). That diff is passed to:

```
beginTransaction(graph, diff)        // vpir-transaction.ts:99
executeTransaction(txn, options)     // vpir-transaction.ts:121
```

`executeTransaction` runs four stages: patch, validate, verify, commit/rollback (lines
131-233). The `verify` option accepts a custom function (`TransactionOptions.verify`,
line 85) — this is where Z3 noninterference checks (`src/verification/`) plug in.

The UI shows the transaction trace (`txn.trace`, line 74) per edit: each stage appears as a
status badge (patch: OK, validate: OK, verify: checking... / passed / failed). If
verification fails, the transaction auto-rolls back (`autoRollback: true`, line 88 default)
and the UI reverts the edit with an error annotation showing which property failed.

This makes IFC and Z3 checks directly interactive and user-visible for the first time.
Previously they run silently inside the execution pipeline.

### Dense-code sync

When the user edits a dense-code line, the editor:

1. Re-parses the changed line using the categorical tokenizer (`detokenize`,
   `categorical-tokenizer.ts:393-500`).
2. Computes a `VPIRDiff` between the previous and new node sequence.
3. Feeds the diff into `beginTransaction` / `executeTransaction`.
4. On commit, re-renders the graph view from the updated `VPIRGraph`.

Morphism well-formedness (`isWellFormed`, `categorical-tokenizer.ts:511-530`) runs as
real-time syntax validation in the dense-code editor before the diff is even submitted. An
invalid morphism sequence (e.g., `action → observation` which has no rule in the vocabulary)
is flagged as a syntax error without touching the transaction layer.

---

## 5. Pre-Execution Review Gate

The bridge-grammar pipeline in `src/bridge-grammar/llm-vpir-generator.ts` currently has
this shape at lines 148-158:

```
parseVPIRGraph(input)  →  if valid: return graph  →  caller executes
```

A review gate inserts a suspension point between parse and return:

```
generate → parse → [review gate?] → execute
```

Implementation sketch at the call site:

```typescript
const result = await generateVPIRGraph(taskDescription, options);
if (result.success && result.graph && reviewGateEnabled) {
  await suspendForReview(result.graph);   // blocks until approved or rejected
}
if (approved) { await executeVPIRGraph(result.graph); }
```

The gate is feature-flagged (`reviewGateEnabled`) and off by default, preserving the current
fully-automated path. When enabled, `suspendForReview` serialises the graph via
`exportGraphToJSON` and presents it in the MVV viewer. The human inspects the graph and
either approves (resumes execution) or rejects (discards the graph and optionally re-prompts
with corrections).

The suspension mechanism is a natural candidate for Track 2's human-in-the-loop (HITL)
primitive, and the approval event is a natural entry in the Track 1 journal for audit.
Neither Track is implemented yet; for an initial version, `suspendForReview` can be as
simple as a CLI prompt or a webhook.

---

## 6. Dense-Code Surface — Sketch

The categorical tokenizer (`src/experiments/categorical-tokenizer.ts`) defines the building
blocks of a dense-code syntax without defining the syntax itself. The vocabulary provides:

- Five node-type tokens per category (`obs-capture`, `obs-query`, `obs-event`, `obs-sensor`,
  `obs-file` for observations; analogous sets for the other four types; lines 114-175).
- Eight dataflow tokens encoding port types (`df-string`, `df-number`, `df-object`,
  `df-boolean`, `df-array`, `df-any`, `df-ref`, `df-dep`; lines 197-215).
- Four security tokens (`sec-public`, `sec-internal`, `sec-confidential`, `sec-restricted`;
  lines 219-234).

A dense-code line is a left-to-right morphism chain. The grammar enforces the morphism rules
from lines 55-85: for example, `observation → inference` is the `data-flow` morphism (line
57), but `action → observation` has no rule and is a syntax error.

Illustrative syntax (design only — not yet specified formally):

```
obs-query -> inf-parse -> inf-extract -> act-fetch -> ast-valid
```

With explicit IFC labels prefixed by `@`:

```
obs-query@external -> inf-parse@internal -> act-fetch@public -> ast-valid@public
```

A composition block groups a subgraph under a single composition token:

```
comp-pipeline {
  obs-capture@external -> inf-classify@internal -> act-invoke@public
}
```

The `composableMorphisms` field on each token (e.g., `composableRuleIds('observation')`
returns all rule IDs where `sourceCategory === 'observation'`, line 107-110) provides the
data a syntax highlighter or language server needs to highlight illegal transitions in real
time without running the full tokenizer.

This syntax is a design sketch only. No parser, formatter, or language server exists.

---

## 7. Deployment Target for MVV

### Dependencies to add

```bash
# In website/
npm install cytoscape cytoscape-dagre
npm install -D @astrojs/react @types/cytoscape @types/cytoscape-dagre
```

`@astrojs/react` is the only change to `website/astro.config.mjs`. Starlight is compatible
with React islands via `client:load` directives; no further Astro configuration is required.

### Build

The existing GitHub Actions deploy workflow triggers on pushes to `main` that touch
`website/`. No new workflow is needed. The Cytoscape bundle is tree-shaken at build time;
`cytoscape-dagre` adds approximately 40 kB gzipped.

### Route

Adding `website/src/content/docs/playground/viewer.astro` automatically creates the route
`/pnxt/playground/viewer` under the configured `base: '/pnxt'`
(`website/astro.config.mjs:3`). A sidebar entry under a new `Playground` group can be added
to `astro.config.mjs:sidebar` in the same PR.

### Static fixture

`createSampleVPIRGraphJSON` in `src/bridge-grammar/llm-vpir-generator.ts:317-391` produces
a valid four-node graph (observe-input → infer-plan → execute-action → assert-success) that
can be serialised to `website/src/fixtures/sample-vpir-graph.json` as the initial viewer
fixture. The fixture can later be replaced by a URL parameter or file upload.

---

## 8. Open Questions

**Graph viewer location.** Should the viewer live inside the Astro website (GitHub Pages,
accessible to all) or as a VS Code extension (local, integrated with the editor)? The Astro
route is lower friction to ship and requires no extension packaging. A VS Code extension
would integrate with the dense-code editor and show the graph inline, but is a substantially
larger build. A reasonable sequence: ship Astro viewer first, evaluate VS Code extension as
a follow-on.

**Multi-user editing and CRDTs.** The transaction model (`vpir-transaction.ts`) is
single-writer: `beginTransaction` snapshots the graph at a point in time and applies one
diff atomically. Concurrent edits from two users would require either a CRDT layer above the
transaction manager or a last-write-wins merge policy. Single-user is sufficient for the
initial design; the question is whether the API surface of `VPIRDiff` and `beginTransaction`
can accommodate a CRDT diff type later without breaking changes.

**Morphism rules as syntax highlighting.** The `composableMorphisms` array on each token
(type `string[]`, entries are rule IDs from `morphismRules`) already encodes which tokens
may follow the current one. A TextMate grammar or a CodeMirror extension could use this
table to highlight invalid transitions without running the full tokenizer. The rule table is
25 entries (lines 55-85) and is stable for the current vocabulary. Whether the grammar
should be derived from the TypeScript source at build time (generating a JSON grammar file)
or hardcoded in the highlighter is an open implementation decision.

---

## NOT Implemented

The following do not exist in the codebase at the time of writing and must be built:

- `VPIRGraphViewer.tsx` — React island (not implemented)
- `website/src/content/docs/playground/viewer.astro` — Astro route (not implemented)
- Dense-code parser and formatter (not implemented)
- Pre-execution review gate in `llm-vpir-generator.ts` (not implemented)
- Diff generation from UI edit events (not implemented)
- Language server or syntax highlighter for dense code (not implemented)
- VS Code extension (not implemented)

## Implemented (referenced above)

| Capability | File | Lines |
|-----------|------|-------|
| JSON export (Cytoscape-ready) | `src/vpir/vpir-graph-export.ts` | 45-95 |
| ASCII/Unicode graph renderer | `src/vpir/vpir-renderer.ts` | 53-91 |
| Transaction lifecycle | `src/vpir/vpir-transaction.ts` | 99-261 |
| LLM generation (no review gate) | `src/bridge-grammar/llm-vpir-generator.ts` | 98-176 |
| Categorical token vocabulary (~50 tokens) | `src/experiments/categorical-tokenizer.ts` | 49-253 |
| Morphism rules (25 rules) | `src/experiments/categorical-tokenizer.ts` | 55-85 |
| Well-formedness check | `src/experiments/categorical-tokenizer.ts` | 511-530 |
| Sample VPIR graph fixture | `src/bridge-grammar/llm-vpir-generator.ts` | 317-391 |
