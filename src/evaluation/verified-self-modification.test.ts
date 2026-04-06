/**
 * Verified Self-Modification Scenarios test suite.
 *
 * Sprint 15 — Advisory Panel: Kay (paradigm), Voevodsky (HoTT), de Moura (SMT).
 */

import {
  SELF_MODIFICATION_SCENARIOS,
  runSelfModificationScenario,
  runAllSelfModificationScenarios,
  createStandardPipeline,
} from './verified-self-modification.js';

// ── Tests ────────────────────────────────────────────────────────────

describe('Verified Self-Modification Scenarios', () => {
  describe('createStandardPipeline', () => {
    it('should create a 6-stage pipeline', () => {
      const pipeline = createStandardPipeline();

      expect(pipeline.nodes.size).toBe(6);
      expect(pipeline.roots).toEqual(['nl-input']);
      expect(pipeline.terminals).toEqual(['dpn-execution']);
    });

    it('should have monotonically increasing trust levels', () => {
      const pipeline = createStandardPipeline();

      const stageOrder = [
        'nl-input', 'bridge-grammar', 'vpir-generation',
        'hott-categorization', 'z3-verification', 'dpn-execution',
      ];

      let prevTrust = 0;
      for (const stageId of stageOrder) {
        const node = pipeline.nodes.get(stageId)!;
        expect(node.label.trustLevel).toBeGreaterThanOrEqual(prevTrust);
        prevTrust = node.label.trustLevel;
      }
    });

    it('should have valid node connections', () => {
      const pipeline = createStandardPipeline();

      for (const node of pipeline.nodes.values()) {
        for (const ref of node.inputs) {
          expect(pipeline.nodes.has(ref.nodeId)).toBe(true);
        }
      }
    });
  });

  describe('scenario definitions', () => {
    it('should have 5 scenarios defined', () => {
      expect(SELF_MODIFICATION_SCENARIOS.length).toBe(5);
    });

    it('should have unique scenario IDs', () => {
      const ids = SELF_MODIFICATION_SCENARIOS.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should have mix of commit and rollback expectations', () => {
      const commits = SELF_MODIFICATION_SCENARIOS.filter((s) => s.expectedOutcome === 'commit');
      const rollbacks = SELF_MODIFICATION_SCENARIOS.filter((s) => s.expectedOutcome === 'rollback');

      expect(commits.length).toBeGreaterThan(0);
      expect(rollbacks.length).toBeGreaterThan(0);
    });

    it('each scenario should produce a valid modified graph', () => {
      const source = createStandardPipeline();

      for (const scenario of SELF_MODIFICATION_SCENARIOS) {
        const target = scenario.buildTarget(source);

        expect(target.nodes.size).toBeGreaterThan(0);
        expect(target.id).not.toBe(source.id);

        // All input references should point to existing nodes
        for (const node of target.nodes.values()) {
          for (const ref of node.inputs) {
            expect(target.nodes.has(ref.nodeId)).toBe(true);
          }
        }
      }
    });
  });

  describe('Scenario: Add Result Caching', () => {
    it('should add a cache-check node between vpir-generation and hott-categorization', () => {
      const source = createStandardPipeline();
      const scenario = SELF_MODIFICATION_SCENARIOS.find((s) => s.id === 'add-caching')!;
      const target = scenario.buildTarget(source);

      expect(target.nodes.has('cache-check')).toBe(true);
      const cacheNode = target.nodes.get('cache-check')!;
      expect(cacheNode.inputs[0].nodeId).toBe('vpir-generation');

      const hottNode = target.nodes.get('hott-categorization')!;
      expect(hottNode.inputs[0].nodeId).toBe('cache-check');
    });

    it('should commit successfully', async () => {
      const scenario = SELF_MODIFICATION_SCENARIOS.find((s) => s.id === 'add-caching')!;
      const result = await runSelfModificationScenario(scenario);

      expect(result.orchestration.applied).toBe(true);
      expect(result.orchestration.proposal.status).toBe('applied');
      expect(result.orchestration.proposal.confidence).toBeDefined();
      expect(result.durationMs).toBeGreaterThan(0);
    });
  });

  describe('Scenario: Add Confidence Gate', () => {
    it('should add a confidence gate after bridge grammar', () => {
      const source = createStandardPipeline();
      const scenario = SELF_MODIFICATION_SCENARIOS.find((s) => s.id === 'add-confidence-gate')!;
      const target = scenario.buildTarget(source);

      expect(target.nodes.has('confidence-gate')).toBe(true);
      const gateNode = target.nodes.get('confidence-gate')!;
      expect(gateNode.inputs[0].nodeId).toBe('bridge-grammar');
    });

    it('should commit successfully', async () => {
      const scenario = SELF_MODIFICATION_SCENARIOS.find((s) => s.id === 'add-confidence-gate')!;
      const result = await runSelfModificationScenario(scenario);

      expect(result.orchestration.applied).toBe(true);
    });
  });

  describe('Scenario: Modify Trust Levels (IFC Violation)', () => {
    it('should create an IFC violation by raising NL input trust', () => {
      const source = createStandardPipeline();
      const scenario = SELF_MODIFICATION_SCENARIOS.find((s) => s.id === 'modify-trust-levels')!;
      const target = scenario.buildTarget(source);

      const nlNode = target.nodes.get('nl-input')!;
      const bridgeNode = target.nodes.get('bridge-grammar')!;

      // NL input trust (3) > bridge grammar trust (2) → violation
      expect(nlNode.label.trustLevel).toBeGreaterThan(bridgeNode.label.trustLevel);
    });

    it('should detect IFC violation in confidence scoring', async () => {
      const scenario = SELF_MODIFICATION_SCENARIOS.find((s) => s.id === 'modify-trust-levels')!;
      const result = await runSelfModificationScenario(scenario);

      // The modification should result in lower IFC compliance score
      expect(result.orchestration.proposal.confidence).toBeDefined();
      expect(result.orchestration.proposal.confidence!.ifcCompliance).toBeLessThan(1.0);
    });
  });

  describe('Scenario: Add Parallel Verification', () => {
    it('should add a parallel branch from vpir-generation', () => {
      const source = createStandardPipeline();
      const scenario = SELF_MODIFICATION_SCENARIOS.find((s) => s.id === 'add-parallel-verification')!;
      const target = scenario.buildTarget(source);

      expect(target.nodes.has('parallel-hott-check')).toBe(true);
      const parallelNode = target.nodes.get('parallel-hott-check')!;
      expect(parallelNode.inputs[0].nodeId).toBe('vpir-generation');
      expect(target.nodes.size).toBe(7); // 6 original + 1 parallel
    });

    it('should commit successfully', async () => {
      const scenario = SELF_MODIFICATION_SCENARIOS.find((s) => s.id === 'add-parallel-verification')!;
      const result = await runSelfModificationScenario(scenario);

      expect(result.orchestration.applied).toBe(true);
    });
  });

  describe('Scenario: Remove Redundant Stage', () => {
    it('should remove hott-categorization and reconnect z3', () => {
      const source = createStandardPipeline();
      const scenario = SELF_MODIFICATION_SCENARIOS.find((s) => s.id === 'remove-redundant-stage')!;
      const target = scenario.buildTarget(source);

      expect(target.nodes.has('hott-categorization')).toBe(false);
      expect(target.nodes.size).toBe(5);

      const z3Node = target.nodes.get('z3-verification')!;
      expect(z3Node.inputs[0].nodeId).toBe('vpir-generation');
    });

    it('should commit successfully', async () => {
      const scenario = SELF_MODIFICATION_SCENARIOS.find((s) => s.id === 'remove-redundant-stage')!;
      const result = await runSelfModificationScenario(scenario);

      expect(result.orchestration.applied).toBe(true);
    });
  });

  describe('runAllSelfModificationScenarios', () => {
    it('should run all scenarios and report results', async () => {
      const results = await runAllSelfModificationScenarios();

      expect(results.scenarios.length).toBe(5);
      expect(results.passed + results.failed).toBe(5);
      expect(results.totalTimeMs).toBeGreaterThan(0);

      // Each scenario should have confidence data
      for (const result of results.scenarios) {
        expect(result.orchestration.proposal.confidence).toBeDefined();
        expect(result.durationMs).toBeGreaterThan(0);
      }
    });

    it('should include causal impact data for each scenario', async () => {
      const results = await runAllSelfModificationScenarios();

      for (const result of results.scenarios) {
        expect(result.orchestration.proposal.causalImpact).toBeDefined();
      }
    });
  });
});
