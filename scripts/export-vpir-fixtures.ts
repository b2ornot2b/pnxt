/**
 * Export VPIR graph fixtures for the website playground viewer.
 *
 * Builds the Weather-API benchmark VPIR graph, serialises it via
 * `exportGraphToJSON`, and writes the result to the committed fixture at
 * `website/src/fixtures/weather-benchmark.vpir.json`. The fixture is the
 * default load path for the `/playground/viewer` Astro route.
 *
 * Sprint 19 (M8 — Dual Representation) deliverable.
 *
 * Usage:
 *   npx tsx scripts/export-vpir-fixtures.ts
 *   node --import=tsx/esm scripts/export-vpir-fixtures.ts
 *
 * Exits with code 1 if the exported graph has zero nodes (silent-failure
 * guard).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createWeatherVPIRGraph } from '../src/benchmarks/weather-api-shim.js';
import { exportGraphToJSON } from '../src/vpir/vpir-graph-export.js';
import { createLabel } from '../src/types/ifc.js';
import type { VPIRGraphJSON } from '../src/types/visualization.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

/**
 * Produce the weather-benchmark VPIR graph JSON export.
 *
 * Exposed for in-process tests; keeps the CLI thin. `createdAt`
 * timestamps on the security labels are normalised to a fixed epoch so
 * the committed fixture is byte-stable across regenerations.
 */
export function buildWeatherFixture(): VPIRGraphJSON {
  const label = createLabel('weather-benchmark', 2, 'internal');
  const graph = createWeatherVPIRGraph("What's the weather in Tokyo?", label);
  const fixture = exportGraphToJSON(graph);
  for (const node of fixture.nodes) {
    if (node.securityLabel) {
      node.securityLabel = { ...node.securityLabel, createdAt: FIXED_LABEL_EPOCH };
    }
  }
  return fixture;
}

const FIXED_LABEL_EPOCH = '2026-01-01T00:00:00.000Z';

/**
 * Write the fixture to the website's static-import location.
 */
export function writeWeatherFixture(outputPath: string): VPIRGraphJSON {
  const fixture = buildWeatherFixture();
  if (fixture.nodes.length === 0) {
    throw new Error(
      'Refusing to write fixture: exportGraphToJSON produced zero nodes',
    );
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(fixture, null, 2) + '\n', 'utf8');
  return fixture;
}

function main(): void {
  const outputPath = resolve(
    REPO_ROOT,
    'website/src/fixtures/weather-benchmark.vpir.json',
  );

  const fixture = writeWeatherFixture(outputPath);
  // eslint-disable-next-line no-console
  console.log(
    `Wrote ${fixture.nodes.length} nodes / ${fixture.edges.length} edges to ${outputPath}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  }
}
