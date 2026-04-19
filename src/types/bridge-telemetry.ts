/**
 * Bridge Grammar Retry Telemetry types.
 *
 * Wire format for structured retry-failure records produced by the
 * bridge-grammar retry loop. Events are persisted to a telemetry log and
 * analyzed offline by `scripts/analyze-retries.ts` to inform the
 * Hindley-Milner extension decision (see `docs/research/lambda-type-system.md`
 * §7).
 *
 * Sprint 20 — M9 (Type-System Decision Data).
 */

/**
 * Five-bucket taxonomy for retry failures, mapped from `BridgeErrorCategory`
 * by `src/bridge-grammar/retry-categorizer.ts`.
 *
 * - `schema_violation`: JSON structure errors — paper bucket (a).
 * - `type_mismatch`: argument-shape / evidence-type / verifiable-action
 *   errors that an HM type extension would prevent — paper bucket (b).
 * - `semantic_error`: wrong handler, wrong prompt interpretation,
 *   missing domain context — paper bucket (c).
 * - `ifc_violation`: LABEL_MISMATCH / TRUST_INSUFFICIENT on a label path —
 *   paper bucket (d).
 * - `other`: topology, truncation, uncategorizable — paper bucket (d).
 */
export type TelemetryCategory =
  | 'schema_violation'
  | 'type_mismatch'
  | 'semantic_error'
  | 'ifc_violation'
  | 'other';

/**
 * A single retry-failure event. Flat shape — no nested objects — so the
 * persisted JSONL is trivial to stream, grep, and aggregate.
 *
 * Privacy: `responseExcerpt` is hard-capped at 200 characters before any
 * persistence call; `promptHash` is a truncated SHA-256 digest rather than
 * the raw task description.
 */
export interface RetryEvent {
  /** ISO 8601 timestamp of the failure. */
  timestamp: string;

  /** 1-based attempt number (1 = first attempt, which failed). */
  attemptNumber: number;

  /** Human-readable summary joining `[code] path: message` fragments. */
  rejectionReason: string;

  /** Five-bucket telemetry category. */
  errorCategory: TelemetryCategory;

  /** First 16 hex characters of SHA-256(taskDescription); contains no PII. */
  promptHash: string;

  /** First 200 characters of the raw tool-use JSON; hard-capped before store. */
  responseExcerpt: string;
}
