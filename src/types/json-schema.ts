/**
 * JSON Schema type for tool registration and constrained-decoding schemas.
 *
 * Extended in Phase 5 Sprint 2 to support Bridge Grammar constrained output
 * (minimum, maximum, minLength, format, pattern, etc.).
 */

export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  description?: string;
  additionalProperties?: boolean | JSONSchema;

  /** Numeric constraints. */
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;

  /** String constraints. */
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;

  /** Array constraints. */
  minItems?: number;
  maxItems?: number;

  /** Constant value. */
  const?: unknown;

  /** Composition keywords. */
  oneOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];

  /** Default value. */
  default?: unknown;
}
