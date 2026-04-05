/**
 * Tests for Bridge Grammar Error Taxonomy.
 *
 * Sprint 12 — Sutskever, Pearl, de Moura.
 */

import {
  BridgeErrorCategory,
  HANDLER_ERRORS,
  TRUNCATION_ERRORS,
  classifyError,
  diagnoseTruncation,
  diagnoseHandlerErrors,
  diagnose,
  formatDiagnosisForLLM,
} from './bridge-errors.js';
import type { BridgeGrammarError } from '../types/bridge-grammar.js';

describe('BridgeErrorCategory', () => {
  it('should define all six categories', () => {
    expect(BridgeErrorCategory.SCHEMA).toBe('schema');
    expect(BridgeErrorCategory.SEMANTIC).toBe('semantic');
    expect(BridgeErrorCategory.HANDLER).toBe('handler');
    expect(BridgeErrorCategory.TOPOLOGY).toBe('topology');
    expect(BridgeErrorCategory.TRUNCATION).toBe('truncation');
    expect(BridgeErrorCategory.CONFIDENCE).toBe('confidence');
  });
});

describe('classifyError', () => {
  it('should classify INVALID_FIELD as schema error', () => {
    const err: BridgeGrammarError = {
      code: 'INVALID_FIELD',
      path: '/id',
      message: '"id" must be a non-empty string',
    };
    const result = classifyError(err);
    expect(result.category).toBe(BridgeErrorCategory.SCHEMA);
    expect(result.severity).toBe('error');
    expect(result.repairHint).toContain('id');
  });

  it('should classify INVALID_ENUM as schema error with hint', () => {
    const err: BridgeGrammarError = {
      code: 'INVALID_ENUM',
      path: '/type',
      message: '"type" must be one of: inference, observation, action, assertion, composition',
    };
    const result = classifyError(err);
    expect(result.category).toBe(BridgeErrorCategory.SCHEMA);
    expect(result.repairHint).toContain('observation');
  });

  it('should classify DUPLICATE_NODE_ID as topology error', () => {
    const err: BridgeGrammarError = {
      code: 'DUPLICATE_NODE_ID',
      path: '/nodes/2/id',
      message: 'Duplicate node ID: "observe-input"',
    };
    const result = classifyError(err);
    expect(result.category).toBe(BridgeErrorCategory.TOPOLOGY);
    expect(result.repairHint).toContain('unique');
  });

  it('should classify VPIR_CYCLE as topology error', () => {
    const err: BridgeGrammarError = {
      code: 'VPIR_CYCLE',
      path: '',
      message: 'Cycle detected in graph',
    };
    const result = classifyError(err);
    expect(result.category).toBe(BridgeErrorCategory.TOPOLOGY);
    expect(result.repairHint).toContain('DAG');
  });

  it('should classify VPIR_DANGLING_REF as topology error', () => {
    const err: BridgeGrammarError = {
      code: 'VPIR_DANGLING_REF',
      path: '',
      message: 'Node references non-existent node',
    };
    const result = classifyError(err);
    expect(result.category).toBe(BridgeErrorCategory.TOPOLOGY);
  });

  it('should classify VPIR_ prefixed semantic errors as semantic', () => {
    const err: BridgeGrammarError = {
      code: 'VPIR_MISSING_EVIDENCE',
      path: '',
      message: 'Node has no evidence',
    };
    const result = classifyError(err);
    expect(result.category).toBe(BridgeErrorCategory.SEMANTIC);
  });

  it('should classify EMPTY_NODES as schema error', () => {
    const err: BridgeGrammarError = {
      code: 'EMPTY_NODES',
      path: '/nodes',
      message: 'Graph must have at least one node',
    };
    const result = classifyError(err);
    expect(result.category).toBe(BridgeErrorCategory.SCHEMA);
    expect(result.repairHint).toContain('at least one node');
  });

  it('should provide repair hint for missing label', () => {
    const err: BridgeGrammarError = {
      code: 'INVALID_FIELD',
      path: '/nodes/0/label',
      message: '"label" must be a non-empty string',
    };
    const result = classifyError(err);
    expect(result.repairHint).toContain('label');
    expect(result.repairHint).toContain('owner');
  });

  it('should provide repair hint for missing createdAt', () => {
    const err: BridgeGrammarError = {
      code: 'INVALID_FIELD',
      path: '/createdAt',
      message: '"createdAt" must be a non-empty string',
    };
    const result = classifyError(err);
    expect(result.repairHint).toContain('ISO 8601');
  });
});

describe('diagnoseTruncation', () => {
  it('should detect empty output', () => {
    const errors = diagnoseTruncation('');
    expect(errors).toHaveLength(1);
    expect(errors[0].category).toBe(BridgeErrorCategory.TRUNCATION);
    expect(errors[0].code).toBe(TRUNCATION_ERRORS.INCOMPLETE_JSON);
  });

  it('should detect unclosed braces', () => {
    const errors = diagnoseTruncation('{"id": "test", "nodes": [');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('unclosed');
  });

  it('should pass valid JSON structure', () => {
    const errors = diagnoseTruncation('{"id": "test", "nodes": []}');
    expect(errors).toHaveLength(0);
  });

  it('should handle strings with braces correctly', () => {
    const errors = diagnoseTruncation('{"msg": "hello { world }"}');
    expect(errors).toHaveLength(0);
  });

  it('should handle escaped quotes in strings', () => {
    const errors = diagnoseTruncation('{"msg": "say \\"hello\\""}');
    expect(errors).toHaveLength(0);
  });
});

describe('diagnoseHandlerErrors', () => {
  it('should create errors for missing handlers', () => {
    const errors = diagnoseHandlerErrors(
      ['unknown-tool', 'missing-handler'],
      ['http-fetch', 'json-transform'],
    );
    expect(errors).toHaveLength(2);
    expect(errors[0].category).toBe(BridgeErrorCategory.HANDLER);
    expect(errors[0].code).toBe(HANDLER_ERRORS.UNKNOWN_HANDLER);
    expect(errors[0].repairHint).toContain('http-fetch');
  });

  it('should return empty for no missing handlers', () => {
    const errors = diagnoseHandlerErrors([], ['http-fetch']);
    expect(errors).toHaveLength(0);
  });
});

describe('diagnose', () => {
  it('should produce clean diagnosis for no errors', () => {
    const result = diagnose([]);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.repairable).toBe(false);
    expect(result.summary).toBe('No errors detected.');
  });

  it('should classify and group validation errors', () => {
    const errors: BridgeGrammarError[] = [
      { code: 'INVALID_FIELD', path: '/id', message: 'Missing id' },
      { code: 'DUPLICATE_NODE_ID', path: '/nodes/1/id', message: 'Duplicate' },
    ];
    const result = diagnose(errors);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].category).toBe(BridgeErrorCategory.SCHEMA);
    expect(result.errors[1].category).toBe(BridgeErrorCategory.TOPOLOGY);
    expect(result.summary).toContain('2 error(s)');
  });

  it('should mark repairable when all errors are fixable', () => {
    const errors: BridgeGrammarError[] = [
      { code: 'MISSING_FIELD', path: '/createdAt', message: 'Missing createdAt' },
      { code: 'INVALID_ENUM', path: '/type', message: 'Invalid type' },
    ];
    const result = diagnose(errors);
    expect(result.repairable).toBe(true);
    expect(result.summary).toContain('auto-repairable');
  });

  it('should mark not repairable when any error is not fixable', () => {
    const errors: BridgeGrammarError[] = [
      { code: 'MISSING_FIELD', path: '/createdAt', message: 'Missing' },
      { code: 'VPIR_CYCLE', path: '', message: 'Cycle' },
    ];
    const result = diagnose(errors);
    expect(result.repairable).toBe(false);
  });

  it('should include truncation errors from raw output', () => {
    const result = diagnose([], { rawOutput: '{"incomplete": ' });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.category === BridgeErrorCategory.TRUNCATION)).toBe(true);
  });

  it('should include handler errors', () => {
    const result = diagnose([], {
      missingHandlers: ['fake-tool'],
      availableHandlers: ['http-fetch'],
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].category).toBe(BridgeErrorCategory.HANDLER);
  });
});

describe('formatDiagnosisForLLM', () => {
  it('should return simple message for no errors', () => {
    const diagnosis = diagnose([]);
    const formatted = formatDiagnosisForLLM(diagnosis);
    expect(formatted).toBe('No errors found.');
  });

  it('should format errors grouped by category', () => {
    const errors: BridgeGrammarError[] = [
      { code: 'INVALID_FIELD', path: '/id', message: 'Missing id' },
      { code: 'INVALID_FIELD', path: '/name', message: 'Missing name' },
      { code: 'DUPLICATE_NODE_ID', path: '/nodes/1/id', message: 'Duplicate node' },
    ];
    const diagnosis = diagnose(errors);
    const formatted = formatDiagnosisForLLM(diagnosis);

    expect(formatted).toContain('SCHEMA errors:');
    expect(formatted).toContain('TOPOLOGY errors:');
    expect(formatted).toContain('Missing id');
    expect(formatted).toContain('Fix:');
  });

  it('should include repair hints in formatted output', () => {
    const errors: BridgeGrammarError[] = [
      { code: 'INVALID_ENUM', path: '/type', message: 'Invalid type' },
    ];
    const diagnosis = diagnose(errors);
    const formatted = formatDiagnosisForLLM(diagnosis);

    expect(formatted).toContain('Fix:');
    expect(formatted).toContain('observation');
  });
});
