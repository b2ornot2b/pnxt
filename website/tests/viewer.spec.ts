/**
 * Playwright E2E smoke test for the Sprint 19 VPIR Graph Viewer.
 *
 * Run manually:
 *
 *   cd website && npx playwright install chromium && npm run test:e2e
 *
 * CI does not run this suite — the root Jest run owns the default test
 * budget and Playwright requires browser binaries. The spec exists so
 * regressions can be caught locally before a website release.
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.VIEWER_BASE_URL ?? 'http://localhost:4321/pnxt';

test.describe('VPIR Graph Viewer (MVV)', () => {
  test('renders the weather-benchmark fixture without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`${BASE_URL}/playground/viewer/`);

    await expect(page.getByRole('heading', { name: /VPIR Graph Viewer/i })).toBeVisible();

    const canvas = page.getByTestId('vpir-graph-canvas');
    await expect(canvas).toBeVisible();

    // Cytoscape renders into an internal <canvas>. Wait for at least one
    // canvas element to exist inside the container before asserting
    // render success.
    await expect(canvas.locator('canvas').first()).toBeVisible({ timeout: 10_000 });

    expect(consoleErrors, `console errors during load: ${consoleErrors.join(' | ')}`).toEqual([]);
  });
});
