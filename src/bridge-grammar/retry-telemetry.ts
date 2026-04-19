/**
 * Retry Telemetry Collector — persists structured retry-failure events for
 * offline analysis.
 *
 * The collector is injected into `generateVPIRGraph` via
 * `VPIRGeneratorOptions.collector`. When present, every failed retry
 * attempt produces one `RetryEvent` that is categorized (via
 * `retry-categorizer.ts`) and appended to a pluggable sink. When absent,
 * behavior is identical to the pre-Sprint-20 generator (backward
 * compatible).
 *
 * Two sinks are provided:
 * - `InMemorySink` — records events in a local array; used by tests and by
 *   the default `collector.events` accessor.
 * - `JsonlFileSink` — appends one JSON line per event to a file on disk;
 *   O(1) per event, suitable for long-running production-like runs.
 *
 * Persistence failures are swallowed with a console warning: a telemetry
 * write must never abort a generation attempt.
 *
 * Sprint 20 — M9 (Type-System Decision Data).
 */

import { createHash } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { RetryEvent } from '../types/bridge-telemetry.js';

/**
 * Hard cap on `responseExcerpt` length in characters.
 *
 * A 200-character prefix of a tool-use JSON payload starts with
 * `{"nodes":[...` and cannot structurally contain an Anthropic API key
 * (which would appear only in request headers, never in tool output).
 * The cap is nonetheless enforced defensively.
 */
export const RESPONSE_EXCERPT_LIMIT = 200;

/**
 * Pluggable sink for persisted telemetry events.
 */
export interface TelemetrySink {
  append(event: RetryEvent): Promise<void>;
}

/**
 * In-memory sink — records events in a local array. Used by tests and by
 * the collector's default `events` accessor.
 */
export class InMemorySink implements TelemetrySink {
  readonly events: RetryEvent[] = [];

  async append(event: RetryEvent): Promise<void> {
    this.events.push(event);
  }
}

/**
 * JSONL file sink — appends one JSON object per line to `filePath`.
 *
 * Creates parent directories on first write. O(1) per append (unlike
 * `FileStorageBackend`, which rewrites the entire file on every call).
 */
export class JsonlFileSink implements TelemetrySink {
  private readonly filePath: string;
  private initialized = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async append(event: RetryEvent): Promise<void> {
    if (!this.initialized) {
      await mkdir(dirname(this.filePath), { recursive: true });
      this.initialized = true;
    }
    await appendFile(this.filePath, `${JSON.stringify(event)}\n`, 'utf-8');
  }
}

/**
 * Options for constructing a `RetryTelemetryCollector`.
 */
export interface RetryTelemetryCollectorOptions {
  /** Where to persist each event. Defaults to an `InMemorySink`. */
  sink?: TelemetrySink;
}

/**
 * Arguments for recording a single retry failure.
 */
export interface RecordRetryArgs {
  attemptNumber: number;
  rejectionReason: string;
  errorCategory: RetryEvent['errorCategory'];
  taskDescription: string;
  rawResponse?: string;
}

/**
 * Collects one `RetryEvent` per failed retry attempt and persists it via
 * the configured sink.
 *
 * Usage from `generateVPIRGraph`:
 *
 * ```ts
 * const collector = new RetryTelemetryCollector({
 *   sink: new JsonlFileSink('logs/bridge-telemetry.jsonl'),
 * });
 * await generateVPIRGraph(task, { collector });
 * ```
 *
 * After a run, inspect `collector.events` for in-memory access or point
 * `scripts/analyze-retries.ts` at the JSONL file for histogram analysis.
 */
export class RetryTelemetryCollector {
  private readonly sink: TelemetrySink;
  private readonly memory: InMemorySink;

  constructor(options: RetryTelemetryCollectorOptions = {}) {
    this.memory = new InMemorySink();
    this.sink = options.sink ?? this.memory;
  }

  /**
   * Every event passed to `record()` is mirrored into the in-memory log,
   * regardless of which external sink is configured. Exposed primarily
   * for tests and for programmatic summaries during a single run.
   */
  get events(): readonly RetryEvent[] {
    return this.memory.events;
  }

  async record(args: RecordRetryArgs): Promise<void> {
    const event: RetryEvent = {
      timestamp: new Date().toISOString(),
      attemptNumber: args.attemptNumber,
      rejectionReason: args.rejectionReason,
      errorCategory: args.errorCategory,
      promptHash: hashPrompt(args.taskDescription),
      responseExcerpt: truncateExcerpt(args.rawResponse ?? ''),
    };

    // Always record in memory so `events` reflects every recorded attempt,
    // even when the external sink fails.
    if (this.sink !== this.memory) {
      await this.memory.append(event);
    }

    try {
      await this.sink.append(event);
    } catch (error) {
      console.warn('[retry-telemetry] sink append failed:', error);
    }
  }
}

/**
 * SHA-256 of the task description, truncated to 16 hex characters.
 *
 * 16 hex chars = 64 bits of entropy — enough to disambiguate distinct
 * prompts across a corpus of thousands of events without ever persisting
 * the raw prompt text.
 */
export function hashPrompt(taskDescription: string): string {
  return createHash('sha256').update(taskDescription).digest('hex').slice(0, 16);
}

/**
 * Truncate a raw response to the first `RESPONSE_EXCERPT_LIMIT` chars.
 */
export function truncateExcerpt(rawResponse: string): string {
  if (rawResponse.length <= RESPONSE_EXCERPT_LIMIT) {
    return rawResponse;
  }
  return rawResponse.slice(0, RESPONSE_EXCERPT_LIMIT);
}
