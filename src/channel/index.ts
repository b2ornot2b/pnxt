export { Channel, ChannelClosedError } from './channel.js';
export { Process } from './process.js';
export { DataflowGraph } from './dataflow-graph.js';
export { DPNRuntime } from './dpn-runtime.js';
export type { DPNRuntimeOptions, DPNExecutionResult, DPNExecutionTrace, DPNExecutionError } from './dpn-runtime.js';
export { TracingChannel, createTracingPair } from './tracing-channel.js';
export type { ChannelTraceEntry } from './tracing-channel.js';
export {
  buildLTS,
  checkStrongBisimulation,
  checkObservationalEquivalence,
  toHoTTPath,
  transportPropertyViaBisimulation,
} from './bisimulation.js';
