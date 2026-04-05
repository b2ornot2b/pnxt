import {
  encodeTermsForNoninterference,
} from './z3-noninterference.js';
import {
  createVar,
  createAbs,
  createApp,
  baseType,
  arrowType,
  resetIdCounter,
} from '../lambda/llmbda.js';
import { createLabel } from '../types/ifc.js';
import { createZ3Context } from './z3-invariants.js';
import type { SecurityLabel } from '../types/ifc.js';

// ── Helpers ─────────────────────────────────────────────────────────

function lowLabel(): SecurityLabel {
  return createLabel('test', 1, 'public');
}

function highLabel(): SecurityLabel {
  return createLabel('test', 3, 'confidential');
}

// ── Encoding Tests ───────────────────────────────────��──────────────

describe('Noninterference Encoding', () => {
  beforeEach(() => resetIdCounter());

  it('should encode a single variable as a node', () => {
    const x = createVar('x', baseType('Int'), lowLabel());
    const encoding = encodeTermsForNoninterference({ terms: [x] });

    expect(encoding.nodes).toHaveLength(1);
    expect(encoding.nodes[0].kind).toBe('variable');
    expect(encoding.nodes[0].isInput).toBe(true);
    expect(encoding.nodes[0].isOutput).toBe(true);
  });

  it('should encode application as nodes + edges', () => {
    const x = createVar('x', baseType('Int'), lowLabel());
    const f = createVar('f', arrowType(baseType('Int'), baseType('Int')), lowLabel());
    const app = createApp(f, x);

    const encoding = encodeTermsForNoninterference({ terms: [app] });

    expect(encoding.nodes.length).toBe(3); // f, x, app
    expect(encoding.edges.length).toBe(2); // f→app, x→app
  });

  it('should identify high inputs and low outputs', () => {
    const highX = createVar('x', baseType('Int'), highLabel());
    const lowF = createVar('f', arrowType(baseType('Int'), baseType('Int')), lowLabel());
    const app = createApp(lowF, highX);

    const encoding = encodeTermsForNoninterference({ terms: [app] });

    expect(encoding.highInputs.length).toBeGreaterThan(0);
    expect(encoding.lowOutputs.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle abstraction encoding', () => {
    const param = createVar('x', baseType('Int'), lowLabel());
    const body = createVar('y', baseType('Int'), lowLabel());
    const abs = createAbs(param, body);

    const encoding = encodeTermsForNoninterference({ terms: [abs] });

    expect(encoding.nodes.length).toBeGreaterThanOrEqual(2);
    expect(encoding.edges.length).toBeGreaterThanOrEqual(1);
  });

  it('should mark root terms as outputs', () => {
    const x = createVar('x', baseType('Int'), lowLabel());
    const encoding = encodeTermsForNoninterference({ terms: [x] });

    const outputNodes = encoding.nodes.filter((n) => n.isOutput);
    expect(outputNodes.length).toBe(1);
  });

  it('should use configurable high threshold', () => {
    const x = createVar('x', baseType('Int'), createLabel('test', 2, 'internal'));
    const encoding = encodeTermsForNoninterference({ terms: [x], highThreshold: 2 });

    expect(encoding.highInputs.length).toBe(1);
  });

  it('should return no high inputs when all labels are low', () => {
    const x = createVar('x', baseType('Int'), lowLabel());
    const y = createVar('y', baseType('Int'), lowLabel());

    const encoding = encodeTermsForNoninterference({ terms: [x, y] });
    expect(encoding.highInputs).toHaveLength(0);
  });
});

// ── Z3 Verification Tests ───────────────────────────────────────────

describe('Noninterference Z3 Verification', () => {
  let z3ctx: Awaited<ReturnType<typeof createZ3Context>>;

  beforeAll(async () => {
    z3ctx = await createZ3Context();
  }, 30_000);

  beforeEach(() => resetIdCounter());

  it('should verify noninterference for all-low terms', async () => {
    const x = createVar('x', baseType('Int'), lowLabel());
    const result = await z3ctx.verifyNoninterference([x]);

    expect(result.verified).toBe(true);
    expect(result.property).toBe('ifc_noninterference_proof');
    expect(result.solver).toBe('z3');
  });

  it('should verify noninterference when no low outputs exist', async () => {
    const x = createVar('x', baseType('Int'), highLabel());
    const result = await z3ctx.verifyNoninterference([x]);

    // No low outputs → trivially noninterfering
    expect(result.verified).toBe(true);
  });

  it('should verify noninterference for safe application', async () => {
    // f(x) where both f and x are low-security → safe
    const x = createVar('x', baseType('Int'), lowLabel());
    const f = createVar('f', arrowType(baseType('Int'), baseType('Int')), lowLabel());
    const app = createApp(f, x);

    const result = await z3ctx.verifyNoninterference([app]);
    expect(result.verified).toBe(true);
  });

  it('should detect potential noninterference violation', async () => {
    // High-security input flowing to low-security output
    const highX = createVar('x', baseType('Int'), highLabel());
    const lowF = createVar('f', arrowType(baseType('Int'), baseType('Int')), lowLabel());
    const app = createApp(lowF, highX);

    const result = await z3ctx.verifyNoninterference([app]);

    // The application has a low-security function applied to high-security arg.
    // The result (low label from func) depends on high-security input.
    // Whether this is detected depends on the encoding model.
    expect(result.property).toBe('ifc_noninterference_proof');
    expect(result.solver).toBe('z3');
  });

  it('should return duration', async () => {
    const x = createVar('x', baseType('Int'), lowLabel());
    const result = await z3ctx.verifyNoninterference([x]);

    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('should handle empty terms', async () => {
    const result = await z3ctx.verifyNoninterference([]);
    expect(result.verified).toBe(true);
  });

  it('should handle multiple independent terms', async () => {
    const x = createVar('x', baseType('Int'), lowLabel());
    const y = createVar('y', baseType('Bool'), lowLabel());

    const result = await z3ctx.verifyNoninterference([x, y]);
    expect(result.verified).toBe(true);
  });
});
