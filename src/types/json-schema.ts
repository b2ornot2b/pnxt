/**
 * Minimal JSON Schema type for tool registration schemas.
 */

export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  description?: string;
  additionalProperties?: boolean | JSONSchema;
}
