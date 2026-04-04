/**
 * Capability negotiation types.
 *
 * Based on Phase 3 research:
 * - docs/research/phase-3/01-agent-computer-interface-specification.md (Section 4)
 * - docs/research/phase-3/04-trust-safety-governance-framework.md (Section 3)
 * - docs/research/phase-3/06-implementation-reference-architecture.md (Section 5.2)
 */

import type { TrustLevel } from './agent.js';

/**
 * Semantic version for a capability.
 * - Patch: bug fixes, backward compatible
 * - Minor: new optional features, backward compatible
 * - Major: breaking changes, requires migration
 */
export interface CapabilityVersion {
  major: number;
  minor: number;
  patch: number;
}

/**
 * A capability that an agent possesses or requests.
 * Capabilities are unforgeable, attenuatable, revocable, and auditable.
 */
export interface AgentCapability {
  /** The operation this capability authorizes (e.g., 'file.write', 'git.commit'). */
  operation: string;

  /** Version of this capability definition. */
  version: CapabilityVersion;

  /** Constraints on the operation. */
  constraints: CapabilityConstraints;

  /** Who granted this capability. */
  grantedBy: string;

  /** When it was granted (ISO 8601). */
  grantedAt: string;

  /** Why it was granted (for audit). */
  rationale: string;
}

export interface CapabilityConstraints {
  /** Path patterns for file operations (e.g., ['src/utils/**', 'tests/**']). */
  paths?: string[];

  /** Branch patterns for git operations (e.g., ['feature/*', 'fix/*']). */
  branches?: string[];

  /** Max files affected per operation. */
  maxFiles?: number;

  /** Max lines changed per operation. */
  maxLines?: number;

  /** Capability expiry (ISO 8601). */
  validUntil?: string;

  /** Minimum interval between uses in milliseconds. */
  cooldown?: number;
}

/**
 * A capability that the system offers, with version and trust requirement.
 */
export interface OfferedCapability {
  operation: string;
  version: CapabilityVersion;
  description: string;
  requiredTrustLevel: TrustLevel;
  defaultConstraints: CapabilityConstraints;
}

/**
 * Agent's request to establish a session with specific capabilities.
 */
export interface CapabilityRequest {
  agentId: string;

  /** Capabilities the agent is requesting. */
  requested: Array<{
    operation: string;
    /** Minimum version the agent supports. */
    minVersion: CapabilityVersion;
  }>;
}

/**
 * System's response to a capability negotiation request.
 */
export interface CapabilityNegotiationResult {
  agentId: string;

  /** Capabilities that were granted. */
  granted: AgentCapability[];

  /** Capabilities that were denied, with reasons. */
  denied: Array<{
    operation: string;
    reason: string;
  }>;
}
