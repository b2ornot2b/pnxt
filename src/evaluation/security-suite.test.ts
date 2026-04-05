/**
 * Security hardening tests — adversarial testing of trust and sandboxing.
 *
 * These tests verify that security boundaries hold under adversarial conditions.
 * Each test category exercises a different attack vector.
 */

import { SecurityTestSuite, createSecurityTests } from './security-suite.js';
import { InMemoryTrustEngine } from '../trust/trust-engine.js';
import { InMemoryACIGateway, InMemoryAuditLogger } from '../aci/aci-gateway.js';
import { InMemoryCapabilityNegotiation } from '../capability/capability-negotiation.js';
import { InMemoryAgentRuntime } from '../agent/agent-runtime.js';
import { makeAgentConfig, makeToolRegistration, makeOfferedCapability } from './multi-agent-scenarios.js';

describe('Security Test Suite', () => {
  describe('SecurityTestSuite framework', () => {
    it('should run an empty suite', async () => {
      const suite = new SecurityTestSuite();
      const report = await suite.run();

      expect(report.results).toHaveLength(0);
      expect(report.passed).toBe(0);
      expect(report.failed).toBe(0);
    });

    it('should report passing tests', async () => {
      const suite = new SecurityTestSuite();
      suite.add({
        name: 'always-pass',
        category: 'privilege-escalation',
        description: 'Test that always passes',
        run: async () => true,
      });

      const report = await suite.run();
      expect(report.passed).toBe(1);
      expect(report.failed).toBe(0);
    });

    it('should report failing tests', async () => {
      const suite = new SecurityTestSuite();
      suite.add({
        name: 'always-fail',
        category: 'privilege-escalation',
        description: 'Test that always fails',
        run: async () => false,
      });

      const report = await suite.run();
      expect(report.passed).toBe(0);
      expect(report.failed).toBe(1);
    });

    it('should treat thrown errors as security boundary enforcement', async () => {
      const suite = new SecurityTestSuite();
      suite.add({
        name: 'throws-error',
        category: 'trust-manipulation',
        description: 'Test that throws (boundary enforced)',
        run: async () => { throw new Error('Access denied'); },
      });

      const report = await suite.run();
      expect(report.passed).toBe(1);
      expect(report.results[0].details).toContain('Access denied');
    });
  });

  describe('Standard Security Tests', () => {
    let suite: SecurityTestSuite;

    beforeEach(() => {
      suite = createSecurityTests();
    });

    it('should pass all standard security tests', async () => {
      const report = await suite.run();

      expect(report.failed).toBe(0);
      expect(report.passed).toBeGreaterThan(0);

      // Log any failures for debugging
      for (const result of report.results) {
        if (!result.passed) {
          console.error(`SECURITY FAILURE: ${result.name} — ${result.details}`);
        }
      }
    });

    it('should cover all security categories', async () => {
      const report = await suite.run();
      const categories = new Set(report.results.map((r) => r.category));

      expect(categories.has('privilege-escalation')).toBe(true);
      expect(categories.has('trust-manipulation')).toBe(true);
      expect(categories.has('capability-abuse')).toBe(true);
      expect(categories.has('audit-integrity')).toBe(true);
      expect(categories.has('resource-exhaustion')).toBe(true);
    });
  });

  describe('Privilege Escalation', () => {
    it('should block unregistered agents from accessing any tool', async () => {
      const trust = new InMemoryTrustEngine();
      const logger = new InMemoryAuditLogger();
      const gateway = new InMemoryACIGateway({
        trustResolver: (id) => trust.getTrustLevel(id),
        auditLogger: logger,
      });

      gateway.registerTool(
        makeToolRegistration('sensitive.tool', ['process']),
        async () => ({ secret: 'data' }),
      );

      const result = await gateway.invoke({
        toolName: 'sensitive.tool',
        input: {},
        agentId: 'fake-agent',
        requestId: 'req-1',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('AGENT_NOT_FOUND');
    });

    it('should enforce side-effect trust requirements', async () => {
      const trust = new InMemoryTrustEngine();
      trust.registerAgent('level-0', 0);
      trust.registerAgent('level-1', 1);
      trust.registerAgent('level-2', 2);

      const gateway = new InMemoryACIGateway({
        trustResolver: (id) => trust.getTrustLevel(id),
      });

      // file_write requires trust 1, git requires trust 2, process requires trust 3
      gateway.registerTool(makeToolRegistration('write', ['file_write']), async () => ({}));
      gateway.registerTool(makeToolRegistration('git', ['git']), async () => ({}));
      gateway.registerTool(makeToolRegistration('exec', ['process']), async () => ({}));

      // Level 0 can't write
      const r1 = await gateway.invoke({ toolName: 'write', input: {}, agentId: 'level-0', requestId: 'r1' });
      expect(r1.success).toBe(false);

      // Level 1 can write but not git
      const r2 = await gateway.invoke({ toolName: 'write', input: {}, agentId: 'level-1', requestId: 'r2' });
      expect(r2.success).toBe(true);
      const r3 = await gateway.invoke({ toolName: 'git', input: {}, agentId: 'level-1', requestId: 'r3' });
      expect(r3.success).toBe(false);

      // Level 2 can git but not exec
      const r4 = await gateway.invoke({ toolName: 'git', input: {}, agentId: 'level-2', requestId: 'r4' });
      expect(r4.success).toBe(true);
      const r5 = await gateway.invoke({ toolName: 'exec', input: {}, agentId: 'level-2', requestId: 'r5' });
      expect(r5.success).toBe(false);
    });

    it('should prevent duplicate agent registration to avoid trust reset', async () => {
      const runtime = new InMemoryAgentRuntime();
      const config = makeAgentConfig({ id: 'agent-1', name: 'Agent 1', type: 'coding' });

      await runtime.register(config);
      await expect(runtime.register(config)).rejects.toThrow('Agent already registered');
    });
  });

  describe('Trust Manipulation', () => {
    it('should bound trust score between 0 and 100', async () => {
      const trust = new InMemoryTrustEngine();
      trust.registerAgent('test-agent', 0);
      const now = new Date().toISOString();

      // Flood with successes
      for (let i = 0; i < 100; i++) {
        trust.recordEvent({ agentId: 'test-agent', reason: 'task_success', timestamp: now });
      }

      const highCal = trust.calibrate('test-agent');
      expect(highCal.trustScore).toBeLessThanOrEqual(100);
      expect(highCal.trustScore).toBeGreaterThanOrEqual(0);
    });

    it('should not allow direct trust level setting without recording event', async () => {
      const trust = new InMemoryTrustEngine();
      trust.registerAgent('agent-1', 1);

      trust.setTrustLevel('agent-1', 3, 'manual promotion');

      // The event should be recorded
      const events = trust.getEvents('agent-1');
      expect(events).toHaveLength(1);
      expect(events[0].reason).toBe('manual_adjustment');
    });

    it('should properly reset agent trust and clear metrics', async () => {
      const trust = new InMemoryTrustEngine();
      trust.registerAgent('reset-agent', 3);
      const now = new Date().toISOString();

      // Build up history
      for (let i = 0; i < 10; i++) {
        trust.recordEvent({ agentId: 'reset-agent', reason: 'task_success', timestamp: now });
      }

      trust.reset('reset-agent', 'model update');

      expect(trust.getTrustLevel('reset-agent')).toBe(0);
      const calibration = trust.calibrate('reset-agent');
      expect(calibration.metrics.tasksCompleted).toBe(0);
    });
  });

  describe('Capability Abuse', () => {
    it('should enforce version compatibility during negotiation', async () => {
      const trust = new InMemoryTrustEngine();
      trust.registerAgent('agent-1', 3);

      const caps = new InMemoryCapabilityNegotiation({
        trustResolver: (id) => trust.getTrustLevel(id),
      });

      caps.registerOfferedCapability({
        operation: 'file.write',
        version: { major: 1, minor: 0, patch: 0 },
        description: 'Write files',
        requiredTrustLevel: 1,
        defaultConstraints: {},
      });

      // Request major version 2 — should be denied
      const result = caps.negotiate({
        agentId: 'agent-1',
        requested: [
          { operation: 'file.write', minVersion: { major: 2, minor: 0, patch: 0 } },
        ],
      });

      expect(result.denied).toHaveLength(1);
      expect(result.denied[0].reason).toContain('Version incompatible');
    });

    it('should revoke all capabilities atomically', async () => {
      const trust = new InMemoryTrustEngine();
      trust.registerAgent('agent-1', 3);

      const caps = new InMemoryCapabilityNegotiation({
        trustResolver: (id) => trust.getTrustLevel(id),
      });

      caps.registerOfferedCapability(makeOfferedCapability('op.a', 0));
      caps.registerOfferedCapability(makeOfferedCapability('op.b', 0));
      caps.registerOfferedCapability(makeOfferedCapability('op.c', 0));

      caps.negotiate({
        agentId: 'agent-1',
        requested: [
          { operation: 'op.a', minVersion: { major: 1, minor: 0, patch: 0 } },
          { operation: 'op.b', minVersion: { major: 1, minor: 0, patch: 0 } },
          { operation: 'op.c', minVersion: { major: 1, minor: 0, patch: 0 } },
        ],
      });

      expect(caps.getGrantedCapabilities('agent-1')).toHaveLength(3);

      caps.revokeAll('agent-1');

      expect(caps.getGrantedCapabilities('agent-1')).toHaveLength(0);
      expect(caps.hasCapability('agent-1', 'op.a')).toBe(false);
      expect(caps.hasCapability('agent-1', 'op.b')).toBe(false);
      expect(caps.hasCapability('agent-1', 'op.c')).toBe(false);
    });
  });

  describe('Agent Lifecycle Safety', () => {
    it('should reject invalid state transitions', async () => {
      const runtime = new InMemoryAgentRuntime();
      const config = makeAgentConfig({ id: 'agent-1', name: 'Agent 1', type: 'coding' });

      await runtime.register(config);

      // created → active is not valid (must go through initializing → ready first)
      await expect(runtime.transition('agent-1', 'active')).rejects.toThrow('Invalid transition');
    });

    it('should not allow transitions on terminated agents', async () => {
      const runtime = new InMemoryAgentRuntime();
      const config = makeAgentConfig({ id: 'agent-1', name: 'Agent 1', type: 'coding' });

      await runtime.register(config);
      await runtime.transition('agent-1', 'initializing');
      await runtime.transition('agent-1', 'ready');
      await runtime.terminate('agent-1');

      // No transitions from terminated
      await expect(runtime.transition('agent-1', 'active')).rejects.toThrow('Invalid transition');
    });
  });
});
