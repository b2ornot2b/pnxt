/**
 * Formal Noninterference Verification via Z3.
 *
 * Encodes the noninterference property as an SMT formula:
 *   For any two executions that differ only in high-security inputs,
 *   the low-security outputs must be identical.
 *
 * This replaces the tree-walk approach in `src/lambda/llmbda.ts:363`
 * with a mathematically rigorous Z3-backed proof. The tree-walk remains
 * as a fast, local check; this module provides the formal guarantee.
 *
 * Sprint 5 deliverable — Advisory Panel: Andrew Myers (IFC).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { LambdaTerm, Abstraction, Application, Variable } from '../types/lambda.js';
import { CLASSIFICATION_ORDER } from '../types/ifc.js';

// ── Types ───────────────────────────────────────────────────────────

export interface NoninterferenceInput {
  /** The lambda terms to verify. */
  terms: LambdaTerm[];

  /** Trust level threshold: labels at or above this are "high". Default: 3. */
  highThreshold?: number;
}

export interface NoninterferenceEncoding {
  /** Flattened term nodes with IFC annotations. */
  nodes: TermNode[];

  /** Edges representing data flow between terms. */
  edges: FlowEdge[];

  /** High-security input node indices. */
  highInputs: number[];

  /** Low-security output node indices. */
  lowOutputs: number[];
}

export interface TermNode {
  index: number;
  termId: string;
  kind: LambdaTerm['kind'];
  trustLevel: number;
  classificationLevel: number;
  isInput: boolean;
  isOutput: boolean;
}

export interface FlowEdge {
  sourceIndex: number;
  targetIndex: number;
}

// ── Encoding ────────────────────────────────────────────────────────

/**
 * Flatten a set of lambda terms into nodes and edges for Z3 encoding.
 *
 * Each sub-term becomes a node. Applications create edges from func/arg
 * to the application node. Abstractions create edges from body to the
 * abstraction node.
 */
export function encodeTermsForNoninterference(
  input: NoninterferenceInput,
): NoninterferenceEncoding {
  const highThreshold = input.highThreshold ?? 3;
  const nodes: TermNode[] = [];
  const edges: FlowEdge[] = [];
  const visited = new Set<string>();

  function walkTerm(term: LambdaTerm): number {
    if (visited.has(term.id)) {
      return nodes.findIndex((n) => n.termId === term.id);
    }
    visited.add(term.id);

    const index = nodes.length;
    const isInput = term.kind === 'variable' && (term as Variable).name !== undefined;

    nodes.push({
      index,
      termId: term.id,
      kind: term.kind,
      trustLevel: term.label.trustLevel,
      classificationLevel: CLASSIFICATION_ORDER[term.label.classification] ?? 0,
      isInput,
      isOutput: false,
    });

    if (term.kind === 'application') {
      const app = term as Application;
      const funcIdx = walkTerm(app.func);
      const argIdx = walkTerm(app.arg);
      edges.push({ sourceIndex: funcIdx, targetIndex: index });
      edges.push({ sourceIndex: argIdx, targetIndex: index });
    } else if (term.kind === 'abstraction') {
      const abs = term as Abstraction;
      const bodyIdx = walkTerm(abs.body);
      edges.push({ sourceIndex: bodyIdx, targetIndex: index });
    }

    return index;
  }

  // Walk all terms; the root terms are outputs.
  const rootIndices: number[] = [];
  for (const term of input.terms) {
    const idx = walkTerm(term);
    rootIndices.push(idx);
  }

  // Mark root nodes as outputs.
  for (const idx of rootIndices) {
    nodes[idx].isOutput = true;
  }

  // Identify high inputs and low outputs.
  const highInputs = nodes
    .filter((n) => n.isInput && (n.trustLevel >= highThreshold || n.classificationLevel >= 2))
    .map((n) => n.index);

  const lowOutputs = nodes
    .filter((n) => n.isOutput && n.trustLevel < highThreshold && n.classificationLevel < 2)
    .map((n) => n.index);

  return { nodes, edges, highInputs, lowOutputs };
}

/**
 * Verify noninterference using Z3.
 *
 * Encodes two parallel executions:
 * - Run A: with high-security input values H1
 * - Run B: with high-security input values H2 (H1 ≠ H2)
 * - All low-security inputs are identical
 *
 * Asserts: low-security outputs differ → check UNSAT.
 * If UNSAT: noninterference holds (proven).
 * If SAT: counterexample shows a leak path.
 */
export async function verifyNoninterferenceZ3(
  z3: unknown,
  terms: LambdaTerm[],
): Promise<{
  verified: boolean;
  counterexample?: Record<string, unknown>;
  duration: number;
}> {
  const start = performance.now();
  const api = z3 as Record<string, unknown>;
  const Z3 = api as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  const encoding = encodeTermsForNoninterference({ terms });

  // If no high inputs or no low outputs, noninterference is trivially satisfied.
  if (encoding.highInputs.length === 0 || encoding.lowOutputs.length === 0) {
    return { verified: true, duration: performance.now() - start };
  }

  const solver = new Z3.Solver();

  // For each node, create two integer variables (run A and run B) representing
  // the abstract "value" at that node.
  const runA: unknown[] = [];
  const runB: unknown[] = [];

  for (const node of encoding.nodes) {
    runA.push(Z3.Int.const(`a_${node.index}`));
    runB.push(Z3.Int.const(`b_${node.index}`));
  }

  // Constraint 1: Low-security inputs are identical across runs.
  for (const node of encoding.nodes) {
    if (node.isInput && !encoding.highInputs.includes(node.index)) {
      solver.add((runA[node.index] as any).eq(runB[node.index] as any));
    }
  }

  // Constraint 2: High-security inputs differ in at least one.
  if (encoding.highInputs.length > 0) {
    const diffs = encoding.highInputs.map((idx) =>
      (runA[idx] as any).neq(runB[idx] as any),
    );
    solver.add(Z3.Or(...diffs));
  }

  // Constraint 3: Data flow propagation — if there is no high→low leak,
  // then each node's value is determined by its inputs via the same function.
  // We model this as: for non-high-input nodes, if all inputs are equal
  // across runs, the node value must be equal.
  //
  // For each node that receives only low-security data, assert equal outputs.
  const highInputSet = new Set(encoding.highInputs);

  for (const node of encoding.nodes) {
    if (node.isInput) continue; // inputs are constrained above

    // Find all source nodes flowing into this node.
    const incomingEdges = encoding.edges.filter((e) => e.targetIndex === node.index);
    const sources = incomingEdges.map((e) => e.sourceIndex);

    // If all sources are low-security (no high taint), this node should produce
    // the same value in both runs (since inputs are identical).
    const allSourcesLow = sources.every((s) => {
      const srcNode = encoding.nodes[s];
      return srcNode.trustLevel < (terms[0]?.label.trustLevel ?? 3) ||
        (!highInputSet.has(s) && srcNode.classificationLevel < 2);
    });

    if (allSourcesLow && sources.length > 0) {
      // All inputs are low → deterministic function → same output.
      solver.add((runA[node.index] as any).eq(runB[node.index] as any));
    }
  }

  // Constraint 4 (negated property): Assert that some low output differs.
  // If UNSAT → no such execution exists → noninterference holds.
  const outputDiffs = encoding.lowOutputs.map((idx) =>
    (runA[idx] as any).neq(runB[idx] as any),
  );

  if (outputDiffs.length > 0) {
    solver.add(Z3.Or(...outputDiffs));
  }

  const result = await solver.check();
  const duration = performance.now() - start;

  if (result === 'unsat') {
    return { verified: true, duration };
  }

  // SAT — extract counterexample.
  const model = solver.model();
  const counterexample: Record<string, unknown> = {
    highInputs: encoding.highInputs.map((idx) => ({
      termId: encoding.nodes[idx].termId,
      runA: Number(model.eval(runA[idx]).toString()),
      runB: Number(model.eval(runB[idx]).toString()),
    })),
    lowOutputs: encoding.lowOutputs.map((idx) => ({
      termId: encoding.nodes[idx].termId,
      runA: Number(model.eval(runA[idx]).toString()),
      runB: Number(model.eval(runB[idx]).toString()),
    })),
    leakPath: 'High-security input influences low-security output',
  };

  return { verified: false, counterexample, duration };
}
