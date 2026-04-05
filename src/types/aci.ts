/**
 * Agent-Computer Interface (ACI) Gateway types.
 *
 * Based on Phase 3 research:
 * - docs/research/phase-3/01-agent-computer-interface-specification.md
 * - docs/research/phase-3/04-trust-safety-governance-framework.md
 * - docs/research/phase-3/06-implementation-reference-architecture.md
 */

import type { JSONSchema } from './json-schema.js';
import type { TrustLevel } from './agent.js';

export type SideEffect = 'file_read' | 'file_write' | 'network' | 'process' | 'git' | 'none';
export type CostCategory = 'cheap' | 'moderate' | 'expensive';

/**
 * Minimum trust level required per side-effect category.
 *
 * - Level 0 (Observer): read-only, no side effects
 * - Level 1 (Contributor): file writes within scope
 * - Level 2 (Collaborator): git, network in sandbox
 * - Level 3 (Trusted): process execution, broad network
 * - Level 4 (Autonomous): unrestricted within boundaries
 */
export const SIDE_EFFECT_TRUST_REQUIREMENTS: Record<SideEffect, TrustLevel> = {
  none: 0,
  file_read: 0,
  file_write: 1,
  git: 2,
  network: 2,
  process: 3,
};

export interface ToolRegistration {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  sideEffects: SideEffect[];

  ops: {
    timeout: number;
    retryable: boolean;
    idempotent: boolean;
    costCategory: CostCategory;
  };

  /** Minimum trust level to invoke this tool. Defaults to max of side-effect requirements. */
  requiredTrustLevel?: TrustLevel;
}

export interface ToolInvocation {
  toolName: string;
  input: unknown;
  agentId: string;
  requestId: string;
  /** Optional IFC label on the input data. When present, the gateway checks
   *  that the input label can flow to the tool's trust context. */
  requesterLabel?: import('./ifc.js').SecurityLabel;
}

export interface ToolResult {
  requestId: string;
  success: boolean;
  output?: unknown;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  duration: number;
  /** IFC label on the result, derived from the tool's trust requirements. */
  resultLabel?: import('./ifc.js').SecurityLabel;
}

/** Audit event categories per the trust/governance framework. */
export type AuditCategory = 'action' | 'permission' | 'communication' | 'system' | 'memory';
export type AuditResult = 'success' | 'failure' | 'blocked' | 'escalated';

export interface AuditEvent {
  id: string;
  timestamp: string;
  category: AuditCategory;

  actor: {
    type: 'agent' | 'human' | 'system';
    id: string;
  };

  event: string;
  details: Record<string, unknown>;

  requestId: string;
  result: AuditResult;
  resultDetails?: string;
}

/** Interface for audit log consumers. */
export interface AuditLogger {
  log(event: AuditEvent): void;
  getEvents(filter?: { agentId?: string; category?: AuditCategory }): AuditEvent[];
}
