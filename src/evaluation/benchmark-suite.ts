/**
 * Benchmark Suite — standardized benchmarks for evaluating ANP implementations.
 *
 * Provides a framework for measuring performance characteristics of the ANP
 * system under controlled conditions. Each benchmark case has a setup phase,
 * a timed execution phase, and assertions on the results.
 */

import type { TrustLevel } from '../types/agent.js';
import { InMemoryAgentRuntime } from '../agent/agent-runtime.js';
import { InMemoryTrustEngine } from '../trust/trust-engine.js';
import { InMemoryACIGateway, InMemoryAuditLogger } from '../aci/aci-gateway.js';
import { InMemoryCapabilityNegotiation } from '../capability/capability-negotiation.js';
import { InMemoryMemoryService } from '../memory/memory-service.js';
import { makeAgentConfig, makeToolRegistration, makeOfferedCapability } from './multi-agent-scenarios.js';

/**
 * A single benchmark case.
 */
export interface BenchmarkCase {
  name: string;
  description: string;
  /** Number of iterations to run for statistical significance. */
  iterations: number;
  /** The benchmark function. Returns an arbitrary result for validation. */
  run: () => Promise<unknown>;
}

/**
 * Result of a single benchmark case.
 */
export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  opsPerSecond: number;
}

/**
 * Full benchmark report.
 */
export interface BenchmarkReport {
  timestamp: string;
  results: BenchmarkResult[];
  totalDuration: number;
}

/**
 * Runs benchmark cases and collects timing data.
 */
export class BenchmarkSuite {
  private cases: BenchmarkCase[] = [];

  add(benchmarkCase: BenchmarkCase): void {
    this.cases.push(benchmarkCase);
  }

  async run(): Promise<BenchmarkReport> {
    const suiteStart = Date.now();
    const results: BenchmarkResult[] = [];

    for (const bc of this.cases) {
      const timings: number[] = [];

      for (let i = 0; i < bc.iterations; i++) {
        const start = performance.now();
        await bc.run();
        timings.push(performance.now() - start);
      }

      const totalMs = timings.reduce((a, b) => a + b, 0);
      const avgMs = totalMs / bc.iterations;
      const minMs = Math.min(...timings);
      const maxMs = Math.max(...timings);

      results.push({
        name: bc.name,
        iterations: bc.iterations,
        totalMs,
        avgMs,
        minMs,
        maxMs,
        opsPerSecond: 1000 / avgMs,
      });
    }

    return {
      timestamp: new Date().toISOString(),
      results,
      totalDuration: Date.now() - suiteStart,
    };
  }
}

/**
 * Create the standard ANP benchmark suite.
 */
export function createStandardBenchmarks(): BenchmarkSuite {
  const suite = new BenchmarkSuite();

  // --- Agent Registration Throughput ---
  suite.add({
    name: 'agent-registration',
    description: 'Register 100 agents sequentially',
    iterations: 5,
    run: async () => {
      const runtime = new InMemoryAgentRuntime();
      for (let i = 0; i < 100; i++) {
        await runtime.register(
          makeAgentConfig({ id: `agent-${i}`, name: `Agent ${i}`, type: 'coding' }),
        );
      }
      return runtime.listAgents().length;
    },
  });

  // --- Trust Calibration ---
  suite.add({
    name: 'trust-calibration',
    description: 'Record 50 events and calibrate trust for 10 agents',
    iterations: 10,
    run: async () => {
      const engine = new InMemoryTrustEngine();
      const now = new Date().toISOString();

      for (let i = 0; i < 10; i++) {
        engine.registerAgent(`agent-${i}`, 1);
        for (let j = 0; j < 5; j++) {
          engine.recordEvent({
            agentId: `agent-${i}`,
            reason: j % 3 === 0 ? 'task_failure' : 'task_success',
            timestamp: now,
          });
        }
        engine.calibrate(`agent-${i}`);
      }
    },
  });

  // --- ACI Gateway Invocations ---
  suite.add({
    name: 'aci-invocation',
    description: 'Invoke a tool 100 times through the ACI gateway with trust checking',
    iterations: 5,
    run: async () => {
      const trust = new InMemoryTrustEngine();
      trust.registerAgent('bench-agent', 2);
      const logger = new InMemoryAuditLogger();

      const gateway = new InMemoryACIGateway({
        trustResolver: (id) => trust.getTrustLevel(id),
        auditLogger: logger,
      });

      gateway.registerTool(
        makeToolRegistration('bench.tool', ['file_read']),
        async () => ({ ok: true }),
      );

      for (let i = 0; i < 100; i++) {
        await gateway.invoke({
          toolName: 'bench.tool',
          input: { i },
          agentId: 'bench-agent',
          requestId: `req-${i}`,
        });
      }

      return logger.getEvents().length;
    },
  });

  // --- Capability Negotiation ---
  suite.add({
    name: 'capability-negotiation',
    description: 'Negotiate capabilities for 20 agents with 10 offered capabilities each',
    iterations: 10,
    run: async () => {
      const trust = new InMemoryTrustEngine();
      const caps = new InMemoryCapabilityNegotiation({
        trustResolver: (id) => trust.getTrustLevel(id),
      });

      for (let c = 0; c < 10; c++) {
        caps.registerOfferedCapability(
          makeOfferedCapability(`op.${c}`, (c % 5) as TrustLevel),
        );
      }

      for (let a = 0; a < 20; a++) {
        trust.registerAgent(`agent-${a}`, (a % 5) as TrustLevel);
        caps.negotiate({
          agentId: `agent-${a}`,
          requested: Array.from({ length: 10 }, (_, c) => ({
            operation: `op.${c}`,
            minVersion: { major: 1, minor: 0, patch: 0 },
          })),
        });
      }
    },
  });

  // --- Memory Store and Query ---
  suite.add({
    name: 'memory-store-query',
    description: 'Store 50 memories then query 20 times',
    iterations: 5,
    run: async () => {
      const memory = new InMemoryMemoryService();
      const now = new Date().toISOString();

      const topics = ['auth', 'api', 'database', 'testing', 'deployment'];
      for (let i = 0; i < 50; i++) {
        await memory.store({
          type: i % 2 === 0 ? 'semantic' : 'episodic',
          content: `Memory entry ${i} about ${topics[i % 5]} implementation details`,
          metadata: {
            source: `agent-${i % 5}`,
            confidence: 0.7 + Math.random() * 0.3,
            topics: [topics[i % 5]],
            entities: [`agent-${i % 5}`],
            timestamp: now,
          },
        });
      }

      let totalResults = 0;
      for (let q = 0; q < 20; q++) {
        const results = await memory.query({
          text: topics[q % 5],
          limit: 10,
        });
        totalResults += results.length;
      }

      return totalResults;
    },
  });

  // --- Full Agent Lifecycle ---
  suite.add({
    name: 'agent-lifecycle',
    description: 'Full agent lifecycle: register, transition through all states, terminate',
    iterations: 10,
    run: async () => {
      const runtime = new InMemoryAgentRuntime();

      for (let i = 0; i < 20; i++) {
        const config = makeAgentConfig({
          id: `lifecycle-${i}`,
          name: `Lifecycle Agent ${i}`,
          type: 'coding',
        });
        await runtime.register(config);
        await runtime.transition(`lifecycle-${i}`, 'initializing');
        await runtime.transition(`lifecycle-${i}`, 'ready');
        await runtime.transition(`lifecycle-${i}`, 'active');
        await runtime.transition(`lifecycle-${i}`, 'completing');
        await runtime.terminate(`lifecycle-${i}`);
      }

      return runtime.listAgents().length;
    },
  });

  return suite;
}
