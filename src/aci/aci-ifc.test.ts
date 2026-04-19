/**
 * ACI Gateway IFC label enforcement tests.
 *
 * Validates that the gateway checks IFC labels on tool invocation inputs
 * when a requesterLabel is provided.
 */

import { InMemoryACIGateway, InMemoryAuditLogger } from './aci-gateway.js';
import type { ToolRegistration, ToolInvocation } from '../types/aci.js';
import type { TrustLevel } from '../types/agent.js';
import type { SecurityLabel } from '../types/ifc.js';
import { createLabel } from '../types/ifc.js';

function makeTool(name: string, sideEffects: string[], requiredTrust?: TrustLevel): ToolRegistration {
  return {
    name,
    description: `Test tool: ${name}`,
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    sideEffects: sideEffects as ToolRegistration['sideEffects'],
    ops: { timeout: 5000, retryable: false, idempotent: true, costCategory: 'cheap' },
    requiredTrustLevel: requiredTrust,
  };
}

function makeInvocation(
  toolName: string,
  agentId: string,
  requesterLabel?: SecurityLabel,
): ToolInvocation {
  return {
    toolName,
    input: { data: 'test' },
    agentId,
    requestId: `req-${Date.now()}`,
    requesterLabel,
  };
}

describe('ACI Gateway — IFC Label Enforcement', () => {
  let gateway: InMemoryACIGateway;
  let auditLogger: InMemoryAuditLogger;

  beforeEach(() => {
    auditLogger = new InMemoryAuditLogger();
    gateway = new InMemoryACIGateway({
      trustResolver: (id) => {
        const levels: Record<string, TrustLevel> = {
          'low-agent': 1,
          'mid-agent': 2,
          'high-agent': 4,
        };
        return levels[id];
      },
      auditLogger,
    });

    gateway.registerTool(
      makeTool('read_file', ['file_read']),
      async () => 'file contents',
    );
    gateway.registerTool(
      makeTool('write_file', ['file_write']),
      async () => 'ok',
    );
    gateway.registerTool(
      makeTool('exec_cmd', ['process']),
      async () => 'output',
    );
  });

  it('should allow invocation when input label flows to tool context', async () => {
    // low-trust label flowing to low-trust tool (file_read requires level 0)
    const label = createLabel('low-agent', 0, 'public');
    const result = await gateway.invoke(makeInvocation('read_file', 'mid-agent', label));
    expect(result.success).toBe(true);
  });

  it('should block invocation when input label cannot flow to tool context', async () => {
    // high-trust classified data flowing to low-trust tool
    const label = createLabel('high-agent', 4, 'confidential');
    const result = await gateway.invoke(makeInvocation('read_file', 'high-agent', label));
    expect(result.success).toBe(false);
    expect(result.error!.code).toBe('IFC_VIOLATION');
  });

  it('should allow invocation without requesterLabel (backward compatible)', async () => {
    // No label — should work exactly as before
    const result = await gateway.invoke(makeInvocation('write_file', 'mid-agent'));
    expect(result.success).toBe(true);
  });

  it('should allow when label trust matches tool trust requirement', async () => {
    // file_write requires trust level 1, label at trust 1
    const label = createLabel('mid-agent', 1, 'internal');
    const result = await gateway.invoke(makeInvocation('write_file', 'mid-agent', label));
    expect(result.success).toBe(true);
  });

  it('should block when classification is too high for tool context', async () => {
    // Label with 'restricted' classification flowing to a 'public' tool context
    const label = createLabel('high-agent', 0, 'restricted');
    const result = await gateway.invoke(makeInvocation('read_file', 'high-agent', label));
    expect(result.success).toBe(false);
    expect(result.error!.code).toBe('IFC_VIOLATION');
  });

  it('should audit IFC violations', async () => {
    const label = createLabel('high-agent', 4, 'restricted');
    await gateway.invoke(makeInvocation('read_file', 'high-agent', label));

    const events = auditLogger.getEvents({ agentId: 'high-agent' });
    const ifcEvent = events.find((e) => e.resultDetails?.includes('IFC violation'));
    expect(ifcEvent).toBeDefined();
    expect(ifcEvent!.result).toBe('blocked');
  });

  it('should check trust level before IFC label', async () => {
    // Agent with trust 1 trying to use exec_cmd (requires trust 3) — should fail trust check first
    const label = createLabel('low-agent', 1, 'internal');
    const result = await gateway.invoke(makeInvocation('exec_cmd', 'low-agent', label));
    expect(result.success).toBe(false);
    expect(result.error!.code).toBe('INSUFFICIENT_TRUST');
  });
});

describe('ACI Gateway — llm_call forces external label (Sprint 18 / M7)', () => {
  let gateway: InMemoryACIGateway;

  beforeEach(() => {
    gateway = new InMemoryACIGateway({
      trustResolver: (id) => {
        const levels: Record<string, TrustLevel> = {
          'mid-agent': 2,
          'high-agent': 4,
        };
        return levels[id];
      },
    });
    // Plain LLM tool — models the Sprint 18 llm-inference registration.
    gateway.registerTool(
      makeTool('llm-call', ['network', 'llm_call'], 2),
      async () => ({ response: 'oracle answer', tokensUsed: 5, model: 'mock' }),
    );
    // Same trust level but no llm_call side effect — should NOT be forced external.
    gateway.registerTool(
      makeTool('http-fetch', ['network'], 2),
      async () => ({ status: 200, body: 'ok' }),
    );
  });

  it('stamps the result with {trustLevel:1, classification:"external"} when llm_call is present', async () => {
    const result = await gateway.invoke(makeInvocation('llm-call', 'mid-agent'));
    expect(result.success).toBe(true);
    expect(result.resultLabel?.classification).toBe('external');
    expect(result.resultLabel?.trustLevel).toBe(1);
  });

  it('stamps external even when a high-trust agent invokes the tool', async () => {
    const result = await gateway.invoke(makeInvocation('llm-call', 'high-agent'));
    expect(result.resultLabel?.classification).toBe('external');
    expect(result.resultLabel?.trustLevel).toBe(1);
  });

  it('preserves the agent id as owner of the external-labeled result', async () => {
    const result = await gateway.invoke(makeInvocation('llm-call', 'mid-agent'));
    expect(result.resultLabel?.owner).toBe('mid-agent');
  });

  it('does NOT force external on a plain network handler (http-fetch remains internal)', async () => {
    const result = await gateway.invoke(makeInvocation('http-fetch', 'mid-agent'));
    expect(result.resultLabel?.classification).toBe('internal');
    expect(result.resultLabel?.classification).not.toBe('external');
  });

  it('produces a result label that cannot flow to a public sink (noninterference)', async () => {
    const result = await gateway.invoke(makeInvocation('llm-call', 'mid-agent'));
    expect(result.success).toBe(true);
    // Re-invoke with the external-labeled output as requesterLabel into a public-level tool.
    gateway.registerTool(
      makeTool('public-sink', ['none'], 0),
      async () => 'ok',
    );
    const sinkResult = await gateway.invoke({
      toolName: 'public-sink',
      input: {},
      agentId: 'mid-agent',
      requestId: 'req-sink',
      requesterLabel: result.resultLabel!,
    });
    expect(sinkResult.success).toBe(false);
    expect(sinkResult.error?.code).toBe('IFC_VIOLATION');
  });

  it('external-labeled output is also blocked at any trusted sink (internal/confidential/restricted)', async () => {
    // The gateway derives a tool's input context from its required trust,
    // which maxes out at `confidential` (trust 3+). `external` sits above
    // `restricted`, so data tagged external is trapped — no declassification
    // node ships in Sprint 18 (future work). This test pins the invariant.
    const first = await gateway.invoke(makeInvocation('llm-call', 'mid-agent'));
    expect(first.resultLabel?.classification).toBe('external');

    const reinvoke = await gateway.invoke({
      toolName: 'http-fetch',
      input: {},
      agentId: 'mid-agent',
      requestId: 'req-reinvoke',
      requesterLabel: first.resultLabel!,
    });
    expect(reinvoke.success).toBe(false);
    expect(reinvoke.error?.code).toBe('IFC_VIOLATION');
  });

  it('non-llm tools remain unaffected by the override path', async () => {
    const result = await gateway.invoke(makeInvocation('http-fetch', 'mid-agent'));
    expect(result.success).toBe(true);
    expect(result.resultLabel?.trustLevel).toBe(2);
    expect(result.resultLabel?.classification).toBe('internal');
  });
});
