/**
 * Integration tests for the VPIR fixture export CLI (Sprint 19).
 *
 * Exercises the in-process helpers without spawning a subprocess, then
 * round-trips the written fixture through JSON.parse to confirm the file
 * on disk is valid and structurally complete.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildWeatherFixture, writeWeatherFixture } from './export-vpir-fixtures.js';

describe('export-vpir-fixtures', () => {
  describe('buildWeatherFixture', () => {
    it('produces a non-empty weather-pipeline graph', () => {
      const fixture = buildWeatherFixture();

      expect(fixture.metadata.id).toBe('weather-pipeline');
      expect(fixture.metadata.name).toBe('Weather API Query Pipeline');
      expect(fixture.nodes.length).toBeGreaterThanOrEqual(1);
      expect(fixture.edges.length).toBeGreaterThanOrEqual(0);
    });

    it('every node carries id, type, label, and position', () => {
      const fixture = buildWeatherFixture();

      for (const node of fixture.nodes) {
        expect(typeof node.id).toBe('string');
        expect(node.id.length).toBeGreaterThan(0);
        expect(typeof node.type).toBe('string');
        expect(typeof node.label).toBe('string');
        expect(node.position).toEqual(
          expect.objectContaining({
            layer: expect.any(Number),
            index: expect.any(Number),
          }),
        );
      }
    });

    it('nodes carry the Sprint 19 visualization encoding inputs', () => {
      const fixture = buildWeatherFixture();
      const withLabel = fixture.nodes.filter((n) => n.securityLabel);
      expect(withLabel.length).toBe(fixture.nodes.length);

      for (const node of withLabel) {
        expect(typeof node.securityLabel!.classification).toBe('string');
        expect(typeof node.securityLabel!.trustLevel).toBe('number');
      }
    });

    it('edges reference existing node ids', () => {
      const fixture = buildWeatherFixture();
      const nodeIds = new Set(fixture.nodes.map((n) => n.id));
      for (const edge of fixture.edges) {
        expect(nodeIds.has(edge.source)).toBe(true);
        expect(nodeIds.has(edge.target)).toBe(true);
      }
    });
  });

  describe('writeWeatherFixture', () => {
    let scratch: string;

    beforeEach(() => {
      scratch = mkdtempSync(join(tmpdir(), 'pnxt-fixture-test-'));
    });

    afterEach(() => {
      rmSync(scratch, { recursive: true, force: true });
    });

    it('writes valid JSON that parses back to the returned fixture', () => {
      const outputPath = join(scratch, 'nested', 'weather.json');
      const written = writeWeatherFixture(outputPath);

      const parsed = JSON.parse(readFileSync(outputPath, 'utf8')) as unknown;
      expect(parsed).toEqual(written);
    });
  });
});
