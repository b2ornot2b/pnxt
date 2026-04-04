/**
 * Benchmark tests — verify that ANP system meets performance expectations.
 *
 * These tests run the standard benchmark suite and assert that operations
 * complete within reasonable time bounds and produce correct results.
 */

import { BenchmarkSuite, createStandardBenchmarks } from './benchmark-suite.js';

describe('Benchmark Suite', () => {
  describe('BenchmarkSuite framework', () => {
    it('should run an empty suite', async () => {
      const suite = new BenchmarkSuite();
      const report = await suite.run();

      expect(report.results).toHaveLength(0);
      expect(report.timestamp).toBeDefined();
    });

    it('should collect timing data for a single benchmark', async () => {
      const suite = new BenchmarkSuite();
      suite.add({
        name: 'noop',
        description: 'No-op benchmark',
        iterations: 3,
        run: async () => 42,
      });

      const report = await suite.run();

      expect(report.results).toHaveLength(1);
      expect(report.results[0].name).toBe('noop');
      expect(report.results[0].iterations).toBe(3);
      expect(report.results[0].avgMs).toBeGreaterThanOrEqual(0);
      expect(report.results[0].minMs).toBeLessThanOrEqual(report.results[0].maxMs);
      expect(report.results[0].opsPerSecond).toBeGreaterThan(0);
    });
  });

  describe('Standard ANP Benchmarks', () => {
    let suite: BenchmarkSuite;

    beforeEach(() => {
      suite = createStandardBenchmarks();
    });

    it('should run all standard benchmarks without errors', async () => {
      const report = await suite.run();

      expect(report.results.length).toBeGreaterThanOrEqual(6);
      expect(report.totalDuration).toBeGreaterThan(0);

      // Every benchmark should complete successfully
      for (const result of report.results) {
        expect(result.iterations).toBeGreaterThan(0);
        expect(result.totalMs).toBeGreaterThanOrEqual(0);
        expect(result.avgMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should complete agent-registration benchmark with reasonable throughput', async () => {
      const report = await suite.run();
      const agentReg = report.results.find((r) => r.name === 'agent-registration');

      expect(agentReg).toBeDefined();
      // 100 agent registrations should complete in under 100ms average
      expect(agentReg!.avgMs).toBeLessThan(100);
    });

    it('should complete trust-calibration benchmark efficiently', async () => {
      const report = await suite.run();
      const trustCal = report.results.find((r) => r.name === 'trust-calibration');

      expect(trustCal).toBeDefined();
      // 50 events + 10 calibrations should be fast
      expect(trustCal!.avgMs).toBeLessThan(50);
    });

    it('should complete ACI invocation benchmark with audit logging', async () => {
      const report = await suite.run();
      const aciInvoke = report.results.find((r) => r.name === 'aci-invocation');

      expect(aciInvoke).toBeDefined();
      // 100 tool invocations with trust checking and audit logging
      expect(aciInvoke!.avgMs).toBeLessThan(200);
    });

    it('should complete capability-negotiation benchmark', async () => {
      const report = await suite.run();
      const capNeg = report.results.find((r) => r.name === 'capability-negotiation');

      expect(capNeg).toBeDefined();
      // 20 agents × 10 capabilities = 200 negotiations
      expect(capNeg!.avgMs).toBeLessThan(50);
    });

    it('should complete memory-store-query benchmark', async () => {
      const report = await suite.run();
      const memBench = report.results.find((r) => r.name === 'memory-store-query');

      expect(memBench).toBeDefined();
      // 50 stores + 20 queries should complete quickly
      expect(memBench!.avgMs).toBeLessThan(200);
    });

    it('should complete agent-lifecycle benchmark', async () => {
      const report = await suite.run();
      const lifecycle = report.results.find((r) => r.name === 'agent-lifecycle');

      expect(lifecycle).toBeDefined();
      // 20 full lifecycles should be fast
      expect(lifecycle!.avgMs).toBeLessThan(50);
    });
  });
});
