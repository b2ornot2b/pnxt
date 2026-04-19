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

/**
 * Thrown when a journal entry's schemaVersion does not match the
 * interpreter's current schema — the journal was written by a different build.
 */
export class JournalSchemaVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JournalSchemaVersionError';
  }
}

/**
 * Thrown when a journal checkpoint's graphHash does not match the current
 * graph — the graph structure changed between crash and resume.
 */
export class JournalGraphHashError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JournalGraphHashError';
  }
}

/**
 * Thrown when a Channel snapshot cannot be restored because its
 * bufferSize or channelId does not match the target channel.
 */
export class ChannelSnapshotMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChannelSnapshotMismatchError';
  }
}

/**
 * Thrown when a Process snapshot cannot be restored because its
 * processId does not match the target process.
 */
export class ProcessSnapshotMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProcessSnapshotMismatchError';
  }
}
