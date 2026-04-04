/**
 * Agent-Computer Interface (ACI) Gateway types.
 *
 * Based on Phase 3 research:
 * - docs/research/phase-3/01-agent-computer-interface-specification.md
 * - docs/research/phase-3/06-implementation-reference-architecture.md
 */

import type { JSONSchema } from './json-schema.js';

export type SideEffect = 'file_read' | 'file_write' | 'network' | 'process' | 'git' | 'none';
export type CostCategory = 'cheap' | 'moderate' | 'expensive';

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
}

export interface ToolInvocation {
  toolName: string;
  input: unknown;
  agentId: string;
  requestId: string;
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
}
