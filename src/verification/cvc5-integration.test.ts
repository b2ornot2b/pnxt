/**
 * CVC5 Integration test suite.
 *
 * Sprint 7 — Advisory Panel: Leonardo de Moura (solver depth).
 *
 * Note: Tests that require the CVC5 binary are conditionally skipped
 * when the binary is not available.
 */

import { CVC5Solver, MultiSolverVerifier } from './cvc5-integration.js';
import { createZ3Context } from './z3-invariants.js';
import type { Z3Context } from './z3-invariants.js';
import type { VerificationConfig, VerificationResult } from '../types/verification.js';

// --- Tests ---

describe('CVC5Solver', () => {
  let cvc5: CVC5Solver;

  beforeAll(() => {
    cvc5 = new CVC5Solver({ timeout: 3000 });
  });

  it('should report availability as a boolean without throwing', async () => {
    const available = await cvc5.isAvailable();
    expect(typeof available).toBe('boolean');
  });

  it('should return error status when binary is not found', async () => {
    const badSolver = new CVC5Solver({ binaryPath: '/nonexistent/cvc5', timeout: 2000 });
    const result = await badSolver.check('(check-sat)');
    expect(['error', 'timeout']).toContain(result.status);
  });

  describe('when CVC5 is available', () => {
    let available: boolean;

    beforeAll(async () => {
      available = await cvc5.isAvailable();
    });

    it('should solve a simple UNSAT problem', async () => {
      if (!available) return; // skip

      const smt = [
        '(set-logic QF_LIA)',
        '(declare-const x Int)',
        '(assert (> x 10))',
        '(assert (< x 5))',
        '(check-sat)',
      ].join('\n');

      const result = await cvc5.check(smt);
      expect(result.status).toBe('unsat');
    });

    it('should solve a simple SAT problem', async () => {
      if (!available) return; // skip

      const smt = [
        '(set-logic QF_LIA)',
        '(declare-const x Int)',
        '(assert (> x 10))',
        '(assert (< x 20))',
        '(check-sat)',
        '(get-model)',
      ].join('\n');

      const result = await cvc5.check(smt);
      expect(result.status).toBe('sat');
    });
  });
});

describe('MultiSolverVerifier', () => {
  let ctx: Z3Context;

  beforeAll(async () => {
    ctx = await createZ3Context();
  }, 30000);

  afterAll(() => {
    ctx = undefined as unknown as Z3Context;
  });

  it('should use Z3 when solver is set to z3', async () => {
    const config: VerificationConfig = { solver: 'z3', timeout: 5000 };
    const verifier = new MultiSolverVerifier(config, ctx);

    const z3Result: VerificationResult = {
      verified: true,
      solver: 'z3',
      duration: 10,
      property: 'user_assertion',
    };

    const result = await verifier.verify(
      '(check-sat)',
      async () => z3Result,
      'user_assertion',
    );

    expect(result.solver).toBe('z3');
    expect(result.verified).toBe(true);
  });

  it('should use CVC5 when solver is set to cvc5', async () => {
    const cvc5 = new CVC5Solver();
    const available = await cvc5.isAvailable();

    const config: VerificationConfig = { solver: 'cvc5', timeout: 5000 };
    const verifier = new MultiSolverVerifier(config, ctx);

    const result = await verifier.verify(
      [
        '(set-logic QF_LIA)',
        '(declare-const x Int)',
        '(assert (> x 10))',
        '(assert (< x 5))',
        '(check-sat)',
      ].join('\n'),
      async () => ({ verified: true, solver: 'z3' as const, duration: 1, property: 'user_assertion' as const }),
      'user_assertion',
    );

    if (available) {
      expect(result.solver).toBe('cvc5');
      expect(result.verified).toBe(true);
    } else {
      // CVC5 not available, should return error status
      expect(result.solver).toBe('cvc5');
    }
  });

  it('should try Z3 first in auto mode', async () => {
    const config: VerificationConfig = { solver: 'auto', timeout: 5000 };
    const verifier = new MultiSolverVerifier(config, ctx);

    const z3Result: VerificationResult = {
      verified: true,
      solver: 'z3',
      duration: 5,
      property: 'user_assertion',
    };

    const result = await verifier.verify(
      '(check-sat)',
      async () => z3Result,
      'user_assertion',
    );

    // Z3 succeeded, so result should be from Z3
    expect(result.solver).toBe('z3');
    expect(result.verified).toBe(true);
  });

  it('should report CVC5 availability', async () => {
    const config: VerificationConfig = { solver: 'auto', timeout: 5000 };
    const verifier = new MultiSolverVerifier(config, ctx);

    const available = await verifier.isCVC5Available();
    expect(typeof available).toBe('boolean');
  });

  it('should return Z3 counterexample in auto mode when Z3 finds one', async () => {
    const config: VerificationConfig = { solver: 'auto', timeout: 5000 };
    const verifier = new MultiSolverVerifier(config, ctx);

    const z3Result: VerificationResult = {
      verified: false,
      solver: 'z3',
      duration: 5,
      property: 'user_assertion',
      counterexample: { x: 42 },
    };

    const result = await verifier.verify(
      '(check-sat)',
      async () => z3Result,
      'user_assertion',
    );

    // Z3 found a definitive counterexample, no need for fallback
    expect(result.solver).toBe('z3');
    expect(result.verified).toBe(false);
    expect(result.counterexample).toEqual({ x: 42 });
  });
});
