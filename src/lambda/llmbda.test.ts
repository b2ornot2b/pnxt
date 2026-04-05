/**
 * Tests for LLMbda Calculus — typed lambda calculus with IFC labels.
 */

import type { SecurityLabel } from '../types/ifc.js';
import type { Variable } from '../types/lambda.js';
import {
  createVar,
  createAbs,
  createApp,
  baseType,
  arrowType,
  betaReduce,
  normalize,
  typeCheck,
  checkNoninterference,
  termToVPIR,
  termToString,
  typeToString,
  typesEqual,
  resetIdCounter,
} from './llmbda.js';
import { validateGraph } from '../vpir/vpir-validator.js';
import { vpirGraphToCategory } from '../hott/vpir-bridge.js';
import { validateCategory } from '../hott/category.js';

const lowLabel: SecurityLabel = {
  owner: 'test', trustLevel: 1, classification: 'public', createdAt: '2026-01-01T00:00:00Z',
};

const highLabel: SecurityLabel = {
  owner: 'test', trustLevel: 3, classification: 'confidential', createdAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  resetIdCounter();
});

describe('Term constructors', () => {
  it('should create a variable', () => {
    const v = createVar('x', baseType('Int'), lowLabel);
    expect(v.kind).toBe('variable');
    expect(v.name).toBe('x');
    expect(v.type).toEqual({ tag: 'base', name: 'Int' });
    expect(v.label).toBe(lowLabel);
  });

  it('should create an abstraction', () => {
    const x = createVar('x', baseType('Int'), lowLabel);
    const abs = createAbs(x, x);
    expect(abs.kind).toBe('abstraction');
    expect(abs.param).toBe(x);
    expect(abs.body).toBe(x);
    expect(abs.type.tag).toBe('arrow');
    expect(abs.type.param).toEqual(baseType('Int'));
    expect(abs.type.result).toEqual(baseType('Int'));
  });

  it('should create an application', () => {
    const x = createVar('x', baseType('Int'), lowLabel);
    const abs = createAbs(x, x);
    const y = createVar('y', baseType('Int'), lowLabel);
    const app = createApp(abs, y);
    expect(app.kind).toBe('application');
    expect(app.func).toBe(abs);
    expect(app.arg).toBe(y);
    expect(app.type).toEqual(baseType('Int'));
  });
});

describe('Type helpers', () => {
  it('should create and compare base types', () => {
    expect(typesEqual(baseType('Int'), baseType('Int'))).toBe(true);
    expect(typesEqual(baseType('Int'), baseType('Bool'))).toBe(false);
  });

  it('should create and compare arrow types', () => {
    const arrow1 = arrowType(baseType('Int'), baseType('Bool'));
    const arrow2 = arrowType(baseType('Int'), baseType('Bool'));
    const arrow3 = arrowType(baseType('Int'), baseType('Int'));
    expect(typesEqual(arrow1, arrow2)).toBe(true);
    expect(typesEqual(arrow1, arrow3)).toBe(false);
  });

  it('should render types as strings', () => {
    expect(typeToString(baseType('Int'))).toBe('Int');
    expect(typeToString(arrowType(baseType('Int'), baseType('Bool')))).toBe('(Int → Bool)');
  });
});

describe('Beta reduction', () => {
  it('should reduce identity application: (λx.x) y → y', () => {
    const x = createVar('x', baseType('Int'), lowLabel);
    const identity = createAbs(x, x);
    const y = createVar('y', baseType('Int'), lowLabel);
    const app = createApp(identity, y);

    const result = betaReduce(app);
    expect(result.kind).toBe('variable');
    expect((result as Variable).name).toBe('y');
  });

  it('should reduce constant function: (λx.λy.x) a → λy.a', () => {
    const x = createVar('x', baseType('Int'), lowLabel);
    const y = createVar('y', baseType('Bool'), lowLabel);
    const innerAbs = createAbs(y, x);
    const outerAbs = createAbs(x, innerAbs);

    const a = createVar('a', baseType('Int'), lowLabel);
    const app = createApp(outerAbs, a);

    const result = betaReduce(app);
    expect(result.kind).toBe('abstraction');
    expect(termToString(result)).toContain('λy');
    expect(termToString(result)).toContain('a');
  });

  it('should return same term when already in normal form', () => {
    const x = createVar('x', baseType('Int'), lowLabel);
    const result = betaReduce(x);
    expect(result).toBe(x); // Same reference
  });
});

describe('Normalization', () => {
  it('should normalize (λx.x) y to y', () => {
    const x = createVar('x', baseType('Int'), lowLabel);
    const identity = createAbs(x, x);
    const y = createVar('y', baseType('Int'), lowLabel);
    const app = createApp(identity, y);

    const result = normalize(app);
    expect(result.normalForm).toBe(true);
    expect(result.steps).toBe(1);
    expect(result.reductions).toHaveLength(1);
    expect(result.reductions[0].rule).toBe('beta');
  });

  it('should normalize multi-step: (λx.λy.x) a b → a', () => {
    const x = createVar('x', baseType('Int'), lowLabel);
    const y = createVar('y', baseType('Bool'), lowLabel);
    const innerAbs = createAbs(y, x);
    const outerAbs = createAbs(x, innerAbs);

    const a = createVar('a', baseType('Int'), lowLabel);
    const b = createVar('b', baseType('Bool'), lowLabel);
    const app1 = createApp(outerAbs, a);
    const app2 = createApp(app1, b);

    const result = normalize(app2);
    expect(result.normalForm).toBe(true);
    expect(result.steps).toBe(2);
    expect(termToString(result.term)).toBe('a');
  });

  it('should stop at maxSteps', () => {
    // Create a simple term that normalizes in 1 step, but set maxSteps to 0
    const x = createVar('x', baseType('Int'), lowLabel);
    const identity = createAbs(x, x);
    const y = createVar('y', baseType('Int'), lowLabel);
    const app = createApp(identity, y);

    const result = normalize(app, 0);
    expect(result.normalForm).toBe(false);
    expect(result.steps).toBe(0);
  });
});

describe('Type checking', () => {
  it('should type check a bound variable', () => {
    const x = createVar('x', baseType('Int'), lowLabel);
    const result = typeCheck(x, {
      bindings: new Map([['x', { type: baseType('Int'), label: lowLabel }]]),
    });
    expect(result.valid).toBe(true);
    expect(result.type).toEqual(baseType('Int'));
  });

  it('should reject an unbound variable', () => {
    const x = createVar('x', baseType('Int'), lowLabel);
    const result = typeCheck(x);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Unbound variable 'x'");
  });

  it('should type check an abstraction', () => {
    const x = createVar('x', baseType('Int'), lowLabel);
    const abs = createAbs(x, x);
    const result = typeCheck(abs);
    expect(result.valid).toBe(true);
    expect(result.type?.tag).toBe('arrow');
  });

  it('should type check a well-typed application', () => {
    const x = createVar('x', baseType('Int'), lowLabel);
    const abs = createAbs(x, x);
    const y = createVar('y', baseType('Int'), lowLabel);
    const app = createApp(abs, y);

    const result = typeCheck(app, {
      bindings: new Map([['y', { type: baseType('Int'), label: lowLabel }]]),
    });
    expect(result.valid).toBe(true);
    expect(result.type).toEqual(baseType('Int'));
  });

  it('should reject ill-typed application (type mismatch)', () => {
    const x = createVar('x', baseType('Int'), lowLabel);
    const abs = createAbs(x, x);
    const y = createVar('y', baseType('Bool'), lowLabel);
    const app = createApp(abs, y);

    const result = typeCheck(app, {
      bindings: new Map([['y', { type: baseType('Bool'), label: lowLabel }]]),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Type mismatch'))).toBe(true);
  });
});

describe('IFC noninterference', () => {
  it('should accept same-level flow', () => {
    const x = createVar('x', baseType('Int'), lowLabel);
    const abs = createAbs(x, x);
    const y = createVar('y', baseType('Int'), lowLabel);
    const app = createApp(abs, y);

    const violations = checkNoninterference(app);
    expect(violations).toHaveLength(0);
  });

  it('should accept low-to-high flow', () => {
    const x = createVar('x', baseType('Int'), highLabel);
    const abs = createAbs(x, x);
    const y = createVar('y', baseType('Int'), lowLabel);
    const app = createApp(abs, y);

    const violations = checkNoninterference(app);
    expect(violations).toHaveLength(0);
  });

  it('should reject high-to-low flow', () => {
    const x = createVar('x', baseType('Int'), lowLabel);
    const abs = createAbs(x, x);
    // High-security argument applied to low-security function
    const y = createVar('y', baseType('Int'), highLabel);
    const app = createApp(abs, y);

    const violations = checkNoninterference(app);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].message).toContain('Noninterference violation');
  });
});

describe('termToVPIR', () => {
  it('should convert a simple term to a valid VPIR graph', () => {
    const x = createVar('x', baseType('Int'), lowLabel);
    const abs = createAbs(x, x);
    const y = createVar('y', baseType('Int'), lowLabel);
    const app = createApp(abs, y);

    const vpir = termToVPIR(app);
    expect(vpir.nodes.size).toBeGreaterThan(0);
    expect(vpir.roots.length).toBeGreaterThan(0);
    expect(vpir.terminals.length).toBeGreaterThan(0);

    // Validate the VPIR graph structure
    const validation = validateGraph(vpir);
    expect(validation.valid).toBe(true);
  });

  it('should produce observation nodes for variables', () => {
    const x = createVar('x', baseType('Int'), lowLabel);
    const vpir = termToVPIR(x);
    const nodes = Array.from(vpir.nodes.values());
    expect(nodes.some((n) => n.type === 'observation')).toBe(true);
  });

  it('should produce inference nodes for applications', () => {
    const x = createVar('x', baseType('Int'), lowLabel);
    const abs = createAbs(x, x);
    const y = createVar('y', baseType('Int'), lowLabel);
    const app = createApp(abs, y);

    const vpir = termToVPIR(app);
    const nodes = Array.from(vpir.nodes.values());
    expect(nodes.some((n) => n.type === 'inference')).toBe(true);
  });
});

describe('Lambda → VPIR → HoTT roundtrip', () => {
  it('should convert lambda term to VPIR to HoTT category and validate', () => {
    const x = createVar('x', baseType('Int'), lowLabel);
    const abs = createAbs(x, x);
    const y = createVar('y', baseType('Int'), lowLabel);
    const app = createApp(abs, y);

    // Lambda → VPIR
    const vpir = termToVPIR(app);
    expect(validateGraph(vpir).valid).toBe(true);

    // VPIR → HoTT
    const category = vpirGraphToCategory(vpir);
    expect(category.objects.size).toBeGreaterThan(0);
    expect(category.morphisms.size).toBeGreaterThan(0);

    // Validate categorical structure
    const catValidation = validateCategory(category);
    expect(catValidation.valid).toBe(true);
  });
});
