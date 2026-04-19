import {
  InMemoryCapabilityNegotiation,
  compareVersions,
  formatVersion,
  isVersionCompatible,
  registerHumanAttentionCapability,
  HUMAN_ATTENTION_CAPABILITY,
} from './capability-negotiation.js';
import type { OfferedCapability } from '../types/capability.js';
import type { TrustLevel } from '../types/agent.js';

function makeOffered(overrides: Partial<OfferedCapability> = {}): OfferedCapability {
  return {
    operation: 'file.read',
    version: { major: 1, minor: 0, patch: 0 },
    description: 'Read files',
    requiredTrustLevel: 0,
    defaultConstraints: {},
    ...overrides,
  };
}

describe('version utilities', () => {
  describe('compareVersions', () => {
    it('should return 0 for equal versions', () => {
      expect(compareVersions({ major: 1, minor: 2, patch: 3 }, { major: 1, minor: 2, patch: 3 }))
        .toBe(0);
    });

    it('should compare by major first', () => {
      expect(compareVersions({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 9, patch: 9 }))
        .toBeGreaterThan(0);
    });

    it('should compare by minor when major is equal', () => {
      expect(compareVersions({ major: 1, minor: 2, patch: 0 }, { major: 1, minor: 3, patch: 0 }))
        .toBeLessThan(0);
    });

    it('should compare by patch when major and minor are equal', () => {
      expect(compareVersions({ major: 1, minor: 2, patch: 4 }, { major: 1, minor: 2, patch: 3 }))
        .toBeGreaterThan(0);
    });
  });

  describe('formatVersion', () => {
    it('should format as semver string', () => {
      expect(formatVersion({ major: 1, minor: 2, patch: 3 })).toBe('1.2.3');
    });
  });

  describe('isVersionCompatible', () => {
    it('should accept matching major with higher minor', () => {
      expect(
        isVersionCompatible({ major: 1, minor: 3, patch: 0 }, { major: 1, minor: 2, patch: 0 }),
      ).toBe(true);
    });

    it('should reject different major versions', () => {
      expect(
        isVersionCompatible({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 }),
      ).toBe(false);
    });

    it('should reject older minor within same major', () => {
      expect(
        isVersionCompatible({ major: 1, minor: 1, patch: 0 }, { major: 1, minor: 2, patch: 0 }),
      ).toBe(false);
    });

    it('should accept exact version match', () => {
      expect(
        isVersionCompatible({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 }),
      ).toBe(true);
    });
  });
});

describe('InMemoryCapabilityNegotiation', () => {
  let trustLevels: Map<string, TrustLevel>;
  let negotiation: InMemoryCapabilityNegotiation;

  beforeEach(() => {
    trustLevels = new Map([['agent-1', 2 as TrustLevel]]);
    negotiation = new InMemoryCapabilityNegotiation({
      trustResolver: (id) => trustLevels.get(id),
    });
  });

  describe('registerOfferedCapability', () => {
    it('should register a capability', () => {
      negotiation.registerOfferedCapability(makeOffered());
      expect(negotiation.listOfferedCapabilities()).toHaveLength(1);
    });

    it('should throw on duplicate operation', () => {
      negotiation.registerOfferedCapability(makeOffered());
      expect(() => negotiation.registerOfferedCapability(makeOffered())).toThrow(
        'Capability already offered',
      );
    });
  });

  describe('negotiate', () => {
    it('should grant capabilities when trust is sufficient', () => {
      negotiation.registerOfferedCapability(
        makeOffered({ operation: 'file.read', requiredTrustLevel: 0 }),
      );

      const result = negotiation.negotiate({
        agentId: 'agent-1',
        requested: [{ operation: 'file.read', minVersion: { major: 1, minor: 0, patch: 0 } }],
      });

      expect(result.granted).toHaveLength(1);
      expect(result.denied).toHaveLength(0);
      expect(result.granted[0].operation).toBe('file.read');
    });

    it('should deny capabilities when trust is insufficient', () => {
      trustLevels.set('agent-1', 0);
      negotiation.registerOfferedCapability(
        makeOffered({ operation: 'git.commit', requiredTrustLevel: 2 }),
      );

      const result = negotiation.negotiate({
        agentId: 'agent-1',
        requested: [{ operation: 'git.commit', minVersion: { major: 1, minor: 0, patch: 0 } }],
      });

      expect(result.granted).toHaveLength(0);
      expect(result.denied).toHaveLength(1);
      expect(result.denied[0].reason).toContain('Insufficient trust');
    });

    it('should deny unknown agents', () => {
      negotiation.registerOfferedCapability(makeOffered());

      const result = negotiation.negotiate({
        agentId: 'unknown',
        requested: [{ operation: 'file.read', minVersion: { major: 1, minor: 0, patch: 0 } }],
      });

      expect(result.granted).toHaveLength(0);
      expect(result.denied).toHaveLength(1);
      expect(result.denied[0].reason).toContain('Unknown agent');
    });

    it('should deny unavailable capabilities', () => {
      const result = negotiation.negotiate({
        agentId: 'agent-1',
        requested: [
          { operation: 'nonexistent', minVersion: { major: 1, minor: 0, patch: 0 } },
        ],
      });

      expect(result.denied).toHaveLength(1);
      expect(result.denied[0].reason).toContain('not available');
    });

    it('should deny incompatible versions', () => {
      negotiation.registerOfferedCapability(
        makeOffered({ version: { major: 1, minor: 0, patch: 0 } }),
      );

      const result = negotiation.negotiate({
        agentId: 'agent-1',
        requested: [{ operation: 'file.read', minVersion: { major: 2, minor: 0, patch: 0 } }],
      });

      expect(result.denied).toHaveLength(1);
      expect(result.denied[0].reason).toContain('Version incompatible');
    });

    it('should apply tighter constraints for low trust agents', () => {
      trustLevels.set('agent-1', 1);
      negotiation.registerOfferedCapability(
        makeOffered({
          operation: 'file.write',
          requiredTrustLevel: 1,
          defaultConstraints: { maxFiles: 50, maxLines: 5000 },
        }),
      );

      const result = negotiation.negotiate({
        agentId: 'agent-1',
        requested: [{ operation: 'file.write', minVersion: { major: 1, minor: 0, patch: 0 } }],
      });

      expect(result.granted).toHaveLength(1);
      // Trust level 1 should get maxFiles capped at 5
      expect(result.granted[0].constraints.maxFiles).toBe(5);
      expect(result.granted[0].constraints.maxLines).toBe(200);
    });

    it('should preserve default constraints for high trust agents', () => {
      trustLevels.set('agent-1', 3);
      negotiation.registerOfferedCapability(
        makeOffered({
          operation: 'file.write',
          requiredTrustLevel: 1,
          defaultConstraints: { maxFiles: 50, maxLines: 5000 },
        }),
      );

      const result = negotiation.negotiate({
        agentId: 'agent-1',
        requested: [{ operation: 'file.write', minVersion: { major: 1, minor: 0, patch: 0 } }],
      });

      expect(result.granted[0].constraints.maxFiles).toBe(50);
      expect(result.granted[0].constraints.maxLines).toBe(5000);
    });

    it('should handle multiple capabilities in one request', () => {
      negotiation.registerOfferedCapability(
        makeOffered({ operation: 'file.read', requiredTrustLevel: 0 }),
      );
      negotiation.registerOfferedCapability(
        makeOffered({ operation: 'file.write', requiredTrustLevel: 1 }),
      );
      negotiation.registerOfferedCapability(
        makeOffered({ operation: 'process.execute', requiredTrustLevel: 3 }),
      );

      const result = negotiation.negotiate({
        agentId: 'agent-1',
        requested: [
          { operation: 'file.read', minVersion: { major: 1, minor: 0, patch: 0 } },
          { operation: 'file.write', minVersion: { major: 1, minor: 0, patch: 0 } },
          { operation: 'process.execute', minVersion: { major: 1, minor: 0, patch: 0 } },
        ],
      });

      expect(result.granted).toHaveLength(2);
      expect(result.denied).toHaveLength(1);
      expect(result.denied[0].operation).toBe('process.execute');
    });

    it('should support renegotiation by replacing previous grants', () => {
      negotiation.registerOfferedCapability(
        makeOffered({
          operation: 'file.read',
          requiredTrustLevel: 0,
          defaultConstraints: { paths: ['src/**'] },
        }),
      );

      // First negotiation
      negotiation.negotiate({
        agentId: 'agent-1',
        requested: [{ operation: 'file.read', minVersion: { major: 1, minor: 0, patch: 0 } }],
      });

      expect(negotiation.getGrantedCapabilities('agent-1')).toHaveLength(1);

      // Renegotiate same capability
      negotiation.negotiate({
        agentId: 'agent-1',
        requested: [{ operation: 'file.read', minVersion: { major: 1, minor: 0, patch: 0 } }],
      });

      // Should still have 1, not 2
      expect(negotiation.getGrantedCapabilities('agent-1')).toHaveLength(1);
    });
  });

  describe('getGrantedCapabilities', () => {
    it('should return empty array for unknown agent', () => {
      expect(negotiation.getGrantedCapabilities('unknown')).toEqual([]);
    });
  });

  describe('revoke', () => {
    it('should revoke a specific capability', () => {
      negotiation.registerOfferedCapability(makeOffered({ operation: 'file.read' }));
      negotiation.negotiate({
        agentId: 'agent-1',
        requested: [{ operation: 'file.read', minVersion: { major: 1, minor: 0, patch: 0 } }],
      });

      expect(negotiation.revoke('agent-1', 'file.read')).toBe(true);
      expect(negotiation.getGrantedCapabilities('agent-1')).toHaveLength(0);
    });

    it('should return false for non-existent capability', () => {
      expect(negotiation.revoke('agent-1', 'nonexistent')).toBe(false);
    });

    it('should return false for unknown agent', () => {
      expect(negotiation.revoke('unknown', 'file.read')).toBe(false);
    });
  });

  describe('revokeAll', () => {
    it('should revoke all capabilities for an agent', () => {
      negotiation.registerOfferedCapability(makeOffered({ operation: 'file.read' }));
      negotiation.registerOfferedCapability(
        makeOffered({ operation: 'file.write', requiredTrustLevel: 1 }),
      );

      negotiation.negotiate({
        agentId: 'agent-1',
        requested: [
          { operation: 'file.read', minVersion: { major: 1, minor: 0, patch: 0 } },
          { operation: 'file.write', minVersion: { major: 1, minor: 0, patch: 0 } },
        ],
      });

      negotiation.revokeAll('agent-1');
      expect(negotiation.getGrantedCapabilities('agent-1')).toHaveLength(0);
    });
  });

  describe('hasCapability', () => {
    it('should return true for granted capability', () => {
      negotiation.registerOfferedCapability(makeOffered());
      negotiation.negotiate({
        agentId: 'agent-1',
        requested: [{ operation: 'file.read', minVersion: { major: 1, minor: 0, patch: 0 } }],
      });

      expect(negotiation.hasCapability('agent-1', 'file.read')).toBe(true);
    });

    it('should return false for non-granted capability', () => {
      expect(negotiation.hasCapability('agent-1', 'file.read')).toBe(false);
    });

    it('should return false for expired capability', () => {
      negotiation.registerOfferedCapability(
        makeOffered({
          defaultConstraints: { validUntil: '2020-01-01T00:00:00Z' },
        }),
      );

      negotiation.negotiate({
        agentId: 'agent-1',
        requested: [{ operation: 'file.read', minVersion: { major: 1, minor: 0, patch: 0 } }],
      });

      expect(negotiation.hasCapability('agent-1', 'file.read')).toBe(false);
    });
  });
});

describe('registerHumanAttentionCapability (Sprint 17)', () => {
  it('registers the standard human.attention capability', () => {
    const negotiation = new InMemoryCapabilityNegotiation({
      trustResolver: () => 4,
    });
    registerHumanAttentionCapability(negotiation);

    const offered = negotiation.listOfferedCapabilities();
    expect(offered.map((c) => c.operation)).toContain('human.attention');
    expect(HUMAN_ATTENTION_CAPABILITY.requiredTrustLevel).toBe(3);
  });

  it('is idempotent', () => {
    const negotiation = new InMemoryCapabilityNegotiation({
      trustResolver: () => 4,
    });
    registerHumanAttentionCapability(negotiation);
    registerHumanAttentionCapability(negotiation);

    const offered = negotiation.listOfferedCapabilities();
    expect(offered.filter((c) => c.operation === 'human.attention')).toHaveLength(1);
  });

  it('denies human.attention to an agent below the required trust', () => {
    const negotiation = new InMemoryCapabilityNegotiation({
      trustResolver: () => 1,
    });
    registerHumanAttentionCapability(negotiation);

    const result = negotiation.negotiate({
      agentId: 'low-trust',
      requested: [{ operation: 'human.attention', minVersion: { major: 1, minor: 0, patch: 0 } }],
    });

    expect(result.granted).toHaveLength(0);
    expect(result.denied[0].reason).toMatch(/Insufficient trust/);
  });
});
