/**
 * LLMbda Calculus — typed lambda calculus with IFC labels.
 *
 * The computational substrate of the Agent-Native Programming paradigm.
 * Every LLM output can be modeled as a lambda term, every reasoning step
 * as a beta reduction, and every security violation as an information flow
 * breach. Terms connect to VPIR graphs (and thence to HoTT categories
 * and Z3 verification) via `termToVPIR`.
 *
 * Based on:
 * - docs/research/original-prompt.md (LLMbda Calculus with IFC)
 * - Advisory Review 2026-04-05 (Church — need pure lambda substrate)
 */

import type {
  Abstraction,
  Application,
  IFCViolation,
  LambdaTerm,
  LambdaType,
  ReductionResult,
  ReductionStep,
  TypeCheckResult,
  TypeContext,
  Variable,
} from '../types/lambda.js';
import type { SecurityLabel } from '../types/ifc.js';
import type { VPIRGraph, VPIRNode, VPIRRef } from '../types/vpir.js';
import { canFlowTo } from '../types/ifc.js';

let idCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}_${++idCounter}`;
}

/**
 * Reset the internal ID counter (for testing).
 */
export function resetIdCounter(): void {
  idCounter = 0;
}

// --- Term constructors ---

/**
 * Create a variable term.
 */
export function createVar(
  name: string,
  type: LambdaType,
  label: SecurityLabel,
): Variable {
  return {
    id: nextId('var'),
    kind: 'variable',
    name,
    type,
    label,
  };
}

/**
 * Create a lambda abstraction: λparam.body
 */
export function createAbs(
  param: Variable,
  body: LambdaTerm,
): Abstraction {
  const bodyType = getTermType(body);
  return {
    id: nextId('abs'),
    kind: 'abstraction',
    param,
    body,
    type: { tag: 'arrow', param: param.type, result: bodyType },
    label: param.label,
  };
}

/**
 * Create a function application: (func arg)
 */
export function createApp(
  func: LambdaTerm,
  arg: LambdaTerm,
): Application {
  const funcType = getTermType(func);
  const resultType = funcType.tag === 'arrow' && funcType.result
    ? funcType.result
    : { tag: 'base' as const, name: 'unknown' };
  return {
    id: nextId('app'),
    kind: 'application',
    func,
    arg,
    type: resultType,
    label: func.label,
  };
}

// --- Type helpers ---

/**
 * Create a base type.
 */
export function baseType(name: string): LambdaType {
  return { tag: 'base', name };
}

/**
 * Create an arrow (function) type.
 */
export function arrowType(param: LambdaType, result: LambdaType): LambdaType {
  return { tag: 'arrow', param, result };
}

/**
 * Get the type of a lambda term.
 */
export function getTermType(term: LambdaTerm): LambdaType {
  if (term.kind === 'variable') return (term as Variable).type;
  if (term.kind === 'abstraction') return (term as Abstraction).type;
  if (term.kind === 'application') return (term as Application).type;
  return { tag: 'base', name: 'unknown' };
}

/**
 * Check if two types are structurally equal.
 */
export function typesEqual(a: LambdaType, b: LambdaType): boolean {
  if (a.tag !== b.tag) return false;
  if (a.tag === 'base' && b.tag === 'base') return a.name === b.name;
  if (a.tag === 'arrow' && b.tag === 'arrow') {
    return typesEqual(a.param!, b.param!) && typesEqual(a.result!, b.result!);
  }
  return false;
}

/**
 * Render a type as a string.
 */
export function typeToString(t: LambdaType): string {
  if (t.tag === 'base') return t.name ?? '?';
  return `(${typeToString(t.param!)} → ${typeToString(t.result!)})`;
}

/**
 * Render a term as a string.
 */
export function termToString(term: LambdaTerm): string {
  switch (term.kind) {
    case 'variable':
      return (term as Variable).name;
    case 'abstraction': {
      const abs = term as Abstraction;
      return `(λ${abs.param.name}.${termToString(abs.body)})`;
    }
    case 'application': {
      const app = term as Application;
      return `(${termToString(app.func)} ${termToString(app.arg)})`;
    }
  }
}

// --- Beta reduction ---

/**
 * Substitute all free occurrences of `varName` with `replacement` in `term`.
 */
function substitute(term: LambdaTerm, varName: string, replacement: LambdaTerm): LambdaTerm {
  switch (term.kind) {
    case 'variable': {
      const v = term as Variable;
      if (v.name === varName) return replacement;
      return term;
    }
    case 'abstraction': {
      const abs = term as Abstraction;
      if (abs.param.name === varName) return term;
      const newBody = substitute(abs.body, varName, replacement);
      if (newBody === abs.body) return term;
      return { ...abs, id: nextId('abs'), body: newBody } as Abstraction;
    }
    case 'application': {
      const app = term as Application;
      const newFunc = substitute(app.func, varName, replacement);
      const newArg = substitute(app.arg, varName, replacement);
      if (newFunc === app.func && newArg === app.arg) return term;
      return { ...app, id: nextId('app'), func: newFunc, arg: newArg } as Application;
    }
  }
}

/**
 * Perform a single step of beta reduction.
 *
 * Looks for the leftmost-outermost redex ((λx.body) arg) and reduces it
 * to body[x := arg].
 *
 * @returns The reduced term, or the same term if already in normal form
 */
export function betaReduce(term: LambdaTerm): LambdaTerm {
  if (term.kind === 'application') {
    const app = term as Application;
    if (app.func.kind === 'abstraction') {
      // Redex found: (λx.body) arg → body[x := arg]
      const abs = app.func as Abstraction;
      return substitute(abs.body, abs.param.name, app.arg);
    }
    // Try reducing the function position first
    const reducedFunc = betaReduce(app.func);
    if (reducedFunc !== app.func) {
      return { ...app, id: nextId('app'), func: reducedFunc } as Application;
    }
    // Then try reducing the argument
    const reducedArg = betaReduce(app.arg);
    if (reducedArg !== app.arg) {
      return { ...app, id: nextId('app'), arg: reducedArg } as Application;
    }
  }
  if (term.kind === 'abstraction') {
    const abs = term as Abstraction;
    const reducedBody = betaReduce(abs.body);
    if (reducedBody !== abs.body) {
      return { ...abs, id: nextId('abs'), body: reducedBody } as Abstraction;
    }
  }
  return term;
}

/**
 * Normalize a term by repeated beta reduction until normal form
 * or maxSteps is reached.
 */
export function normalize(term: LambdaTerm, maxSteps: number = 100): ReductionResult {
  let current = term;
  const reductions: ReductionStep[] = [];
  let steps = 0;

  for (let i = 0; i < maxSteps; i++) {
    const before = termToString(current);
    const next = betaReduce(current);
    if (next === current) {
      // Normal form reached
      return { term: current, steps, reductions, normalForm: true };
    }
    const after = termToString(next);
    reductions.push({ before, after, rule: 'beta' });
    current = next;
    steps++;
  }

  return { term: current, steps, reductions, normalForm: false };
}

// --- Type checking ---

/**
 * Type check a lambda term in the given context.
 *
 * Also performs IFC label checking: when a high-security value flows
 * into a lower-security context, an IFC violation is recorded.
 */
export function typeCheck(term: LambdaTerm, context?: TypeContext): TypeCheckResult {
  const ctx = context ?? { bindings: new Map() };
  const errors: string[] = [];
  const ifcViolations: IFCViolation[] = [];

  const result = checkTerm(term, ctx, errors, ifcViolations);

  return {
    valid: errors.length === 0 && ifcViolations.length === 0,
    type: result,
    errors,
    ifcViolations,
  };
}

function checkTerm(
  term: LambdaTerm,
  ctx: TypeContext,
  errors: string[],
  ifcViolations: IFCViolation[],
): LambdaType | undefined {
  switch (term.kind) {
    case 'variable': {
      const v = term as Variable;
      const binding = ctx.bindings.get(v.name);
      if (!binding) {
        errors.push(`Unbound variable '${v.name}'`);
        return undefined;
      }
      // IFC check: variable's label must be able to flow to the binding's label
      if (!canFlowTo(binding.label, v.label)) {
        ifcViolations.push({
          message: `Variable '${v.name}': binding label cannot flow to usage label`,
          highLabel: binding.label,
          lowLabel: v.label,
          termId: v.id,
        });
      }
      return binding.type;
    }
    case 'abstraction': {
      const abs = term as Abstraction;
      // Extend context with parameter binding
      const newCtx: TypeContext = {
        bindings: new Map(ctx.bindings),
      };
      newCtx.bindings.set(abs.param.name, {
        type: abs.param.type,
        label: abs.param.label,
      });
      const bodyType = checkTerm(abs.body, newCtx, errors, ifcViolations);
      if (bodyType) {
        return { tag: 'arrow', param: abs.param.type, result: bodyType };
      }
      return undefined;
    }
    case 'application': {
      const app = term as Application;
      const funcType = checkTerm(app.func, ctx, errors, ifcViolations);
      const argType = checkTerm(app.arg, ctx, errors, ifcViolations);

      if (!funcType || !argType) return undefined;

      if (funcType.tag !== 'arrow') {
        errors.push(`Cannot apply non-function type: ${typeToString(funcType)}`);
        return undefined;
      }

      if (!typesEqual(funcType.param!, argType)) {
        errors.push(
          `Type mismatch: expected ${typeToString(funcType.param!)}, got ${typeToString(argType)}`,
        );
        return undefined;
      }

      // IFC check: argument label must be able to flow to function's label
      if (!canFlowTo(app.arg.label, app.func.label)) {
        ifcViolations.push({
          message: `Application: argument label cannot flow to function label`,
          highLabel: app.arg.label,
          lowLabel: app.func.label,
          termId: app.id,
        });
      }

      return funcType.result;
    }
  }
}

// --- IFC noninterference checking ---

/**
 * Check that no high-security value flows to a low-security output.
 *
 * Walks the term tree and verifies that at every application site,
 * the argument's security label can flow to the function's label
 * (i.e., high-trust data doesn't leak to low-trust contexts).
 */
export function checkNoninterference(term: LambdaTerm): IFCViolation[] {
  const violations: IFCViolation[] = [];
  walkForIFC(term, violations);
  return violations;
}

function walkForIFC(term: LambdaTerm, violations: IFCViolation[]): void {
  if (term.kind === 'application') {
    const app = term as Application;
    if (!canFlowTo(app.arg.label, app.func.label)) {
      violations.push({
        message: `Noninterference violation: high-security argument flows to low-security function`,
        highLabel: app.arg.label,
        lowLabel: app.func.label,
        termId: app.id,
      });
    }
    walkForIFC(app.func, violations);
    walkForIFC(app.arg, violations);
  }
  if (term.kind === 'abstraction') {
    walkForIFC((term as Abstraction).body, violations);
  }
}

// --- Term to VPIR conversion ---

/**
 * Convert a lambda term into a VPIR graph.
 *
 * Each sub-term becomes a VPIR node:
 * - Variables → observation nodes (reading a value)
 * - Abstractions → inference nodes (deriving a function)
 * - Applications → inference nodes (applying a function, with reduction as the step)
 *
 * Dependencies follow the term structure: body depends on params,
 * application depends on func and arg.
 */
export function termToVPIR(term: LambdaTerm): VPIRGraph {
  const nodes: VPIRNode[] = [];
  const now = new Date().toISOString();

  collectNodes(term, nodes, now);

  // Determine roots (nodes with no inputs) and terminals (leaf computations)
  const roots = nodes.filter((n) => n.inputs.length === 0).map((n) => n.id);
  const referencedIds = new Set<string>();
  for (const node of nodes) {
    for (const ref of node.inputs) {
      referencedIds.add(ref.nodeId);
    }
  }
  const terminals = nodes.filter((n) => !referencedIds.has(n.id)).map((n) => n.id);

  return {
    id: `vpir-lambda-${term.id}`,
    name: `Lambda: ${termToString(term)}`,
    nodes: new Map(nodes.map((n) => [n.id, n])),
    roots: roots.length > 0 ? roots : [nodes[0].id],
    terminals: terminals.length > 0 ? terminals : [nodes[nodes.length - 1].id],
    createdAt: now,
  };
}

// --- VPIR → Lambda denotation (semantic foundation) ---

/**
 * Convert a VPIR node to its lambda calculus denotation.
 *
 * Each VPIR node type maps to a lambda term:
 * - observation → variable (data input)
 * - inference  → application (function applied to inputs)
 * - action     → abstraction with side-effect label
 * - assertion  → application of predicate
 * - composition → nested application (sub-graph)
 *
 * This positions the LLMbda Calculus as the *semantic foundation*
 * of VPIR: every VPIR computation has a meaning as a lambda term.
 */
export function vpirNodeToLambda(node: VPIRNode): LambdaTerm {
  const label = node.label;
  const outputType = node.outputs[0]?.dataType ?? 'unknown';

  switch (node.type) {
    case 'observation': {
      // Observation: reading a value → variable
      return createVar(
        node.id,
        baseType(outputType),
        label,
      );
    }
    case 'inference': {
      // Inference: derived from inputs → application
      if (node.inputs.length === 0) {
        // No inputs: constant function
        return createVar(node.id, baseType(outputType), label);
      }
      // Model as: f(x1)(x2)...(xn) where f is the inference function
      const inferFn = createVar(
        `${node.id}_fn`,
        buildArrowType(node.inputs, outputType),
        label,
      );
      let result: LambdaTerm = inferFn;
      for (const input of node.inputs) {
        const argVar = createVar(
          input.nodeId,
          baseType(input.dataType),
          label,
        );
        result = createApp(result, argVar);
      }
      return result;
    }
    case 'action': {
      // Action: side-effecting operation → abstraction
      const param = createVar(
        `${node.id}_input`,
        baseType(node.inputs[0]?.dataType ?? 'unit'),
        label,
      );
      const bodyVar = createVar(
        `${node.id}_effect`,
        baseType(outputType),
        label,
      );
      return createAbs(param, bodyVar);
    }
    case 'assertion': {
      // Assertion: predicate application → application of predicate to input
      const predicate = createVar(
        `${node.id}_pred`,
        arrowType(
          baseType(node.inputs[0]?.dataType ?? 'unknown'),
          baseType('Bool'),
        ),
        label,
      );
      if (node.inputs.length === 0) {
        return predicate;
      }
      const input = createVar(
        node.inputs[0].nodeId,
        baseType(node.inputs[0].dataType),
        label,
      );
      return createApp(predicate, input);
    }
    case 'composition': {
      // Composition: nested application (sub-graph aggregation)
      if (node.inputs.length === 0) {
        return createVar(node.id, baseType(outputType), label);
      }
      const composeFn = createVar(
        `${node.id}_compose`,
        buildArrowType(node.inputs, outputType),
        label,
      );
      let result: LambdaTerm = composeFn;
      for (const input of node.inputs) {
        const argVar = createVar(
          input.nodeId,
          baseType(input.dataType),
          label,
        );
        result = createApp(result, argVar);
      }
      return result;
    }
    case 'human': {
      // Human: an externally-produced value. Modelled as a variable that
      // stands in as an opaque input to the surrounding lambda term.
      return createVar(node.id, baseType(outputType), label);
    }
  }
}

/**
 * Build an arrow type from a list of inputs to an output type.
 * E.g., [a, b] → c becomes a → (b → c)
 */
function buildArrowType(inputs: VPIRRef[], outputTypeName: string): LambdaType {
  let result: LambdaType = baseType(outputTypeName);
  for (let i = inputs.length - 1; i >= 0; i--) {
    result = arrowType(baseType(inputs[i].dataType), result);
  }
  return result;
}

/**
 * Annotate all nodes in a VPIR graph with their lambda calculus denotations.
 *
 * This populates the `lambdaSemantics` field on each node, positioning
 * the LLMbda Calculus as the semantic foundation of VPIR.
 *
 * @returns A new graph with all nodes annotated (original graph is unchanged)
 */
export function annotateGraphWithSemantics(graph: VPIRGraph): VPIRGraph {
  const annotatedNodes = new Map<string, VPIRNode>();

  for (const [nodeId, node] of graph.nodes) {
    const lambdaTerm = vpirNodeToLambda(node);
    annotatedNodes.set(nodeId, {
      ...node,
      lambdaSemantics: lambdaTerm,
    });
  }

  return {
    ...graph,
    nodes: annotatedNodes,
  };
}

function collectNodes(term: LambdaTerm, nodes: VPIRNode[], now: string): string {
  const nodeId = `lambda-${term.id}`;

  switch (term.kind) {
    case 'variable': {
      const v = term as Variable;
      nodes.push({
        id: nodeId,
        type: 'observation',
        operation: `Read variable '${v.name}': ${typeToString(v.type)}`,
        inputs: [],
        outputs: [{ port: 'value', dataType: typeToString(v.type) }],
        evidence: [{ type: 'data', source: `var:${v.name}`, confidence: 1.0 }],
        label: term.label,
        verifiable: true,
        createdAt: now,
        agentId: 'lambda-calculus',
      });
      return nodeId;
    }
    case 'abstraction': {
      const abs = term as Abstraction;
      const bodyNodeId = collectNodes(abs.body, nodes, now);
      const bodyNode = nodes.find((n) => n.id === bodyNodeId);
      const bodyPort = bodyNode?.outputs[0]?.port ?? 'value';
      nodes.push({
        id: nodeId,
        type: 'inference',
        operation: `Lambda abstraction: λ${abs.param.name}.body`,
        inputs: [{ nodeId: bodyNodeId, port: bodyPort, dataType: typeToString(getTermType(abs.body)) }],
        outputs: [{ port: 'function', dataType: typeToString(abs.type) }],
        evidence: [{ type: 'rule', source: 'lambda-abstraction', confidence: 1.0 }],
        label: term.label,
        verifiable: true,
        createdAt: now,
        agentId: 'lambda-calculus',
      });
      return nodeId;
    }
    case 'application': {
      const app = term as Application;
      const funcNodeId = collectNodes(app.func, nodes, now);
      const argNodeId = collectNodes(app.arg, nodes, now);
      // Find the actual output port names of the func and arg nodes
      const funcNode = nodes.find((n) => n.id === funcNodeId);
      const argNode = nodes.find((n) => n.id === argNodeId);
      const funcPort = funcNode?.outputs[0]?.port ?? 'value';
      const argPort = argNode?.outputs[0]?.port ?? 'value';
      nodes.push({
        id: nodeId,
        type: 'inference',
        operation: `Apply function to argument`,
        inputs: [
          { nodeId: funcNodeId, port: funcPort, dataType: typeToString(getTermType(app.func)) },
          { nodeId: argNodeId, port: argPort, dataType: typeToString(getTermType(app.arg)) },
        ],
        outputs: [{ port: 'result', dataType: typeToString(app.type) }],
        evidence: [{ type: 'rule', source: 'beta-reduction', confidence: 1.0 }],
        label: term.label,
        verifiable: true,
        createdAt: now,
        agentId: 'lambda-calculus',
      });
      return nodeId;
    }
  }
}
