import { PassThrough } from 'node:stream';

import { CLIHumanGateway, NoopHumanGateway } from './human-gateway.js';
import type { HumanGatewayRequest } from './human-gateway.js';
import { createLabel } from '../types/ifc.js';

function makeRequest(overrides: Partial<HumanGatewayRequest> = {}): HumanGatewayRequest {
  return {
    promptId: 'node-1',
    message: 'Approve this action?',
    context: new Map<string, unknown>(),
    requesterLabel: createLabel('agent-a', 4, 'internal'),
    ...overrides,
  };
}

describe('NoopHumanGateway', () => {
  it('resolves with the configured response and default humanId', async () => {
    const gateway = new NoopHumanGateway({ response: 'approved' });

    const result = await gateway.prompt(makeRequest());

    expect(result.response).toBe('approved');
    expect(result.humanId).toBe('noop-operator');
    expect(typeof result.respondedAt).toBe('number');
    expect(result.respondedAt).toBeLessThanOrEqual(Date.now());
  });

  it('honours a configured humanId', async () => {
    const gateway = new NoopHumanGateway({ response: { ok: true }, humanId: 'alice' });

    const result = await gateway.prompt(makeRequest());

    expect(result.humanId).toBe('alice');
    expect(result.response).toEqual({ ok: true });
  });

  it('counts invocations for crash-resume assertions', async () => {
    const gateway = new NoopHumanGateway({ response: 1 });

    expect(gateway.calls).toBe(0);
    await gateway.prompt(makeRequest());
    await gateway.prompt(makeRequest());
    expect(gateway.calls).toBe(2);
  });

  it('delays when delayMs is configured', async () => {
    const gateway = new NoopHumanGateway({ response: 'ok', delayMs: 50 });
    const start = Date.now();

    await gateway.prompt(makeRequest());

    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });
});

describe('CLIHumanGateway', () => {
  it('round-trips a stdin line back as the response value', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const gateway = new CLIHumanGateway(input, output);

    const promise = gateway.prompt(
      makeRequest({ message: 'do it?', requiresExplicitProvenance: true }),
    );

    input.write('approved\n');

    const result = await promise;
    expect(result.response).toBe('approved');
    // humanId falls back to HUMAN_ID env or 'operator'
    expect(typeof result.humanId).toBe('string');
    expect(result.humanId.length).toBeGreaterThan(0);
  });

  it('surfaces prompt, promptId, and provenance summary to stdout', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on('data', (chunk) => chunks.push(chunk.toString()));

    const gateway = new CLIHumanGateway(input, output);
    const promise = gateway.prompt(
      makeRequest({
        promptId: 'human-42',
        message: 'Confirm?',
        requiresExplicitProvenance: true,
        context: new Map([['inputA', 'hello']]),
      }),
    );

    input.write('y\n');
    await promise;

    const combined = chunks.join('');
    expect(combined).toContain('human-42');
    expect(combined).toContain('Confirm?');
    expect(combined).toContain('provenance:');
    expect(combined).toContain('inputA');
  });

  it('rejects when timeout expires before a response arrives', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const gateway = new CLIHumanGateway(input, output);

    await expect(
      gateway.prompt(makeRequest({ timeout: 20 })),
    ).rejects.toThrow(/timeout/);
  });
});
