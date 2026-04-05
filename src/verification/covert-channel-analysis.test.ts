import {
  analyzeCovertChannels,
  analyzeTimingChannels,
  analyzeMemoryAccessPatterns,
  analyzeBridgeGrammarChannels,
} from './covert-channel-analysis.js';

// ── Full Report Tests ───────────────────────────────────────────────

describe('Covert Channel Analysis', () => {
  describe('Full Report', () => {
    it('should produce a complete report with all three vectors', () => {
      const report = analyzeCovertChannels();

      expect(report.vectors.timing).toBeDefined();
      expect(report.vectors.memoryAccess).toBeDefined();
      expect(report.vectors.bridgeGrammar).toBeDefined();
      expect(report.timestamp).toBeDefined();
    });

    it('should count total risks', () => {
      const report = analyzeCovertChannels();
      const totalFromVectors =
        report.vectors.timing.risks.length +
        report.vectors.memoryAccess.risks.length +
        report.vectors.bridgeGrammar.risks.length;

      expect(report.totalRisks).toBe(totalFromVectors);
      expect(report.totalRisks).toBeGreaterThan(0);
    });

    it('should produce severity summary', () => {
      const report = analyzeCovertChannels();
      const { summary } = report;

      expect(summary.critical + summary.high + summary.medium + summary.low).toBe(
        report.totalRisks,
      );
      expect(summary.mitigated + summary.unmitigated).toBe(report.totalRisks);
    });

    it('should have unique risk IDs across all vectors', () => {
      const report = analyzeCovertChannels();
      const allIds = [
        ...report.vectors.timing.risks.map((r) => r.id),
        ...report.vectors.memoryAccess.risks.map((r) => r.id),
        ...report.vectors.bridgeGrammar.risks.map((r) => r.id),
      ];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });

    it('should include affected components for every risk', () => {
      const report = analyzeCovertChannels();
      const allRisks = [
        ...report.vectors.timing.risks,
        ...report.vectors.memoryAccess.risks,
        ...report.vectors.bridgeGrammar.risks,
      ];

      for (const risk of allRisks) {
        expect(risk.affectedComponents.length).toBeGreaterThan(0);
      }
    });
  });

  // ── Timing Channel Tests ──────────────────────────────────────────

  describe('Timing Channels', () => {
    it('should identify backpressure timing risk', () => {
      const analysis = analyzeTimingChannels();
      const backpressure = analysis.risks.find((r) => r.id === 'timing-001');

      expect(backpressure).toBeDefined();
      expect(backpressure!.vector).toBe('timing');
      expect(backpressure!.severity).toBe('medium');
    });

    it('should identify process execution timing risk', () => {
      const analysis = analyzeTimingChannels();
      const execTiming = analysis.risks.find((r) => r.id === 'timing-002');

      expect(execTiming).toBeDefined();
    });

    it('should identify channel close timing risk', () => {
      const analysis = analyzeTimingChannels();
      const closeTiming = analysis.risks.find((r) => r.id === 'timing-003');

      expect(closeTiming).toBeDefined();
      expect(closeTiming!.severity).toBe('low');
    });

    it('should mark execution timing as mitigated when IFC enforced', () => {
      const analysis = analyzeTimingChannels({ ifcEnforced: true });
      const execTiming = analysis.risks.find((r) => r.id === 'timing-002');

      expect(execTiming!.mitigated).toBe(true);
    });

    it('should mark execution timing as unmitigated when IFC not enforced', () => {
      const analysis = analyzeTimingChannels({ ifcEnforced: false });
      const execTiming = analysis.risks.find((r) => r.id === 'timing-002');

      expect(execTiming!.mitigated).toBe(false);
    });

    it('should include mitigation descriptions', () => {
      const analysis = analyzeTimingChannels();
      for (const risk of analysis.risks) {
        expect(risk.mitigation.length).toBeGreaterThan(0);
      }
    });

    it('should include assessment', () => {
      const analysis = analyzeTimingChannels();
      expect(analysis.assessment.length).toBeGreaterThan(0);
    });
  });

  // ── Memory Access Pattern Tests ───────────────────────────────────

  describe('Memory Access Patterns', () => {
    it('should identify query pattern leakage risk', () => {
      const analysis = analyzeMemoryAccessPatterns();
      const queryLeak = analysis.risks.find((r) => r.id === 'memory-001');

      expect(queryLeak).toBeDefined();
      expect(queryLeak!.vector).toBe('memory_access');
    });

    it('should identify cache timing risk', () => {
      const analysis = analyzeMemoryAccessPatterns();
      const cacheTiming = analysis.risks.find((r) => r.id === 'memory-002');

      expect(cacheTiming).toBeDefined();
      expect(cacheTiming!.severity).toBe('low');
    });

    it('should identify KG node enumeration risk', () => {
      const analysis = analyzeMemoryAccessPatterns();
      const enumRisk = analysis.risks.find((r) => r.id === 'memory-003');

      expect(enumRisk).toBeDefined();
      expect(enumRisk!.severity).toBe('high');
    });

    it('should mark query pattern as mitigated with oblivious access', () => {
      const analysis = analyzeMemoryAccessPatterns({ obliviousAccess: true });
      const queryLeak = analysis.risks.find((r) => r.id === 'memory-001');

      expect(queryLeak!.mitigated).toBe(true);
    });

    it('should include KG-related affected components', () => {
      const analysis = analyzeMemoryAccessPatterns();
      const kgComponents = analysis.risks.flatMap((r) => r.affectedComponents);

      expect(kgComponents.some((c) => c.includes('knowledge-graph'))).toBe(true);
    });
  });

  // ── Bridge Grammar Side Channel Tests ─────────────────────────────

  describe('Bridge Grammar Side Channels', () => {
    it('should identify schema selection leakage risk', () => {
      const analysis = analyzeBridgeGrammarChannels();
      const schemaLeak = analysis.risks.find((r) => r.id === 'bridge-001');

      expect(schemaLeak).toBeDefined();
      expect(schemaLeak!.vector).toBe('bridge_grammar');
    });

    it('should identify LLM response timing risk', () => {
      const analysis = analyzeBridgeGrammarChannels();
      const llmTiming = analysis.risks.find((r) => r.id === 'bridge-002');

      expect(llmTiming).toBeDefined();
      expect(llmTiming!.severity).toBe('medium');
    });

    it('should identify validation error leakage risk', () => {
      const analysis = analyzeBridgeGrammarChannels();
      const validationLeak = analysis.risks.find((r) => r.id === 'bridge-003');

      expect(validationLeak).toBeDefined();
    });

    it('should mark schema selection as mitigated with fixed schemas', () => {
      const analysis = analyzeBridgeGrammarChannels({ fixedSchemas: true });
      const schemaLeak = analysis.risks.find((r) => r.id === 'bridge-001');

      expect(schemaLeak!.mitigated).toBe(true);
    });

    it('should include bridge-grammar affected components', () => {
      const analysis = analyzeBridgeGrammarChannels();
      const bgComponents = analysis.risks.flatMap((r) => r.affectedComponents);

      expect(bgComponents.some((c) => c.includes('bridge-grammar'))).toBe(true);
    });
  });

  // ── Configuration Variations ──────────────────────────────────────

  describe('Configuration Variations', () => {
    it('should produce different results with all mitigations enabled', () => {
      const baseline = analyzeCovertChannels();
      const mitigated = analyzeCovertChannels({
        ifcEnforced: true,
        fixedSchemas: true,
        obliviousAccess: true,
      });

      expect(mitigated.summary.mitigated).toBeGreaterThan(baseline.summary.mitigated);
    });

    it('should produce more unmitigated risks with no config', () => {
      const noConfig = analyzeCovertChannels();
      expect(noConfig.summary.unmitigated).toBeGreaterThan(0);
    });
  });
});
