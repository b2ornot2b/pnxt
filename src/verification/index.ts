export {
  createZ3Context,
  type Z3Context,
  type CapabilityGrantInput,
  type TrustTransitionInput,
  type ToolTrustInput,
  type LambdaTypeSafetyInput,
} from './z3-invariants.js';

export {
  encodeTermsForNoninterference,
  verifyNoninterferenceZ3,
  type NoninterferenceInput,
  type NoninterferenceEncoding,
} from './z3-noninterference.js';

export {
  verifyDPNProgress,
  verifyDPNDeadlockFreedom,
  verifyDPNFairness,
  buildDependencyGraph,
} from './z3-liveness.js';

export {
  verifyUnivalenceZ3,
  extractEquivalencePairs,
  type UnivalenceInput,
  type EquivalencePair,
} from './z3-univalence.js';

export {
  analyzeCovertChannels,
  analyzeTimingChannels,
  analyzeMemoryAccessPatterns,
  analyzeBridgeGrammarChannels,
  type CovertChannelReport,
  type CovertChannelRisk,
  type VectorAnalysis,
} from './covert-channel-analysis.js';

export {
  ProgramVerifier,
  toSmtLib2,
} from './z3-program-verifier.js';

export {
  CVC5Solver,
  MultiSolverVerifier,
  type CVC5Result,
} from './cvc5-integration.js';
export {
  verifyGraphProperties,
} from './z3-graph-verifier.js';
export type {
  GraphVerificationResult,
  PropertyStatus,
} from './z3-graph-verifier.js';
