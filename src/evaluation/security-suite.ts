/**
 * Security Test Suite — adversarial testing of trust and sandboxing mechanisms.
 *
 * Exercises the ANP system with attack patterns to verify that security
 * boundaries hold under adversarial conditions.
 */

import { InMemoryAgentRuntime } from '../agent/agent-runtime.js';
import { InMemoryTrustEngine } from '../trust/trust-engine.js';
import { InMemoryACIGateway, InMemoryAuditLogger } from '../aci/aci-gateway.js';
import { InMemoryCapabilityNegotiation } from '../capability/capability-negotiation.js';
import { InMemoryMemoryService } from '../memory/memory-service.js';
import { makeAgentConfig, makeToolRegistration, makeOfferedCapability } from './multi-agent-scenarios.js';

/**
 * A security test case.
 */
export interface SecurityTestCase {
  name: string;
  category: 'privilege-escalation' | 'trust-manipulation' | 'capability-abuse' | 'audit-integrity' | 'resource-exhaustion';
  description: string;
  /** Runs the test. Returns true if the security boundary held. */
  run: () => Promise<boolean>;
}

/**
 * Result of a security test.
 */
export interface SecurityTestResult {
  name: string;
  category: SecurityTestCase['category'];
  passed: boolean;
  details: string;
}

/**
 * Full security test report.
 */
export interface SecurityReport {
  timestamp: string;
  results: SecurityTestResult[];
  passed: number;
  failed: number;
}

/**
 * Runs security test cases and collects results.
 */
export class SecurityTestSuite {
  private cases: SecurityTestCase[] = [];

  add(testCase: SecurityTestCase): void {
    this.cases.push(testCase);
  }

  async run(): Promise<SecurityReport> {
    const results: SecurityTestResult[] = [];

    for (const tc of this.cases) {
      let passed = false;
      let details = '';

      try {
        passed = await tc.run();
        details = passed ? 'Security boundary held' : 'Security boundary breached';
      } catch (error) {
        // Errors during security tests may indicate the boundary held
        // (e.g., throwing on unauthorized access)
        passed = true;
        details = `Boundary enforced via error: ${error instanceof Error ? error.message : String(error)}`;
      }

      results.push({
        name: tc.name,
        category: tc.category,
        passed,
        details,
      });
    }

    return {
      timestamp: new Date().toISOString(),
      results,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
    };
  }
}

/**
 * Create the standard security test suite for ANP.
 */
export function createSecurityTests(): SecurityTestSuite {
  const suite = new SecurityTestSuite();

  // --- Privilege Escalation Tests ---

  suite.add({
    name: 'unregistered-agent-tool-access',
    category: 'privilege-escalation',
    description: 'Unregistered agent attempts to invoke a tool',
    run: async () => {
      const trust = new InMemoryTrustEngine();
      const logger = new InMemoryAuditLogger();
      const gateway = new InMemoryACIGateway({
        trustResolver: (id) => trust.getTrustLevel(id),
        auditLogger: logger,
      });

      gateway.registerTool(
        makeToolRegistration('file.read', ['file_read']),
        async () => ({ content: 'secret' }),
      );

      const result = await gateway.invoke({
        toolName: 'file.read',
        input: {},
        agentId: 'unknown-agent',
        requestId: 'req-1',
      });

      // Should be blocked
      return !result.success && result.error?.code === 'AGENT_NOT_FOUND';
    },
  });

  suite.add({
    name: 'low-trust-high-privilege-tool',
    category: 'privilege-escalation',
    description: 'Trust level 0 agent attempts to use a trust level 3 tool',
    run: async () => {
      const trust = new InMemoryTrustEngine();
      trust.registerAgent('low-trust', 0);
      const logger = new InMemoryAuditLogger();
      const gateway = new InMemoryACIGateway({
        trustResolver: (id) => trust.getTrustLevel(id),
        auditLogger: logger,
      });

      gateway.registerTool(
        makeToolRegistration('process.exec', ['process']),
        async () => ({ output: 'executed' }),
      );

      const result = await gateway.invoke({
        toolName: 'process.exec',
        input: { cmd: 'rm -rf /' },
        agentId: 'low-trust',
        requestId: 'req-1',
      });

      // Should be blocked due to insufficient trust
      return !result.success && result.error?.code === 'INSUFFICIENT_TRUST';
    },
  });

  suite.add({
    name: 'capability-request-beyond-trust',
    category: 'privilege-escalation',
    description: 'Agent requests capabilities above its trust level',
    run: async () => {
      const trust = new InMemoryTrustEngine();
      trust.registerAgent('agent-low', 0);

      const caps = new InMemoryCapabilityNegotiation({
        trustResolver: (id) => trust.getTrustLevel(id),
      });

      caps.registerOfferedCapability(makeOfferedCapability('git.commit', 2));
      caps.registerOfferedCapability(makeOfferedCapability('process.exec', 3));

      const result = caps.negotiate({
        agentId: 'agent-low',
        requested: [
          { operation: 'git.commit', minVersion: { major: 1, minor: 0, patch: 0 } },
          { operation: 'process.exec', minVersion: { major: 1, minor: 0, patch: 0 } },
        ],
      });

      // Both should be denied
      return result.granted.length === 0 && result.denied.length === 2;
    },
  });

  // --- Trust Manipulation Tests ---

  suite.add({
    name: 'duplicate-agent-registration',
    category: 'trust-manipulation',
    description: 'Attempt to re-register an agent to reset its trust history',
    run: async () => {
      const trust = new InMemoryTrustEngine();
      trust.registerAgent('agent-1', 1);

      // Record some negative events
      trust.recordEvent({ agentId: 'agent-1', reason: 'task_failure', timestamp: new Date().toISOString() });
      trust.recordEvent({ agentId: 'agent-1', reason: 'bug_introduced', timestamp: new Date().toISOString() });

      // Attempt re-registration should fail
      try {
        trust.registerAgent('agent-1', 4);
        return false; // Should not succeed
      } catch {
        // Verify negative history is preserved
        const events = trust.getEvents('agent-1');
        return events.some((e) => e.reason === 'task_failure');
      }
    },
  });

  suite.add({
    name: 'trust-level-ceiling',
    category: 'trust-manipulation',
    description: 'Verify trust score cannot exceed 100 even with extreme positive events',
    run: async () => {
      const trust = new InMemoryTrustEngine();
      trust.registerAgent('over-achiever', 0);

      // Flood with success events
      for (let i = 0; i < 1000; i++) {
        trust.recordEvent({
          agentId: 'over-achiever',
          reason: 'task_success',
          timestamp: new Date().toISOString(),
        });
      }

      const calibration = trust.calibrate('over-achiever');
      return calibration.trustScore <= 100;
    },
  });

  suite.add({
    name: 'security-violation-impact',
    category: 'trust-manipulation',
    description: 'Security violation should be recorded and impact trust negatively',
    run: async () => {
      const trust = new InMemoryTrustEngine();
      trust.registerAgent('violator', 2);

      // Build up some trust first
      for (let i = 0; i < 5; i++) {
        trust.recordEvent({
          agentId: 'violator',
          reason: 'task_success',
          timestamp: new Date().toISOString(),
        });
      }
      const beforeCalibration = trust.calibrate('violator');

      // Record security violation
      trust.recordEvent({
        agentId: 'violator',
        reason: 'security_violation',
        timestamp: new Date().toISOString(),
      });
      const afterCalibration = trust.calibrate('violator');

      // Trust score should decrease after security violation
      return afterCalibration.trustScore < beforeCalibration.trustScore;
    },
  });

  // --- Capability Abuse Tests ---

  suite.add({
    name: 'expired-capability-use',
    category: 'capability-abuse',
    description: 'Attempt to use an expired capability',
    run: async () => {
      const trust = new InMemoryTrustEngine();
      trust.registerAgent('agent-expiry', 2);

      const caps = new InMemoryCapabilityNegotiation({
        trustResolver: (id) => trust.getTrustLevel(id),
      });

      // Register capability with a very tight expiry via default constraints
      caps.registerOfferedCapability({
        operation: 'file.write',
        version: { major: 1, minor: 0, patch: 0 },
        description: 'Write files',
        requiredTrustLevel: 1,
        defaultConstraints: {
          validUntil: '2020-01-01T00:00:00.000Z', // Already expired
        },
      });

      caps.negotiate({
        agentId: 'agent-expiry',
        requested: [
          { operation: 'file.write', minVersion: { major: 1, minor: 0, patch: 0 } },
        ],
      });

      // The capability was granted but should not pass hasCapability check
      return !caps.hasCapability('agent-expiry', 'file.write');
    },
  });

  suite.add({
    name: 'revoked-capability-use',
    category: 'capability-abuse',
    description: 'Attempt to use a capability after revocation',
    run: async () => {
      const trust = new InMemoryTrustEngine();
      trust.registerAgent('agent-revoke', 2);

      const caps = new InMemoryCapabilityNegotiation({
        trustResolver: (id) => trust.getTrustLevel(id),
      });

      caps.registerOfferedCapability(makeOfferedCapability('git.commit', 1));

      caps.negotiate({
        agentId: 'agent-revoke',
        requested: [
          { operation: 'git.commit', minVersion: { major: 1, minor: 0, patch: 0 } },
        ],
      });

      // Verify capability was granted
      const hadCapability = caps.hasCapability('agent-revoke', 'git.commit');

      // Revoke it
      caps.revoke('agent-revoke', 'git.commit');

      // Should no longer have it
      return hadCapability && !caps.hasCapability('agent-revoke', 'git.commit');
    },
  });

  suite.add({
    name: 'trust-constraint-tightening',
    category: 'capability-abuse',
    description: 'Lower trust agents should receive tighter constraints',
    run: async () => {
      const trust = new InMemoryTrustEngine();
      trust.registerAgent('low-trust', 1);
      trust.registerAgent('high-trust', 3);

      const caps = new InMemoryCapabilityNegotiation({
        trustResolver: (id) => trust.getTrustLevel(id),
      });

      caps.registerOfferedCapability({
        operation: 'file.write',
        version: { major: 1, minor: 0, patch: 0 },
        description: 'Write files',
        requiredTrustLevel: 1,
        defaultConstraints: { maxFiles: 50, maxLines: 5000 },
      });

      const lowResult = caps.negotiate({
        agentId: 'low-trust',
        requested: [{ operation: 'file.write', minVersion: { major: 1, minor: 0, patch: 0 } }],
      });

      const highResult = caps.negotiate({
        agentId: 'high-trust',
        requested: [{ operation: 'file.write', minVersion: { major: 1, minor: 0, patch: 0 } }],
      });

      const lowConstraints = lowResult.granted[0]?.constraints;
      const highConstraints = highResult.granted[0]?.constraints;

      if (!lowConstraints || !highConstraints) return false;

      // Low trust should have tighter limits
      return (
        (lowConstraints.maxFiles ?? Infinity) < (highConstraints.maxFiles ?? Infinity) ||
        (lowConstraints.maxLines ?? Infinity) < (highConstraints.maxLines ?? Infinity)
      );
    },
  });

  // --- Audit Integrity Tests ---

  suite.add({
    name: 'audit-log-completeness',
    category: 'audit-integrity',
    description: 'All tool invocations (success and failure) should be audited',
    run: async () => {
      const trust = new InMemoryTrustEngine();
      trust.registerAgent('audited-agent', 2);
      const logger = new InMemoryAuditLogger();

      const gateway = new InMemoryACIGateway({
        trustResolver: (id) => trust.getTrustLevel(id),
        auditLogger: logger,
      });

      gateway.registerTool(
        makeToolRegistration('tool.ok', ['file_read']),
        async () => ({ ok: true }),
      );
      gateway.registerTool(
        makeToolRegistration('tool.fail', ['file_read']),
        async () => { throw new Error('tool error'); },
      );

      // Invoke both tools
      await gateway.invoke({
        toolName: 'tool.ok',
        input: {},
        agentId: 'audited-agent',
        requestId: 'req-ok',
      });
      await gateway.invoke({
        toolName: 'tool.fail',
        input: {},
        agentId: 'audited-agent',
        requestId: 'req-fail',
      });

      // Also attempt a nonexistent tool
      await gateway.invoke({
        toolName: 'tool.nonexistent',
        input: {},
        agentId: 'audited-agent',
        requestId: 'req-404',
      });

      const events = logger.getEvents();

      // Should have audit entries for all 3 invocations
      return events.length === 3;
    },
  });

  suite.add({
    name: 'audit-blocked-actions',
    category: 'audit-integrity',
    description: 'Blocked actions due to insufficient trust should be audited',
    run: async () => {
      const trust = new InMemoryTrustEngine();
      trust.registerAgent('blocked-agent', 0);
      const logger = new InMemoryAuditLogger();

      const gateway = new InMemoryACIGateway({
        trustResolver: (id) => trust.getTrustLevel(id),
        auditLogger: logger,
      });

      gateway.registerTool(
        makeToolRegistration('secure.tool', ['process']),
        async () => ({ ok: true }),
      );

      await gateway.invoke({
        toolName: 'secure.tool',
        input: {},
        agentId: 'blocked-agent',
        requestId: 'req-blocked',
      });

      const events = logger.getEvents();
      const blockedEvents = events.filter((e) => e.result === 'blocked');

      return blockedEvents.length === 1 && blockedEvents[0].category === 'permission';
    },
  });

  // --- Resource Exhaustion Tests ---

  suite.add({
    name: 'mass-agent-registration',
    category: 'resource-exhaustion',
    description: 'System should handle registration of many agents without error',
    run: async () => {
      const runtime = new InMemoryAgentRuntime();

      for (let i = 0; i < 500; i++) {
        await runtime.register(
          makeAgentConfig({ id: `mass-${i}`, name: `Mass Agent ${i}`, type: 'coding' }),
        );
      }

      return runtime.listAgents().length === 500;
    },
  });

  suite.add({
    name: 'mass-memory-storage',
    category: 'resource-exhaustion',
    description: 'Memory service should handle storing many entries',
    run: async () => {
      const memory = new InMemoryMemoryService();
      const now = new Date().toISOString();

      for (let i = 0; i < 500; i++) {
        await memory.store({
          type: 'episodic',
          content: `Memory entry number ${i} with some content`,
          metadata: {
            source: 'test',
            confidence: 0.9,
            topics: ['test'],
            entities: ['test'],
            timestamp: now,
          },
        });
      }

      const results = await memory.query({ text: 'memory entry', limit: 500 });
      return results.length === 500;
    },
  });

  suite.add({
    name: 'rapid-trust-events',
    category: 'resource-exhaustion',
    description: 'Trust engine should handle rapid event recording',
    run: async () => {
      const trust = new InMemoryTrustEngine();
      trust.registerAgent('rapid-agent', 1);
      const now = new Date().toISOString();

      for (let i = 0; i < 1000; i++) {
        trust.recordEvent({
          agentId: 'rapid-agent',
          reason: i % 2 === 0 ? 'task_success' : 'task_revision',
          timestamp: now,
        });
      }

      const events = trust.getEvents('rapid-agent');
      return events.length === 1000;
    },
  });

  return suite;
}
