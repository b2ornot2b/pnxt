# Sprint 19: Visual Authoring MVV — Interactive VPIR Graph Viewer

> **Phase**: 8, Sprint 19 — "Visual Authoring MVV — Interactive VPIR Graph Viewer"
> **Priority**: P2
> **Primary Advisors**: Kay (paradigm design — dual representation), Liskov (UX for language), Myers (visualizing IFC labels)
> **Milestone**: M8 — "Dual Representation"

---

## Summary

Sprint 19 opens Phase 8 ("Dual Representation") by shipping the first human-readable view of a VPIR graph. Until now, the only inspection surface is the ASCII renderer (`src/vpir/vpir-renderer.ts:53-91`) — useful for debugging but static, unstyled, and stripped of IFC and trust information. No interactive path exists between graph generation and graph execution.

The design document `docs/research/dual-representation.md` identifies three concrete gaps: no authoring surface, no inspection surface, and no review gate. Sprint 19 closes the second gap — the inspection surface — by shipping the Minimum Viable Viewer (MVV): a view-only Cytoscape.js graph rendered as a React island inside the existing Astro website. The viewer makes a generated VPIR graph visible to a human for the first time.

The JSON export layer (`src/vpir/vpir-graph-export.ts:45-95`) already produces the exact Cytoscape-compatible shape: nodes with `{id, type, label, position: {layer, index}, securityLabel, verifiable}` and edges with `{id, source, target, label, dataType}`. Sprint 19 consumes that output directly; no new backend logic is required. The fixture is generated from the existing weather-benchmark benchmark (`src/benchmarks/weather-api-shim.ts`) via a new CLI script.

Bidirectional editing, the pre-execution review gate, and dense-code surface syntax are explicitly out of scope and deferred.

---

## Deliverables

### 1. Website Dependencies

**File**: `website/package.json`

Add runtime dependencies:

- `react` — React runtime for Astro islands
- `react-dom` — React DOM renderer
- `cytoscape` — core graph visualization library
- `cytoscape-dagre` — dagre layout plugin for hierarchical DAG rendering

Add dev dependencies:

- `@astrojs/react` — Astro React integration
- `@types/react` — TypeScript types for React
- `@types/cytoscape` — TypeScript types for Cytoscape.js

### 2. Astro React Integration

**File**: `website/astro.config.mjs`

Register `@astrojs/react` in the `integrations[]` array. No other Astro configuration change is required; Starlight is compatible with React islands via `client:load`. The existing sidebar receives a new `Playground` group with a single entry pointing to `/playground/viewer`.

### 3. VPIRGraphViewer React Component

**File**: `website/src/components/VPIRGraphViewer.tsx`

A React island that accepts a `VPIRGraphJSON` prop and renders it via Cytoscape.js with the dagre layout plugin. The component is marked `client:load` at its call site, restricting JavaScript to this island only.

Key implementation details drawn from `docs/research/dual-representation.md:96-127`:

- Nodes are mapped to Cytoscape elements with `position.layer` driving the Y axis (`y = layer * 120`) and `position.index` driving the X axis (`x = index * 180`). Pre-computed layer ordering from `computeLayers` (`src/vpir/vpir-graph-export.ts:250`) is used directly; no additional layout pass is needed.
- Visual encoding applied via Cytoscape style sheets:

| Attribute | Encoding |
|-----------|----------|
| `node.type` | Fill color: `observation`=blue, `inference`=amber, `action`=red, `assertion`=green, `composition`=purple |
| `securityLabel.trustLevel` (0-4 scale) | Border width: 0=1px, 1=2px, 2=2.5px, 3=3px, 4=4px |
| `securityLabel.classification` | Border color: `public`=grey, `internal`=yellow, `confidential`=orange, `restricted`=red |
| `verifiable: true` | Node shape: rectangle |
| `verifiable: false` | Node shape: diamond |
| Edge `dataType` | Edge label |

- Pan and zoom enabled via Cytoscape defaults; no write controls rendered.
- The component is stateless with respect to the graph data; it receives a frozen `VPIRGraphJSON` and renders it. No callbacks, no diff generation, no transaction calls.

### 4. VPIRNodeTooltip Component

**File**: `website/src/components/VPIRNodeTooltip.tsx`

A React component rendered on Cytoscape `mouseover` events. Receives a selected node's data object and displays:

- Node `type` and `label`
- Full `securityLabel` object: `classification` and `trustLevel`
- `verifiable` flag rendered as a labelled boolean badge
- Node `id` (for debugging)

The tooltip is positioned relative to the node's screen coordinates via a `position` prop passed from the Cytoscape event handler in `VPIRGraphViewer`. It is dismissed on `mouseout`.

### 5. Playground Viewer Route

**File**: `website/src/content/docs/playground/viewer.astro`

An Astro page that:

1. Loads `website/src/fixtures/weather-benchmark.vpir.json` as a static import (default path).
2. Optionally accepts a `?graph=` URL parameter pointing to an alternative fixture path — the parameter is read at runtime in the client island, not at build time.
3. Renders `VPIRGraphViewer` with `client:load` passing the fixture JSON as a prop.
4. Includes a descriptive heading and a note that the viewer is read-only.

Adding this file automatically creates the route `/pnxt/playground/viewer` under the configured `base: '/pnxt'` (`website/astro.config.mjs:3`).

### 6. Weather Benchmark Fixture

**File**: `website/src/fixtures/weather-benchmark.vpir.json`

A static JSON file produced by running `scripts/export-vpir-fixtures.ts` against the weather-benchmark (`src/benchmarks/weather-api-shim.ts`). The fixture is committed to the repository so the viewer works without a build step.

The fixture shape matches `VPIRGraphJSON` exactly (`src/types/visualization.ts`): a `nodes` array, an `edges` array, and a `metadata` object. It is the authoritative smoke-test input for both the viewer component unit tests and the Playwright E2E test.

### 7. Export CLI Script

**File**: `scripts/export-vpir-fixtures.ts`

A standalone Node CLI that:

1. Imports the weather-benchmark definition from `src/benchmarks/weather-api-shim.ts`.
2. Extracts or constructs the `VPIRGraph` from the benchmark (using the graph built internally by the shim).
3. Calls `exportGraphToJSON` (`src/vpir/vpir-graph-export.ts:45`) to produce a `VPIRGraphJSON`.
4. Writes the result as formatted JSON to `website/src/fixtures/weather-benchmark.vpir.json`.

Usage:

```bash
npx ts-node scripts/export-vpir-fixtures.ts
```

The script is non-destructive: if the fixture file already exists it overwrites it. It exits with code 1 if the export produces zero nodes, guarding against silent failures.

### 8. Visual Encoding Specification

The encoding is defined in `VPIRGraphViewer.tsx` as a Cytoscape style array. The five node-type colors, four classification border colors, and the trust-level border-width scale (0-4) are all expressed as named constants at the top of the file for easy future adjustment. The `verifiable` flag drives `shape`: `rectangle` for `true`, `diamond` for `false`. Muted opacity (0.6) is applied to `verifiable: false` nodes to draw attention to unverifiable steps.

This encoding is documented in `docs/research/dual-representation.md:135-143` and implemented faithfully.

### 9. Tests

**File**: `website/tests/viewer.spec.ts`

Playwright E2E smoke test:

- Visits `/pnxt/playground/viewer`
- Asserts the page title is present
- Asserts at least one Cytoscape node element is rendered in the DOM (selector: `canvas` or `.cy-node` depending on Cytoscape rendering mode)
- Asserts no console errors during load

**File**: `website/src/components/VPIRGraphViewer.test.tsx`

React Testing Library unit test:

- Renders `VPIRGraphViewer` with the weather-benchmark fixture as prop
- Asserts the component mounts without throwing
- Asserts the container element is present in the DOM

**File**: `scripts/export-vpir-fixtures.test.ts`

Integration test:

- Runs the export CLI against the weather-benchmark
- Parses the output JSON
- Asserts `nodes.length >= 1` and `edges.length >= 0`
- Asserts every node has `id`, `type`, `label`, `position`

---

## Alignment Impact

| Advisor | Gap Addressed | How |
|---------|--------------|-----|
| Kay (Paradigm) | **Primary** | MVV is the first human-visible surface for the dual-representation pillar; makes VPIR programs inspectable outside the terminal |
| Liskov (Language) | **Primary** | Clean typed React component API; `VPIRGraphJSON` is the stable contract; viewer makes the language's output legible |
| Myers (IFC) | **Primary** | IFC labels (`classification`, `trustLevel`) and `verifiable` flag are first-class visual attributes — not buried in JSON |
| Sutskever (LLM) | Indirect | LLM-generated graphs are now directly human-inspectable, closing the black-box gap between generation and execution |
| Pearl (Causal) | Indirect | Node-level trust and verifiability are visible; causal chains through the graph are traceable by a human reviewer |
| Voevodsky (HoTT) | Stable | No change to HoTT layer |
| Church (Lambda) | Stable | No change to LLMbda layer |
| Milner (Process) | Stable | No change to DPN layer |
| Agha (Actor) | Stable | No change to actor layer |
| de Moura (SMT) | Stable | No change to Z3 layer |

---

## Test Metrics

| Metric | Sprint 15 | Sprint 19 | Delta |
|--------|-----------|-----------|-------|
| Test Suites | 83 | 86 | +3 |
| Tests | 1485+ | 1507+ | +22 |
| Z3 Properties | 21 | 21 | +0 |
| Website Components | 0 | 2 | +2 |
| E2E Tests | 0 | 1 | +1 |
| Fixture Files | 0 | 1 | +1 |

---

## Acceptance Criteria

- Viewer reachable at `/playground/viewer` on the deployed Astro site
- Loads `website/src/fixtures/weather-benchmark.vpir.json` without console error
- Hovering a node displays a tooltip with: IFC label (`classification` + `trustLevel`) and `verifiable` flag
- Pan and zoom work (Cytoscape default interactions)
- Build time on the existing GitHub Pages workflow stays under 3 minutes; Cytoscape bundle adds approximately 40 kB gzipped (`cytoscape-dagre` estimate from `docs/research/dual-representation.md:292`)
- No write, edit, or delete controls are present in the viewer
- `npm run build` in `website/` passes without type errors or lint violations

---

## NOT Implemented This Sprint

The following are explicitly deferred:

- **Bidirectional editing** — deferred to Sprint 20 or 21; requires hooking `VPIRDiff` → `beginTransaction` (`src/vpir/vpir-transaction.ts:99`) into UI events
- **Pre-execution review gate** — deferred; depends on Sprint 17 HITL primitive; design in `docs/research/dual-representation.md:199-229`
- **Dense-code surface syntax** — design only in `docs/research/dual-representation.md:236-275`; no parser, formatter, or language server exists
- **Multiple graph selection / graph diff visualization**
- **Mobile / responsive optimization**
- **VS Code extension** — deferred; Astro route is lower friction for the first ship

---

## Dependencies

- **Soft**: Sprint 18 `uiMetadata` fields provide richer display context; the viewer ships without them and degrades gracefully (shows `label` and `type` only)
- **Independent**: Sprint 16 (HITL) and Sprint 17 are not required
- **Existing infrastructure used**:
  - `src/vpir/vpir-graph-export.ts:45-95` — `exportGraphToJSON` (already implemented)
  - `src/types/visualization.ts` — `VPIRGraphJSON`, `GraphNode`, `GraphEdge` types (already implemented)
  - `src/benchmarks/weather-api-shim.ts` — benchmark source for the fixture (already implemented)
  - `website/astro.config.mjs` — existing config extended, not replaced

---

## New Files

- `website/src/components/VPIRGraphViewer.tsx` — React island; Cytoscape.js graph renderer
- `website/src/components/VPIRGraphViewer.test.tsx` — RTL unit test (mount + node assertion)
- `website/src/components/VPIRNodeTooltip.tsx` — hover tooltip; IFC label + verifiable flag
- `website/src/content/docs/playground/viewer.astro` — Astro route at `/playground/viewer`
- `website/src/fixtures/weather-benchmark.vpir.json` — committed fixture from weather-benchmark export
- `scripts/export-vpir-fixtures.ts` — CLI; runs `exportGraphToJSON` on weather-benchmark and writes fixture
- `scripts/export-vpir-fixtures.test.ts` — integration test; fixture validity assertions
- `website/tests/viewer.spec.ts` — Playwright E2E smoke test
- `docs/sprints/sprint-19-visual-authoring-mvv.md` — This document

## Modified Files

- `website/package.json` — add `react`, `react-dom`, `cytoscape`, `cytoscape-dagre`, `@astrojs/react`, `@types/react`, `@types/cytoscape`
- `website/astro.config.mjs` — register `@astrojs/react` in `integrations[]`; add `Playground` sidebar group
- `status.md` — Sprint 19 deliverables and M8 progress
- `docs/sprints/README.md` — S19 entry in Phase 8 sprint index

---

## Out of Scope

| Item | Reason |
|------|--------|
| Bidirectional editing | Deferred — Sprint 20/21; requires transaction pipeline wiring |
| Pre-execution review gate | Deferred — requires Sprint 17 HITL first |
| Dense-code surface syntax | Design only this sprint; no implementation |
| Graph diff visualization | Not required for MVV |
| Mobile optimization | Not required for initial ship |
| Multi-user / CRDT editing | Single-writer transaction model sufficient |

---

## Implementation Notes

### Why Cytoscape.js

`exportGraphToJSON` (`src/vpir/vpir-graph-export.ts:45-95`) already produces the exact Cytoscape element format with no transformation required. `position.layer` (BFS-computed by `computeLayers`, lines 250-300) maps directly to Y coordinates. The dagre plugin accepts `layer` as a rank hint, making the initial render correct by construction.

### Why React Island (not SSR)

Cytoscape.js requires a DOM canvas. Astro's default SSR renders HTML at build time; a React island with `client:load` defers Cytoscape initialization to the browser. This is the standard Astro pattern for DOM-dependent third-party libraries and is explicitly documented in `docs/research/dual-representation.md:288-290`.

### Fixture Regeneration

The fixture at `website/src/fixtures/weather-benchmark.vpir.json` is committed. To regenerate after benchmark changes:

```bash
npx ts-node scripts/export-vpir-fixtures.ts
```

The CI pipeline does not auto-regenerate fixtures; the committed file is the source of truth for the viewer's default load path.
