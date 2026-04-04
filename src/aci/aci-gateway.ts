/**
 * ACI Gateway — mediates all agent interactions with external systems.
 *
 * Implements the gateway described in:
 * - docs/research/phase-3/01-agent-computer-interface-specification.md
 * - docs/research/phase-3/06-implementation-reference-architecture.md
 */

import type { ToolRegistration, ToolInvocation, ToolResult } from '../types/aci.js';

export type ToolHandler = (input: unknown) => Promise<unknown>;

interface RegisteredTool {
  registration: ToolRegistration;
  handler: ToolHandler;
}

export interface ACIGateway {
  registerTool(registration: ToolRegistration, handler: ToolHandler): void;

  invoke(invocation: ToolInvocation): Promise<ToolResult>;

  listTools(): ToolRegistration[];

  hasTool(name: string): boolean;
}

/**
 * In-memory ACI Gateway implementation for prototyping and testing.
 */
export class InMemoryACIGateway implements ACIGateway {
  private tools = new Map<string, RegisteredTool>();

  registerTool(registration: ToolRegistration, handler: ToolHandler): void {
    if (this.tools.has(registration.name)) {
      throw new Error(`Tool already registered: ${registration.name}`);
    }
    this.tools.set(registration.name, { registration, handler });
  }

  async invoke(invocation: ToolInvocation): Promise<ToolResult> {
    const tool = this.tools.get(invocation.toolName);
    if (!tool) {
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

      return {
        requestId: invocation.requestId,
        success: true,
        output,
        duration: Date.now() - start,
      };
    } catch (error) {
      return {
        requestId: invocation.requestId,
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : String(error),
          retryable: tool.registration.ops.retryable,
        },
        duration: Date.now() - start,
      };
    }
  }

  listTools(): ToolRegistration[] {
    return Array.from(this.tools.values()).map((t) => t.registration);
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }
}
