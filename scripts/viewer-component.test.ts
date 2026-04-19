/**
 * Smoke assertions for the `VPIRGraphViewer` React island (Sprint 19).
 *
 * The root Jest config intentionally does not scan the `website/` tree
 * (that workspace is Astro-only and avoids a second Jest setup), so this
 * file ships a source-level smoke assertion compatible with the
 * existing root Jest runner. It scans the viewer source for the
 * Sprint-19 visual encoding invariants:
 *
 *   1. The named export `VPIRGraphViewer` exists.
 *   2. All six VPIR node types are mapped to fill colors.
 *   3. All five IFC classifications (including the Sprint-18 `external`
 *      band) are mapped to border colors.
 *   4. Trust levels 0-4 each have a border-width entry.
 *
 * React rendering is exercised end-to-end by the Playwright spec at
 * `website/tests/viewer.spec.ts`.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const VIEWER_PATH = resolve(
  __dirname,
  '../website/src/components/VPIRGraphViewer.tsx',
);
const TOOLTIP_PATH = resolve(
  __dirname,
  '../website/src/components/VPIRNodeTooltip.tsx',
);
const viewerSource = readFileSync(VIEWER_PATH, 'utf8');
const tooltipSource = readFileSync(TOOLTIP_PATH, 'utf8');

describe('VPIRGraphViewer source', () => {
  it('exports the VPIRGraphViewer function', () => {
    expect(viewerSource).toMatch(/export function VPIRGraphViewer\(/);
  });

  it.each([
    'observation',
    'inference',
    'action',
    'assertion',
    'composition',
    'human',
  ])('maps node type %s to a fill color', (type) => {
    expect(viewerSource).toMatch(new RegExp(`${type}:\\s*'#`));
  });

  it.each([
    'public',
    'internal',
    'confidential',
    'restricted',
    'external',
  ])('maps classification %s to a border color', (classification) => {
    expect(viewerSource).toMatch(new RegExp(`${classification}:\\s*'#`));
  });

  it('defines a border width for every trust level 0-4', () => {
    for (let level = 0; level <= 4; level += 1) {
      expect(viewerSource).toMatch(new RegExp(`${level}:\\s*\\d`));
    }
  });

  it('switches shape based on the verifiable flag', () => {
    expect(viewerSource).toMatch(/verifiable.*===?\s*false.*diamond/s);
  });

  it('wires cytoscape pan+zoom defaults (wheelSensitivity set)', () => {
    expect(viewerSource).toContain('wheelSensitivity');
  });
});

describe('VPIRNodeTooltip source', () => {
  it('exports the VPIRNodeTooltip function', () => {
    expect(tooltipSource).toMatch(/export function VPIRNodeTooltip\(/);
  });

  it('renders classification, trust level, and verifiable flag', () => {
    expect(tooltipSource).toContain('Classification');
    expect(tooltipSource).toContain('Trust level');
    expect(tooltipSource).toContain('Verifiable');
  });

  it('exposes a stable test id for the tooltip wrapper', () => {
    expect(tooltipSource).toContain("data-testid=\"vpir-tooltip\"");
  });
});
