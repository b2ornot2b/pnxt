export {
  EvidenceTypeSchema,
  EvidenceSchema,
  VPIRRefSchema,
  VPIROutputSchema,
  SecurityLabelSchema,
  VPIRNodeTypeSchema,
  VPIRNodeSchema,
  VPIRGraphSchema,
} from './vpir-schema.js';

export {
  parseVPIRNode,
  parseVPIRGraph,
} from './schema-validator.js';

export {
  toFunctionCallingSchema,
  toAnthropicToolSchema,
  toStructuredOutputSchema,
  getSchemaForFormat,
} from './constrained-output.js';

export {
  generateVPIRGraph,
  createMockClient,
  createSampleVPIRGraphJSON,
  buildVPIRGraphTool,
} from './llm-vpir-generator.js';
export type {
  VPIRGeneratorOptions,
  VPIRGenerationResult,
} from './llm-vpir-generator.js';
export {
  generateTaskVPIRGraph,
  buildTaskAwareSystemPrompt,
  buildTaskAwareVPIRTool,
} from './task-vpir-generator.js';
export type {
  TaskVPIRGeneratorOptions,
} from './task-vpir-generator.js';
export {
  BridgeErrorCategory,
  SCHEMA_ERRORS,
  SEMANTIC_ERRORS,
  HANDLER_ERRORS,
  TOPOLOGY_ERRORS,
  TRUNCATION_ERRORS,
  classifyError,
  diagnoseTruncation,
  diagnoseHandlerErrors,
  diagnose,
  formatDiagnosisForLLM,
} from './bridge-errors.js';
export type {
  BridgeError,
  BridgeDiagnosis,
} from './bridge-errors.js';
export {
  repairTruncatedJSON,
  repairBridgeOutput,
} from './bridge-repair.js';
export type {
  RepairAction,
  RepairResult,
} from './bridge-repair.js';
export {
  scoreGraphConfidence,
} from './bridge-confidence.js';
export type {
  GraphConfidenceScore,
  NodeConfidence,
  ConfidenceScorerOptions,
} from './bridge-confidence.js';
export {
  generateReliableVPIRGraph,
} from './reliable-generator.js';
export type {
  ReliableGenerationResult,
  ReliableGeneratorOptions,
  GenerationStage,
} from './reliable-generator.js';
export {
  generateWithRefinement,
  buildRefinementPrompt,
} from './iterative-generator.js';
export type {
  FeedbackStrategy,
  AttemptRecord,
  IterativeGenerationOptions,
  IterativeGenerationResult,
} from './iterative-generator.js';
export {
  applyNeurosymbolicRefinement,
} from './neurosymbolic-bridge.js';
export type {
  NeurosymbolicPatchRecord,
  NeurosymbolicOptions,
  NeurosymbolicResult,
} from './neurosymbolic-bridge.js';
export {
  executeAutonomousPipeline,
} from './autonomous-pipeline.js';
export type {
  PipelineStageName,
  PipelineStageTrace,
  CategorizationResult,
  AutonomousPipelineOptions,
  AutonomousPipelineResult,
} from './autonomous-pipeline.js';
