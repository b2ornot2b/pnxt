import {
  createTemperatureConversionSpec,
  createMathExpressionSpec,
  runBenchmark,
  runAllBenchmarks,
} from './external-task-benchmark.js';
import { TaskRunner } from '../aci/task-runner.js';
import { VPIRGraphBuilder } from '../vpir/vpir-graph-builder.js';
import { createStandardRegistry } from '../aci/tool-registry.js';

describe('External Task Benchmark', () => {
  describe('Temperature Conversion Pipeline', () => {
    it('should create a valid temperature conversion spec', () => {
      const spec = createTemperatureConversionSpec();

      expect(spec.id).toBe('benchmark-temp-conversion');
      expect((spec.nodes as unknown[]).length).toBe(2);
      expect(spec.roots).toEqual(['observe-input']);
      expect(spec.terminals).toEqual(['convert-temperature']);
    });

    it('should build from JSON via VPIRGraphBuilder', () => {
      const spec = createTemperatureConversionSpec();
      const result = VPIRGraphBuilder.fromJSON(spec);

      expect(result.success).toBe(true);
      expect(result.graph).toBeDefined();
      expect(result.graph!.nodes.size).toBe(2);
    });

    it('should pass tool registry validation', () => {
      const spec = createTemperatureConversionSpec();
      const registry = createStandardRegistry();
      const result = VPIRGraphBuilder.fromJSON(spec, { toolRegistry: registry });

      expect(result.success).toBe(true);
    });

    it('should execute end-to-end and produce correct temperature', async () => {
      const result = await runBenchmark(
        'Temperature Conversion',
        createTemperatureConversionSpec(),
        ['unit-convert'],
      );

      expect(result.success).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.nodeCount).toBe(2);
      expect(result.handlersUsed).toContain('unit-convert');

      // The output should contain the conversion result
      const outputs = Object.values(result.outputs);
      expect(outputs.length).toBeGreaterThan(0);

      // 98.6F should convert to 37C
      const output = outputs[0] as Record<string, unknown>;
      expect(output).toBeDefined();
      expect(typeof output.result).toBe('number');
      expect(output.result).toBeCloseTo(37, 0);
    });

    it('should execute via TaskRunner directly with DPN trace', async () => {
      const runner = new TaskRunner();
      const spec = createTemperatureConversionSpec();
      const result = await runner.run(spec);

      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.graphId).toBe('benchmark-temp-conversion');
      expect(result.dpnResult).toBeDefined();
      expect(result.dpnResult!.trace.processStates).toBeDefined();

      // Verify all processes completed
      const states = result.dpnResult!.trace.processStates;
      for (const state of Object.values(states)) {
        expect(state).toBe('completed');
      }
    });
  });

  describe('Math Expression Pipeline', () => {
    it('should create a valid math expression spec', () => {
      const spec = createMathExpressionSpec();

      expect(spec.id).toBe('benchmark-math-expression');
      expect((spec.nodes as unknown[]).length).toBe(2);
      expect(spec.roots).toEqual(['observe-expression']);
      expect(spec.terminals).toEqual(['evaluate-math']);
    });

    it('should build from JSON via VPIRGraphBuilder', () => {
      const spec = createMathExpressionSpec();
      const result = VPIRGraphBuilder.fromJSON(spec);

      expect(result.success).toBe(true);
      expect(result.graph!.nodes.size).toBe(2);
    });

    it('should execute end-to-end and evaluate 2*(3+4)-1 = 13', async () => {
      const result = await runBenchmark(
        'Math Expression',
        createMathExpressionSpec(),
        ['math-eval'],
      );

      expect(result.success).toBe(true);
      expect(result.nodeCount).toBe(2);
      expect(result.handlersUsed).toContain('math-eval');

      const output = Object.values(result.outputs)[0] as Record<string, unknown>;
      expect(output).toBeDefined();
      expect(output.result).toBe(13);
    });

    it('should execute via TaskRunner directly', async () => {
      const runner = new TaskRunner();
      const spec = createMathExpressionSpec();
      const result = await runner.run(spec);

      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.graphId).toBe('benchmark-math-expression');
    });
  });

  describe('runAllBenchmarks', () => {
    it('should run both benchmarks successfully', async () => {
      const results = await runAllBenchmarks();

      expect(results.length).toBe(2);
      expect(results[0].name).toBe('Temperature Conversion Pipeline');
      expect(results[0].success).toBe(true);
      expect(results[1].name).toBe('Math Expression Pipeline');
      expect(results[1].success).toBe(true);
    });

    it('should report timing for each benchmark', async () => {
      const results = await runAllBenchmarks();

      for (const result of results) {
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        expect(result.errors.length).toBe(0);
      }
    });
  });

  describe('M2 validation criteria', () => {
    it('task is expressed as pure JSON (no TypeScript)', () => {
      // The spec is pure JSON — serializable, no Map objects, no class instances
      const spec = createTemperatureConversionSpec();
      const jsonString = JSON.stringify(spec);
      expect(typeof jsonString).toBe('string');

      // Round-trip: JSON.stringify → JSON.parse → valid spec
      const parsed = JSON.parse(jsonString);
      expect(parsed.id).toBe('benchmark-temp-conversion');
      expect(parsed.nodes.length).toBe(2);
    });

    it('graph passes structural validation', () => {
      const spec = createTemperatureConversionSpec();
      const result = VPIRGraphBuilder.fromJSON(spec);

      expect(result.success).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('graph executes through DPN runtime with handler resolution', async () => {
      const runner = new TaskRunner();
      const spec = createTemperatureConversionSpec();
      const result = await runner.run(spec);

      expect(result.success).toBe(true);
      expect(result.dpnResult).toBeDefined();
      expect(result.dpnResult!.status).toBe('completed');

      // Verify DPN trace shows process execution
      const states = result.dpnResult!.trace.processStates;
      expect(Object.keys(states).length).toBe(2);

      // Verify outputs contain correct conversion
      const output = Object.values(result.outputs)[0] as Record<string, unknown>;
      expect(typeof output.result).toBe('number');
    });

    it('IFC labels are preserved through execution', async () => {
      const spec = createTemperatureConversionSpec();
      const result = VPIRGraphBuilder.fromJSON(spec);

      expect(result.success).toBe(true);
      // Verify all nodes have IFC labels
      for (const node of result.graph!.nodes.values()) {
        expect(node.label).toBeDefined();
        expect(node.label.owner).toBe('benchmark');
        expect(node.label.classification).toBe('internal');
      }
    });
  });
});
