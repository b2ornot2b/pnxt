export { validateNode, validateGraph } from './vpir-validator.js';
export { executeGraph, topologicalSort } from './vpir-interpreter.js';
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
