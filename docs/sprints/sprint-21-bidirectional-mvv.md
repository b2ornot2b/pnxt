# Sprint 21: Bidirectional MVV — Authoring Surface with Verified Patches

> **Phase**: 8, Sprint 21 — "Bidirectional MVV Editing"
> **Priority**: P2
> **Primary Advisors**: Kay (dual representation — view + edit closes the loop), Liskov (reuse of diff/patch/validator/Z3/HumanGateway — no new abstractions), Myers (IFC monotonicity re-checked on every mutation), Agha (HITL pre-execution gate reuses S17 primitive)
> **Milestone**: M8 — "Dual Representation" Phase 2

---

## Context

Phase 8 has delivered Sprint 16 (M5 Durable VPIR) through Sprint 20 (M9 Bridge-Grammar Retry Telemetry, code-complete). Sprint 19 shipped the read-only Minimum Viable Viewer at `/pnxt/playground/viewer` (`website/src/components/VPIRGraphViewer.tsx`): the first human-visible surface for a VPIR graph, bound to Cytoscape.js via a React island.

Sprint 20's M9 decision — whether to extend LLMbda with Hindley-Milner features — depends on accumulating ≥ 100 real retry events and convening the advisory panel for histogram triage. That data does **not** yet exist. Rather than speculatively committing to an HM spike (which the position paper `docs/research/lambda-type-system.md` explicitly warns against), Sprint 21 pursues a direction that is **orthogonal** to M9: it closes the M8 dual-representation loop by turning the viewer from an inspection surface into an authoring surface. This unlocks Kay's "paradigm actualisation" axis (read + write over the same JSON), exercises Sprint 14's diff/patch engine in a human-driven context (not just self-modification), and produces a downloadable `VPIRGraphJSON` that round-trips back into `TaskRunner` (S11) — all without depending on telemetry data.

The intended outcome: every Cytoscape mutation becomes a Sprint 14 `DiffOperation`, validated by S3's validator, pre-verified by S12's `verifyGraphProperties`, and — for the execute action — gated by a browser-side `HumanGateway` implementation of the Sprint 17 interface. No new abstractions are introduced; the editor is a thin adapter.

---

## Deliverables

### 1. `VPIRGraphViewer.tsx` — edit-mode extension
**File**: `website/src/components/VPIRGraphViewer.tsx` (modification)

Add an `editable?: boolean` prop (default `false`, preserving Sprint 19 read-only behaviour). When true, bind Cytoscape events `tap`, `cxttap` (right-click), `ehcomplete` (edge-handles plugin), and keyboard `Delete`/`Backspace` to emit `EditorIntent` objects. A new `useEditorReducer` hook owns the working `VPIRGraphJSON`, a `pendingDiff` slot, per-node validation flags, and the last-applied inverse diff (single-slot undo via `invertDiff`, `src/vpir/vpir-diff.ts`). Every mutation flows through the diff adapter — no raw JSON splicing.

### 2. `editor-adapter.ts` — intent-to-diff bridge
**File**: `website/src/lib/editor-adapter.ts` (new)

Pure functions mapping `EditorIntent` (`add_node | remove_node | modify_node | add_edge | remove_edge | modify_metadata | edit_label`) to Sprint 14 `DiffOperation[]`. Hydrates `VPIRGraphJSON` back into the server-shaped `VPIRGraph` required by `applyPatch` (`src/vpir/vpir-patch.ts`) using the node deserializer pattern documented in `vpir-patch.ts`. Returns `{ nextGraph, diff, validation, verification }`.

### 3. `editor-worker.ts` — browser-side validate + verify
**File**: `website/src/lib/editor-worker.ts` (new)

Thin wrapper that runs `validateGraph` synchronously on the main thread (pure TS, no Z3) and delegates `verifyGraphProperties` to a Web Worker importing the same `z3-graph-verifier.ts` module via `z3-solver` WASM. A 300 ms debounced scheduler prevents per-keystroke re-verification. Returns a `GraphVerificationResult` whose `properties[]` drives per-node red outlines and tooltip error text (reuses `VPIRNodeTooltip`).

### 4. `ReviewGate.tsx` — pre-execution HITL surface
**File**: `website/src/components/ReviewGate.tsx` (new)

React component bound to the "Execute Graph" button. Constructs a `HumanGatewayRequest` populated with the graph id, node/edge count, and outstanding verification warnings, then hands it to a `BrowserHumanGateway` that resolves via a modal confirm/reject. On approve → hand the `VPIRGraph` to the existing `TaskRunner` surface; on reject → discard with a journal entry. Reuses the Sprint 17 primitive exactly; no new gating concept is invented.

### 5. `BrowserHumanGateway` class
**File**: `src/vpir/human-gateway-browser.ts` (new, sibling to `human-gateway.ts`)

Implements the `HumanGateway` interface from `src/types/vpir-execution.ts` using a `Promise` captured by the React modal. Kept in `src/vpir/` (not `website/`) so it can be unit-tested under Jest with the existing `human-gateway.test.ts` harness and so import paths match the Liskov-aligned S17 structure.

### 6. `EditorToolbar.tsx` — command surface
**File**: `website/src/components/EditorToolbar.tsx` (new)

Buttons: add node (type picker), delete selection, edit label (trustLevel 0-4 + classification enum), undo (single slot), download JSON, execute. Download calls `JSON.stringify(currentGraphJSON, null, 2)` and triggers a `Blob` download; the emitted artefact is round-trippable through `parseVPIRGraph` (`src/bridge-grammar/schema-validator.ts`) and `VPIRGraphBuilder.fromJSON` (`src/vpir/vpir-graph-builder.ts`).

### 7. `/playground/editor` page
**File**: `website/src/content/docs/playground/editor.mdx` (new)

Mounts `<VPIRGraphViewer client:load editable graph={weatherBenchmark} />` with the toolbar and review gate. A note explicitly calls out that edits are client-local and must be exported to re-enter the Node pipeline.

### 8. Type extensions
**File**: `src/types/vpir-editor.ts` (new)

- `EditorIntent` discriminated union (add/remove/modify/connect/disconnect/edit-label).
- `EditorState { graph: VPIRGraphJSON; pendingDiff: VPIRDiff | null; lastInverse: VPIRDiff | null; perNodeErrors: Record<string, string[]>; verification: GraphVerificationResult | null }`.
- No changes to `src/types/vpir.ts`; the existing `DiffOperationType` union already covers every required mutation.

### 9. Tests

**Unit** (Jest):
- `src/vpir/human-gateway-browser.test.ts` — resolve/reject paths
- `website/src/lib/editor-adapter.test.ts` — each `EditorIntent` emits a spec-correct `DiffOperation`; IFC label edit produces a `modify_node` with the new `SecurityLabel`

**Integration** (Jest):
- `website/src/lib/editor-worker.integration.test.ts` — compose adapter → `applyPatch` → `validateGraph` → `verifyGraphProperties` on the weather fixture; assert that lowering a downstream node's `classification` from `confidential` to `public` yields `status: 'violated'` on `ifc-monotonicity`

**Playwright** (extending `website/tests/viewer.spec.ts`):
- `viewer-edit.spec.ts` — add-node, delete-node, edit-label (trust 1 → 3), connect-edge, disconnect-edge, pre-execution gate approve, pre-execution gate reject, download-json (assert downloaded blob round-trips through `parseVPIRGraph`). Zero console errors retained as a hard gate.

---

## Acceptance Criteria

| Criterion | Verification |
|-----------|-------------|
| Every Cytoscape mutation emits exactly one `VPIRDiff` and flows through `applyPatch` | Unit: `editor-adapter.test.ts` spies on `applyPatch` |
| Invalid edits surface per-node red outline + tooltip error within 300 ms | Playwright: edit-label to invalid classification, assert `[data-invalid="true"]` on node |
| IFC monotonicity re-checked on every classification/trustLevel change | Integration: lower downstream classification → `ifc-monotonicity` violated |
| Execute button routes through `HumanGateway.prompt` | Playwright: spy asserts `prompt()` called exactly once per execute click |
| Rejected gate does NOT invoke TaskRunner | Playwright: reject modal, assert no `TaskRunner` / `/api/execute` call |
| Exported JSON round-trips through `parseVPIRGraph` + `VPIRGraphBuilder` | Playwright: download, re-upload, assert deep-equal structural match |
| Single-slot undo restores pre-edit graph via `invertDiff` | Unit: apply diff, apply inverse, assert `computeDiff(original, result).operations.length === 0` |
| `npm run ci` green; S19 read-only mode unchanged when `editable` absent | CI + Playwright: `viewer.spec.ts` still passes unchanged |

---

## Risks

1. **Cytoscape edit UX complexity** — `cytoscape-edgehandles` is the standard answer but adds a bundle dependency. Mitigation: gate behind dynamic `import()` matching the S19 dagre pattern (`VPIRGraphViewer.tsx` dagre fallback block).
2. **Z3 WASM cold-start in the browser** — first-ever verify may exceed 2 s. Mitigation: verify in a Web Worker with a debounced scheduler; fall back to validator-only feedback while Z3 warms.
3. **Diff engine not yet exercised on authoring patches** — S14 tests focus on programmatic diffs. Mitigation: integration test matrix covers all seven `DiffOperationType` values end-to-end; single-slot undo exercises `invertDiff` symmetrically.
4. **IFC feedback latency vs keystroke edits** — 300 ms debounce is a guess. Mitigation: validator (pure TS) runs synchronously on every edit; only Z3 monotonicity is deferred, matching Myers's "check but don't block typing".
5. **`BrowserHumanGateway` divergence from CLI/Noop** — Mitigation: share the `HumanGateway` interface from `src/types/vpir-execution.ts`; cross-implementation contract test asserts all three gateways satisfy the same request/response shape.

---

## Advisor Alignment

| Advisor | Relevance | How This Sprint Addresses It |
|---------|-----------|------------------------------|
| Kay | Dual representation requires both read and write | S19 delivered read; S21 delivers write over the same JSON surface, closing the loop without a second data model |
| Liskov | No new abstractions; every primitive already exists | S14 diff/patch, S12 `verifyGraphProperties`, S17 `HumanGateway`, S11 `VPIRGraphBuilder` all reused verbatim; `BrowserHumanGateway` is a Liskov-substitutable implementation of the existing `HumanGateway` interface |
| Myers | IFC labels must stay visible and enforceable | Every classification/trustLevel edit re-runs IFC monotonicity and paints violations back onto the affected nodes |
| Agha | HITL gate before side effects | Execute button routes through `HumanGatewayRequest` → approve/reject modal → `TaskRunner` only on approve, identical semantics to S17 CLI gateway |

---

## Out of Scope

- **Dense-code surface syntax** (M8 Phase 3, lower priority).
- **New node types** beyond the existing union.
- **New handlers** — `llm-inference` shipped in S18; `python-exec` is Node Catalog Rank 2, a separate track.
- **Multi-user collaboration** or undo history beyond last-patch inverse.
- **Any dependency on M9 retry telemetry distribution** — this sprint ships independently. M9 data accumulates organically from benchmark runs during S21, feeding a later triage sprint.

---

## Dependencies (unchanged — reused as-is)

- `src/vpir/vpir-diff.ts` — `computeDiff`, `invertDiff`
- `src/vpir/vpir-patch.ts` — `applyPatch`, `cloneGraph`
- `src/vpir/vpir-transaction.ts` — `beginTransaction`, `commitTransaction`, `rollbackTransaction`
- `src/vpir/vpir-validator.ts` — `validateGraph`
- `src/verification/z3-graph-verifier.ts` — `verifyGraphProperties`
- `src/vpir/human-gateway.ts` + `src/types/vpir-execution.ts` — `HumanGateway` interface
- `src/vpir/vpir-graph-builder.ts` — `VPIRGraphBuilder.fromJSON`
- `src/bridge-grammar/schema-validator.ts` — `parseVPIRGraph` for export round-trip

---

## Verification

End-to-end acceptance is covered by the Playwright spec, which asserts the full round-trip: mount editor → mutate graph → observe Z3 feedback → click execute → confirm modal → verify `TaskRunner` invocation on approve and absence on reject → download JSON → re-parse via `parseVPIRGraph`. Run locally with:

```bash
# Unit + integration
npm test

# E2E (requires Playwright browsers installed)
cd website && npm run test:e2e

# Full CI
npm run ci
```

Advisory panel composite score target: **9.75 / 10** (from 9.72 baseline) — principally on the Kay (dual representation closed) and Liskov (no new abstractions) axes.

---

## New Files

- `src/vpir/human-gateway-browser.ts` — `BrowserHumanGateway` implementation
- `src/vpir/human-gateway-browser.test.ts` — gateway unit tests
- `src/types/vpir-editor.ts` — `EditorIntent`, `EditorState` types
- `website/src/lib/editor-adapter.ts` — intent → diff bridge
- `website/src/lib/editor-adapter.test.ts` — adapter unit tests
- `website/src/lib/editor-worker.ts` — validate + verify wrapper
- `website/src/lib/editor-worker.integration.test.ts` — full-stack integration test
- `website/src/components/EditorToolbar.tsx` — toolbar component
- `website/src/components/ReviewGate.tsx` — HITL gate component
- `website/src/content/docs/playground/editor.mdx` — playground page
- `website/tests/viewer-edit.spec.ts` — Playwright E2E spec
- `docs/sprints/sprint-21-bidirectional-mvv.md` — this document

## Modified Files

- `website/src/components/VPIRGraphViewer.tsx` — `editable` prop, `useEditorReducer` hook, Cytoscape event bindings
- `website/tests/viewer.spec.ts` — asserts read-only default still holds
- `status.md` — Sprint 21 deliverables and M8 Phase 2 status (post-sprint)
- `docs/sprints/README.md` — S21 entry in Phase 8 table

---

## Referenced Code Locations

| Claim | File |
|-------|------|
| View-only viewer (S19 baseline) | `website/src/components/VPIRGraphViewer.tsx` |
| Diff engine — `computeDiff`, `invertDiff` | `src/vpir/vpir-diff.ts` |
| Patch engine — `applyPatch`, `cloneGraph` | `src/vpir/vpir-patch.ts` |
| Transaction manager — begin/commit/rollback | `src/vpir/vpir-transaction.ts` |
| Graph validator | `src/vpir/vpir-validator.ts` |
| Z3 pre-verification (acyclicity, input completeness, IFC monotonicity, handler trust) | `src/verification/z3-graph-verifier.ts` |
| `HumanGateway` interface (S17) | `src/types/vpir-execution.ts` |
| CLI/Noop gateway implementations (S17) | `src/vpir/human-gateway.ts` |
| VPIR graph builder + `fromJSON` | `src/vpir/vpir-graph-builder.ts` |
| Schema validator — `parseVPIRGraph` | `src/bridge-grammar/schema-validator.ts` |
| Weather benchmark fixture (S19) | `website/src/fixtures/weather-benchmark.vpir.json` |
| Lambda type-system position paper (M9 context) | `docs/research/lambda-type-system.md` |
