/**
 * Standard Handler Library — pre-built tool handlers for common operations.
 *
 * Provides 8 standard handlers that VPIR action nodes can reference by
 * operation name, eliminating the need for TypeScript-coded handlers.
 * Each handler comes with a matching ToolRegistration for the ACI gateway.
 *
 * Sprint 10 deliverable — Advisory Panel: Kay, Liskov, Milner.
 */

import type { ToolRegistration, SideEffect, CostCategory } from '../types/aci.js';
import type { TrustLevel } from '../types/agent.js';
import type { ToolHandler } from './aci-gateway.js';

// ── Handler result types ──────────────────────────────────────────

export interface HttpFetchInput {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpFetchOutput {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface JsonTransformInput {
  data: unknown;
  /** JSONPath-like expression or key path (dot-separated). */
  path?: string;
  /** Operation: 'pick' extracts a value, 'map' applies a transform, 'filter' filters arrays. */
  operation: 'pick' | 'map' | 'filter' | 'flatten' | 'keys' | 'values' | 'entries';
  /** Predicate key for filter operations (truthy check on this field). */
  predicateKey?: string;
}

export interface FileReadInput {
  path: string;
  encoding?: string;
}

export interface FileWriteInput {
  path: string;
  content: string;
  encoding?: string;
}

export interface StringFormatInput {
  template: string;
  values: Record<string, string | number | boolean>;
}

export interface MathEvalInput {
  expression: string;
  variables?: Record<string, number>;
}

export interface DataValidateInput {
  data: unknown;
  rules: Array<{
    field: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    required?: boolean;
    min?: number;
    max?: number;
    pattern?: string;
  }>;
}

export interface DataValidateOutput {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
}

export interface UnitConvertInput {
  value: number;
  from: string;
  to: string;
}

// ── Helper to build ToolRegistration ──────────────────────────────

function makeRegistration(
  name: string,
  description: string,
  inputSchema: ToolRegistration['inputSchema'],
  outputSchema: ToolRegistration['outputSchema'],
  sideEffects: SideEffect[],
  options: {
    timeout?: number;
    retryable?: boolean;
    idempotent?: boolean;
    costCategory?: CostCategory;
    requiredTrustLevel?: TrustLevel;
  } = {},
): ToolRegistration {
  return {
    name,
    description,
    inputSchema,
    outputSchema,
    sideEffects,
    ops: {
      timeout: options.timeout ?? 10_000,
      retryable: options.retryable ?? false,
      idempotent: options.idempotent ?? true,
      costCategory: options.costCategory ?? 'cheap',
    },
    requiredTrustLevel: options.requiredTrustLevel,
  };
}

// ── Standard handlers ─────────────────────────────────────────────

/**
 * HTTP fetch handler — performs HTTP requests.
 *
 * Uses the global `fetch` API. Side effects: network.
 */
export const httpFetchHandler: ToolHandler = async (input: unknown): Promise<unknown> => {
  const { url, method, headers, body } = input as HttpFetchInput;

  if (!url || typeof url !== 'string') {
    throw new Error('http-fetch: "url" is required and must be a string');
  }

  const response = await fetch(url, {
    method: method ?? 'GET',
    headers: headers ?? {},
    body: body ?? undefined,
  });

  const responseBody = await response.text();
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    status: response.status,
    headers: responseHeaders,
    body: responseBody,
  } satisfies HttpFetchOutput;
};

export const httpFetchRegistration: ToolRegistration = makeRegistration(
  'http-fetch',
  'Perform an HTTP request and return the response',
  {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to fetch' },
      method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
      headers: { type: 'object', additionalProperties: { type: 'string' } },
      body: { type: 'string' },
    },
    required: ['url'],
  },
  {
    type: 'object',
    properties: {
      status: { type: 'number' },
      headers: { type: 'object', additionalProperties: { type: 'string' } },
      body: { type: 'string' },
    },
    required: ['status', 'headers', 'body'],
  },
  ['network'],
  { timeout: 30_000, retryable: true, idempotent: false, costCategory: 'moderate', requiredTrustLevel: 2 },
);

/**
 * JSON transform handler — picks, maps, filters, flattens JSON data.
 */
export const jsonTransformHandler: ToolHandler = async (input: unknown): Promise<unknown> => {
  const { data, path, operation, predicateKey } = input as JsonTransformInput;

  // Resolve path if provided
  let target = data;
  if (path) {
    const parts = path.split('.');
    for (const part of parts) {
      if (target === null || target === undefined) break;
      target = (target as Record<string, unknown>)[part];
    }
  }

  switch (operation) {
    case 'pick':
      return target;

    case 'map':
      if (!Array.isArray(target)) throw new Error('json-transform: "map" requires array data');
      return target;

    case 'filter':
      if (!Array.isArray(target)) throw new Error('json-transform: "filter" requires array data');
      if (!predicateKey) throw new Error('json-transform: "filter" requires "predicateKey"');
      return target.filter((item) => {
        if (typeof item === 'object' && item !== null) {
          return Boolean((item as Record<string, unknown>)[predicateKey]);
        }
        return Boolean(item);
      });

    case 'flatten':
      if (!Array.isArray(target)) throw new Error('json-transform: "flatten" requires array data');
      return target.flat();

    case 'keys':
      if (typeof target !== 'object' || target === null) {
        throw new Error('json-transform: "keys" requires object data');
      }
      return Object.keys(target);

    case 'values':
      if (typeof target !== 'object' || target === null) {
        throw new Error('json-transform: "values" requires object data');
      }
      return Object.values(target);

    case 'entries':
      if (typeof target !== 'object' || target === null) {
        throw new Error('json-transform: "entries" requires object data');
      }
      return Object.entries(target);

    default:
      throw new Error(`json-transform: unknown operation "${operation}"`);
  }
};

export const jsonTransformRegistration: ToolRegistration = makeRegistration(
  'json-transform',
  'Transform JSON data: pick, map, filter, flatten, keys, values, entries',
  {
    type: 'object',
    properties: {
      data: { description: 'JSON data to transform' },
      path: { type: 'string', description: 'Dot-separated path to resolve' },
      operation: { type: 'string', enum: ['pick', 'map', 'filter', 'flatten', 'keys', 'values', 'entries'] },
      predicateKey: { type: 'string', description: 'Key for filter predicate (truthy check)' },
    },
    required: ['data', 'operation'],
  },
  { type: 'object', description: 'Transformed data' },
  ['none'],
  { idempotent: true },
);

/**
 * File read handler — reads a file from disk.
 */
export const fileReadHandler: ToolHandler = async (input: unknown): Promise<unknown> => {
  const { path, encoding } = input as FileReadInput;

  if (!path || typeof path !== 'string') {
    throw new Error('file-read: "path" is required and must be a string');
  }

  const fs = await import('fs/promises');
  const content = await fs.readFile(path, { encoding: (encoding ?? 'utf-8') as BufferEncoding });
  return { content, path };
};

export const fileReadRegistration: ToolRegistration = makeRegistration(
  'file-read',
  'Read a file from the filesystem',
  {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to read' },
      encoding: { type: 'string', description: 'File encoding (default: utf-8)' },
    },
    required: ['path'],
  },
  {
    type: 'object',
    properties: {
      content: { type: 'string' },
      path: { type: 'string' },
    },
    required: ['content', 'path'],
  },
  ['file_read'],
  { requiredTrustLevel: 0 },
);

/**
 * File write handler — writes content to a file.
 */
export const fileWriteHandler: ToolHandler = async (input: unknown): Promise<unknown> => {
  const { path, content, encoding } = input as FileWriteInput;

  if (!path || typeof path !== 'string') {
    throw new Error('file-write: "path" is required and must be a string');
  }
  if (typeof content !== 'string') {
    throw new Error('file-write: "content" is required and must be a string');
  }

  const fs = await import('fs/promises');
  await fs.writeFile(path, content, { encoding: (encoding ?? 'utf-8') as BufferEncoding });
  return { path, bytesWritten: Buffer.byteLength(content, (encoding ?? 'utf-8') as BufferEncoding) };
};

export const fileWriteRegistration: ToolRegistration = makeRegistration(
  'file-write',
  'Write content to a file on the filesystem',
  {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to write' },
      content: { type: 'string', description: 'Content to write' },
      encoding: { type: 'string', description: 'File encoding (default: utf-8)' },
    },
    required: ['path', 'content'],
  },
  {
    type: 'object',
    properties: {
      path: { type: 'string' },
      bytesWritten: { type: 'number' },
    },
    required: ['path', 'bytesWritten'],
  },
  ['file_write'],
  { idempotent: true, requiredTrustLevel: 1 },
);

/**
 * String format handler — template string interpolation.
 *
 * Replaces `{{key}}` placeholders with provided values.
 */
export const stringFormatHandler: ToolHandler = async (input: unknown): Promise<unknown> => {
  const { template, values } = input as StringFormatInput;

  if (!template || typeof template !== 'string') {
    throw new Error('string-format: "template" is required and must be a string');
  }

  let result = template;
  for (const [key, value] of Object.entries(values ?? {})) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
  }

  return { formatted: result };
};

export const stringFormatRegistration: ToolRegistration = makeRegistration(
  'string-format',
  'Interpolate {{key}} placeholders in a template string',
  {
    type: 'object',
    properties: {
      template: { type: 'string', description: 'Template with {{key}} placeholders' },
      values: { type: 'object', additionalProperties: {}, description: 'Key-value pairs for interpolation' },
    },
    required: ['template', 'values'],
  },
  {
    type: 'object',
    properties: {
      formatted: { type: 'string' },
    },
    required: ['formatted'],
  },
  ['none'],
  { idempotent: true },
);

/**
 * Math eval handler — evaluates safe arithmetic expressions.
 *
 * Supports: +, -, *, /, %, **, (, ), and numeric variables.
 * Does NOT use eval() — uses a simple recursive-descent parser.
 */
export const mathEvalHandler: ToolHandler = async (input: unknown): Promise<unknown> => {
  const { expression, variables } = input as MathEvalInput;

  if (!expression || typeof expression !== 'string') {
    throw new Error('math-eval: "expression" is required and must be a string');
  }

  const result = evaluateExpression(expression, variables ?? {});
  return { result };
};

/** Safe recursive-descent expression evaluator. */
function evaluateExpression(expr: string, vars: Record<string, number>): number {
  let pos = 0;
  const input = expr.replace(/\s/g, '');

  function parseExpression(): number {
    let left = parseTerm();
    while (pos < input.length && (input[pos] === '+' || input[pos] === '-')) {
      const op = input[pos++];
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parsePower();
    while (pos < input.length && (input[pos] === '*' || input[pos] === '/' || input[pos] === '%')) {
      const op = input[pos++];
      const right = parsePower();
      if (op === '*') left = left * right;
      else if (op === '/') {
        if (right === 0) throw new Error('math-eval: division by zero');
        left = left / right;
      } else {
        left = left % right;
      }
    }
    return left;
  }

  function parsePower(): number {
    let base = parseUnary();
    if (pos < input.length + 1 && input[pos] === '*' && input[pos + 1] === '*') {
      pos += 2;
      const exponent = parsePower();
      base = Math.pow(base, exponent);
    }
    return base;
  }

  function parseUnary(): number {
    if (input[pos] === '-') {
      pos++;
      return -parseAtom();
    }
    if (input[pos] === '+') {
      pos++;
    }
    return parseAtom();
  }

  function parseAtom(): number {
    if (input[pos] === '(') {
      pos++; // skip (
      const val = parseExpression();
      if (input[pos] !== ')') throw new Error('math-eval: expected closing parenthesis');
      pos++; // skip )
      return val;
    }

    // Try to parse a number
    const numMatch = input.slice(pos).match(/^(\d+\.?\d*)/);
    if (numMatch) {
      pos += numMatch[1].length;
      return parseFloat(numMatch[1]);
    }

    // Try to parse a variable name
    const varMatch = input.slice(pos).match(/^([a-zA-Z_]\w*)/);
    if (varMatch) {
      const name = varMatch[1];
      pos += name.length;
      if (!(name in vars)) throw new Error(`math-eval: undefined variable "${name}"`);
      return vars[name];
    }

    throw new Error(`math-eval: unexpected character at position ${pos}: "${input[pos]}"`);
  }

  const result = parseExpression();
  if (pos !== input.length) {
    throw new Error(`math-eval: unexpected trailing characters at position ${pos}`);
  }
  return result;
}

export const mathEvalRegistration: ToolRegistration = makeRegistration(
  'math-eval',
  'Evaluate a safe arithmetic expression with optional variables',
  {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'Arithmetic expression (e.g., "2 * (x + 3)")' },
      variables: { type: 'object', additionalProperties: { type: 'number' }, description: 'Variable bindings' },
    },
    required: ['expression'],
  },
  {
    type: 'object',
    properties: {
      result: { type: 'number' },
    },
    required: ['result'],
  },
  ['none'],
  { idempotent: true },
);

/**
 * Data validate handler — validates data against a set of rules.
 */
export const dataValidateHandler: ToolHandler = async (input: unknown): Promise<unknown> => {
  const { data, rules } = input as DataValidateInput;

  if (!rules || !Array.isArray(rules)) {
    throw new Error('data-validate: "rules" is required and must be an array');
  }

  const errors: Array<{ field: string; message: string }> = [];
  const obj = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;

  for (const rule of rules) {
    const value = obj[rule.field];

    if (rule.required && (value === undefined || value === null)) {
      errors.push({ field: rule.field, message: `Field "${rule.field}" is required` });
      continue;
    }

    if (value === undefined || value === null) continue;

    // Type check
    if (rule.type === 'array') {
      if (!Array.isArray(value)) {
        errors.push({ field: rule.field, message: `Expected array, got ${typeof value}` });
        continue;
      }
    } else if (typeof value !== rule.type) {
      errors.push({ field: rule.field, message: `Expected ${rule.type}, got ${typeof value}` });
      continue;
    }

    // Range checks for numbers
    if (rule.type === 'number' && typeof value === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        errors.push({ field: rule.field, message: `Value ${value} is below minimum ${rule.min}` });
      }
      if (rule.max !== undefined && value > rule.max) {
        errors.push({ field: rule.field, message: `Value ${value} exceeds maximum ${rule.max}` });
      }
    }

    // Pattern check for strings
    if (rule.type === 'string' && typeof value === 'string' && rule.pattern) {
      if (!new RegExp(rule.pattern).test(value)) {
        errors.push({ field: rule.field, message: `Value does not match pattern "${rule.pattern}"` });
      }
    }

    // Length checks for arrays
    if (rule.type === 'array' && Array.isArray(value)) {
      if (rule.min !== undefined && value.length < rule.min) {
        errors.push({ field: rule.field, message: `Array length ${value.length} is below minimum ${rule.min}` });
      }
      if (rule.max !== undefined && value.length > rule.max) {
        errors.push({ field: rule.field, message: `Array length ${value.length} exceeds maximum ${rule.max}` });
      }
    }
  }

  return { valid: errors.length === 0, errors } satisfies DataValidateOutput;
};

export const dataValidateRegistration: ToolRegistration = makeRegistration(
  'data-validate',
  'Validate data against a set of type, range, and pattern rules',
  {
    type: 'object',
    properties: {
      data: { description: 'Data object to validate' },
      rules: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            type: { type: 'string', enum: ['string', 'number', 'boolean', 'array', 'object'] },
            required: { type: 'boolean' },
            min: { type: 'number' },
            max: { type: 'number' },
            pattern: { type: 'string' },
          },
          required: ['field', 'type'],
        },
      },
    },
    required: ['data', 'rules'],
  },
  {
    type: 'object',
    properties: {
      valid: { type: 'boolean' },
      errors: { type: 'array', items: { type: 'object' } },
    },
    required: ['valid', 'errors'],
  },
  ['none'],
  { idempotent: true },
);

/**
 * Unit convert handler — converts between common units.
 *
 * Supports temperature (C/F/K), length (m/km/mi/ft), weight (kg/lb/oz/g),
 * and data (B/KB/MB/GB/TB).
 */
export const unitConvertHandler: ToolHandler = async (input: unknown): Promise<unknown> => {
  const { value, from, to } = input as UnitConvertInput;

  if (typeof value !== 'number') {
    throw new Error('unit-convert: "value" must be a number');
  }
  if (!from || !to) {
    throw new Error('unit-convert: "from" and "to" are required');
  }

  const result = convertUnit(value, from.toLowerCase(), to.toLowerCase());
  return { result, from, to };
};

function convertUnit(value: number, from: string, to: string): number {
  if (from === to) return value;

  // Temperature conversions
  const tempUnits = ['c', 'f', 'k'];
  if (tempUnits.includes(from) && tempUnits.includes(to)) {
    return convertTemperature(value, from, to);
  }

  // Length conversions (base: meters)
  const lengthFactors: Record<string, number> = {
    m: 1, km: 1000, mi: 1609.344, ft: 0.3048, in: 0.0254, cm: 0.01, mm: 0.001, yd: 0.9144,
  };
  if (from in lengthFactors && to in lengthFactors) {
    return (value * lengthFactors[from]) / lengthFactors[to];
  }

  // Weight conversions (base: grams)
  const weightFactors: Record<string, number> = {
    g: 1, kg: 1000, lb: 453.592, oz: 28.3495, mg: 0.001, t: 1_000_000,
  };
  if (from in weightFactors && to in weightFactors) {
    return (value * weightFactors[from]) / weightFactors[to];
  }

  // Data conversions (base: bytes)
  const dataFactors: Record<string, number> = {
    b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4,
  };
  if (from in dataFactors && to in dataFactors) {
    return (value * dataFactors[from]) / dataFactors[to];
  }

  throw new Error(`unit-convert: cannot convert from "${from}" to "${to}"`);
}

function convertTemperature(value: number, from: string, to: string): number {
  // Convert to Celsius first
  let celsius: number;
  switch (from) {
    case 'c': celsius = value; break;
    case 'f': celsius = (value - 32) * 5 / 9; break;
    case 'k': celsius = value - 273.15; break;
    default: throw new Error(`unit-convert: unknown temperature unit "${from}"`);
  }

  // Convert from Celsius to target
  switch (to) {
    case 'c': return celsius;
    case 'f': return celsius * 9 / 5 + 32;
    case 'k': return celsius + 273.15;
    default: throw new Error(`unit-convert: unknown temperature unit "${to}"`);
  }
}

export const unitConvertRegistration: ToolRegistration = makeRegistration(
  'unit-convert',
  'Convert between common units (temperature, length, weight, data)',
  {
    type: 'object',
    properties: {
      value: { type: 'number', description: 'Value to convert' },
      from: { type: 'string', description: 'Source unit (e.g., "C", "km", "kg", "MB")' },
      to: { type: 'string', description: 'Target unit (e.g., "F", "mi", "lb", "GB")' },
    },
    required: ['value', 'from', 'to'],
  },
  {
    type: 'object',
    properties: {
      result: { type: 'number' },
      from: { type: 'string' },
      to: { type: 'string' },
    },
    required: ['result', 'from', 'to'],
  },
  ['none'],
  { idempotent: true },
);

// ── Aggregate exports ─────────────────────────────────────────────

export interface StandardHandler {
  name: string;
  registration: ToolRegistration;
  handler: ToolHandler;
}

/**
 * All standard handlers with their registrations.
 */
export const STANDARD_HANDLERS: StandardHandler[] = [
  { name: 'http-fetch', registration: httpFetchRegistration, handler: httpFetchHandler },
  { name: 'json-transform', registration: jsonTransformRegistration, handler: jsonTransformHandler },
  { name: 'file-read', registration: fileReadRegistration, handler: fileReadHandler },
  { name: 'file-write', registration: fileWriteRegistration, handler: fileWriteHandler },
  { name: 'string-format', registration: stringFormatRegistration, handler: stringFormatHandler },
  { name: 'math-eval', registration: mathEvalRegistration, handler: mathEvalHandler },
  { name: 'data-validate', registration: dataValidateRegistration, handler: dataValidateHandler },
  { name: 'unit-convert', registration: unitConvertRegistration, handler: unitConvertHandler },
];

/**
 * Get a standard handler by name.
 */
export function getStandardHandler(name: string): StandardHandler | undefined {
  return STANDARD_HANDLERS.find((h) => h.name === name);
}

/**
 * Get all standard handler names.
 */
export function getStandardHandlerNames(): string[] {
  return STANDARD_HANDLERS.map((h) => h.name);
}
