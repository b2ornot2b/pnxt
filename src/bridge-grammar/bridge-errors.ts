/**
 * Bridge Grammar Error Taxonomy — typed error hierarchy for LLM output failures.
 *
 * Provides structured, machine-readable error classification with repair hints
 * for programmatic error handling. Extends the base BridgeGrammarError with
 * categories, severity levels, and actionable feedback for LLM retry loops.
 *
 * Sprint 12 deliverable — Advisory Panel: Sutskever, Pearl, de Moura.
 */

import type { BridgeGrammarError } from '../types/bridge-grammar.js';

// ── Error Categories ────────────────────────────────────────────────

/**
 * Categories of bridge grammar failures, from structural to semantic.
 */
export enum BridgeErrorCategory {
  /** JSON structure violations (missing fields, wrong types). */
  SCHEMA = 'schema',
  /** Valid JSON but invalid VPIR semantics (wrong evidence types, etc.). */
  SEMANTIC = 'semantic',
  /** References to non-existent tool handlers. */
  HANDLER = 'handler',
  /** Graph structure issues (cycles, dangling refs, missing roots). */
  TOPOLOGY = 'topology',
  /** Partial or incomplete LLM output. */
  TRUNCATION = 'truncation',
  /** Confidence scores below threshold. */
  CONFIDENCE = 'confidence',
}

// ── Structured Error ────────────────────────────────────────────────

/**
 * A structured bridge grammar error with category, severity, and repair hints.
 */
export interface BridgeError {
  /** Error category for programmatic handling. */
  category: BridgeErrorCategory;
  /** Machine-readable error code (e.g., 'MISSING_FIELD', 'INVALID_NODE_REF'). */
  code: string;
  /** JSON pointer path to the offending field. */
  path: string;
  /** Human-readable error description. */
  message: string;
  /** Actionable fix suggestion for LLM retry feedback. */
  repairHint?: string;
  /** Whether this is a blocking error or a warning. */
  severity: 'error' | 'warning';
}

// ── Diagnosis Result ────────────────────────────────────────────────

/**
 * Complete diagnosis of a bridge grammar output, grouping errors by severity.
 */
export interface BridgeDiagnosis {
  /** Blocking errors that prevent execution. */
  errors: BridgeError[];
  /** Non-blocking warnings (quality issues, low confidence). */
  warnings: BridgeError[];
  /** Whether auto-repair can resolve all errors. */
  repairable: boolean;
  /** One-line summary for LLM feedback. */
  summary: string;
}

// ── Error Code Constants ────────────────────────────────────────────

/** Schema error codes. */
export const SCHEMA_ERRORS = {
  MISSING_FIELD: 'MISSING_FIELD',
  INVALID_TYPE: 'INVALID_TYPE',
  INVALID_ENUM: 'INVALID_ENUM',
  INVALID_RANGE: 'INVALID_RANGE',
  EMPTY_ARRAY: 'EMPTY_ARRAY',
} as const;

/** Semantic error codes. */
export const SEMANTIC_ERRORS = {
  WRONG_EVIDENCE_TYPE: 'WRONG_EVIDENCE_TYPE',
  ACTION_NOT_VERIFIABLE: 'ACTION_NOT_VERIFIABLE',
  OBSERVATION_HAS_INPUTS: 'OBSERVATION_HAS_INPUTS',
  MISSING_EVIDENCE: 'MISSING_EVIDENCE',
  LABEL_MISMATCH: 'LABEL_MISMATCH',
} as const;

/** Handler error codes. */
export const HANDLER_ERRORS = {
  UNKNOWN_HANDLER: 'UNKNOWN_HANDLER',
  TRUST_INSUFFICIENT: 'TRUST_INSUFFICIENT',
} as const;

/** Topology error codes. */
export const TOPOLOGY_ERRORS = {
  CYCLE_DETECTED: 'CYCLE_DETECTED',
  DANGLING_REF: 'DANGLING_REF',
  MISSING_ROOTS: 'MISSING_ROOTS',
  MISSING_TERMINALS: 'MISSING_TERMINALS',
  DUPLICATE_NODE_ID: 'DUPLICATE_NODE_ID',
  ORPHAN_NODE: 'ORPHAN_NODE',
} as const;

/** Truncation error codes. */
export const TRUNCATION_ERRORS = {
  INCOMPLETE_JSON: 'INCOMPLETE_JSON',
  MISSING_NODES: 'MISSING_NODES',
  NO_TOOL_USE: 'NO_TOOL_USE',
} as const;

// ── Repairable Codes ────────────────────────────────────────────────

/**
 * Error codes that the auto-repair engine can attempt to fix.
 */
const REPAIRABLE_CODES = new Set<string>([
  SCHEMA_ERRORS.MISSING_FIELD,
  SCHEMA_ERRORS.INVALID_ENUM,
  TOPOLOGY_ERRORS.MISSING_ROOTS,
  TOPOLOGY_ERRORS.MISSING_TERMINALS,
  TOPOLOGY_ERRORS.DUPLICATE_NODE_ID,
  TRUNCATION_ERRORS.INCOMPLETE_JSON,
]);

// ── Category Detection ──────────────────────────────────────────────

/**
 * Map a BridgeGrammarError code to a BridgeErrorCategory.
 */
function categorizeErrorCode(code: string): BridgeErrorCategory {
  if (code.startsWith('VPIR_')) {
    const inner = code.slice(5);
    if (inner === 'CYCLE' || inner === 'DANGLING_REF' || inner === 'ORPHAN_NODE') {
      return BridgeErrorCategory.TOPOLOGY;
    }
    return BridgeErrorCategory.SEMANTIC;
  }

  if (Object.values(SCHEMA_ERRORS).includes(code as typeof SCHEMA_ERRORS[keyof typeof SCHEMA_ERRORS])) {
    return BridgeErrorCategory.SCHEMA;
  }
  if (Object.values(SEMANTIC_ERRORS).includes(code as typeof SEMANTIC_ERRORS[keyof typeof SEMANTIC_ERRORS])) {
    return BridgeErrorCategory.SEMANTIC;
  }
  if (Object.values(HANDLER_ERRORS).includes(code as typeof HANDLER_ERRORS[keyof typeof HANDLER_ERRORS])) {
    return BridgeErrorCategory.HANDLER;
  }
  if (Object.values(TOPOLOGY_ERRORS).includes(code as typeof TOPOLOGY_ERRORS[keyof typeof TOPOLOGY_ERRORS])) {
    return BridgeErrorCategory.TOPOLOGY;
  }
  if (Object.values(TRUNCATION_ERRORS).includes(code as typeof TRUNCATION_ERRORS[keyof typeof TRUNCATION_ERRORS])) {
    return BridgeErrorCategory.TRUNCATION;
  }

  // Existing codes from schema-validator.ts
  if (code === 'INVALID_FIELD' || code === 'EMPTY_NODES') {
    return BridgeErrorCategory.SCHEMA;
  }
  if (code === 'DUPLICATE_NODE_ID') {
    return BridgeErrorCategory.TOPOLOGY;
  }

  return BridgeErrorCategory.SCHEMA;
}

/**
 * Generate a repair hint for a given error code and path.
 */
function generateRepairHint(code: string, path: string, message: string): string | undefined {
  switch (code) {
    case SCHEMA_ERRORS.MISSING_FIELD:
    case 'INVALID_FIELD': {
      const field = path.split('/').pop() ?? '';
      if (field === 'createdAt') return 'Add a "createdAt" field with an ISO 8601 timestamp.';
      if (field === 'id') return 'Add a unique "id" string field.';
      if (field === 'label') return 'Add a "label" object with owner, trustLevel, classification, createdAt.';
      if (field === 'evidence') return 'Add an "evidence" array with at least one entry.';
      if (field === 'roots') return 'Add a "roots" array with IDs of nodes that have no inputs.';
      if (field === 'terminals') return 'Add a "terminals" array with IDs of leaf nodes.';
      return `Add the missing "${field}" field.`;
    }
    case SCHEMA_ERRORS.INVALID_ENUM:
    case 'INVALID_ENUM':
      if (path.includes('type')) {
        return 'Node type must be one of: observation, inference, action, assertion, composition.';
      }
      if (path.includes('classification')) {
        return 'Classification must be one of: public, internal, confidential, restricted, external.';
      }
      return undefined;
    case TOPOLOGY_ERRORS.MISSING_ROOTS:
      return 'Ensure at least one node has an empty inputs array and is listed in roots.';
    case TOPOLOGY_ERRORS.MISSING_TERMINALS:
      return 'Ensure at least one node is listed in terminals.';
    case TOPOLOGY_ERRORS.DUPLICATE_NODE_ID:
    case 'DUPLICATE_NODE_ID':
      return 'Each node must have a unique ID. Rename duplicate nodes.';
    case TOPOLOGY_ERRORS.DANGLING_REF:
    case 'VPIR_DANGLING_REF':
      return 'Node references a non-existent nodeId in its inputs. Check that all referenced nodes exist.';
    case TOPOLOGY_ERRORS.CYCLE_DETECTED:
    case 'VPIR_CYCLE':
      return 'The graph contains a cycle. VPIR graphs must be directed acyclic graphs (DAGs).';
    case HANDLER_ERRORS.UNKNOWN_HANDLER:
      return `The operation references an unknown handler. ${message}`;
    case TRUNCATION_ERRORS.INCOMPLETE_JSON:
      return 'The JSON output appears truncated. Ensure the full graph is emitted.';
    case TRUNCATION_ERRORS.NO_TOOL_USE:
      return 'No tool_use block was found in the response. Use the emit_vpir_graph tool.';
    case 'EMPTY_NODES':
      return 'The graph must contain at least one node.';
    default:
      return undefined;
  }
}

// ── Diagnosis Functions ─────────────────────────────────────────────

/**
 * Classify a BridgeGrammarError into a structured BridgeError.
 */
export function classifyError(error: BridgeGrammarError): BridgeError {
  const category = categorizeErrorCode(error.code);
  const repairHint = generateRepairHint(error.code, error.path, error.message);

  return {
    category,
    code: error.code,
    path: error.path,
    message: error.message,
    repairHint,
    severity: 'error',
  };
}

/**
 * Diagnose raw LLM output for truncation issues before parsing.
 *
 * Detects incomplete JSON, missing brackets, and other truncation artifacts.
 */
export function diagnoseTruncation(raw: string): BridgeError[] {
  const errors: BridgeError[] = [];

  if (!raw || raw.trim().length === 0) {
    errors.push({
      category: BridgeErrorCategory.TRUNCATION,
      code: TRUNCATION_ERRORS.INCOMPLETE_JSON,
      path: '',
      message: 'Empty output received',
      repairHint: 'The LLM produced no output. Retry the generation.',
      severity: 'error',
    });
    return errors;
  }

  // Check for unbalanced braces/brackets
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escape = false;

  for (const ch of raw) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') braceCount++;
    else if (ch === '}') braceCount--;
    else if (ch === '[') bracketCount++;
    else if (ch === ']') bracketCount--;
  }

  if (braceCount > 0 || bracketCount > 0) {
    errors.push({
      category: BridgeErrorCategory.TRUNCATION,
      code: TRUNCATION_ERRORS.INCOMPLETE_JSON,
      path: '',
      message: `Unbalanced JSON: ${braceCount} unclosed braces, ${bracketCount} unclosed brackets`,
      repairHint: 'The JSON output appears truncated. Ensure the full graph is emitted.',
      severity: 'error',
    });
  }

  return errors;
}

/**
 * Diagnose handler availability errors from a tool discovery result.
 */
export function diagnoseHandlerErrors(
  missingHandlers: string[],
  availableHandlers: string[],
): BridgeError[] {
  return missingHandlers.map((handler) => ({
    category: BridgeErrorCategory.HANDLER,
    code: HANDLER_ERRORS.UNKNOWN_HANDLER,
    path: '',
    message: `Unknown handler: "${handler}"`,
    repairHint: `Use one of the available handlers: ${availableHandlers.join(', ')}`,
    severity: 'error' as const,
  }));
}

/**
 * Produce a full diagnosis from BridgeGrammarErrors and optional handler/truncation issues.
 */
export function diagnose(
  validationErrors: BridgeGrammarError[],
  options?: {
    missingHandlers?: string[];
    availableHandlers?: string[];
    rawOutput?: string;
  },
): BridgeDiagnosis {
  const classified: BridgeError[] = validationErrors.map(classifyError);

  // Add truncation errors if raw output is available
  if (options?.rawOutput) {
    classified.push(...diagnoseTruncation(options.rawOutput));
  }

  // Add handler errors
  if (options?.missingHandlers && options.missingHandlers.length > 0) {
    classified.push(
      ...diagnoseHandlerErrors(
        options.missingHandlers,
        options.availableHandlers ?? [],
      ),
    );
  }

  const errors = classified.filter((e) => e.severity === 'error');
  const warnings = classified.filter((e) => e.severity === 'warning');

  const repairable = errors.length > 0 &&
    errors.every((e) => REPAIRABLE_CODES.has(e.code));

  const categoryCounts = new Map<BridgeErrorCategory, number>();
  for (const e of errors) {
    categoryCounts.set(e.category, (categoryCounts.get(e.category) ?? 0) + 1);
  }

  const parts: string[] = [];
  for (const [cat, count] of categoryCounts) {
    parts.push(`${count} ${cat}`);
  }

  const summary = errors.length === 0
    ? 'No errors detected.'
    : `${errors.length} error(s): ${parts.join(', ')}${repairable ? ' (auto-repairable)' : ''}.`;

  return { errors, warnings, repairable, summary };
}

/**
 * Format a diagnosis into structured LLM feedback for retry.
 *
 * Produces a concise, actionable error report suitable for inclusion in
 * retry messages to the LLM.
 */
export function formatDiagnosisForLLM(diagnosis: BridgeDiagnosis): string {
  if (diagnosis.errors.length === 0) {
    return 'No errors found.';
  }

  const lines: string[] = [`${diagnosis.summary}\n`];

  // Group by category for clarity
  const byCategory = new Map<BridgeErrorCategory, BridgeError[]>();
  for (const e of diagnosis.errors) {
    const list = byCategory.get(e.category) ?? [];
    list.push(e);
    byCategory.set(e.category, list);
  }

  for (const [category, errs] of byCategory) {
    lines.push(`## ${category.toUpperCase()} errors:`);
    for (const e of errs) {
      const pathStr = e.path ? ` at ${e.path}` : '';
      lines.push(`- [${e.code}]${pathStr}: ${e.message}`);
      if (e.repairHint) {
        lines.push(`  Fix: ${e.repairHint}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
