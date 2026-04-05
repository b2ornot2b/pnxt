/**
 * CVC5 Integration — alternative SMT solver via subprocess.
 *
 * Adds CVC5 alongside Z3 for solver diversity. CVC5 excels at quantifier
 * alternation, nonlinear arithmetic, and string constraints. The
 * MultiSolverVerifier orchestrates both solvers with configurable fallback.
 *
 * Sprint 7 deliverable — Advisory Panel: Leonardo de Moura (solver depth).
 */

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Z3Context } from './z3-invariants.js';
import type {
  VerificationConfig,
  VerificationProperty,
  VerificationResult,
} from '../types/verification.js';

const execFileAsync = promisify(execFile);

// ── CVC5 Solver ────────────────────────────────────────────────────

/**
 * Result from a CVC5 subprocess invocation.
 */
export interface CVC5Result {
  status: 'sat' | 'unsat' | 'unknown' | 'timeout' | 'error';
  model?: string;
  error?: string;
}

/**
 * CVC5 solver wrapper using subprocess communication.
 */
export class CVC5Solver {
  private readonly binaryPath: string;
  private readonly timeout: number;

  constructor(config?: { binaryPath?: string; timeout?: number }) {
    this.binaryPath = config?.binaryPath ?? 'cvc5';
    this.timeout = config?.timeout ?? 5000;
  }

  /**
   * Check if CVC5 binary is available on the system.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync(this.binaryPath, ['--version'], {
        timeout: 3000,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Run an SMT-LIB2 query through CVC5.
   */
  async check(smtlib2: string): Promise<CVC5Result> {
    return new Promise((resolve) => {
      const proc = spawn(this.binaryPath, ['--lang', 'smt2', '--produce-models', '--quiet'], {
        timeout: this.timeout,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill();
      }, this.timeout);

      proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

      proc.on('error', (err: Error) => {
        clearTimeout(timer);
        resolve({ status: 'error', error: err.message });
      });

      proc.on('close', () => {
        clearTimeout(timer);

        if (timedOut) {
          resolve({ status: 'timeout' });
          return;
        }

        const output = stdout.trim();

        if (output.startsWith('sat')) {
          const modelStart = output.indexOf('(');
          resolve({
            status: 'sat',
            model: modelStart >= 0 ? output.slice(modelStart) : undefined,
          });
        } else if (output.startsWith('unsat')) {
          resolve({ status: 'unsat' });
        } else if (output.startsWith('unknown')) {
          resolve({ status: 'unknown' });
        } else {
          resolve({
            status: 'error',
            error: stderr || `Unexpected output: ${output}`,
          });
        }
      });

      // Write SMT-LIB2 input to stdin and close
      proc.stdin.write(smtlib2);
      proc.stdin.end();
    });
  }
}

// ── Multi-Solver Verifier ──────────────────────────────────────────

/**
 * Orchestrates Z3 and CVC5 solvers with configurable fallback.
 */
export class MultiSolverVerifier {
  private readonly config: Required<VerificationConfig>;
  private readonly cvc5: CVC5Solver;

  constructor(config: VerificationConfig, _z3Context: Z3Context) {
    this.config = {
      solver: config.solver,
      timeout: config.timeout ?? 5000,
      cvc5Path: config.cvc5Path ?? 'cvc5',
      fallbackOnTimeout: config.fallbackOnTimeout ?? true,
    };
    this.cvc5 = new CVC5Solver({
      binaryPath: this.config.cvc5Path,
      timeout: this.config.timeout,
    });
  }

  /**
   * Verify a property using the configured solver strategy.
   *
   * @param smtlib2 - The SMT-LIB2 query string (used for CVC5 mode)
   * @param z3Verifier - A function that verifies via Z3 native API
   * @param property - The property being verified
   */
  async verify(
    smtlib2: string,
    z3Verifier: () => Promise<VerificationResult>,
    property: VerificationProperty,
  ): Promise<VerificationResult> {
    switch (this.config.solver) {
      case 'z3':
        return z3Verifier();

      case 'cvc5':
        return this.verifyCVC5(smtlib2, property);

      case 'auto':
        return this.verifyAuto(smtlib2, z3Verifier, property);
    }
  }

  /**
   * Check if CVC5 solver is available.
   */
  async isCVC5Available(): Promise<boolean> {
    return this.cvc5.isAvailable();
  }

  /**
   * Verify using CVC5 only.
   */
  private async verifyCVC5(
    smtlib2: string,
    property: VerificationProperty,
  ): Promise<VerificationResult> {
    const start = performance.now();
    const result = await this.cvc5.check(smtlib2);
    const duration = performance.now() - start;

    if (result.status === 'unsat') {
      return { verified: true, solver: 'cvc5', duration, property };
    }

    if (result.status === 'sat') {
      return {
        verified: false,
        solver: 'cvc5',
        duration,
        property,
        counterexample: { model: result.model },
      };
    }

    // unknown, timeout, or error
    return {
      verified: false,
      solver: 'cvc5',
      duration,
      property,
      counterexample: {
        status: result.status,
        error: result.error,
      },
    };
  }

  /**
   * Auto mode: Z3 first, CVC5 fallback on timeout/unknown.
   */
  private async verifyAuto(
    smtlib2: string,
    z3Verifier: () => Promise<VerificationResult>,
    property: VerificationProperty,
  ): Promise<VerificationResult> {
    // Try Z3 first
    const z3Start = performance.now();
    try {
      const z3Result = await Promise.race([
        z3Verifier(),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), this.config.timeout),
        ),
      ]);

      if (z3Result !== null) {
        // Z3 completed within timeout
        if (z3Result.verified || !this.config.fallbackOnTimeout) {
          return z3Result;
        }
        // Z3 returned a definitive counterexample — no need for fallback
        if (z3Result.counterexample && !('status' in z3Result.counterexample)) {
          return z3Result;
        }
      }
    } catch {
      // Z3 failed — try CVC5
    }

    // Fallback to CVC5
    const cvc5Available = await this.cvc5.isAvailable();
    if (!cvc5Available) {
      // CVC5 not available — return a timeout/unknown result
      return {
        verified: false,
        solver: 'z3',
        duration: performance.now() - z3Start,
        property,
        counterexample: { status: 'timeout', fallback: 'cvc5_unavailable' },
      };
    }

    return this.verifyCVC5(smtlib2, property);
  }
}
