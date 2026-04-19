/**
 * Tests for the RetryTelemetryCollector and JsonlFileSink.
 *
 * Covers: privacy invariants, in-memory collection, sink failure isolation,
 * JSONL round-trip, and an integration check that the instrumented
 * generator emits exactly one event per failed retry attempt.
 *
 * Sprint 20 — M9.
 */

import { readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  InMemorySink,
  JsonlFileSink,
  RESPONSE_EXCERPT_LIMIT,
  RetryTelemetryCollector,
  hashPrompt,
  truncateExcerpt,
  type TelemetrySink,
} from './retry-telemetry.js';
import {
  createMockClient,
  createSampleVPIRGraphJSON,
  generateVPIRGraph,
} from './llm-vpir-generator.js';
import type { RetryEvent } from '../types/bridge-telemetry.js';

describe('hashPrompt', () => {
  it('produces a 16-char lowercase hex string', () => {
    const hash = hashPrompt('the quick brown fox');
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(hash.length).toBe(16);
  });

  it('is deterministic for the same input', () => {
    expect(hashPrompt('same input')).toBe(hashPrompt('same input'));
  });

  it('differs for different inputs', () => {
    expect(hashPrompt('input A')).not.toBe(hashPrompt('input B'));
  });
});

describe('truncateExcerpt', () => {
  it('returns strings shorter than the limit unchanged', () => {
    expect(truncateExcerpt('short')).toBe('short');
  });

  it('truncates strings longer than the limit', () => {
    const long = 'a'.repeat(10_000);
    const truncated = truncateExcerpt(long);
    expect(truncated.length).toBe(RESPONSE_EXCERPT_LIMIT);
    expect(truncated).toBe('a'.repeat(RESPONSE_EXCERPT_LIMIT));
  });

  it('handles empty input', () => {
    expect(truncateExcerpt('')).toBe('');
  });
});

describe('RetryTelemetryCollector — privacy invariants', () => {
  it('always truncates responseExcerpt to <= 200 characters', async () => {
    const collector = new RetryTelemetryCollector();
    await collector.record({
      attemptNumber: 1,
      rejectionReason: 'test',
      errorCategory: 'other',
      taskDescription: 'prompt',
      rawResponse: 'x'.repeat(10_000),
    });
    expect(collector.events).toHaveLength(1);
    expect(collector.events[0].responseExcerpt.length).toBeLessThanOrEqual(
      RESPONSE_EXCERPT_LIMIT,
    );
  });

  it('never persists API-key-looking patterns within the excerpt window', async () => {
    // A raw response that leads with a tool-use JSON payload cannot
    // structurally contain an Anthropic API key, but the 200-char cap
    // acts as a defensive safety net. We verify the cap directly and
    // sanity-check on a crafted input whose suffix contains a fake key.
    const safePrefix = '{"nodes":[{"id":"n1","type":"observation"}]}'.padEnd(200, ' ');
    const rawResponse = `${safePrefix}sk-ant-fake-should-not-appear`;
    const collector = new RetryTelemetryCollector();
    await collector.record({
      attemptNumber: 1,
      rejectionReason: 'test',
      errorCategory: 'other',
      taskDescription: 'prompt',
      rawResponse,
    });
    expect(collector.events[0].responseExcerpt).not.toContain('sk-ant-');
    expect(collector.events[0].responseExcerpt).not.toContain('Bearer ');
    expect(collector.events[0].responseExcerpt).not.toMatch(/x-api-key/i);
  });

  it('defaults rawResponse to empty string when undefined', async () => {
    const collector = new RetryTelemetryCollector();
    await collector.record({
      attemptNumber: 1,
      rejectionReason: 'no rawResponse',
      errorCategory: 'other',
      taskDescription: 'prompt',
    });
    expect(collector.events[0].responseExcerpt).toBe('');
  });
});

describe('RetryTelemetryCollector — sink failures do not abort generation', () => {
  it('swallows thrown errors from the sink', async () => {
    const failingSink: TelemetrySink = {
      append: async () => {
        throw new Error('sink is on fire');
      },
    };
    const collector = new RetryTelemetryCollector({ sink: failingSink });
    const originalWarn = console.warn;
    const warnCalls: unknown[][] = [];
    console.warn = (...args: unknown[]) => void warnCalls.push(args);
    try {
      await expect(
        collector.record({
          attemptNumber: 1,
          rejectionReason: 'test',
          errorCategory: 'other',
          taskDescription: 'prompt',
          rawResponse: '{}',
        }),
      ).resolves.toBeUndefined();
      expect(warnCalls.length).toBeGreaterThan(0);
      // In-memory mirror still captures the event so analysis is possible
      // even when the external sink is unavailable.
      expect(collector.events).toHaveLength(1);
    } finally {
      console.warn = originalWarn;
    }
  });

  it('records event shape correctly on the in-memory mirror', async () => {
    const sinkEvents: RetryEvent[] = [];
    const sink: TelemetrySink = { append: async (e) => void sinkEvents.push(e) };
    const collector = new RetryTelemetryCollector({ sink });
    await collector.record({
      attemptNumber: 2,
      rejectionReason: '[MISSING_FIELD] /nodes/0/evidence: empty',
      errorCategory: 'schema_violation',
      taskDescription: 'hello world',
      rawResponse: '{"nodes":[]}',
    });
    expect(sinkEvents).toHaveLength(1);
    const e = sinkEvents[0];
    expect(e.attemptNumber).toBe(2);
    expect(e.errorCategory).toBe('schema_violation');
    expect(e.rejectionReason).toContain('MISSING_FIELD');
    expect(e.promptHash).toMatch(/^[0-9a-f]{16}$/);
    expect(e.responseExcerpt).toBe('{"nodes":[]}');
    expect(() => new Date(e.timestamp).toISOString()).not.toThrow();
  });
});

describe('JsonlFileSink', () => {
  const tmpDir = join(tmpdir(), `pnxt-telemetry-${Date.now()}-${Math.random()}`);
  const logPath = join(tmpDir, 'nested', 'telemetry.jsonl');

  beforeAll(async () => {
    await mkdir(tmpDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('appends one JSON line per event and creates parent directories', async () => {
    const sink = new JsonlFileSink(logPath);
    const e1: RetryEvent = {
      timestamp: '2026-04-19T00:00:00.000Z',
      attemptNumber: 1,
      rejectionReason: 'first',
      errorCategory: 'schema_violation',
      promptHash: 'deadbeefdeadbeef',
      responseExcerpt: '{}',
    };
    const e2: RetryEvent = { ...e1, attemptNumber: 2, rejectionReason: 'second' };
    await sink.append(e1);
    await sink.append(e2);

    const raw = await readFile(logPath, 'utf-8');
    const lines = raw.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({ attemptNumber: 1, rejectionReason: 'first' });
    expect(JSON.parse(lines[1])).toMatchObject({ attemptNumber: 2, rejectionReason: 'second' });
  });
});

describe('InMemorySink', () => {
  it('records events in insertion order', async () => {
    const sink = new InMemorySink();
    await sink.append({
      timestamp: '2026-04-19T00:00:00.000Z',
      attemptNumber: 1,
      rejectionReason: 'r',
      errorCategory: 'other',
      promptHash: 'deadbeefdeadbeef',
      responseExcerpt: '',
    });
    expect(sink.events).toHaveLength(1);
  });
});

describe('generateVPIRGraph instrumentation — integration', () => {
  it('records one event per failed retry attempt when a collector is injected', async () => {
    // createMockClient(sample, /*failFirst=*/ true): 1st call returns a
    // text block (no tool_use), 2nd call returns a valid VPIR tool_use.
    // Expect: one retry → one telemetry event with errorCategory='other'.
    const sample = createSampleVPIRGraphJSON('telemetry-probe');
    const client = createMockClient(sample, true);
    const collector = new RetryTelemetryCollector();

    const result = await generateVPIRGraph('integration probe', {
      client,
      collector,
      maxRetries: 2,
    });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(collector.events).toHaveLength(1);
    expect(collector.events[0].attemptNumber).toBe(1);
    expect(collector.events[0].errorCategory).toBe('other');
    expect(collector.events[0].rejectionReason).toMatch(/tool_use/i);
    expect(collector.events[0].promptHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('records zero events when generation succeeds on the first attempt', async () => {
    const sample = createSampleVPIRGraphJSON('clean-path');
    const client = createMockClient(sample, false);
    const collector = new RetryTelemetryCollector();

    const result = await generateVPIRGraph('clean-path probe', {
      client,
      collector,
    });

    expect(result.success).toBe(true);
    expect(collector.events).toHaveLength(0);
  });
});

