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
