/**
 * Bridge Grammar Auto-Repair Engine — automatic correction of common LLM output errors.
 *
 * Attempts to repair malformed LLM output before retrying, reducing the number of
 * LLM round-trips needed for successful generation. Operates on raw JSON (pre-validation)
 * and applies safe, deterministic transformations.
 *
 * Repair strategies:
 * - Missing fields: inject defaults (createdAt, label, roots, terminals)
 * - Truncated output: close unbalanced brackets/braces
 * - Wrong enum values: fuzzy-match to closest valid value
 * - Missing roots/terminals: auto-compute from graph topology
 * - Duplicate node IDs: auto-suffix with index
 *
 * Sprint 12 deliverable — Advisory Panel: Sutskever, Pearl, de Moura.
 */

import {
  type BridgeError,
  type BridgeDiagnosis,
  BridgeErrorCategory,
  TOPOLOGY_ERRORS,
} from './bridge-errors.js';

// ── Types ───────────────────────────────────────────────────────────

/**
 * A single repair action applied to the output.
 */
export interface RepairAction {
  /** Repair strategy type. */
  type: string;
  /** JSON pointer path where the repair was applied. */
  path: string;
  /** Human-readable description of what was fixed. */
  description: string;
}

/**
 * Result of an auto-repair attempt.
 */
export interface RepairResult {
  /** The repaired JSON value (deep-cloned from input). */
  repaired: unknown;
  /** List of repairs that were applied. */
  appliedRepairs: RepairAction[];
  /** Errors that could not be repaired. */
  remainingErrors: BridgeError[];
}

// ── Valid Enum Values ───────────────────────────────────────────────

const VALID_NODE_TYPES = ['inference', 'observation', 'action', 'assertion', 'composition'];
const VALID_CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'];
const VALID_EVIDENCE_TYPES = ['data', 'rule', 'model_output'];

// ── Fuzzy Matching ──────────────────────────────────────────────────

/**
 * Compute Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Find the closest match from a list of valid values.
 * Returns null if no match is close enough.
 */
function fuzzyMatch(value: string, validValues: string[]): string | null {
  const lower = value.toLowerCase().trim();
  let best: string | null = null;
  let bestDist = Infinity;

  for (const valid of validValues) {
    // Exact match (case-insensitive)
    if (lower === valid.toLowerCase()) return valid;

    const dist = levenshtein(lower, valid.toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      best = valid;
    }
  }

  // Allow up to half the length of the target as edit distance
  const maxDist = Math.max(3, Math.floor((best?.length ?? 0) / 2));
  return bestDist <= maxDist ? best : null;
}

// ── JSON Truncation Repair ──────────────────────────────────────────

/**
 * Attempt to close truncated JSON by balancing brackets/braces.
 */
export function repairTruncatedJSON(raw: string): { repaired: string; wasRepaired: boolean } {
  if (!raw || raw.trim().length === 0) {
    return { repaired: raw, wasRepaired: false };
  }

  const closers: string[] = [];
  let inString = false;
  let escape = false;

  for (const ch of raw) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') closers.push('}');
    else if (ch === '[') closers.push(']');
    else if (ch === '}' || ch === ']') closers.pop();
  }

  if (closers.length === 0 && !inString) {
    return { repaired: raw, wasRepaired: false };
  }

  let repaired = raw;

  // Close open string
  if (inString) {
    repaired += '"';
  }

  // Close brackets/braces in reverse order
  while (closers.length > 0) {
    repaired += closers.pop();
  }

  return { repaired, wasRepaired: true };
}

// ── Field-Level Repairs ─────────────────────────────────────────────

function makeDefaultLabel(): Record<string, unknown> {
  return {
    owner: 'llm-generator',
    trustLevel: 2,
    classification: 'internal',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Inject missing fields into a node object.
 */
function repairNodeFields(
  node: Record<string, unknown>,
  repairs: RepairAction[],
  nodeIndex: number,
): void {
  const path = `/nodes/${nodeIndex}`;

  if (typeof node.createdAt !== 'string' || node.createdAt === '') {
    node.createdAt = new Date().toISOString();
    repairs.push({
      type: 'inject_default',
      path: `${path}/createdAt`,
      description: 'Injected default ISO 8601 timestamp',
    });
  }

  if (typeof node.label !== 'object' || node.label === null) {
    node.label = makeDefaultLabel();
    repairs.push({
      type: 'inject_default',
      path: `${path}/label`,
      description: 'Injected default security label',
    });
  }

  if (!Array.isArray(node.evidence) || node.evidence.length === 0) {
    node.evidence = [{ type: 'data', source: 'auto-repair', confidence: 0.5 }];
    repairs.push({
      type: 'inject_default',
      path: `${path}/evidence`,
      description: 'Injected default evidence entry',
    });
  }

  if (!Array.isArray(node.inputs)) {
    node.inputs = [];
    repairs.push({
      type: 'inject_default',
      path: `${path}/inputs`,
      description: 'Injected empty inputs array',
    });
  }

  if (!Array.isArray(node.outputs)) {
    node.outputs = [{ port: 'result', dataType: 'unknown' }];
    repairs.push({
      type: 'inject_default',
      path: `${path}/outputs`,
      description: 'Injected default outputs array',
    });
  }

  if (typeof node.verifiable !== 'boolean') {
    node.verifiable = true;
    repairs.push({
      type: 'inject_default',
      path: `${path}/verifiable`,
      description: 'Injected default verifiable=true',
    });
  }
}

/**
 * Fuzzy-fix enum values in a node.
 */
function repairNodeEnums(
  node: Record<string, unknown>,
  repairs: RepairAction[],
  nodeIndex: number,
): void {
  const path = `/nodes/${nodeIndex}`;

  // Fix node type
  if (typeof node.type === 'string' && !VALID_NODE_TYPES.includes(node.type)) {
    const match = fuzzyMatch(node.type, VALID_NODE_TYPES);
    if (match) {
      repairs.push({
        type: 'fix_enum',
        path: `${path}/type`,
        description: `Fixed node type "${node.type}" → "${match}"`,
      });
      node.type = match;
    }
  }

  // Fix evidence types
  if (Array.isArray(node.evidence)) {
    for (let i = 0; i < node.evidence.length; i++) {
      const ev = node.evidence[i] as Record<string, unknown>;
      if (typeof ev?.type === 'string' && !VALID_EVIDENCE_TYPES.includes(ev.type)) {
        const match = fuzzyMatch(ev.type, VALID_EVIDENCE_TYPES);
        if (match) {
          repairs.push({
            type: 'fix_enum',
            path: `${path}/evidence/${i}/type`,
            description: `Fixed evidence type "${ev.type}" → "${match}"`,
          });
          ev.type = match;
        }
      }
    }
  }

  // Fix classification in label
  if (typeof node.label === 'object' && node.label !== null) {
    const label = node.label as Record<string, unknown>;
    if (typeof label.classification === 'string' && !VALID_CLASSIFICATIONS.includes(label.classification)) {
      const match = fuzzyMatch(label.classification, VALID_CLASSIFICATIONS);
      if (match) {
        repairs.push({
          type: 'fix_enum',
          path: `${path}/label/classification`,
          description: `Fixed classification "${label.classification}" → "${match}"`,
        });
        label.classification = match;
      }
    }
  }
}

/**
 * Fix duplicate node IDs by appending a suffix.
 */
function repairDuplicateIds(
  nodes: Record<string, unknown>[],
  repairs: RepairAction[],
): void {
  const seen = new Map<string, number>();

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const id = node.id as string;
    if (!id) continue;

    const count = seen.get(id) ?? 0;
    if (count > 0) {
      const newId = `${id}-${count}`;
      repairs.push({
        type: 'fix_duplicate_id',
        path: `/nodes/${i}/id`,
        description: `Renamed duplicate ID "${id}" → "${newId}"`,
      });
      node.id = newId;
    }
    seen.set(id, count + 1);
  }
}

/**
 * Compute roots and terminals from graph topology.
 */
function computeRootsAndTerminals(
  nodes: Record<string, unknown>[],
): { roots: string[]; terminals: string[] } {
  const nodeIds = new Set<string>();
  const hasInputFrom = new Set<string>(); // nodes that receive input
  const isReferencedBy = new Set<string>(); // nodes whose output is consumed

  for (const node of nodes) {
    const id = node.id as string;
    if (id) nodeIds.add(id);

    if (Array.isArray(node.inputs)) {
      for (const input of node.inputs) {
        const ref = input as Record<string, unknown>;
        if (typeof ref.nodeId === 'string') {
          isReferencedBy.add(ref.nodeId);
          hasInputFrom.add(id);
        }
      }
    }
  }

  const roots: string[] = [];
  const terminals: string[] = [];

  for (const id of nodeIds) {
    if (!hasInputFrom.has(id)) roots.push(id);
    if (!isReferencedBy.has(id)) terminals.push(id);
  }

  return { roots, terminals };
}

// ── Main Repair Function ────────────────────────────────────────────

/**
 * Attempt to auto-repair a malformed bridge grammar output.
 *
 * Applies safe, deterministic transformations to fix common LLM output errors.
 * The repaired output should be re-validated through the schema validator.
 *
 * @param raw - The raw JSON value from LLM output (parsed or string)
 * @param diagnosis - The error diagnosis from bridge-errors
 * @returns Repair result with the fixed output and list of applied repairs
 */
export function repairBridgeOutput(
  raw: unknown,
  diagnosis: BridgeDiagnosis,
): RepairResult {
  const repairs: RepairAction[] = [];
  const remainingErrors: BridgeError[] = [];

  // Handle string input (possibly truncated)
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    const hasTruncation = diagnosis.errors.some(
      (e) => e.category === BridgeErrorCategory.TRUNCATION,
    );

    if (hasTruncation) {
      const { repaired, wasRepaired } = repairTruncatedJSON(raw);
      if (wasRepaired) {
        repairs.push({
          type: 'close_json',
          path: '',
          description: 'Closed truncated JSON by balancing brackets/braces',
        });
      }
      try {
        obj = JSON.parse(repaired);
      } catch {
        remainingErrors.push(...diagnosis.errors);
        return { repaired: raw, appliedRepairs: repairs, remainingErrors };
      }
    } else {
      try {
        obj = JSON.parse(raw);
      } catch {
        remainingErrors.push(...diagnosis.errors);
        return { repaired: raw, appliedRepairs: repairs, remainingErrors };
      }
    }
  }

  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    remainingErrors.push(...diagnosis.errors);
    return { repaired: obj, appliedRepairs: repairs, remainingErrors };
  }

  // Deep clone to avoid mutating the original
  const graph = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;

  // Repair graph-level fields
  if (typeof graph.id !== 'string' || graph.id === '') {
    graph.id = `vpir-repaired-${Date.now()}`;
    repairs.push({
      type: 'inject_default',
      path: '/id',
      description: 'Injected default graph ID',
    });
  }

  if (typeof graph.name !== 'string' || graph.name === '') {
    graph.name = 'Repaired VPIR Graph';
    repairs.push({
      type: 'inject_default',
      path: '/name',
      description: 'Injected default graph name',
    });
  }

  if (typeof graph.createdAt !== 'string' || graph.createdAt === '') {
    graph.createdAt = new Date().toISOString();
    repairs.push({
      type: 'inject_default',
      path: '/createdAt',
      description: 'Injected default graph timestamp',
    });
  }

  // Repair nodes
  if (Array.isArray(graph.nodes)) {
    const nodes = graph.nodes as Record<string, unknown>[];

    // Fix duplicate IDs first
    repairDuplicateIds(nodes, repairs);

    // Fix individual node fields and enums
    for (let i = 0; i < nodes.length; i++) {
      if (typeof nodes[i] === 'object' && nodes[i] !== null) {
        repairNodeFields(nodes[i], repairs, i);
        repairNodeEnums(nodes[i], repairs, i);
      }
    }

    // Compute roots/terminals if missing
    const hasRoots = Array.isArray(graph.roots) && graph.roots.length > 0;
    const hasTerminals = Array.isArray(graph.terminals) && graph.terminals.length > 0;

    if (!hasRoots || !hasTerminals) {
      const computed = computeRootsAndTerminals(nodes);

      if (!hasRoots && computed.roots.length > 0) {
        graph.roots = computed.roots;
        repairs.push({
          type: 'compute_topology',
          path: '/roots',
          description: `Auto-computed roots from topology: [${computed.roots.join(', ')}]`,
        });
      }

      if (!hasTerminals && computed.terminals.length > 0) {
        graph.terminals = computed.terminals;
        repairs.push({
          type: 'compute_topology',
          path: '/terminals',
          description: `Auto-computed terminals from topology: [${computed.terminals.join(', ')}]`,
        });
      }
    }
  }

  // Determine which errors remain unfixed
  for (const error of diagnosis.errors) {
    const wasRepaired = repairs.some((r) => {
      if (error.path && r.path && error.path === r.path) return true;
      if (error.category === BridgeErrorCategory.TRUNCATION && r.type === 'close_json') return true;
      if (error.code === TOPOLOGY_ERRORS.MISSING_ROOTS && r.path === '/roots') return true;
      if (error.code === TOPOLOGY_ERRORS.MISSING_TERMINALS && r.path === '/terminals') return true;
      return false;
    });

    if (!wasRepaired) {
      // Check if it was a category-level repair
      const categoryRepaired =
        (error.category === BridgeErrorCategory.SCHEMA && repairs.some((r) => r.path.startsWith(error.path))) ||
        (error.code === TOPOLOGY_ERRORS.DUPLICATE_NODE_ID && repairs.some((r) => r.type === 'fix_duplicate_id'));

      if (!categoryRepaired) {
        remainingErrors.push(error);
      }
    }
  }

  return { repaired: graph, appliedRepairs: repairs, remainingErrors };
}
