/**
 * ACI Gateway — mediates all agent interactions with external systems.
 *
 * Implements the gateway described in:
 * - docs/research/phase-3/01-agent-computer-interface-specification.md
 * - docs/research/phase-3/04-trust-safety-governance-framework.md
 * - docs/research/phase-3/06-implementation-reference-architecture.md
 */

import type {
  ToolRegistration,
  ToolInvocation,
  ToolResult,
  AuditEvent,
  AuditCategory,
  AuditLogger,
} from '../types/aci.js';
import { SIDE_EFFECT_TRUST_REQUIREMENTS } from '../types/aci.js';
import type { TrustLevel } from '../types/agent.js';
import type { SecurityLabel } from '../types/ifc.js';
import { createLabel, canFlowTo } from '../types/ifc.js';

export type ToolHandler = (input: unknown) => Promise<unknown>;

interface RegisteredTool {
  registration: ToolRegistration;
  handler: ToolHandler;
}

/** Resolves an agent ID to its current trust level. */
export type TrustResolver = (agentId: string) => TrustLevel | undefined;

export interface ACIGatewayOptions {
  trustResolver?: TrustResolver;
  auditLogger?: AuditLogger;
}

export interface ACIGateway {
  registerTool(registration: ToolRegistration, handler: ToolHandler): void;

  invoke(invocation: ToolInvocation): Promise<ToolResult>;

  listTools(): ToolRegistration[];

  hasTool(name: string): boolean;
}

/**
 * In-memory audit logger. Append-only event store.
 */
export class InMemoryAuditLogger implements AuditLogger {
  private events: AuditEvent[] = [];
  private nextId = 1;

  log(event: AuditEvent): void {
    this.events.push(event);
  }

  createEvent(
    category: AuditCategory,
    actorId: string,
    event: string,
    requestId: string,
    details: Record<string, unknown>,
    result: AuditEvent['result'],
    resultDetails?: string,
  ): AuditEvent {
    return {
      id: `audit_${this.nextId++}`,
      timestamp: new Date().toISOString(),
      category,
      actor: { type: 'agent', id: actorId },
      event,
      details,
      requestId,
      result,
      resultDetails,
    };
  }

  getEvents(filter?: { agentId?: string; category?: AuditCategory }): AuditEvent[] {
    if (!filter) return [...this.events];

    return this.events.filter((e) => {
      if (filter.agentId && e.actor.id !== filter.agentId) return false;
      if (filter.category && e.category !== filter.category) return false;
      return true;
    });
  }
}

/**
 * Compute the minimum trust level required for a tool based on its side effects.
 */
function computeRequiredTrust(registration: ToolRegistration): TrustLevel {
  if (registration.requiredTrustLevel !== undefined) {
    return registration.requiredTrustLevel;
  }

  let maxLevel: TrustLevel = 0;
  for (const effect of registration.sideEffects) {
    const required = SIDE_EFFECT_TRUST_REQUIREMENTS[effect];
    if (required > maxLevel) {
      maxLevel = required;
    }
  }
  return maxLevel;
}

/**
 * In-memory ACI Gateway implementation with trust checking and audit logging.
 */
export class InMemoryACIGateway implements ACIGateway {
  private tools = new Map<string, RegisteredTool>();
  private trustResolver: TrustResolver | undefined;
  private auditLogger: AuditLogger | undefined;

  constructor(options?: ACIGatewayOptions) {
    this.trustResolver = options?.trustResolver;
    this.auditLogger = options?.auditLogger;
  }

  registerTool(registration: ToolRegistration, handler: ToolHandler): void {
    if (this.tools.has(registration.name)) {
      throw new Error(`Tool already registered: ${registration.name}`);
    }
    this.tools.set(registration.name, { registration, handler });
  }

  async invoke(invocation: ToolInvocation): Promise<ToolResult> {
    const tool = this.tools.get(invocation.toolName);
    if (!tool) {
      this.logAudit(
        'action',
        invocation.agentId,
        `invoke:${invocation.toolName}`,
        invocation.requestId,
        { input: invocation.input },
        'failure',
        `Tool not found: ${invocation.toolName}`,
      );
      return {
        requestId: invocation.requestId,
        success: false,
        error: {
          code: 'TOOL_NOT_FOUND',
          message: `Tool not found: ${invocation.toolName}`,
          retryable: false,
        },
        duration: 0,
      };
    }

    // Trust check
    if (this.trustResolver) {
      const agentTrust = this.trustResolver(invocation.agentId);
      const requiredTrust = computeRequiredTrust(tool.registration);

      if (agentTrust === undefined) {
        this.logAudit(
          'permission',
          invocation.agentId,
          `invoke:${invocation.toolName}`,
          invocation.requestId,
          { requiredTrustLevel: requiredTrust },
          'blocked',
          `Unknown agent: ${invocation.agentId}`,
        );
        return {
          requestId: invocation.requestId,
          success: false,
          error: {
            code: 'AGENT_NOT_FOUND',
            message: `Unknown agent: ${invocation.agentId}`,
            retryable: false,
          },
          duration: 0,
        };
      }

      if (agentTrust < requiredTrust) {
        this.logAudit(
          'permission',
          invocation.agentId,
          `invoke:${invocation.toolName}`,
          invocation.requestId,
          { agentTrustLevel: agentTrust, requiredTrustLevel: requiredTrust },
          'blocked',
          `Insufficient trust: agent has level ${agentTrust}, tool requires level ${requiredTrust}`,
        );
        return {
          requestId: invocation.requestId,
          success: false,
          error: {
            code: 'INSUFFICIENT_TRUST',
            message: `Insufficient trust level: agent has ${agentTrust}, requires ${requiredTrust}`,
            retryable: false,
          },
          duration: 0,
        };
      }
    }

    // IFC label check on input data
    if (invocation.requesterLabel) {
      const requiredTrust = computeRequiredTrust(tool.registration);
      const toolContextLabel: SecurityLabel = createLabel(
        'system',
        requiredTrust,
        requiredTrust >= 3 ? 'confidential' : requiredTrust >= 1 ? 'internal' : 'public',
      );

      if (!canFlowTo(invocation.requesterLabel, toolContextLabel)) {
        this.logAudit(
          'permission',
          invocation.agentId,
          `invoke:${invocation.toolName}`,
          invocation.requestId,
          {
            inputLabel: invocation.requesterLabel,
            toolContextLabel,
          },
          'blocked',
          `IFC violation: input label (trust ${invocation.requesterLabel.trustLevel}, ${invocation.requesterLabel.classification}) cannot flow to tool context (trust ${toolContextLabel.trustLevel}, ${toolContextLabel.classification})`,
        );
        return {
          requestId: invocation.requestId,
          success: false,
          error: {
            code: 'IFC_VIOLATION',
            message: `IFC violation: input data label cannot flow to tool context`,
            retryable: false,
          },
          duration: 0,
        };
      }
    }

    const start = Date.now();

    try {
      const output = await Promise.race([
        tool.handler(invocation.input),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Tool execution timed out')),
            tool.registration.ops.timeout,
          ),
        ),
      ]);

      const duration = Date.now() - start;

      this.logAudit(
        'action',
        invocation.agentId,
        `invoke:${invocation.toolName}`,
        invocation.requestId,
        { input: invocation.input, duration },
        'success',
      );

      // IFC: label the result with the tool's trust requirement level.
      // This ensures data produced by high-trust tools carries a high label,
      // preventing it from flowing to low-trust contexts without explicit check.
      const requiredTrust = computeRequiredTrust(tool.registration);
      const resultLabel: SecurityLabel = createLabel(
        invocation.agentId,
        requiredTrust,
        requiredTrust >= 3 ? 'confidential' : requiredTrust >= 1 ? 'internal' : 'public',
      );

      return {
        requestId: invocation.requestId,
        success: true,
        output,
        duration,
        resultLabel,
      };
    } catch (error) {
      const duration = Date.now() - start;
      const message = error instanceof Error ? error.message : String(error);

      this.logAudit(
        'action',
        invocation.agentId,
        `invoke:${invocation.toolName}`,
        invocation.requestId,
        { input: invocation.input, duration, error: message },
        'failure',
        message,
      );

      return {
        requestId: invocation.requestId,
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message,
          retryable: tool.registration.ops.retryable,
        },
        duration,
      };
    }
  }

  listTools(): ToolRegistration[] {
    return Array.from(this.tools.values()).map((t) => t.registration);
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  private logAudit(
    category: AuditCategory,
    agentId: string,
    event: string,
    requestId: string,
    details: Record<string, unknown>,
    result: AuditEvent['result'],
    resultDetails?: string,
  ): void {
    if (!this.auditLogger) return;

    if (this.auditLogger instanceof InMemoryAuditLogger) {
      const auditEvent = this.auditLogger.createEvent(
        category,
        agentId,
        event,
        requestId,
        details,
        result,
        resultDetails,
      );
      this.auditLogger.log(auditEvent);
    } else {
      this.auditLogger.log({
        id: `audit_${Date.now()}`,
        timestamp: new Date().toISOString(),
        category,
        actor: { type: 'agent', id: agentId },
        event,
        details,
        requestId,
        result,
        resultDetails,
      });
    }
  }
}
