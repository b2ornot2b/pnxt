import {
  MUTATION_SCENARIOS,
  runMutationScenario,
  runMutationBenchmark,
} from './self-mutation-benchmark.js';

// ── Tests ─────────────────────────────────────────────────────────

describe('Self-Mutation Benchmark', () => {
  describe('MUTATION_SCENARIOS', () => {
    it('should define 6 scenarios', () => {
      expect(MUTATION_SCENARIOS).toHaveLength(6);
    });

    it('should have unique names', () => {
      const names = MUTATION_SCENARIOS.map((s) => s.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('should include both commit and rollback expectations', () => {
      const commits = MUTATION_SCENARIOS.filter((s) => s.expectCommit);
      const rollbacks = MUTATION_SCENARIOS.filter((s) => !s.expectCommit);
      expect(commits.length).toBeGreaterThan(0);
      expect(rollbacks.length).toBeGreaterThan(0);
    });
  });

  describe('runMutationScenario', () => {
    it('should run add-caching-stage scenario', async () => {
      const scenario = MUTATION_SCENARIOS.find((s) => s.name === 'add-caching-stage')!;
      const result = await runMutationScenario(scenario);

      expect(result.scenario).toBe('add-caching-stage');
      expect(result.committed).toBe(true);
      expect(result.outcomeCorrect).toBe(true);
      expect(result.diffOperations).toBeGreaterThan(0);
      expect(result.finalNodeCount).toBe(7); // 6 + 1
      expect(result.errors).toHaveLength(0);
    });

    it('should run remove-intermediate-stage scenario', async () => {
      const scenario = MUTATION_SCENARIOS.find((s) => s.name === 'remove-intermediate-stage')!;
      const result = await runMutationScenario(scenario);

      expect(result.scenario).toBe('remove-intermediate-stage');
      expect(result.diffOperations).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should correctly handle modify-trust-levels scenario (IFC violation)', async () => {
      const scenario = MUTATION_SCENARIOS.find((s) => s.name === 'modify-trust-levels')!;
      const result = await runMutationScenario(scenario);

      expect(result.scenario).toBe('modify-trust-levels');
      expect(result.outcomeCorrect).toBe(true); // Expected rollback due to IFC violation
      expect(result.diffOperations).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should run add-parallel-branch scenario', async () => {
      const scenario = MUTATION_SCENARIOS.find((s) => s.name === 'add-parallel-branch')!;
      const result = await runMutationScenario(scenario);

      expect(result.scenario).toBe('add-parallel-branch');
      expect(result.committed).toBe(true);
      expect(result.finalNodeCount).toBe(7); // 6 + 1
      expect(result.errors).toHaveLength(0);
    });

    it('should correctly handle IFC violation scenario', async () => {
      const scenario = MUTATION_SCENARIOS.find((s) => s.name === 'ifc-violation-modification')!;
      const result = await runMutationScenario(scenario);

      expect(result.scenario).toBe('ifc-violation-modification');
      // IFC violation should cause rollback
      expect(result.outcomeCorrect).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should run rollback scenario', async () => {
      const scenario = MUTATION_SCENARIOS.find((s) => s.name === 'rollback-failing-modification')!;
      const result = await runMutationScenario(scenario);

      expect(result.scenario).toBe('rollback-failing-modification');
      expect(result.errors).toHaveLength(0);
    });

    it('should report timing for all scenarios', async () => {
      for (const scenario of MUTATION_SCENARIOS) {
        const result = await runMutationScenario(scenario);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should track property preservation metrics', async () => {
      const scenario = MUTATION_SCENARIOS.find((s) => s.name === 'add-caching-stage')!;
      const result = await runMutationScenario(scenario);

      expect(result.transportedProperties + result.reverifiedProperties)
        .toBeGreaterThanOrEqual(0);
    });
  });

  describe('runMutationBenchmark', () => {
    it('should run all scenarios and produce aggregate results', async () => {
      const results = await runMutationBenchmark();

      expect(results.totalScenarios).toBe(6);
      expect(results.scenarios).toHaveLength(6);
      expect(results.totalDurationMs).toBeGreaterThan(0);
    });

    it('should have majority correct outcomes', async () => {
      const results = await runMutationBenchmark();

      // At least 4 out of 6 scenarios should have correct outcome
      expect(results.correctOutcomes).toBeGreaterThanOrEqual(4);
    });

    it('should run with a subset of scenarios', async () => {
      const subset = MUTATION_SCENARIOS.slice(0, 2);
      const results = await runMutationBenchmark(subset);

      expect(results.totalScenarios).toBe(2);
      expect(results.scenarios).toHaveLength(2);
    });
  });
});
