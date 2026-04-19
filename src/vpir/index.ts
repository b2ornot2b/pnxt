export { validateNode, validateGraph } from './vpir-validator.js';
export { executeGraph, resumeFromCheckpoint, topologicalSort } from './vpir-interpreter.js';
export { renderNode, renderGraph, renderTrace, renderTraceStep } from './vpir-renderer.js';
export {
  analyzeParallelism,
  createInputHash,
  InMemoryResultCache,
  Semaphore,
} from './vpir-optimizer.js';
export {
  exportGraphToJSON,
  exportCategoryToJSON,
  exportPipelineToJSON,
  exportTraceToJSON,
} from './vpir-graph-export.js';
export { VPIRGraphBuilder } from './vpir-graph-builder.js';
export type { NodeSpec, BuildResult } from './vpir-graph-builder.js';
export {
  diffGraphs,
  invertDiff,
  composeDiffs,
  summarizeDiff,
} from './vpir-diff.js';
export type { DiffSummary } from './vpir-diff.js';
export {
  applyPatch,
  dryRunPatch,
  validatePatchedGraph,
  cloneGraph,
} from './vpir-patch.js';
export {
  beginTransaction,
  executeTransaction,
  commitTransaction,
  rollbackTransaction,
  getTransactionGraph,
} from './vpir-transaction.js';
export type {
  TransactionStatus,
  TransactionTrace,
  GraphTransaction,
  TransactionOptions,
} from './vpir-transaction.js';
export {
  FileBackedJournal,
  InMemoryJournal,
  JOURNAL_SCHEMA_VERSION,
  assertCheckpointMatchesGraph,
  graphContentHash,
  isAssertionNode,
} from './vpir-journal.js';
export type {
  ExecutionState,
  JournalCheckpoint,
  JournalEntry,
  JournalRecord,
  VPIRJournal,
} from './vpir-journal.js';
export { CLIHumanGateway, NoopHumanGateway } from './human-gateway.js';
export type {
  HumanGateway,
  HumanGatewayRequest,
  HumanGatewayResponse,
} from './human-gateway.js';
export { SelfModificationOrchestrator } from './self-modification-orchestrator.js';
export type {
  ProposalStatus,
  ModificationProposal,
  OrchestrationResult,
  OrchestratorOptions,
} from './self-modification-orchestrator.js';
