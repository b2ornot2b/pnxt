/**
 * Capability Negotiation — versioned capability discovery and contract negotiation.
 *
 * Implements the 3-phase capability handshake described in:
 * - docs/research/phase-3/01-agent-computer-interface-specification.md (Section 4)
 * - docs/research/phase-3/04-trust-safety-governance-framework.md (Section 3)
 *
 * Protocol:
 * 1. Agent presents identity and requested capabilities
 * 2. System responds with granted/denied capabilities based on trust and availability
 * 3. Agent operates within the granted capability set
 * 4. Capabilities can be renegotiated mid-session
 */

import type { TrustLevel } from '../types/agent.js';
import type {
  AgentCapability,
  CapabilityConstraints,
  CapabilityRequest,
  CapabilityNegotiationResult,
  CapabilityVersion,
  OfferedCapability,
} from '../types/capability.js';

/** Resolves an agent ID to its current trust level. */
export type CapabilityTrustResolver = (agentId: string) => TrustLevel | undefined;

export interface CapabilityNegotiationOptions {
  trustResolver: CapabilityTrustResolver;
}

export interface CapabilityNegotiation {
  /** Register a capability the system offers. */
  registerOfferedCapability(offered: OfferedCapability): void;

  /** List all capabilities the system offers. */
  listOfferedCapabilities(): OfferedCapability[];

  /** Negotiate capabilities for an agent based on trust and availability. */
  negotiate(request: CapabilityRequest): CapabilityNegotiationResult;

  /** Get all capabilities currently granted to an agent. */
  getGrantedCapabilities(agentId: string): AgentCapability[];

  /** Revoke a specific capability from an agent. */
  revoke(agentId: string, operation: string): boolean;

  /** Revoke all capabilities from an agent. */
  revokeAll(agentId: string): void;

  /** Check whether an agent currently holds a capability for an operation. */
  hasCapability(agentId: string, operation: string): boolean;
}

/**
 * Compare two semantic versions.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareVersions(a: CapabilityVersion, b: CapabilityVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/** Format a version as a string (e.g., "1.2.3"). */
export function formatVersion(v: CapabilityVersion): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

/**
 * Check if an offered version satisfies a minimum version requirement.
 * Compatible if offered major matches requested major AND offered >= requested.
 */
export function isVersionCompatible(
  offered: CapabilityVersion,
  minRequired: CapabilityVersion,
): boolean {
  // Major version must match (breaking changes)
  if (offered.major !== minRequired.major) return false;
  // Offered must be >= required within the same major
  return compareVersions(offered, minRequired) >= 0;
}

/**
 * Apply trust-based constraint tightening.
 * Lower trust levels get more restrictive constraints.
 */
function applyTrustConstraints(
  defaults: CapabilityConstraints,
  agentTrust: TrustLevel,
): CapabilityConstraints {
  const result = { ...defaults };

  // Lower trust → tighter file/line limits
  if (agentTrust <= 1) {
    if (result.maxFiles !== undefined) {
      result.maxFiles = Math.min(result.maxFiles, 5);
    } else {
      result.maxFiles = 5;
    }
    if (result.maxLines !== undefined) {
      result.maxLines = Math.min(result.maxLines, 200);
    } else {
      result.maxLines = 200;
    }
  } else if (agentTrust === 2) {
    if (result.maxFiles !== undefined) {
      result.maxFiles = Math.min(result.maxFiles, 20);
    }
    if (result.maxLines !== undefined) {
      result.maxLines = Math.min(result.maxLines, 1000);
    }
  }
  // Trust 3+ gets defaults as-is

  return result;
}

/**
 * In-memory capability negotiation implementation.
 */
export class InMemoryCapabilityNegotiation implements CapabilityNegotiation {
  private offered = new Map<string, OfferedCapability>();
  private granted = new Map<string, AgentCapability[]>();
  private trustResolver: CapabilityTrustResolver;

  constructor(options: CapabilityNegotiationOptions) {
    this.trustResolver = options.trustResolver;
  }

  registerOfferedCapability(offered: OfferedCapability): void {
    if (this.offered.has(offered.operation)) {
      throw new Error(`Capability already offered: ${offered.operation}`);
    }
    this.offered.set(offered.operation, offered);
  }

  listOfferedCapabilities(): OfferedCapability[] {
    return Array.from(this.offered.values());
  }

  negotiate(request: CapabilityRequest): CapabilityNegotiationResult {
    const agentTrust = this.trustResolver(request.agentId);

    if (agentTrust === undefined) {
      return {
        agentId: request.agentId,
        granted: [],
        denied: request.requested.map((r) => ({
          operation: r.operation,
          reason: `Unknown agent: ${request.agentId}`,
        })),
      };
    }

    const granted: AgentCapability[] = [];
    const denied: CapabilityNegotiationResult['denied'] = [];
    const now = new Date().toISOString();

    for (const req of request.requested) {
      const offered = this.offered.get(req.operation);

      if (!offered) {
        denied.push({
          operation: req.operation,
          reason: `Capability not available: ${req.operation}`,
        });
        continue;
      }

      if (!isVersionCompatible(offered.version, req.minVersion)) {
        denied.push({
          operation: req.operation,
          reason:
            `Version incompatible: offered ${formatVersion(offered.version)}, ` +
            `required >=${formatVersion(req.minVersion)}`,
        });
        continue;
      }

      if (agentTrust < offered.requiredTrustLevel) {
        denied.push({
          operation: req.operation,
          reason:
            `Insufficient trust: agent has level ${agentTrust}, ` +
            `requires level ${offered.requiredTrustLevel}`,
        });
        continue;
      }

      const constraints = applyTrustConstraints(offered.defaultConstraints, agentTrust);

      granted.push({
        operation: req.operation,
        version: { ...offered.version },
        constraints,
        grantedBy: 'system',
        grantedAt: now,
        rationale: `Negotiated for agent ${request.agentId} at trust level ${agentTrust}`,
      });
    }

    // Store granted capabilities (replace any previous grants)
    const existing = this.granted.get(request.agentId) ?? [];
    // Remove old grants for re-negotiated operations
    const renegotiatedOps = new Set(request.requested.map((r) => r.operation));
    const kept = existing.filter((c) => !renegotiatedOps.has(c.operation));
    this.granted.set(request.agentId, [...kept, ...granted]);

    return { agentId: request.agentId, granted, denied };
  }

  getGrantedCapabilities(agentId: string): AgentCapability[] {
    return [...(this.granted.get(agentId) ?? [])];
  }

  revoke(agentId: string, operation: string): boolean {
    const caps = this.granted.get(agentId);
    if (!caps) return false;

    const idx = caps.findIndex((c) => c.operation === operation);
    if (idx === -1) return false;

    caps.splice(idx, 1);
    return true;
  }

  revokeAll(agentId: string): void {
    this.granted.delete(agentId);
  }

  hasCapability(agentId: string, operation: string): boolean {
    const caps = this.granted.get(agentId);
    if (!caps) return false;

    const now = new Date().toISOString();
    return caps.some((c) => {
      if (c.operation !== operation) return false;
      // Check expiry
      if (c.constraints.validUntil && c.constraints.validUntil < now) return false;
      return true;
    });
  }
}
