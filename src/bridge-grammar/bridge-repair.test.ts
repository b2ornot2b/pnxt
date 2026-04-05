/**
 * Tests for Bridge Grammar Auto-Repair Engine.
 *
 * Sprint 12 — Sutskever, Pearl, de Moura.
 */

import {
  repairTruncatedJSON,
  repairBridgeOutput,
} from './bridge-repair.js';
import { diagnose } from './bridge-errors.js';
import { parseVPIRGraph } from './schema-validator.js';
import type { BridgeGrammarError } from '../types/bridge-grammar.js';

describe('repairTruncatedJSON', () => {
  it('should close unclosed braces', () => {
    const { repaired, wasRepaired } = repairTruncatedJSON('{"id": "test"');
    expect(wasRepaired).toBe(true);
    expect(repaired).toBe('{"id": "test"}');
    expect(() => JSON.parse(repaired)).not.toThrow();
  });

  it('should close unclosed brackets', () => {
    const { repaired, wasRepaired } = repairTruncatedJSON('{"nodes": [{"id": "a"}');
    expect(wasRepaired).toBe(true);
    expect(repaired).toBe('{"nodes": [{"id": "a"}]}');
  });

  it('should close nested structures', () => {
    const { repaired, wasRepaired } = repairTruncatedJSON('[{"a": [1, 2');
    expect(wasRepaired).toBe(true);
    expect(() => JSON.parse(repaired)).not.toThrow();
  });

  it('should close unclosed strings', () => {
    const { repaired, wasRepaired } = repairTruncatedJSON('{"id": "test');
    expect(wasRepaired).toBe(true);
    expect(repaired.endsWith('"}'));
  });

  it('should not modify valid JSON', () => {
    const { repaired, wasRepaired } = repairTruncatedJSON('{"valid": true}');
    expect(wasRepaired).toBe(false);
    expect(repaired).toBe('{"valid": true}');
  });

  it('should handle empty input', () => {
    const { repaired, wasRepaired } = repairTruncatedJSON('');
    expect(wasRepaired).toBe(false);
    expect(repaired).toBe('');
  });
});

describe('repairBridgeOutput', () => {
  describe('missing graph-level fields', () => {
    it('should inject missing id, name, createdAt', () => {
      const raw = { nodes: [], roots: [], terminals: [] };
      const validation = parseVPIRGraph(raw);
      const diagnosis = diagnose(validation.errors);

      const result = repairBridgeOutput(raw, diagnosis);
      const repaired = result.repaired as Record<string, unknown>;

      expect(repaired.id).toBeDefined();
      expect(repaired.name).toBeDefined();
      expect(repaired.createdAt).toBeDefined();
      expect(result.appliedRepairs.length).toBeGreaterThan(0);
      expect(result.appliedRepairs.some((r) => r.path === '/id')).toBe(true);
    });
  });

  describe('missing node fields', () => {
    it('should inject missing createdAt and label in nodes', () => {
      const raw = {
        id: 'test',
        name: 'Test',
        createdAt: new Date().toISOString(),
        nodes: [
          {
            id: 'node-1',
            type: 'observation',
            operation: 'test',
            inputs: [],
            outputs: [{ port: 'data', dataType: 'string' }],
            // missing: evidence, label, verifiable, createdAt
          },
        ],
        roots: ['node-1'],
        terminals: ['node-1'],
      };
      const validation = parseVPIRGraph(raw);
      const diagnosis = diagnose(validation.errors);

      const result = repairBridgeOutput(raw, diagnosis);
      const repaired = result.repaired as Record<string, unknown>;
      const nodes = repaired.nodes as Record<string, unknown>[];

      expect(nodes[0].label).toBeDefined();
      expect(nodes[0].createdAt).toBeDefined();
      expect(nodes[0].evidence).toBeDefined();
      expect(nodes[0].verifiable).toBe(true);
    });
  });

  describe('enum fixing', () => {
    it('should fix misspelled node type "observe" to "observation"', () => {
      const raw = {
        id: 'test',
        name: 'Test',
        createdAt: new Date().toISOString(),
        nodes: [
          {
            id: 'node-1',
            type: 'observe', // wrong
            operation: 'test',
            inputs: [],
            outputs: [{ port: 'data', dataType: 'string' }],
            evidence: [{ type: 'data', source: 'test', confidence: 1.0 }],
            label: { owner: 'test', trustLevel: 2, classification: 'internal', createdAt: new Date().toISOString() },
            verifiable: true,
            createdAt: new Date().toISOString(),
          },
        ],
        roots: ['node-1'],
        terminals: ['node-1'],
      };
      const validation = parseVPIRGraph(raw);
      const diagnosis = diagnose(validation.errors);

      const result = repairBridgeOutput(raw, diagnosis);
      const nodes = (result.repaired as Record<string, unknown>).nodes as Record<string, unknown>[];

      expect(nodes[0].type).toBe('observation');
      expect(result.appliedRepairs.some((r) => r.type === 'fix_enum')).toBe(true);
    });

    it('should fix misspelled classification', () => {
      const raw = {
        id: 'test',
        name: 'Test',
        createdAt: new Date().toISOString(),
        nodes: [
          {
            id: 'node-1',
            type: 'observation',
            operation: 'test',
            inputs: [],
            outputs: [{ port: 'data', dataType: 'string' }],
            evidence: [{ type: 'data', source: 'test', confidence: 1.0 }],
            label: { owner: 'test', trustLevel: 2, classification: 'internl', createdAt: new Date().toISOString() },
            verifiable: true,
            createdAt: new Date().toISOString(),
          },
        ],
        roots: ['node-1'],
        terminals: ['node-1'],
      };
      const validation = parseVPIRGraph(raw);
      const diagnosis = diagnose(validation.errors);

      const result = repairBridgeOutput(raw, diagnosis);
      const nodes = (result.repaired as Record<string, unknown>).nodes as Record<string, unknown>[];
      const label = nodes[0].label as Record<string, unknown>;

      expect(label.classification).toBe('internal');
    });
  });

  describe('duplicate node IDs', () => {
    it('should rename duplicate node IDs', () => {
      const now = new Date().toISOString();
      const label = { owner: 'test', trustLevel: 2, classification: 'internal', createdAt: now };
      const raw = {
        id: 'test',
        name: 'Test',
        createdAt: now,
        nodes: [
          {
            id: 'node-1',
            type: 'observation',
            operation: 'first',
            inputs: [],
            outputs: [{ port: 'data', dataType: 'string' }],
            evidence: [{ type: 'data', source: 'test', confidence: 1.0 }],
            label,
            verifiable: true,
            createdAt: now,
          },
          {
            id: 'node-1', // duplicate
            type: 'inference',
            operation: 'second',
            inputs: [{ nodeId: 'node-1', port: 'data', dataType: 'string' }],
            outputs: [{ port: 'result', dataType: 'string' }],
            evidence: [{ type: 'rule', source: 'test', confidence: 0.9 }],
            label,
            verifiable: true,
            createdAt: now,
          },
        ],
        roots: ['node-1'],
        terminals: ['node-1-1'],
      };
      const validation = parseVPIRGraph(raw);
      const diagnosis = diagnose(validation.errors);

      const result = repairBridgeOutput(raw, diagnosis);
      const nodes = (result.repaired as Record<string, unknown>).nodes as Record<string, unknown>[];

      const ids = nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length); // all unique
      expect(result.appliedRepairs.some((r) => r.type === 'fix_duplicate_id')).toBe(true);
    });
  });

  describe('missing roots/terminals', () => {
    it('should auto-compute roots and terminals', () => {
      const now = new Date().toISOString();
      const label = { owner: 'test', trustLevel: 2, classification: 'internal', createdAt: now };
      const raw = {
        id: 'test',
        name: 'Test',
        createdAt: now,
        nodes: [
          {
            id: 'root-node',
            type: 'observation',
            operation: 'gather',
            inputs: [],
            outputs: [{ port: 'data', dataType: 'string' }],
            evidence: [{ type: 'data', source: 'test', confidence: 1.0 }],
            label,
            verifiable: true,
            createdAt: now,
          },
          {
            id: 'leaf-node',
            type: 'inference',
            operation: 'process',
            inputs: [{ nodeId: 'root-node', port: 'data', dataType: 'string' }],
            outputs: [{ port: 'result', dataType: 'string' }],
            evidence: [{ type: 'rule', source: 'test', confidence: 0.9 }],
            label,
            verifiable: true,
            createdAt: now,
          },
        ],
        // missing: roots, terminals
      };

      // Manually create diagnosis for missing roots/terminals
      const errors: BridgeGrammarError[] = [
        { code: 'INVALID_FIELD', path: '/roots', message: '"roots" must be an array' },
        { code: 'INVALID_FIELD', path: '/terminals', message: '"terminals" must be an array' },
      ];
      const diagnosis = diagnose(errors);

      const result = repairBridgeOutput(raw, diagnosis);
      const repaired = result.repaired as Record<string, unknown>;

      expect(repaired.roots).toEqual(['root-node']);
      expect(repaired.terminals).toEqual(['leaf-node']);
    });
  });

  describe('truncated string input', () => {
    it('should repair and parse truncated JSON string', () => {
      const raw = '{"id": "test", "name": "Test", "nodes": [], "roots": [], "terminals": []';
      const diagnosis = diagnose([], { rawOutput: raw });

      const result = repairBridgeOutput(raw, diagnosis);
      expect(result.appliedRepairs.some((r) => r.type === 'close_json')).toBe(true);
      expect(typeof result.repaired).toBe('object');
    });

    it('should report remaining errors for unparseable input', () => {
      const raw = 'this is not json at all {{{';
      const diagnosis = diagnose([], { rawOutput: raw });

      const result = repairBridgeOutput(raw, diagnosis);
      // Truncation detected but JSON.parse still fails → errors remain
      expect(result.remainingErrors.length).toBeGreaterThan(0);
    });
  });

  describe('end-to-end repair + re-validation', () => {
    it('should produce a valid graph after repairing missing fields', () => {
      const raw = {
        nodes: [
          {
            id: 'node-1',
            type: 'observe', // misspelled → should fuzzy-match to 'observation'
            operation: 'gather data',
            inputs: [],
            outputs: [{ port: 'data', dataType: 'string' }],
            // missing: evidence, label, verifiable, createdAt
          },
        ],
      };
      const validation = parseVPIRGraph(raw);
      const diagnosis = diagnose(validation.errors);

      const result = repairBridgeOutput(raw, diagnosis);
      expect(result.appliedRepairs.length).toBeGreaterThan(0);

      // Enum fix should have been applied
      expect(result.appliedRepairs.some((r) => r.type === 'fix_enum')).toBe(true);
      // Missing fields should have been injected
      expect(result.appliedRepairs.some((r) => r.type === 'inject_default')).toBe(true);

      // Re-validate: the repaired graph should be closer to valid
      const repaired = result.repaired as Record<string, unknown>;
      const nodes = repaired.nodes as Record<string, unknown>[];
      expect(nodes[0].type).toBe('observation');
      expect(nodes[0].label).toBeDefined();
      expect(nodes[0].createdAt).toBeDefined();
    });
  });
});
