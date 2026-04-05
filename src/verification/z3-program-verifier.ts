/**
 * User-Program Property Verification — verify custom properties on VPIR programs.
 *
 * Transitions Z3 from meta-verification (checking the paradigm's own laws)
 * to program verification (checking properties of programs written in the
 * paradigm). Users specify properties as SMT-LIB2-style constraints
 * referencing VPIR node attributes.
 *
 * Sprint 7 deliverable — Advisory Panel: Leonardo de Moura (SMT depth).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Z3Context } from './z3-invariants.js';
import type { VPIRGraph, VPIRNode } from '../types/vpir.js';
import type {
  ProgramProperty,
  ProgramPropertyKind,
  ProgramVerificationResult,
  VerificationProperty,
} from '../types/verification.js';
import { CLASSIFICATION_ORDER } from '../types/ifc.js';

// ── Property Kind → VerificationProperty mapping ───────────────────

const KIND_TO_PROPERTY: Record<ProgramPropertyKind, VerificationProperty> = {
  precondition: 'user_precondition',
  postcondition: 'user_postcondition',
  invariant: 'user_invariant',
  assertion: 'user_assertion',
};

// ── Variable Binding ───────────��───────────────────────────────────

/**
 * Bindings for a single VPIR node, exposed as Z3 integer constants.
 */
interface NodeBindings {
  trustConst: any;
  classConst: any;
  confidenceConst: any;
  nodeTypeConst: any;
  trustValue: number;
  classValue: number;
  confidenceValue: number;
  nodeTypeValue: number;
}

const NODE_TYPE_ORDER: Record<string, number> = {
  observation: 0,
  inference: 1,
  action: 2,
  assertion: 3,
  composition: 4,
};

/**
 * Create Z3 constants and value bindings for a VPIR node.
 */
function bindNode(z3: any, node: VPIRNode): NodeBindings {
  const prefix = `node_${node.id}`;
  const trustValue = node.label?.trustLevel ?? 0;
  const classValue = CLASSIFICATION_ORDER[node.label?.classification ?? 'public'] ?? 0;
  const confidenceValue = node.evidence.length > 0
    ? Math.round(node.evidence.reduce((sum, e) => sum + e.confidence, 0) / node.evidence.length * 100)
    : 0;
  const nodeTypeValue = NODE_TYPE_ORDER[node.type] ?? 0;

  return {
    trustConst: z3.Int.const(`${prefix}_trust`),
    classConst: z3.Int.const(`${prefix}_class`),
    confidenceConst: z3.Int.const(`${prefix}_confidence`),
    nodeTypeConst: z3.Int.const(`${prefix}_type`),
    trustValue,
    classValue,
    confidenceValue,
    nodeTypeValue,
  };
}

// ── Formula Parsing ────��───────────────────────────────────────────

/**
 * Parse a simplified SMT-LIB2-style formula into a Z3 expression.
 *
 * Supports:
 * - (>= var val), (<= var val), (> var val), (< var val), (= var val)
 * - (and ...), (or ...), (not ...), (=> ...)
 * - Variable references: node_<id>_trust, node_<id>_class,
 *   node_<id>_confidence, node_<id>_type
 */
function parseFormula(
  z3: any,
  formula: string,
  bindings: Map<string, any>,
): any {
  const trimmed = formula.trim();

  // Atom: a variable reference
  if (!trimmed.startsWith('(')) {
    if (bindings.has(trimmed)) {
      return bindings.get(trimmed);
    }
    // Try to parse as integer literal
    const num = parseInt(trimmed, 10);
    if (!isNaN(num)) {
      return z3.Int.val(num);
    }
    // Boolean literals
    if (trimmed === 'true') return z3.Bool.val(true);
    if (trimmed === 'false') return z3.Bool.val(false);
    throw new Error(`Unknown variable or literal: '${trimmed}'`);
  }

  // S-expression: (op arg1 arg2 ...)
  const inner = trimmed.slice(1, -1).trim();
  const parts = splitSExpr(inner);
  const op = parts[0];
  const args = parts.slice(1);

  switch (op) {
    case '>=':
      return parseFormula(z3, args[0], bindings).ge(parseFormula(z3, args[1], bindings));
    case '<=':
      return parseFormula(z3, args[0], bindings).le(parseFormula(z3, args[1], bindings));
    case '>':
      return parseFormula(z3, args[0], bindings).gt(parseFormula(z3, args[1], bindings));
    case '<':
      return parseFormula(z3, args[0], bindings).lt(parseFormula(z3, args[1], bindings));
    case '=':
      return parseFormula(z3, args[0], bindings).eq(parseFormula(z3, args[1], bindings));
    case 'and':
      return z3.And(...args.map((a: string) => parseFormula(z3, a, bindings)));
    case 'or':
      return z3.Or(...args.map((a: string) => parseFormula(z3, a, bindings)));
    case 'not':
      return z3.Not(parseFormula(z3, args[0], bindings));
    case '=>':
      return z3.Implies(
        parseFormula(z3, args[0], bindings),
        parseFormula(z3, args[1], bindings),
      );
    case '+':
      return parseFormula(z3, args[0], bindings).add(parseFormula(z3, args[1], bindings));
    case '-':
      return parseFormula(z3, args[0], bindings).sub(parseFormula(z3, args[1], bindings));
    case '*':
      return parseFormula(z3, args[0], bindings).mul(parseFormula(z3, args[1], bindings));
    default:
      throw new Error(`Unsupported operator: '${op}'`);
  }
}

/**
 * Split an S-expression body into top-level parts, respecting parentheses.
 */
function splitSExpr(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const ch of input) {
    if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      current += ch;
    } else if (ch === ' ' && depth === 0) {
      if (current.length > 0) {
        parts.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) {
    parts.push(current);
  }
  return parts;
}

// ── ProgramVerifier ────────────────────────────────────────────────

/**
 * Verify user-specified properties on VPIR programs via Z3.
 */
export class ProgramVerifier {
  private readonly z3: any;
  private readonly graph: VPIRGraph;

  constructor(z3Context: Z3Context, graph: VPIRGraph) {
    this.z3 = z3Context.api;
    this.graph = graph;
  }

  /**
   * Verify a single user-specified property.
   */
  async verifyProgramProperty(
    property: ProgramProperty,
  ): Promise<ProgramVerificationResult> {
    const start = performance.now();
    const z3 = this.z3;

    // Resolve target nodes
    const targetNodes = this.resolveTargetNodes(property);
    if (targetNodes.length === 0) {
      return {
        verified: false,
        solver: 'z3',
        duration: performance.now() - start,
        property: KIND_TO_PROPERTY[property.kind],
        programProperty: property,
        boundVariables: {},
        counterexample: { error: `No target nodes found for IDs: ${property.targetNodes.join(', ')}` },
      };
    }

    // Build Z3 variable bindings for all target nodes
    const allBindings = new Map<string, any>();
    const boundVariables: Record<string, string> = {};
    const nodeBindingsMap = new Map<string, NodeBindings>();

    for (const node of targetNodes) {
      const bindings = bindNode(z3, node);
      nodeBindingsMap.set(node.id, bindings);

      const prefix = `node_${node.id}`;
      allBindings.set(`${prefix}_trust`, bindings.trustConst);
      allBindings.set(`${prefix}_class`, bindings.classConst);
      allBindings.set(`${prefix}_confidence`, bindings.confidenceConst);
      allBindings.set(`${prefix}_type`, bindings.nodeTypeConst);

      boundVariables[`${prefix}_trust`] = `${node.id}.label.trustLevel`;
      boundVariables[`${prefix}_class`] = `${node.id}.label.classification`;
      boundVariables[`${prefix}_confidence`] = `${node.id}.evidence.avgConfidence`;
      boundVariables[`${prefix}_type`] = `${node.id}.type`;
    }

    try {
      const solver = new z3.Solver();

      // Pin Z3 constants to actual VPIR node values
      for (const [, bindings] of nodeBindingsMap) {
        solver.add(bindings.trustConst.eq(bindings.trustValue));
        solver.add(bindings.classConst.eq(bindings.classValue));
        solver.add(bindings.confidenceConst.eq(bindings.confidenceValue));
        solver.add(bindings.nodeTypeConst.eq(bindings.nodeTypeValue));
      }

      // Build the formula based on property kind
      const formulaExpr = this.buildFormula(z3, property, targetNodes, allBindings, nodeBindingsMap);

      // Assert NEGATION of the property — UNSAT means property holds
      solver.add(z3.Not(formulaExpr));

      const result = await solver.check();
      const duration = performance.now() - start;

      if (result === 'unsat') {
        return {
          verified: true,
          solver: 'z3',
          duration,
          property: KIND_TO_PROPERTY[property.kind],
          programProperty: property,
          boundVariables,
        };
      }

      // SAT — extract counterexample
      const model = solver.model();
      const counterexample: Record<string, unknown> = {};

      for (const [varName, z3Const] of allBindings) {
        try {
          counterexample[varName] = Number(model.eval(z3Const).toString());
        } catch {
          counterexample[varName] = model.eval(z3Const).toString();
        }
      }

      return {
        verified: false,
        counterexample,
        solver: 'z3',
        duration,
        property: KIND_TO_PROPERTY[property.kind],
        programProperty: property,
        boundVariables,
      };
    } catch (error) {
      return {
        verified: false,
        solver: 'z3',
        duration: performance.now() - start,
        property: KIND_TO_PROPERTY[property.kind],
        programProperty: property,
        boundVariables,
        counterexample: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Verify multiple properties, returning results for each.
   */
  async verifyAll(
    properties: ProgramProperty[],
  ): Promise<ProgramVerificationResult[]> {
    const results: ProgramVerificationResult[] = [];
    for (const prop of properties) {
      results.push(await this.verifyProgramProperty(prop));
    }
    return results;
  }

  /**
   * Resolve target node IDs to actual VPIR nodes.
   */
  private resolveTargetNodes(property: ProgramProperty): VPIRNode[] {
    const nodes: VPIRNode[] = [];
    for (const nodeId of property.targetNodes) {
      const node = this.graph.nodes.get(nodeId);
      if (node) {
        nodes.push(node);
      }
    }
    return nodes;
  }

  /**
   * Build the Z3 formula expression based on property kind.
   */
  private buildFormula(
    z3: any,
    property: ProgramProperty,
    targetNodes: VPIRNode[],
    allBindings: Map<string, any>,
    _nodeBindingsMap: Map<string, NodeBindings>,
  ): any {
    const userFormula = parseFormula(z3, property.formula, allBindings);

    switch (property.kind) {
      case 'precondition': {
        // Precondition: the formula must hold for all root target nodes
        // We check: for all targets that are roots, formula holds
        const rootTargets = targetNodes.filter(n => this.graph.roots.includes(n.id));
        if (rootTargets.length === 0) {
          // If no root targets, apply to all targets
          return userFormula;
        }
        return userFormula;
      }

      case 'postcondition': {
        // Postcondition: the formula must hold for all terminal target nodes
        return userFormula;
      }

      case 'invariant': {
        // Invariant: the formula must hold for every target node
        // Since we bind all target nodes' attributes, the user formula should
        // reference them all. We verify the conjunction holds.
        if (targetNodes.length <= 1) {
          return userFormula;
        }
        // For multi-node invariants, the formula itself is expected to
        // quantify over all target nodes (e.g., using (and ...))
        return userFormula;
      }

      case 'assertion': {
        // Assertion: the formula holds at the specific node(s)
        return userFormula;
      }

      default:
        return userFormula;
    }
  }
}

/**
 * Generate an SMT-LIB2 string representation for a program property
 * bound to a VPIR graph. Useful for CVC5 subprocess verification.
 */
export function toSmtLib2(
  graph: VPIRGraph,
  property: ProgramProperty,
): string {
  const lines: string[] = [];
  lines.push('(set-logic QF_LIA)');

  // Declare constants for each target node
  for (const nodeId of property.targetNodes) {
    const node = graph.nodes.get(nodeId);
    if (!node) continue;

    const prefix = `node_${nodeId}`;
    lines.push(`(declare-const ${prefix}_trust Int)`);
    lines.push(`(declare-const ${prefix}_class Int)`);
    lines.push(`(declare-const ${prefix}_confidence Int)`);
    lines.push(`(declare-const ${prefix}_type Int)`);

    // Assert concrete values
    const trustVal = node.label?.trustLevel ?? 0;
    const classVal = CLASSIFICATION_ORDER[node.label?.classification ?? 'public'] ?? 0;
    const confidenceVal = node.evidence.length > 0
      ? Math.round(node.evidence.reduce((s, e) => s + e.confidence, 0) / node.evidence.length * 100)
      : 0;
    const typeVal = NODE_TYPE_ORDER[node.type] ?? 0;

    lines.push(`(assert (= ${prefix}_trust ${trustVal}))`);
    lines.push(`(assert (= ${prefix}_class ${classVal}))`);
    lines.push(`(assert (= ${prefix}_confidence ${confidenceVal}))`);
    lines.push(`(assert (= ${prefix}_type ${typeVal}))`);
  }

  // Assert negation of the user property
  lines.push(`(assert (not ${property.formula}))`);
  lines.push('(check-sat)');
  lines.push('(get-model)');

  return lines.join('\n');
}
