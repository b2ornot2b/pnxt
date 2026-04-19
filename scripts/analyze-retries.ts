/**
 * Offline analysis CLI for bridge-grammar retry telemetry.
 *
 * Reads a JSONL log produced by `RetryTelemetryCollector` + `JsonlFileSink`
 * and prints a category histogram plus the top-N rejection reasons.
 * Intended for the post-sprint M9 triage session: apply the decision
 * framework in `docs/research/lambda-type-system.md` §7 to the output.
 *
 * Sprint 20 — M9 (Type-System Decision Data).
 *
 * Usage:
 *   npx tsx scripts/analyze-retries.ts [--log <path>] [--top <n>]
 *
 * Defaults: `--log logs/bridge-telemetry.jsonl`, `--top 10`.
 *
 * Exit codes:
 *   0  analysis printed (even if the log is empty).
 *   1  the log file was not found at the given path.
 *   2  one or more log lines failed to parse as JSON.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { RetryEvent, TelemetryCategory } from '../src/types/bridge-telemetry.js';

const CATEGORIES: TelemetryCategory[] = [
  'schema_violation',
  'type_mismatch',
  'semantic_error',
  'ifc_violation',
  'other',
];

interface CliArgs {
  logPath: string;
  top: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    logPath: 'logs/bridge-telemetry.jsonl',
    top: 10,
  };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--log' && i + 1 < argv.length) {
      args.logPath = argv[++i];
    } else if (token === '--top' && i + 1 < argv.length) {
      const n = Number.parseInt(argv[++i], 10);
      if (Number.isFinite(n) && n > 0) {
        args.top = n;
      }
    } else if (token === '--help' || token === '-h') {
      printUsage();
      process.exit(0);
    }
  }
  return args;
}

function printUsage(): void {
  process.stdout.write(
    'Usage: tsx scripts/analyze-retries.ts [--log <path>] [--top <n>]\n' +
      '\n' +
      'Options:\n' +
      '  --log <path>  Telemetry JSONL log (default: logs/bridge-telemetry.jsonl).\n' +
      '  --top <n>     Number of top rejection reasons to print (default: 10).\n' +
      '  -h, --help    Show this message.\n',
  );
}

async function loadEvents(
  logPath: string,
): Promise<{ events: RetryEvent[]; parseErrors: number }> {
  let raw: string;
  try {
    raw = await readFile(logPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      process.stderr.write(`Log file not found: ${logPath}\n`);
      process.exit(1);
    }
    throw error;
  }

  const events: RetryEvent[] = [];
  let parseErrors = 0;
  const lines = raw.split('\n').filter((line) => line.trim().length > 0);
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as RetryEvent);
    } catch {
      parseErrors++;
    }
  }
  return { events, parseErrors };
}

function countCategories(events: RetryEvent[]): Map<TelemetryCategory, number> {
  const counts = new Map<TelemetryCategory, number>();
  for (const category of CATEGORIES) {
    counts.set(category, 0);
  }
  for (const event of events) {
    counts.set(event.errorCategory, (counts.get(event.errorCategory) ?? 0) + 1);
  }
  return counts;
}

function countReasons(events: RetryEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    const key = event.rejectionReason.trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function formatPercent(count: number, total: number): string {
  if (total === 0) return '0.0%';
  return `${((count / total) * 100).toFixed(1)}%`;
}

function render(
  logPath: string,
  events: RetryEvent[],
  parseErrors: number,
  top: number,
): string {
  const lines: string[] = [];
  lines.push('Bridge-Grammar Retry Telemetry Analysis');
  lines.push('========================================');
  lines.push(`Log: ${logPath}`);
  lines.push(`Events: ${events.length}`);
  if (parseErrors > 0) {
    lines.push(`Parse errors: ${parseErrors}`);
  }
  lines.push('');
  lines.push('Category Histogram');
  lines.push('------------------');
  const categoryCounts = countCategories(events);
  const maxNameLen = Math.max(...CATEGORIES.map((c) => c.length));
  for (const category of CATEGORIES) {
    const count = categoryCounts.get(category) ?? 0;
    const pct = formatPercent(count, events.length);
    lines.push(`${category.padEnd(maxNameLen)}  ${String(count).padStart(5)}  (${pct})`);
  }
  lines.push('');
  lines.push(`Top ${top} Rejection Reasons`);
  lines.push('-----------------------');
  const reasonCounts = Array.from(countReasons(events).entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, top);
  if (reasonCounts.length === 0) {
    lines.push('(no events)');
  } else {
    for (const [reason, count] of reasonCounts) {
      const snippet = reason.length > 120 ? `${reason.slice(0, 117)}...` : reason;
      lines.push(`${String(count).padStart(4)}  ${snippet}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { events, parseErrors } = await loadEvents(args.logPath);
  const resolved = resolve(args.logPath);
  process.stdout.write(render(resolved, events, parseErrors, args.top));
  if (parseErrors > 0) {
    process.exit(2);
  }
}

main().catch((error) => {
  process.stderr.write(`analyze-retries: ${(error as Error).stack ?? String(error)}\n`);
  process.exit(1);
});
