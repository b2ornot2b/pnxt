import {
  jsonTransformHandler,
  fileReadHandler,
  fileReadRegistration,
  fileWriteHandler,
  fileWriteRegistration,
  stringFormatHandler,
  mathEvalHandler,
  mathEvalRegistration,
  dataValidateHandler,
  unitConvertHandler,
  httpFetchRegistration,
  STANDARD_HANDLERS,
  getStandardHandler,
  getStandardHandlerNames,
} from './handler-library.js';

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Standard Handler Library', () => {
  describe('aggregate exports', () => {
    it('should export 8 standard handlers', () => {
      expect(STANDARD_HANDLERS).toHaveLength(8);
    });

    it('should have unique names for all handlers', () => {
      const names = STANDARD_HANDLERS.map((h) => h.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('should return handler names', () => {
      const names = getStandardHandlerNames();
      expect(names).toContain('http-fetch');
      expect(names).toContain('json-transform');
      expect(names).toContain('math-eval');
      expect(names).toContain('unit-convert');
    });

    it('should get a handler by name', () => {
      const handler = getStandardHandler('math-eval');
      expect(handler).toBeDefined();
      expect(handler!.registration.name).toBe('math-eval');
    });

    it('should return undefined for unknown handler', () => {
      expect(getStandardHandler('nonexistent')).toBeUndefined();
    });
  });

  describe('registrations', () => {
    it('should have valid registration for each handler', () => {
      for (const { registration } of STANDARD_HANDLERS) {
        expect(registration.name).toBeTruthy();
        expect(registration.description).toBeTruthy();
        expect(registration.inputSchema).toBeDefined();
        expect(registration.outputSchema).toBeDefined();
        expect(registration.sideEffects).toBeDefined();
        expect(registration.ops.timeout).toBeGreaterThan(0);
      }
    });

    it('http-fetch should require network side effect', () => {
      expect(httpFetchRegistration.sideEffects).toContain('network');
      expect(httpFetchRegistration.requiredTrustLevel).toBe(2);
    });

    it('file-read should require file_read side effect', () => {
      expect(fileReadRegistration.sideEffects).toContain('file_read');
    });

    it('file-write should require file_write side effect', () => {
      expect(fileWriteRegistration.sideEffects).toContain('file_write');
    });

    it('math-eval should have no side effects', () => {
      expect(mathEvalRegistration.sideEffects).toEqual(['none']);
    });
  });

  describe('json-transform handler', () => {
    it('should pick a value at a path', async () => {
      const result = await jsonTransformHandler({
        data: { a: { b: { c: 42 } } },
        path: 'a.b.c',
        operation: 'pick',
      });
      expect(result).toBe(42);
    });

    it('should pick a top-level value without path', async () => {
      const result = await jsonTransformHandler({
        data: [1, 2, 3],
        operation: 'pick',
      });
      expect(result).toEqual([1, 2, 3]);
    });

    it('should filter an array by predicate key', async () => {
      const result = await jsonTransformHandler({
        data: [
          { name: 'a', active: true },
          { name: 'b', active: false },
          { name: 'c', active: true },
        ],
        operation: 'filter',
        predicateKey: 'active',
      });
      expect(result).toEqual([
        { name: 'a', active: true },
        { name: 'c', active: true },
      ]);
    });

    it('should flatten a nested array', async () => {
      const result = await jsonTransformHandler({
        data: [[1, 2], [3, 4], [5]],
        operation: 'flatten',
      });
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should extract keys from an object', async () => {
      const result = await jsonTransformHandler({
        data: { x: 1, y: 2, z: 3 },
        operation: 'keys',
      });
      expect(result).toEqual(['x', 'y', 'z']);
    });

    it('should extract values from an object', async () => {
      const result = await jsonTransformHandler({
        data: { x: 1, y: 2 },
        operation: 'values',
      });
      expect(result).toEqual([1, 2]);
    });

    it('should extract entries from an object', async () => {
      const result = await jsonTransformHandler({
        data: { x: 1 },
        operation: 'entries',
      });
      expect(result).toEqual([['x', 1]]);
    });

    it('should throw for filter without predicateKey', async () => {
      await expect(
        jsonTransformHandler({ data: [1, 2], operation: 'filter' }),
      ).rejects.toThrow('predicateKey');
    });

    it('should throw for flatten on non-array', async () => {
      await expect(
        jsonTransformHandler({ data: { a: 1 }, operation: 'flatten' }),
      ).rejects.toThrow('array');
    });

    it('should throw for unknown operation', async () => {
      await expect(
        jsonTransformHandler({ data: {}, operation: 'unknown' }),
      ).rejects.toThrow('unknown operation');
    });

    it('should resolve path then apply operation', async () => {
      const result = await jsonTransformHandler({
        data: { users: [{ name: 'A', active: true }, { name: 'B', active: false }] },
        path: 'users',
        operation: 'filter',
        predicateKey: 'active',
      });
      expect(result).toEqual([{ name: 'A', active: true }]);
    });
  });

  describe('string-format handler', () => {
    it('should interpolate template placeholders', async () => {
      const result = await stringFormatHandler({
        template: 'Hello {{name}}, you are {{age}} years old!',
        values: { name: 'Alice', age: 30 },
      });
      expect(result).toEqual({ formatted: 'Hello Alice, you are 30 years old!' });
    });

    it('should handle missing placeholders gracefully', async () => {
      const result = await stringFormatHandler({
        template: 'Hello {{name}}!',
        values: {},
      });
      expect(result).toEqual({ formatted: 'Hello {{name}}!' });
    });

    it('should replace multiple occurrences', async () => {
      const result = await stringFormatHandler({
        template: '{{x}} + {{x}} = {{y}}',
        values: { x: 2, y: 4 },
      });
      expect(result).toEqual({ formatted: '2 + 2 = 4' });
    });

    it('should throw for missing template', async () => {
      await expect(stringFormatHandler({ values: {} })).rejects.toThrow('template');
    });
  });

  describe('math-eval handler', () => {
    it('should evaluate simple arithmetic', async () => {
      expect(await mathEvalHandler({ expression: '2 + 3' })).toEqual({ result: 5 });
      expect(await mathEvalHandler({ expression: '10 - 4' })).toEqual({ result: 6 });
      expect(await mathEvalHandler({ expression: '3 * 7' })).toEqual({ result: 21 });
      expect(await mathEvalHandler({ expression: '15 / 3' })).toEqual({ result: 5 });
    });

    it('should respect operator precedence', async () => {
      expect(await mathEvalHandler({ expression: '2 + 3 * 4' })).toEqual({ result: 14 });
      expect(await mathEvalHandler({ expression: '(2 + 3) * 4' })).toEqual({ result: 20 });
    });

    it('should handle exponentiation', async () => {
      expect(await mathEvalHandler({ expression: '2 ** 10' })).toEqual({ result: 1024 });
    });

    it('should handle modulo', async () => {
      expect(await mathEvalHandler({ expression: '17 % 5' })).toEqual({ result: 2 });
    });

    it('should substitute variables', async () => {
      const result = await mathEvalHandler({
        expression: 'x * 2 + y',
        variables: { x: 5, y: 3 },
      });
      expect(result).toEqual({ result: 13 });
    });

    it('should handle negation', async () => {
      expect(await mathEvalHandler({ expression: '-5 + 3' })).toEqual({ result: -2 });
    });

    it('should handle nested parentheses', async () => {
      expect(await mathEvalHandler({ expression: '((2 + 3) * (4 - 1))' })).toEqual({
        result: 15,
      });
    });

    it('should throw on division by zero', async () => {
      await expect(mathEvalHandler({ expression: '10 / 0' })).rejects.toThrow('division by zero');
    });

    it('should throw on undefined variable', async () => {
      await expect(
        mathEvalHandler({ expression: 'x + 1', variables: {} }),
      ).rejects.toThrow('undefined variable');
    });

    it('should throw for missing expression', async () => {
      await expect(mathEvalHandler({})).rejects.toThrow('expression');
    });

    it('should handle decimal numbers', async () => {
      expect(await mathEvalHandler({ expression: '1.5 + 2.5' })).toEqual({ result: 4 });
    });
  });

  describe('data-validate handler', () => {
    it('should validate a correct object', async () => {
      const result = await dataValidateHandler({
        data: { name: 'Alice', age: 30, active: true },
        rules: [
          { field: 'name', type: 'string', required: true },
          { field: 'age', type: 'number', required: true, min: 0, max: 200 },
          { field: 'active', type: 'boolean' },
        ],
      });
      expect(result).toEqual({ valid: true, errors: [] });
    });

    it('should detect missing required fields', async () => {
      const result = (await dataValidateHandler({
        data: {},
        rules: [{ field: 'name', type: 'string', required: true }],
      })) as { valid: boolean; errors: Array<{ field: string; message: string }> };
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('name');
    });

    it('should detect type mismatches', async () => {
      const result = (await dataValidateHandler({
        data: { age: 'not a number' },
        rules: [{ field: 'age', type: 'number' }],
      })) as { valid: boolean; errors: Array<{ field: string; message: string }> };
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('number');
    });

    it('should check number range', async () => {
      const result = (await dataValidateHandler({
        data: { temp: 150 },
        rules: [{ field: 'temp', type: 'number', min: 0, max: 100 }],
      })) as { valid: boolean; errors: Array<{ field: string; message: string }> };
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('maximum');
    });

    it('should check string patterns', async () => {
      const result = (await dataValidateHandler({
        data: { email: 'not-an-email' },
        rules: [{ field: 'email', type: 'string', pattern: '^[^@]+@[^@]+$' }],
      })) as { valid: boolean; errors: Array<{ field: string; message: string }> };
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('pattern');
    });

    it('should validate arrays', async () => {
      const result = (await dataValidateHandler({
        data: { items: [1, 2] },
        rules: [{ field: 'items', type: 'array', min: 3 }],
      })) as { valid: boolean; errors: Array<{ field: string; message: string }> };
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('minimum');
    });

    it('should skip optional missing fields', async () => {
      const result = await dataValidateHandler({
        data: {},
        rules: [{ field: 'optional', type: 'string' }],
      });
      expect(result).toEqual({ valid: true, errors: [] });
    });
  });

  describe('unit-convert handler', () => {
    it('should convert Celsius to Fahrenheit', async () => {
      const result = (await unitConvertHandler({
        value: 100,
        from: 'C',
        to: 'F',
      })) as { result: number };
      expect(result.result).toBe(212);
    });

    it('should convert Fahrenheit to Celsius', async () => {
      const result = (await unitConvertHandler({
        value: 32,
        from: 'F',
        to: 'C',
      })) as { result: number };
      expect(result.result).toBe(0);
    });

    it('should convert Celsius to Kelvin', async () => {
      const result = (await unitConvertHandler({
        value: 0,
        from: 'C',
        to: 'K',
      })) as { result: number };
      expect(result.result).toBe(273.15);
    });

    it('should convert kilometers to miles', async () => {
      const result = (await unitConvertHandler({
        value: 1,
        from: 'km',
        to: 'mi',
      })) as { result: number };
      expect(result.result).toBeCloseTo(0.621371, 4);
    });

    it('should convert kilograms to pounds', async () => {
      const result = (await unitConvertHandler({
        value: 1,
        from: 'kg',
        to: 'lb',
      })) as { result: number };
      expect(result.result).toBeCloseTo(2.20462, 3);
    });

    it('should convert megabytes to gigabytes', async () => {
      const result = (await unitConvertHandler({
        value: 1024,
        from: 'MB',
        to: 'GB',
      })) as { result: number };
      expect(result.result).toBe(1);
    });

    it('should return same value for same unit', async () => {
      const result = (await unitConvertHandler({
        value: 42,
        from: 'km',
        to: 'km',
      })) as { result: number };
      expect(result.result).toBe(42);
    });

    it('should throw for incompatible units', async () => {
      await expect(
        unitConvertHandler({ value: 1, from: 'km', to: 'kg' }),
      ).rejects.toThrow('cannot convert');
    });

    it('should throw for non-numeric value', async () => {
      await expect(
        unitConvertHandler({ value: 'abc', from: 'km', to: 'mi' }),
      ).rejects.toThrow('number');
    });
  });

  describe('file-read handler', () => {
    let tmpDir: string;

    beforeAll(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pnxt-test-'));
      await fs.writeFile(path.join(tmpDir, 'test.txt'), 'hello world');
    });

    afterAll(async () => {
      await fs.rm(tmpDir, { recursive: true });
    });

    it('should read a file', async () => {
      const result = (await fileReadHandler({
        path: path.join(tmpDir, 'test.txt'),
      })) as { content: string; path: string };
      expect(result.content).toBe('hello world');
    });

    it('should throw for missing path', async () => {
      await expect(fileReadHandler({})).rejects.toThrow('path');
    });

    it('should throw for nonexistent file', async () => {
      await expect(
        fileReadHandler({ path: path.join(tmpDir, 'nonexistent.txt') }),
      ).rejects.toThrow();
    });
  });

  describe('file-write handler', () => {
    let tmpDir: string;

    beforeAll(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pnxt-test-'));
    });

    afterAll(async () => {
      await fs.rm(tmpDir, { recursive: true });
    });

    it('should write a file', async () => {
      const filePath = path.join(tmpDir, 'output.txt');
      const result = (await fileWriteHandler({
        path: filePath,
        content: 'test content',
      })) as { path: string; bytesWritten: number };
      expect(result.bytesWritten).toBe(12);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('test content');
    });

    it('should throw for missing path', async () => {
      await expect(fileWriteHandler({ content: 'x' })).rejects.toThrow('path');
    });

    it('should throw for missing content', async () => {
      await expect(
        fileWriteHandler({ path: path.join(tmpDir, 'x.txt') }),
      ).rejects.toThrow('content');
    });
  });
});
