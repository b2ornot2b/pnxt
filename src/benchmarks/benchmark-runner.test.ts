import { BenchmarkRunner } from './benchmark-runner.js';
import type { BenchmarkDefinition } from './benchmark-runner.js';

function makeDefinition(
  id: string,
  stages?: BenchmarkDefinition['stages'],
  opts?: Partial<BenchmarkDefinition>,
): BenchmarkDefinition {
  return {
    id,
    name: `Test ${id}`,
    task: 'test task',
    stages: stages ?? [
      {
        name: 'step1',
        execute: async (data) => ({ input: data.task, processed: true }),
      },
      {
        name: 'step2',
        execute: async (data) => ({ result: `done-${data.input}` }),
      },
    ],
    ...opts,
  };
}

describe('BenchmarkRunner', () => {
  describe('registration', () => {
    it('should register benchmark definitions', () => {
      const runner = new BenchmarkRunner();
      runner.register(makeDefinition('bench1'));
      expect(runner.count).toBe(1);
    });

    it('should reject duplicate IDs', () => {
      const runner = new BenchmarkRunner();
      runner.register(makeDefinition('bench1'));
      expect(() => runner.register(makeDefinition('bench1'))).toThrow('already registered');
    });

    it('should register multiple benchmarks', () => {
      const runner = new BenchmarkRunner();
      runner.register(makeDefinition('a'));
      runner.register(makeDefinition('b'));
      runner.register(makeDefinition('c'));
      expect(runner.count).toBe(3);
    });
  });

  describe('runOne', () => {
    it('should execute all stages in order', async () => {
      const runner = new BenchmarkRunner();
      const executionOrder: string[] = [];

      runner.register(makeDefinition('ordered', [
        { name: 'first', execute: async () => { executionOrder.push('first'); return {}; } },
        { name: 'second', execute: async () => { executionOrder.push('second'); return {}; } },
        { name: 'third', execute: async () => { executionOrder.push('third'); return {}; } },
      ]));

      await runner.runOne('ordered');
      expect(executionOrder).toEqual(['first', 'second', 'third']);
    });

    it('should time each stage independently', async () => {
      const runner = new BenchmarkRunner();
      runner.register(makeDefinition('timed', [
        {
          name: 'slow',
          execute: async () => {
            await new Promise((r) => setTimeout(r, 50));
            return {};
          },
        },
        {
          name: 'fast',
          execute: async () => ({}),
        },
      ]));

      const result = await runner.runOne('timed');
      expect(result.stages[0].durationMs).toBeGreaterThanOrEqual(40);
      expect(result.stages[1].durationMs).toBeLessThan(result.stages[0].durationMs);
    });

    it('should mark stages as passed on success', async () => {
      const runner = new BenchmarkRunner();
      runner.register(makeDefinition('pass'));

      const result = await runner.runOne('pass');
      expect(result.passed).toBe(true);
      expect(result.stages.every((s) => s.status === 'passed')).toBe(true);
    });

    it('should mark stages as failed on error', async () => {
      const runner = new BenchmarkRunner();
      runner.register(makeDefinition('fail', [
        { name: 'ok', execute: async () => ({}) },
        { name: 'broken', execute: async () => { throw new Error('boom'); } },
      ]));

      const result = await runner.runOne('fail');
      expect(result.passed).toBe(false);
      expect(result.stages[0].status).toBe('passed');
      expect(result.stages[1].status).toBe('failed');
      expect(result.stages[1].error).toBe('boom');
    });

    it('should skip subsequent stages after failure', async () => {
      const runner = new BenchmarkRunner();
      runner.register(makeDefinition('skip', [
        { name: 'ok', execute: async () => ({}) },
        { name: 'broken', execute: async () => { throw new Error('fail'); } },
        { name: 'skipped', execute: async () => ({}) },
      ]));

      const result = await runner.runOne('skip');
      expect(result.stages[2].status).toBe('skipped');
    });

    it('should return structured JSON report', async () => {
      const runner = new BenchmarkRunner();
      runner.register(makeDefinition('report'));

      const result = await runner.runOne('report');
      expect(result.benchmarkId).toBe('report');
      expect(result.task).toBe('test task');
      expect(result.timestamp).toBeDefined();
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.stages)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should pass stage data downstream', async () => {
      const runner = new BenchmarkRunner();
      let receivedData: unknown;

      runner.register(makeDefinition('chain', [
        { name: 'produce', execute: async () => ({ value: 42 }) },
        { name: 'consume', execute: async (data) => { receivedData = data.value; return {}; } },
      ]));

      await runner.runOne('chain');
      expect(receivedData).toBe(42);
    });

    it('should throw for unknown benchmark ID', async () => {
      const runner = new BenchmarkRunner();
      await expect(runner.runOne('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('runAll', () => {
    it('should run all registered benchmarks', async () => {
      const runner = new BenchmarkRunner();
      runner.register(makeDefinition('a'));
      runner.register(makeDefinition('b'));

      const report = await runner.runAll();
      expect(report.results).toHaveLength(2);
      expect(report.summary.total).toBe(2);
    });

    it('should produce summary with pass/fail counts', async () => {
      const runner = new BenchmarkRunner();
      runner.register(makeDefinition('pass'));
      runner.register(makeDefinition('fail', [
        { name: 'broken', execute: async () => { throw new Error('fail'); } },
      ]));

      const report = await runner.runAll();
      expect(report.summary.passed).toBe(1);
      expect(report.summary.failed).toBe(1);
    });

    it('should continue after individual benchmark failure', async () => {
      const runner = new BenchmarkRunner();
      runner.register(makeDefinition('fail-first', [
        { name: 'broken', execute: async () => { throw new Error('fail'); } },
      ]));
      runner.register(makeDefinition('pass-second'));

      const report = await runner.runAll();
      expect(report.results).toHaveLength(2);
      expect(report.results[0].passed).toBe(false);
      expect(report.results[1].passed).toBe(true);
    });
  });

  describe('pass criteria', () => {
    it('should use custom criteria function', async () => {
      const runner = new BenchmarkRunner();
      runner.register(makeDefinition('custom', undefined, {
        passCriteria: (result) => result.outputs?.processed === true,
      }));

      const result = await runner.runOne('custom');
      expect(result.passed).toBe(true);
    });

    it('should fail when criteria returns false', async () => {
      const runner = new BenchmarkRunner();
      runner.register(makeDefinition('custom-fail', undefined, {
        passCriteria: () => false,
      }));

      const result = await runner.runOne('custom-fail');
      expect(result.passed).toBe(false);
      expect(result.errors).toContain('Custom pass criteria failed');
    });
  });
});
