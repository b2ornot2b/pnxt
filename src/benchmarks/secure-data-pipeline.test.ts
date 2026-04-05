/**
 * Secure Data Pipeline Benchmark test suite.
 *
 * Sprint 7 — Advisory Panel: Barbara Liskov (practical clarity).
 */

import {
  createSecurePipelineVPIRGraph,
  createSecurePipelineBenchmark,
  analyzePipelineIFC,
  verifyRedactionCompleteness,
} from './secure-data-pipeline.js';
import { BenchmarkRunner } from './benchmark-runner.js';
import { validateGraph } from '../vpir/vpir-validator.js';

describe('Secure Data Pipeline Benchmark', () => {
  describe('createSecurePipelineVPIRGraph', () => {
    it('should create a graph with 6 nodes', () => {
      const graph = createSecurePipelineVPIRGraph();
      expect(graph.nodes.size).toBe(6);
      expect(graph.roots).toEqual(['data_ingestion']);
      expect(graph.terminals).toEqual(['pipeline_output']);
    });

    it('should pass VPIR validation', () => {
      const graph = createSecurePipelineVPIRGraph();
      const result = validateGraph(graph);
      expect(result.valid).toBe(true);
    });

    it('should have data_ingestion at public level', () => {
      const graph = createSecurePipelineVPIRGraph();
      const ingestion = graph.nodes.get('data_ingestion')!;
      expect(ingestion.label.classification).toBe('public');
      expect(ingestion.label.trustLevel).toBe(1);
    });

    it('should upgrade classification to confidential at classification stage', () => {
      const graph = createSecurePipelineVPIRGraph();
      const classification = graph.nodes.get('classification')!;
      expect(classification.label.classification).toBe('confidential');
    });
  });

  describe('analyzePipelineIFC', () => {
    it('should trace label progression through the pipeline', () => {
      const graph = createSecurePipelineVPIRGraph();
      const analysis = analyzePipelineIFC(graph);

      expect(analysis.labelProgression.length).toBe(6);
      expect(analysis.labelProgression[0].classification).toBe('public');
    });

    it('should detect label upgrade from public to confidential', () => {
      const graph = createSecurePipelineVPIRGraph();
      const analysis = analyzePipelineIFC(graph);

      expect(analysis.labelUpgrades.length).toBeGreaterThan(0);
      const upgrade = analysis.labelUpgrades.find(u => u.nodeId === 'classification');
      expect(upgrade).toBeDefined();
      expect(upgrade!.from).toBe('public');
      expect(upgrade!.to).toBe('confidential');
    });

    it('should have no IFC violations in the standard pipeline', () => {
      const graph = createSecurePipelineVPIRGraph();
      const analysis = analyzePipelineIFC(graph);

      expect(analysis.violations.length).toBe(0);
    });
  });

  describe('verifyRedactionCompleteness', () => {
    it('should verify no PII remains after redaction', () => {
      const graph = createSecurePipelineVPIRGraph();
      const check = verifyRedactionCompleteness(graph);

      expect(check.piiSafe).toBe(true);
      expect(check.nodesAfterRedaction.length).toBeGreaterThan(0);
      expect(check.piiFoundInNodes.length).toBe(0);
    });

    it('should find downstream nodes after redaction', () => {
      const graph = createSecurePipelineVPIRGraph();
      const check = verifyRedactionCompleteness(graph);

      // analysis, declassification_gate, and pipeline_output are downstream
      expect(check.nodesAfterRedaction).toContain('analysis');
      expect(check.nodesAfterRedaction).toContain('declassification_gate');
      expect(check.nodesAfterRedaction).toContain('pipeline_output');
    });
  });

  describe('BenchmarkRunner integration', () => {
    it('should register and run the benchmark successfully', async () => {
      const runner = new BenchmarkRunner();
      const def = createSecurePipelineBenchmark();
      runner.register(def);

      const result = await runner.runOne('secure-data-pipeline');
      expect(result.passed).toBe(true);
      expect(result.stages.every(s => s.status === 'passed')).toBe(true);
      expect(result.stages.length).toBe(5);
    }, 10000);
  });

  describe('combined benchmark suite', () => {
    it('should run delegation + pipeline benchmarks together', async () => {
      const runner = new BenchmarkRunner();
      const { createDelegationBenchmark } = await import('./multi-agent-delegation.js');

      runner.register(createDelegationBenchmark());
      runner.register(createSecurePipelineBenchmark());

      expect(runner.count).toBe(2);

      const report = await runner.runAll();
      expect(report.summary.total).toBe(2);
      expect(report.summary.passed).toBe(2);
      expect(report.summary.failed).toBe(0);
    }, 15000);
  });
});
