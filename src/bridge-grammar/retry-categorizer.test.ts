/**
 * Tests for the retry categorizer — 5-arm unit coverage plus a
 * 20-sample hand-labeled accuracy check (target ≥ 90%).
 *
 * Sprint 20 — M9.
 */

import { categorize } from './retry-categorizer.js';
import {
  BridgeErrorCategory,
  HANDLER_ERRORS,
  SCHEMA_ERRORS,
  SEMANTIC_ERRORS,
  TOPOLOGY_ERRORS,
  TRUNCATION_ERRORS,
  type BridgeError,
} from './bridge-errors.js';
import type { TelemetryCategory } from '../types/bridge-telemetry.js';

function err(
  category: BridgeErrorCategory,
  code: string,
  path: string,
  message = 'test error',
): BridgeError {
  return { category, code, path, message, severity: 'error' };
}

describe('categorize — single-error mapping', () => {
  it('maps SCHEMA errors to schema_violation', () => {
    const e = err(BridgeErrorCategory.SCHEMA, SCHEMA_ERRORS.MISSING_FIELD, '/nodes/0/evidence');
    expect(categorize([e])).toBe('schema_violation');
  });

  it('maps SEMANTIC/WRONG_EVIDENCE_TYPE to type_mismatch', () => {
    const e = err(
      BridgeErrorCategory.SEMANTIC,
      SEMANTIC_ERRORS.WRONG_EVIDENCE_TYPE,
      '/nodes/0/evidence/0',
    );
    expect(categorize([e])).toBe('type_mismatch');
  });

  it('maps SEMANTIC/LABEL_MISMATCH on a label path to ifc_violation', () => {
    const e = err(
      BridgeErrorCategory.SEMANTIC,
      SEMANTIC_ERRORS.LABEL_MISMATCH,
      '/nodes/0/label/trustLevel',
    );
    expect(categorize([e])).toBe('ifc_violation');
  });

  it('maps SEMANTIC/LABEL_MISMATCH on a non-label path to semantic_error', () => {
    const e = err(
      BridgeErrorCategory.SEMANTIC,
      SEMANTIC_ERRORS.LABEL_MISMATCH,
      '/nodes/0/operation',
    );
    expect(categorize([e])).toBe('semantic_error');
  });

  it('maps HANDLER/TRUST_INSUFFICIENT on a label path to ifc_violation', () => {
    const e = err(
      BridgeErrorCategory.HANDLER,
      HANDLER_ERRORS.TRUST_INSUFFICIENT,
      '/nodes/1/label',
    );
    expect(categorize([e])).toBe('ifc_violation');
  });

  it('maps HANDLER/UNKNOWN_HANDLER to semantic_error', () => {
    const e = err(
      BridgeErrorCategory.HANDLER,
      HANDLER_ERRORS.UNKNOWN_HANDLER,
      '/nodes/0/operation',
    );
    expect(categorize([e])).toBe('semantic_error');
  });

  it('maps CONFIDENCE errors to semantic_error', () => {
    const e = err(BridgeErrorCategory.CONFIDENCE, 'LOW_CONFIDENCE', '/nodes/0/evidence/0');
    expect(categorize([e])).toBe('semantic_error');
  });

  it('maps TOPOLOGY errors to other', () => {
    const e = err(BridgeErrorCategory.TOPOLOGY, TOPOLOGY_ERRORS.CYCLE_DETECTED, '/nodes');
    expect(categorize([e])).toBe('other');
  });

  it('maps TRUNCATION errors to other', () => {
    const e = err(BridgeErrorCategory.TRUNCATION, TRUNCATION_ERRORS.INCOMPLETE_JSON, '/');
    expect(categorize([e])).toBe('other');
  });

  it('maps an empty error batch to other defensively', () => {
    expect(categorize([])).toBe('other');
  });
});

describe('categorize — priority resolution with mixed batches', () => {
  it('ifc_violation wins over type_mismatch in a mixed batch', () => {
    const batch = [
      err(BridgeErrorCategory.SEMANTIC, SEMANTIC_ERRORS.WRONG_EVIDENCE_TYPE, '/nodes/0/evidence/0'),
      err(BridgeErrorCategory.SEMANTIC, SEMANTIC_ERRORS.LABEL_MISMATCH, '/nodes/0/label'),
    ];
    expect(categorize(batch)).toBe('ifc_violation');
  });

  it('type_mismatch wins over schema_violation', () => {
    const batch = [
      err(BridgeErrorCategory.SCHEMA, SCHEMA_ERRORS.MISSING_FIELD, '/nodes/0/evidence'),
      err(
        BridgeErrorCategory.SEMANTIC,
        SEMANTIC_ERRORS.ACTION_NOT_VERIFIABLE,
        '/nodes/1',
      ),
    ];
    expect(categorize(batch)).toBe('type_mismatch');
  });

  it('schema_violation wins over semantic_error', () => {
    const batch = [
      err(BridgeErrorCategory.HANDLER, HANDLER_ERRORS.UNKNOWN_HANDLER, '/nodes/0/operation'),
      err(BridgeErrorCategory.SCHEMA, SCHEMA_ERRORS.INVALID_ENUM, '/nodes/0/type'),
    ];
    expect(categorize(batch)).toBe('schema_violation');
  });
});

// ──────────────────────────────────────────────────────────────────────
// 20-sample hand-labeled accuracy test — ≥ 18/20 required (≥ 90%).
// ──────────────────────────────────────────────────────────────────────

type LabeledSample = {
  name: string;
  errors: BridgeError[];
  expected: TelemetryCategory;
};

const LABELED_SAMPLES: LabeledSample[] = [
  // --- 4 schema_violation ---
  {
    name: 'missing evidence array',
    errors: [err(BridgeErrorCategory.SCHEMA, SCHEMA_ERRORS.MISSING_FIELD, '/nodes/0/evidence')],
    expected: 'schema_violation',
  },
  {
    name: 'invalid node type enum',
    errors: [err(BridgeErrorCategory.SCHEMA, SCHEMA_ERRORS.INVALID_ENUM, '/nodes/0/type')],
    expected: 'schema_violation',
  },
  {
    name: 'invalid verifiable flag type',
    errors: [err(BridgeErrorCategory.SCHEMA, SCHEMA_ERRORS.INVALID_TYPE, '/nodes/0/verifiable')],
    expected: 'schema_violation',
  },
  {
    name: 'empty nodes array',
    errors: [err(BridgeErrorCategory.SCHEMA, SCHEMA_ERRORS.EMPTY_ARRAY, '/nodes')],
    expected: 'schema_violation',
  },

  // --- 4 type_mismatch ---
  {
    name: 'wrong evidence type',
    errors: [
      err(
        BridgeErrorCategory.SEMANTIC,
        SEMANTIC_ERRORS.WRONG_EVIDENCE_TYPE,
        '/nodes/0/evidence/0',
      ),
    ],
    expected: 'type_mismatch',
  },
  {
    name: 'action declared verifiable',
    errors: [
      err(BridgeErrorCategory.SEMANTIC, SEMANTIC_ERRORS.ACTION_NOT_VERIFIABLE, '/nodes/0'),
    ],
    expected: 'type_mismatch',
  },
  {
    name: 'observation with inputs',
    errors: [
      err(
        BridgeErrorCategory.SEMANTIC,
        SEMANTIC_ERRORS.OBSERVATION_HAS_INPUTS,
        '/nodes/1/inputs',
      ),
    ],
    expected: 'type_mismatch',
  },
  {
    name: 'inference missing evidence',
    errors: [
      err(BridgeErrorCategory.SEMANTIC, SEMANTIC_ERRORS.MISSING_EVIDENCE, '/nodes/2/evidence'),
    ],
    expected: 'type_mismatch',
  },

  // --- 4 semantic_error ---
  {
    name: 'unknown handler',
    errors: [
      err(BridgeErrorCategory.HANDLER, HANDLER_ERRORS.UNKNOWN_HANDLER, '/nodes/0/operation'),
    ],
    expected: 'semantic_error',
  },
  {
    name: 'low confidence score',
    errors: [err(BridgeErrorCategory.CONFIDENCE, 'LOW_CONFIDENCE', '/nodes/0/evidence/0')],
    expected: 'semantic_error',
  },
  {
    name: 'label mismatch off a label path (e.g. on operation)',
    errors: [
      err(
        BridgeErrorCategory.SEMANTIC,
        SEMANTIC_ERRORS.LABEL_MISMATCH,
        '/nodes/0/operation',
      ),
    ],
    expected: 'semantic_error',
  },
  {
    name: 'co-occurring missing-evidence + unknown-handler: mismatch wins on priority',
    // MISSING_EVIDENCE is a type_mismatch code, not a semantic one — so
    // this sample verifies that type_mismatch still wins in priority.
    errors: [
      err(BridgeErrorCategory.HANDLER, HANDLER_ERRORS.UNKNOWN_HANDLER, '/nodes/0/operation'),
      err(
        BridgeErrorCategory.SEMANTIC,
        SEMANTIC_ERRORS.WRONG_EVIDENCE_TYPE,
        '/nodes/0/evidence/0',
      ),
    ],
    expected: 'type_mismatch',
  },

  // --- 4 ifc_violation ---
  {
    name: 'label mismatch on /nodes/0/label',
    errors: [
      err(BridgeErrorCategory.SEMANTIC, SEMANTIC_ERRORS.LABEL_MISMATCH, '/nodes/0/label'),
    ],
    expected: 'ifc_violation',
  },
  {
    name: 'trust insufficient on /nodes/1/label',
    errors: [
      err(BridgeErrorCategory.HANDLER, HANDLER_ERRORS.TRUST_INSUFFICIENT, '/nodes/1/label'),
    ],
    expected: 'ifc_violation',
  },
  {
    name: 'label mismatch on nested trustLevel path',
    errors: [
      err(
        BridgeErrorCategory.SEMANTIC,
        SEMANTIC_ERRORS.LABEL_MISMATCH,
        '/nodes/0/label/trustLevel',
      ),
    ],
    expected: 'ifc_violation',
  },
  {
    name: 'label mismatch on /edges/0/label',
    errors: [
      err(BridgeErrorCategory.SEMANTIC, SEMANTIC_ERRORS.LABEL_MISMATCH, '/edges/0/label'),
    ],
    expected: 'ifc_violation',
  },

  // --- 4 other ---
  {
    name: 'cycle detected',
    errors: [err(BridgeErrorCategory.TOPOLOGY, TOPOLOGY_ERRORS.CYCLE_DETECTED, '/nodes')],
    expected: 'other',
  },
  {
    name: 'dangling reference',
    errors: [
      err(BridgeErrorCategory.TOPOLOGY, TOPOLOGY_ERRORS.DANGLING_REF, '/nodes/1/inputs/0'),
    ],
    expected: 'other',
  },
  {
    name: 'incomplete JSON',
    errors: [
      err(BridgeErrorCategory.TRUNCATION, TRUNCATION_ERRORS.INCOMPLETE_JSON, '/'),
    ],
    expected: 'other',
  },
  {
    name: 'no tool_use block',
    errors: [err(BridgeErrorCategory.TRUNCATION, TRUNCATION_ERRORS.NO_TOOL_USE, '/')],
    expected: 'other',
  },
];

describe('categorize — 20-sample hand-labeled accuracy', () => {
  it('classifies at least 18/20 samples correctly', () => {
    let correct = 0;
    const misses: string[] = [];
    for (const sample of LABELED_SAMPLES) {
      const actual = categorize(sample.errors);
      if (actual === sample.expected) {
        correct++;
      } else {
        misses.push(`${sample.name}: expected=${sample.expected} actual=${actual}`);
      }
    }
    if (correct < 18) {
      throw new Error(
        `Accuracy ${correct}/20 below 18/20 target. Misses:\n${misses.join('\n')}`,
      );
    }
    expect(correct).toBeGreaterThanOrEqual(18);
    expect(LABELED_SAMPLES).toHaveLength(20);
  });
});
