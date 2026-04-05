/**
 * Tests for Error Recovery Benchmark.
 *
 * Sprint 12 — Advisory Panel: Sutskever, Pearl, de Moura.
 */

import {
  createErrorRecoveryScenarios,
  runScenario,
  runAllErrorRecoveryBenchmarks,
} from './error-recovery-benchmark.js';
import { BridgeErrorCategory } from '../bridge-grammar/bridge-errors.js';

describe('Error Recovery Benchmark', () => {
  describe('scenarios', () => {
    it('should define all 7 scenarios', () => {
      const scenarios = createErrorRecoveryScenarios();
      expect(scenarios).toHaveLength(7);
    });

    it('should cover all error categories', () => {
      const scenarios = createErrorRecoveryScenarios();
      const categories = new Set<BridgeErrorCategory>();
      for (const s of scenarios) {
        for (const cat of s.expectedCategories) {
          categories.add(cat);
        }
      }

      expect(categories.has(BridgeErrorCategory.TRUNCATION)).toBe(true);
      expect(categories.has(BridgeErrorCategory.SCHEMA)).toBe(true);
      expect(categories.has(BridgeErrorCategory.HANDLER)).toBe(true);
      expect(categories.has(BridgeErrorCategory.TOPOLOGY)).toBe(true);
    });
  });

  describe('individual scenarios', () => {
    const scenarios = createErrorRecoveryScenarios();

    it('should diagnose truncated JSON correctly', () => {
      const scenario = scenarios.find((s) => s.name === 'truncated-json')!;
      const result = runScenario(scenario);

      expect(result.diagnosisCorrect).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should diagnose missing fields correctly', () => {
      const scenario = scenarios.find((s) => s.name === 'missing-fields')!;
      const result = runScenario(scenario);

      expect(result.diagnosisCorrect).toBe(true);
      expect(result.errorCount).toBeGreaterThan(0);
    });

    it('should detect invalid handler references', () => {
      const scenario = scenarios.find((s) => s.name === 'invalid-handlers')!;
      const result = runScenario(scenario);

      expect(result.diagnosisCorrect).toBe(true);
    });

    it('should detect cyclic graphs', () => {
      const scenario = scenarios.find((s) => s.name === 'cyclic-graph')!;
      const result = runScenario(scenario);

      expect(result.diagnosisCorrect).toBe(true);
      expect(result.postRepairValid).toBe(false); // Cycles can't be auto-repaired
    });

    it('should repair wrong enum values', () => {
      const scenario = scenarios.find((s) => s.name === 'wrong-enums')!;
      const result = runScenario(scenario);

      expect(result.diagnosisCorrect).toBe(true);
      expect(result.repairCount).toBeGreaterThan(0);
    });

    it('should handle mixed valid/invalid nodes', () => {
      const scenario = scenarios.find((s) => s.name === 'mixed-validity')!;
      const result = runScenario(scenario);

      expect(result.diagnosisCorrect).toBe(true);
      expect(result.repairCount).toBeGreaterThan(0);
    });

    it('should repair duplicate node IDs', () => {
      const scenario = scenarios.find((s) => s.name === 'duplicate-ids')!;
      const result = runScenario(scenario);

      expect(result.diagnosisCorrect).toBe(true);
      expect(result.repairCount).toBeGreaterThan(0);
    });
  });

  describe('full benchmark run', () => {
    it('should run all scenarios and produce a report', () => {
      const report = runAllErrorRecoveryBenchmarks();

      expect(report.totalScenarios).toBe(7);
      expect(report.results).toHaveLength(7);
      expect(report.totalDurationMs).toBeGreaterThanOrEqual(0);

      // At least most diagnoses should be correct
      expect(report.correctDiagnoses).toBeGreaterThanOrEqual(5);
    });

    it('should have timing data for all scenarios', () => {
      const report = runAllErrorRecoveryBenchmarks();

      for (const result of report.results) {
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        expect(typeof result.errorCount).toBe('number');
        expect(typeof result.repairCount).toBe('number');
      }
    });
  });
});
