/**
 * Agent runtime types.
 *
 * Based on Phase 3 research:
 * - docs/research/phase-3/06-implementation-reference-architecture.md
 */

export type AgentType = 'planning' | 'coding' | 'review' | 'testing' | 'deployment' | 'custom';

export type AgentState =
  | 'created'
  | 'initializing'
  | 'ready'
  | 'active'
  | 'completing'
  | 'suspended'
  | 'terminated';

export type UncertaintyResponse = 'ask' | 'best_effort' | 'refuse';
export type TrustLevel = 0 | 1 | 2 | 3 | 4;

export interface AgentConfig {
  id: string;
  name: string;
  type: AgentType;

  behavior: {
    uncertainty_response: UncertaintyResponse;
    instructions: string;
  };

  capabilities: {
    tools: string[];
    concurrency: number;
    token_budget: number;
    time_budget: number;
  };

  memory: {
    preload_topics: string[];
    working_memory_limit: number;
    persist_sessions: boolean;
  };

  trust_level: TrustLevel;
}
