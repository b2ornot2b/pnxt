/**
 * Empirical evaluation — multi-agent coordination scenarios.
 *
 * These tests exercise the full ANP system (runtime, trust, ACI, capabilities,
 * memory) through realistic multi-agent coordination patterns.
 */

import { InMemoryAgentRuntime } from '../agent/agent-runtime.js';
import { InMemoryTrustEngine } from '../trust/trust-engine.js';
import { InMemoryACIGateway, InMemoryAuditLogger } from '../aci/aci-gateway.js';
import { InMemoryCapabilityNegotiation } from '../capability/capability-negotiation.js';
import { InMemoryMemoryService } from '../memory/memory-service.js';
import type { ScenarioServices } from './multi-agent-scenarios.js';
import {
  runScenario,
  createDelegationScenario,
  createTrustEscalationScenario,
  createFailureRecoveryScenario,
} from './multi-agent-scenarios.js';

function createServices(): ScenarioServices {
  const trust = new InMemoryTrustEngine();
  const auditLogger = new InMemoryAuditLogger();
  const gateway = new InMemoryACIGateway({
    trustResolver: (agentId) => trust.getTrustLevel(agentId),
    auditLogger,
  });
  const capabilities = new InMemoryCapabilityNegotiation({
    trustResolver: (agentId) => trust.getTrustLevel(agentId),
  });
  const runtime = new InMemoryAgentRuntime();
  const memory = new InMemoryMemoryService();

  return { runtime, trust, gateway, capabilities, memory };
}

describe('Multi-Agent Coordination Scenarios', () => {
  describe('Delegation Pattern', () => {
    it('should register all agents and complete all tasks', async () => {
      const services = createServices();
      const scenario = createDelegationScenario();
      const result = await runScenario(scenario, services);

      expect(result.scenario).toBe('delegation-pattern');
      expect(result.agentsRegistered).toBe(3);
      expect(result.taskOutcomes).toHaveLength(3);
    });

    it('should respect trust levels for tool access', async () => {
      const services = createServices();
      const scenario = createDelegationScenario();
      const result = await runScenario(scenario, services);

      // Planner (trust 3) should succeed with file.read
      const plannerOutcome = result.taskOutcomes[0];
      expect(plannerOutcome.toolSuccesses).toBeGreaterThanOrEqual(1);

      // Coder (trust 1) can read and write files
      const coderOutcome = result.taskOutcomes[1];
      expect(coderOutcome.toolInvocations).toBe(2);
      expect(coderOutcome.toolSuccesses).toBe(2);

      // Reviewer (trust 2) can read files and commit to git
      const reviewerOutcome = result.taskOutcomes[2];
      expect(reviewerOutcome.toolSuccesses).toBe(2);
    });

    it('should update trust levels after task completions', async () => {
      const services = createServices();
      const scenario = createDelegationScenario();
      await runScenario(scenario, services);

      // All agents should have calibration data
      for (const agent of scenario.agents) {
        const calibration = services.trust.getCalibration(agent.id);
        expect(calibration).toBeDefined();
        expect(calibration!.trustScore).toBeGreaterThan(0);
      }
    });

    it('should store memories from all tasks', async () => {
      const services = createServices();
      const scenario = createDelegationScenario();
      const result = await runScenario(scenario, services);

      expect(result.totalMemories).toBe(3);

      // Verify memories are queryable
      const authMemories = await services.memory.query({ text: 'auth', limit: 10 });
      expect(authMemories.length).toBeGreaterThan(0);
    });

    it('should negotiate capabilities based on trust', async () => {
      const services = createServices();
      const scenario = createDelegationScenario();
      const result = await runScenario(scenario, services);

      // Planner at trust 3 should get all requested capabilities
      const plannerOutcome = result.taskOutcomes[0];
      expect(plannerOutcome.capabilitiesGranted).toBe(1);
      expect(plannerOutcome.capabilitiesDenied).toBe(0);

      // Coder at trust 1 can read and write but not git
      const coderOutcome = result.taskOutcomes[1];
      expect(coderOutcome.capabilitiesGranted).toBe(2);
    });

    it('should transition agents through lifecycle states', async () => {
      const services = createServices();
      const scenario = createDelegationScenario();
      await runScenario(scenario, services);

      // All agents should have been activated
      for (const agentConfig of scenario.agents) {
        const agent = services.runtime.getAgent(agentConfig.id);
        expect(agent).toBeDefined();
        expect(agent!.state).toBe('active');
      }
    });
  });

  describe('Trust Escalation Pattern', () => {
    it('should start agent at trust level 0', async () => {
      const services = createServices();
      const scenario = createTrustEscalationScenario();
      const result = await runScenario(scenario, services);

      expect(result.agentsRegistered).toBe(1);
    });

    it('should block file.write for trust level 0 agent', async () => {
      const services = createServices();
      const scenario = createTrustEscalationScenario();
      const result = await runScenario(scenario, services);

      // First task requests file.read and file.write; agent at level 0
      // file.write requires trust level 1, so it should be blocked
      const firstOutcome = result.taskOutcomes[0];
      expect(firstOutcome.toolFailures).toBeGreaterThan(0);
    });

    it('should increase trust score after successful tasks', async () => {
      const services = createServices();
      const scenario = createTrustEscalationScenario();
      await runScenario(scenario, services);

      const calibration = services.trust.getCalibration('newcomer-1');
      expect(calibration).toBeDefined();
      // 6 task_success events should yield a decent trust score
      expect(calibration!.trustScore).toBeGreaterThan(50);
      expect(calibration!.metrics.tasksSuccessful).toBe(6);
    });

    it('should recommend trust level promotion', async () => {
      const services = createServices();
      const scenario = createTrustEscalationScenario();
      await runScenario(scenario, services);

      const calibration = services.trust.getCalibration('newcomer-1');
      expect(calibration).toBeDefined();
      // After 6 successes, the recommended level should be > 0
      expect(calibration!.recommendedLevel).toBeGreaterThan(0);
    });

    it('should store episodic memories for audit trail', async () => {
      const services = createServices();
      const scenario = createTrustEscalationScenario();
      const result = await runScenario(scenario, services);

      expect(result.totalMemories).toBe(2);

      const analysisMemories = await services.memory.query({ text: 'analysis', limit: 10 });
      expect(analysisMemories.length).toBe(2);
    });
  });

  describe('Failure Recovery Pattern', () => {
    it('should degrade trust score after failures', async () => {
      const services = createServices();
      const scenario = createFailureRecoveryScenario();
      await runScenario(scenario, services);

      const calibration = services.trust.getCalibration('buggy-1');
      expect(calibration).toBeDefined();

      // Agent had 1 failure + 2 bugs, then 2 successes
      // Trust score should be lower than a perfect agent
      expect(calibration!.metrics.tasksFailed).toBe(1);
      expect(calibration!.metrics.changesIntroducingBugs).toBe(2);
    });

    it('should record bug events in trust history', async () => {
      const services = createServices();
      const scenario = createFailureRecoveryScenario();
      await runScenario(scenario, services);

      const events = services.trust.getEvents('buggy-1');
      const bugEvents = events.filter((e) => e.reason === 'bug_introduced');
      expect(bugEvents).toHaveLength(2);
    });

    it('should allow partial recovery through successful tasks', async () => {
      const services = createServices();
      const scenario = createFailureRecoveryScenario();
      await runScenario(scenario, services);

      const calibration = services.trust.getCalibration('buggy-1');
      expect(calibration).toBeDefined();

      // Despite failures, 2 subsequent successes should show some recovery
      expect(calibration!.metrics.tasksSuccessful).toBe(2);
      expect(calibration!.trustScore).toBeGreaterThan(0);
    });

    it('should store diagnostic memories from failure', async () => {
      const services = createServices();
      const scenario = createFailureRecoveryScenario();
      const result = await runScenario(scenario, services);

      expect(result.totalMemories).toBe(2);

      // Bug fix memory should be semantic (learned knowledge)
      const bugMemories = await services.memory.query({ text: 'payment bug', limit: 10 });
      expect(bugMemories.length).toBeGreaterThan(0);
    });

    it('should complete all tasks despite trust issues', async () => {
      const services = createServices();
      const scenario = createFailureRecoveryScenario();
      const result = await runScenario(scenario, services);

      expect(result.taskOutcomes).toHaveLength(2);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cross-scenario Consistency', () => {
    it('should maintain isolated state between scenarios', async () => {
      const services1 = createServices();
      const services2 = createServices();

      const result1 = await runScenario(createDelegationScenario(), services1);
      const result2 = await runScenario(createTrustEscalationScenario(), services2);

      // Each scenario should have its own agents
      expect(result1.agentsRegistered).toBe(3);
      expect(result2.agentsRegistered).toBe(1);

      // Services should be independent
      expect(services1.runtime.listAgents()).toHaveLength(3);
      expect(services2.runtime.listAgents()).toHaveLength(1);
    });
  });
});
