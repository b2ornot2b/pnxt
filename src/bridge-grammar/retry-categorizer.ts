/**
 * Retry Categorizer — pure mapping from `BridgeError[]` to `TelemetryCategory`.
 *
 * Reads the already-structured `BridgeError.category` field (produced by
 * `classifyError()` in `./bridge-errors.ts`) and projects it onto the
 * five-bucket telemetry taxonomy used for the M9 histogram. No I/O, no
 * re-parsing of error strings, no side effects — fully deterministic.
 *
 * The mapping intentionally elevates `SEMANTIC/LABEL_MISMATCH` or
 * `HANDLER/TRUST_INSUFFICIENT` on a `label`-bearing path to
 * `ifc_violation`, separating security-label drift from HM-preventable
 * type mismatches.
 *
 * Sprint 20 — M9.
 */

import type { TelemetryCategory } from '../types/bridge-telemetry.js';
import {
  BridgeErrorCategory,
  HANDLER_ERRORS,
  SEMANTIC_ERRORS,
  type BridgeError,
} from './bridge-errors.js';

/**
 * Semantic codes that an HM type extension would structurally prevent —
 * argument-shape, verifiable-action, and evidence-presence errors.
 */
const TYPE_MISMATCH_CODES = new Set<string>([
  SEMANTIC_ERRORS.WRONG_EVIDENCE_TYPE,
  SEMANTIC_ERRORS.ACTION_NOT_VERIFIABLE,
  SEMANTIC_ERRORS.OBSERVATION_HAS_INPUTS,
  SEMANTIC_ERRORS.MISSING_EVIDENCE,
]);

/**
 * Codes that indicate an IFC label-propagation failure when they occur on
 * a `label`-bearing JSON path.
 */
const IFC_CODES = new Set<string>([
  SEMANTIC_ERRORS.LABEL_MISMATCH,
  HANDLER_ERRORS.TRUST_INSUFFICIENT,
]);

/**
 * Map a structured bridge error onto a single telemetry category.
 *
 * Priority (highest first):
 * 1. IFC: any error whose code is in `IFC_CODES` and whose path contains
 *    a `label` segment.
 * 2. SCHEMA → `schema_violation`.
 * 3. SEMANTIC type-mismatch codes → `type_mismatch`.
 * 4. Remaining SEMANTIC / HANDLER / CONFIDENCE → `semantic_error`.
 * 5. TOPOLOGY / TRUNCATION / unknown → `other`.
 */
function classifySingle(error: BridgeError): TelemetryCategory {
  if (IFC_CODES.has(error.code) && pathContainsLabel(error.path)) {
    return 'ifc_violation';
  }

  switch (error.category) {
    case BridgeErrorCategory.SCHEMA:
      return 'schema_violation';
    case BridgeErrorCategory.SEMANTIC:
      if (TYPE_MISMATCH_CODES.has(error.code)) {
        return 'type_mismatch';
      }
      return 'semantic_error';
    case BridgeErrorCategory.HANDLER:
      return 'semantic_error';
    case BridgeErrorCategory.CONFIDENCE:
      return 'semantic_error';
    case BridgeErrorCategory.TOPOLOGY:
    case BridgeErrorCategory.TRUNCATION:
    default:
      return 'other';
  }
}

/**
 * Categorize a batch of validation errors from a single retry attempt.
 *
 * When the batch contains heterogeneous categories, the first bucket
 * encountered in priority order wins: `ifc_violation` > `type_mismatch` >
 * `schema_violation` > `semantic_error` > `other`. This ordering reflects
 * the decision-framework priorities from
 * `docs/research/lambda-type-system.md` §7 — IFC drift is the most
 * actionable signal, HM-preventable mismatches next, and so on.
 *
 * An empty error array returns `other` defensively — the caller should
 * never invoke the categorizer on a successful validation, but if it
 * does, no telemetry bucket is a reasonable fit.
 */
export function categorize(errors: BridgeError[]): TelemetryCategory {
  if (errors.length === 0) {
    return 'other';
  }

  const categories = errors.map(classifySingle);
  const priority: TelemetryCategory[] = [
    'ifc_violation',
    'type_mismatch',
    'schema_violation',
    'semantic_error',
    'other',
  ];
  for (const candidate of priority) {
    if (categories.includes(candidate)) {
      return candidate;
    }
  }
  return 'other';
}

function pathContainsLabel(path: string): boolean {
  return path.split('/').some((segment) => segment === 'label');
}
