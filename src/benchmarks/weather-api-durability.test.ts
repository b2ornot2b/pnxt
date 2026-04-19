/**
 * Durability scenario for the weather benchmark — Sprint 16 AC-3.
 *
 * Simulates a mid-graph crash by:
 * 1. Running the graph with a bomb-handler that throws after N nodes settle
 *    into a FileBackedJournal writing to a temp file.
 * 2. Instantiating a FRESH FileBackedJournal reading the same file — the
 *    functional equivalent of a restarted process, because the journal
 *    uses read-modify-write JSON persistence with no buffered state
 *    between append calls.
 * 3. resumeFromCheckpoint rebuilds ExecutionState from the persisted log.
 * 4. Re-runs executeGraph with the fixed handlers and the resumed state.
 * 5. Compares final outputs to an uninterrupted reference run — must match.
 */

import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { InferenceHandler, VPIRExecutionContext } from '../types/vpir-execution.js';
import type { VPIRExecutionResult } from '../types/vpir-execution.js';
import { createLabel } from '../types/ifc.js';
import { executeGraph, resumeFromCheckpoint } from '../vpir/vpir-interpreter.js';
import { FileBackedJournal, InMemoryJournal } from '../vpir/vpir-journal.js';
import {
  createWeatherToolHandler,
  createWeatherVPIRGraph,
} from './weather-api-shim.js';

// ── Minimal ACI gateway shim backed by the mock weather handler ────────

function makeWeatherGateway(): NonNullable<VPIRExecutionContext['aciGateway']> {
  const handler = createWeatherToolHandler();
  return {
    async invoke(invocation): Promise<{
      requestId: string;
      success: boolean;
      output: unknown;
      duration: number;
      resultLabel?: ReturnType<typeof createLabel>;
    }> {
      const start = Date.now();
      const output = await handler(invocation.input);
      return {
        requestId: invocation.requestId,
        success: true,
        output,
        duration: Date.now() - start,
        resultLabel: invocation.requesterLabel,
      };
    },
  };
}

// ── Full handler set (everything including the action-fetch bridge) ───

function makeWeatherContext(
  agentId: string,
  formatBomb: { shouldThrow: boolean },
): VPIRExecutionContext {
  const handlers = new Map<string, InferenceHandler>();

  handlers.set('extract-location', async (inputs) => {
    const query = [...inputs.values()][0] as string;
    const lower = query.toLowerCase();
    if (lower.includes('tokyo')) return 'tokyo';
    if (lower.includes('london')) return 'london';
    if (lower.includes('new york')) return 'new york';
    return 'unknown';
  });

  handlers.set('determine-parameters', async (inputs) => {
    const query = [...inputs.values()][0] as string;
    const units = /fahrenheit|imperial/i.test(query) ? 'imperial' : 'metric';
    return { units };
  });

  handlers.set('build-api-request', async (inputs) => {
    let location = 'unknown';
    let params: Record<string, unknown> = {};
    for (const [key, value] of inputs) {
      if (key.includes('location')) location = value as string;
      if (key.includes('params')) params = value as Record<string, unknown>;
    }
    return { location, ...params };
  });

  handlers.set('format-response', async (inputs) => {
    if (formatBomb.shouldThrow) {
      throw new Error('simulated-crash-at-format-response');
    }
    const weather = [...inputs.values()][0] as {
      location: string;
      temperature: number;
      conditions: string;
      humidity: number;
      windSpeed: number;
      units: string;
    };
    const unit = weather.units === 'metric' ? '°C' : '°F';
    return (
      `Weather in ${weather.location}: ${weather.temperature}${unit}, ` +
      `${weather.conditions}. Humidity: ${weather.humidity}%, ` +
      `Wind: ${weather.windSpeed} ${weather.units === 'metric' ? 'km/h' : 'mph'}`
    );
  });

  const assertionHandlers = new Map<string, (inputs: Map<string, unknown>) => Promise<boolean>>();
  assertionHandlers.set('validate-response', async (inputs) => {
    const response = [...inputs.values()][0];
    return typeof response === 'string' && response.length > 0;
  });

  return {
    agentId,
    label: createLabel(agentId, 2, 'internal'),
    handlers,
    assertionHandlers,
    aciGateway: makeWeatherGateway(),
  };
}

// ── Output comparison ─────────────────────────────────────────────────

export interface ComparisonResult {
  equal: boolean;
  mismatches: Array<{ key: string; a: unknown; b: unknown }>;
}

export function compareOutputMaps(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): ComparisonResult {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const mismatches: ComparisonResult['mismatches'] = [];
  for (const key of keys) {
    const av = a[key];
    const bv = b[key];
    if (JSON.stringify(av) !== JSON.stringify(bv)) {
      mismatches.push({ key, a: av, b: bv });
    }
  }
  return { equal: mismatches.length === 0, mismatches };
}

// ── Durability scenario ───────────────────────────────────────────────

describe('Weather benchmark durability scenario', () => {
  const query = 'What is the weather in Tokyo?';
  let tempDir: string;
  let journalPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pnxt-weather-durability-'));
    journalPath = join(tempDir, 'weather-journal.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reference run completes without a journal', async () => {
    const label = createLabel('weather-benchmark', 2, 'internal');
    const graph = createWeatherVPIRGraph(query, label);
    const ctx = makeWeatherContext('weather-benchmark', { shouldThrow: false });
    const result = await executeGraph(graph, ctx);
    expect(result.status).toBe('completed');
    expect(result.outputs['assert-valid:result']).toBe(true);
  });

  it('kill mid-graph, restart with fresh journal, identical final outputs', async () => {
    const label = createLabel('weather-benchmark', 2, 'internal');
    const graph = createWeatherVPIRGraph(query, label);

    // ── Reference run (no crash, no journal). ───────────────────────
    const referenceCtx = makeWeatherContext('weather-benchmark', {
      shouldThrow: false,
    });
    const reference = await executeGraph(graph, referenceCtx);
    expect(reference.status).toBe('completed');

    // ── Run 1: journal on disk, bomb primed at format-response. ─────
    const w1 = new FileBackedJournal(journalPath);
    const bombyCtx = makeWeatherContext('weather-benchmark', {
      shouldThrow: true,
    });
    const crashed = await executeGraph(graph, bombyCtx, { journal: w1 });
    expect(crashed.status).toBe('failed');
    expect(crashed.errors.some((e) => e.nodeId === 'infer-format')).toBe(true);

    // Journal file must exist and be under the ADR-001 budget (< 10 KB
    // for the weather benchmark after a partial run).
    const sizeBytes = statSync(journalPath).size;
    expect(sizeBytes).toBeGreaterThan(0);
    expect(sizeBytes).toBeLessThan(10_000);

    // ── Run 2: fresh FileBackedJournal instance reading the SAME file.
    // This simulates a restarted process re-opening the durable log —
    // functionally equivalent to SIGKILL+restart under this journal's
    // read-modify-write semantics (no buffered state between appends).
    const w2 = new FileBackedJournal(journalPath);
    const state = await resumeFromCheckpoint(graph, w2);
    expect(state).not.toBeNull();
    // Only the pre-bomb nodes should be in completedNodes.
    const settled = new Set(state!.completedNodes);
    expect(settled.has('observe-query')).toBe(true);
    expect(settled.has('infer-location')).toBe(true);
    expect(settled.has('infer-params')).toBe(true);
    expect(settled.has('prepare-request')).toBe(true);
    expect(settled.has('action-fetch')).toBe(true);
    expect(settled.has('infer-format')).toBe(false); // crashed
    expect(settled.has('assert-valid')).toBe(false);

    // Disarm the bomb and resume.
    const fixedCtx = makeWeatherContext('weather-benchmark', {
      shouldThrow: false,
    });
    const resumed = await executeGraph(graph, fixedCtx, {
      journal: w2,
      resumeFrom: state ?? undefined,
    });
    expect(resumed.status).toBe('completed');

    // ── Final outputs of the resumed run must match the reference. ──
    const comparison = compareOutputMaps(reference.outputs, resumed.outputs);
    expect(comparison.mismatches).toEqual([]);
    expect(comparison.equal).toBe(true);
  });

  it('parallel-path run with journal also produces identical outputs to reference', async () => {
    const label = createLabel('weather-benchmark', 2, 'internal');
    const graph = createWeatherVPIRGraph(query, label);

    const refCtx = makeWeatherContext('weather-benchmark', { shouldThrow: false });
    const reference = await executeGraph(graph, refCtx);

    const journal = new InMemoryJournal();
    const parallelCtx = makeWeatherContext('weather-benchmark', {
      shouldThrow: false,
    });
    const result = await executeGraph(graph, parallelCtx, {
      journal,
      parallel: true,
    });

    expect(result.status).toBe('completed');
    const comparison = compareOutputMaps(reference.outputs, result.outputs);
    expect(comparison.equal).toBe(true);

    // Every successful node should have been journaled.
    const entries = journal.snapshot().filter((r) => r.kind === 'entry');
    expect(entries.length).toBe(graph.nodes.size);
  });

  it('journal file stays below the ADR-001 10 KB budget for a full run', async () => {
    const label = createLabel('weather-benchmark', 2, 'internal');
    const graph = createWeatherVPIRGraph(query, label);
    const ctx = makeWeatherContext('weather-benchmark', { shouldThrow: false });

    const journal = new FileBackedJournal(journalPath);
    await executeGraph(graph, ctx, { journal });

    const contents = readFileSync(journalPath, 'utf-8');
    expect(contents.length).toBeLessThan(10_000);

    // Sanity: every node and its checkpoint made it to disk.
    const parsed = JSON.parse(contents) as Record<string, { kind: string; nodeId?: string }>;
    const values = Object.values(parsed);
    const entryCount = values.filter((r) => r.kind === 'entry').length;
    const checkpointCount = values.filter((r) => r.kind === 'checkpoint').length;
    expect(entryCount).toBe(graph.nodes.size);
    expect(checkpointCount).toBe(graph.nodes.size);
  });

  it('reference run vs. resumed-from-crash run produces a VPIRExecutionResult with same status', async () => {
    // Smoke check that crashed + resumed equals reference at the result level.
    const label = createLabel('weather-benchmark', 2, 'internal');
    const graph = createWeatherVPIRGraph(query, label);

    const reference: VPIRExecutionResult = await executeGraph(
      graph,
      makeWeatherContext('weather-benchmark', { shouldThrow: false }),
    );

    const journal = new FileBackedJournal(journalPath);
    await executeGraph(graph, makeWeatherContext('weather-benchmark', { shouldThrow: true }), {
      journal,
    });
    const state = await resumeFromCheckpoint(graph, new FileBackedJournal(journalPath));
    const resumed = await executeGraph(
      graph,
      makeWeatherContext('weather-benchmark', { shouldThrow: false }),
      { journal, resumeFrom: state ?? undefined },
    );

    expect(resumed.status).toBe(reference.status);
  });
});
