/**
 * VPIR execution error classes.
 *
 * Shared error hierarchy for VPIR interpreter and related modules.
 * Each error class maps to a VPIRExecutionError code for structured
 * error reporting in execution traces.
 */

/**
 * Thrown when a VPIR assertion node's condition evaluates to false.
 */
export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

/**
 * Thrown when an ACI gateway invocation fails during action node execution.
 */
export class ACIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ACIError';
  }
}

/**
 * Thrown when a composition node's sub-graph execution fails.
 */
export class SubGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubGraphError';
  }
}

/**
 * Thrown when no handler is registered for a node's operation.
 */
export class HandlerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HandlerError';
  }
}
