/**
 * Human-in-the-loop delivery surfaces (Sprint 17, M6).
 *
 * A `HumanGateway` is the seam between the VPIR interpreter's `executeHuman()`
 * and the outside world. Swapping delivery surfaces (CLI, HTTP webhook, Slack,
 * email) requires only a new `prompt()` implementation — no interpreter or
 * protocol-layer changes.
 *
 * Two reference implementations are provided:
 * - `CLIHumanGateway`  — interactive stdin/stdout for development
 * - `NoopHumanGateway` — test double that auto-resolves with a configured value
 */

import { createInterface } from 'node:readline';

import type {
  HumanGateway,
  HumanGatewayRequest,
  HumanGatewayResponse,
} from '../types/vpir-execution.js';

export type { HumanGateway, HumanGatewayRequest, HumanGatewayResponse };

/**
 * Interactive CLI gateway. Writes the prompt + rendered provenance summary
 * to stdout and reads a single line from stdin as the response.
 */
export class CLIHumanGateway implements HumanGateway {
  constructor(
    private readonly input: NodeJS.ReadableStream = process.stdin,
    private readonly output: NodeJS.WritableStream = process.stdout,
  ) {}

  async prompt(req: HumanGatewayRequest): Promise<HumanGatewayResponse> {
    const rl = createInterface({ input: this.input, output: this.output });

    try {
      this.output.write(`\n── pnxt human-in-the-loop — prompt ${req.promptId} ──\n`);
      this.output.write(`${req.message}\n`);
      if (req.requiresExplicitProvenance) {
        this.output.write(
          `provenance: owner=${req.requesterLabel.owner} trust=${req.requesterLabel.trustLevel} classification=${req.requesterLabel.classification}\n`,
        );
        if (req.context.size > 0) {
          this.output.write(`context: ${renderContext(req.context)}\n`);
        }
      }
      this.output.write('> ');

      const response = await readLine(rl, req.timeout);

      return {
        response,
        humanId: process.env.HUMAN_ID ?? 'operator',
        respondedAt: Date.now(),
      };
    } finally {
      rl.close();
    }
  }
}

/**
 * Test double that resolves with a pre-configured response, optionally after
 * a delay. Never blocks on stdin, so safe for CI and unit tests.
 */
export class NoopHumanGateway implements HumanGateway {
  private callCount = 0;

  constructor(
    private readonly config: {
      response: unknown;
      humanId?: string;
      delayMs?: number;
    },
  ) {}

  get calls(): number {
    return this.callCount;
  }

  async prompt(req: HumanGatewayRequest): Promise<HumanGatewayResponse> {
    this.callCount++;
    if (this.config.delayMs && this.config.delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.config.delayMs));
    }
    void req;
    return {
      response: this.config.response,
      humanId: this.config.humanId ?? 'noop-operator',
      respondedAt: Date.now(),
    };
  }
}

function renderContext(ctx: Map<string, unknown>): string {
  const entries: string[] = [];
  for (const [key, value] of ctx.entries()) {
    entries.push(`${key}=${safeStringify(value)}`);
  }
  return entries.join(', ');
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function readLine(
  rl: ReturnType<typeof createInterface>,
  timeoutMs: number | undefined,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout | undefined;
    const onLine = (line: string): void => {
      if (timer) clearTimeout(timer);
      resolve(line);
    };
    rl.once('line', onLine);
    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        rl.off('line', onLine);
        reject(new Error(`human-gateway timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    }
  });
}
