/**
 * Benchmark Runner — standardized harness for end-to-end paradigm benchmarks.
 *
 * Executes multi-stage pipelines with per-stage timing, structured JSON
 * reports, and configurable pass/fail criteria. The Weather API benchmark
 * is the first consumer; the harness is designed for expansion.
 *
 * Sprint 4 deliverable — Advisory Panel: Liskov (practical clarity).
 */

// ── Types ───────────────────────────────────────────────────────────

export type BenchmarkStageStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface BenchmarkStage {
  name: string;
  status: BenchmarkStageStatus;
  durationMs: number;
  data?: Record<string, unknown>;
  error?: string;
}

export interface BenchmarkRunResult {
  benchmarkId: string;
  task: string;
  passed: boolean;
  stages: BenchmarkStage[];
  totalDurationMs: number;
  outputs?: Record<string, unknown>;
  errors: string[];
  timestamp: string;
}

export interface PipelineBenchmarkReport {
  timestamp: string;
  results: BenchmarkRunResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    totalDurationMs: number;
  };
}

/**
 * A stage executor receives data from previous stages and returns
 * stage-specific data for downstream stages.
 */
export type StageExecutor = (
  stageData: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export interface BenchmarkDefinition {
  /** Unique identifier. */
  id: string;

  /** Human-readable name. */
  name: string;

  /** Natural language task description (input to the pipeline). */
  task: string;

  /** Ordered stages to execute. */
  stages: Array<{
    name: string;
    execute: StageExecutor;
  }>;

  /** Custom pass criteria evaluated after all stages complete. */
  passCriteria?: (result: BenchmarkRunResult) => boolean;

  /** Maximum execution time in milliseconds. Default: 30000. */
  timeout?: number;
}

// ── Runner ──────────────────────────────────────────────────────────

export class BenchmarkRunner {
  private definitions = new Map<string, BenchmarkDefinition>();

  /**
   * Register a benchmark definition.
   */
  register(definition: BenchmarkDefinition): void {
    if (this.definitions.has(definition.id)) {
      throw new Error(`Benchmark already registered: ${definition.id}`);
    }
    this.definitions.set(definition.id, definition);
  }

  /**
   * Run a single benchmark by ID.
   */
  async runOne(id: string): Promise<BenchmarkRunResult> {
    const def = this.definitions.get(id);
    if (!def) {
      throw new Error(`Benchmark not found: ${id}`);
    }
    return this.executeBenchmark(def);
  }

  /**
   * Run all registered benchmarks.
   */
  async runAll(): Promise<PipelineBenchmarkReport> {
    const startTime = Date.now();
    const results: BenchmarkRunResult[] = [];

    for (const def of this.definitions.values()) {
      const result = await this.executeBenchmark(def);
      results.push(result);
    }

    return {
      timestamp: new Date().toISOString(),
      results,
      summary: {
        total: results.length,
        passed: results.filter((r) => r.passed).length,
        failed: results.filter((r) => !r.passed).length,
        totalDurationMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Get the number of registered benchmarks.
   */
  get count(): number {
    return this.definitions.size;
  }

  // ── Private ───────────────────────────���─────────────────────────

  private async executeBenchmark(def: BenchmarkDefinition): Promise<BenchmarkRunResult> {
    const startTime = Date.now();
    const timeout = def.timeout ?? 30_000;
    const stages: BenchmarkStage[] = def.stages.map((s) => ({
      name: s.name,
      status: 'pending' as BenchmarkStageStatus,
      durationMs: 0,
    }));
    const errors: string[] = [];
    let stageData: Record<string, unknown> = { task: def.task };
    let failed = false;

    for (let i = 0; i < def.stages.length; i++) {
      const stageDef = def.stages[i];
      const stage = stages[i];

      if (failed) {
        stage.status = 'skipped';
        continue;
      }

      // Check timeout.
      if (Date.now() - startTime > timeout) {
        stage.status = 'failed';
        stage.error = `Benchmark timed out after ${timeout}ms`;
        errors.push(stage.error);
        failed = true;

        // Skip remaining stages.
        for (let j = i + 1; j < stages.length; j++) {
          stages[j].status = 'skipped';
        }
        break;
      }

      stage.status = 'running';
      const stageStart = Date.now();

      try {
        const result = await stageDef.execute(stageData);
        stage.durationMs = Date.now() - stageStart;
        stage.status = 'passed';
        stage.data = result;

        // Merge stage result into accumulated data for downstream stages.
        stageData = { ...stageData, ...result };
      } catch (err) {
        stage.durationMs = Date.now() - stageStart;
        stage.status = 'failed';
        stage.error = err instanceof Error ? err.message : String(err);
        errors.push(`${stage.name}: ${stage.error}`);
        failed = true;

        // Skip remaining stages.
        for (let j = i + 1; j < stages.length; j++) {
          stages[j].status = 'skipped';
        }
      }
    }

    const result: BenchmarkRunResult = {
      benchmarkId: def.id,
      task: def.task,
      passed: !failed,
      stages,
      totalDurationMs: Date.now() - startTime,
      outputs: stageData,
      errors,
      timestamp: new Date().toISOString(),
    };

    // Apply custom pass criteria if all stages passed.
    if (result.passed && def.passCriteria) {
      result.passed = def.passCriteria(result);
      if (!result.passed) {
        errors.push('Custom pass criteria failed');
      }
    }

    return result;
  }
}
