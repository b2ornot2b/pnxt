/**
 * Categorical Tokenization Experiment test suite.
 *
 * Sprint 9 — Advisory Panel: Sutskever (native tokenization),
 * Voevodsky (typed tokens as categorical objects).
 */

import {
  createWeatherApiVocabulary,
  tokenize,
  detokenize,
  isWellFormed,
  computeStats,
  compareApproaches,
} from './categorical-tokenizer.js';
import { createWeatherVPIRGraph } from '../benchmarks/weather-api-shim.js';
import { createLabel } from '../types/ifc.js';
import type { VPIRGraph, VPIRNode } from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import type { CategoricalToken, CategoricalTokenVocabulary } from '../types/experiments.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeLabel(trust: number = 2): SecurityLabel {
  return createLabel('test', trust as 0 | 1 | 2 | 3 | 4, 'internal');
}

function makeEmptyGraph(): VPIRGraph {
  return {
    id: 'empty',
    name: 'Empty Graph',
    nodes: new Map(),
    roots: [],
    terminals: [],
    createdAt: new Date().toISOString(),
  };
}

function makeSingleNodeGraph(): VPIRGraph {
  const now = new Date().toISOString();
  const node: VPIRNode = {
    id: 'solo',
    type: 'observation',
    operation: 'capture-input',
    inputs: [],
    outputs: [{ port: 'out', dataType: 'string' }],
    evidence: [{ type: 'data', source: 'test', confidence: 1.0 }],
    label: makeLabel(),
    verifiable: true,
    createdAt: now,
  };
  const nodes = new Map<string, VPIRNode>();
  nodes.set('solo', node);
  return {
    id: 'single',
    name: 'Single Node Graph',
    nodes,
    roots: ['solo'],
    terminals: ['solo'],
    createdAt: now,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Categorical Tokenization Experiment', () => {
  let vocabulary: CategoricalTokenVocabulary;

  beforeAll(() => {
    vocabulary = createWeatherApiVocabulary();
  });

  // ── Vocabulary ──

  describe('createWeatherApiVocabulary', () => {
    it('should create a vocabulary with ~50 tokens', () => {
      expect(vocabulary.tokens.size).toBeGreaterThanOrEqual(40);
      expect(vocabulary.tokens.size).toBeLessThanOrEqual(60);
    });

    it('should have morphism rules', () => {
      expect(vocabulary.morphismRules.length).toBeGreaterThan(0);
    });

    it('should cover all token categories', () => {
      const categories = new Set<string>();
      for (const token of vocabulary.tokens.values()) {
        categories.add(token.category);
      }
      expect(categories).toContain('observation');
      expect(categories).toContain('inference');
      expect(categories).toContain('action');
      expect(categories).toContain('assertion');
      expect(categories).toContain('dataflow');
      expect(categories).toContain('security');
      expect(categories).toContain('composition');
    });

    it('should give each token composable morphism IDs', () => {
      for (const token of vocabulary.tokens.values()) {
        expect(token.composableMorphisms).toBeDefined();
        expect(Array.isArray(token.composableMorphisms)).toBe(true);
      }
    });

    it('should give each token an equivalence class', () => {
      for (const token of vocabulary.tokens.values()) {
        expect(token.equivalenceClass).toBeDefined();
        expect(token.equivalenceClass.length).toBeGreaterThan(0);
      }
    });
  });

  // ── Tokenize ──

  describe('tokenize', () => {
    it('should tokenize the Weather API VPIR graph', () => {
      const graph = createWeatherVPIRGraph("What's the weather in Tokyo?", makeLabel());
      const tokens = tokenize(graph, vocabulary);

      expect(tokens.length).toBeGreaterThan(0);
      // Each node produces: security token + node token + output tokens
      // 7 nodes → at least 14 tokens (security + node per node)
      expect(tokens.length).toBeGreaterThanOrEqual(14);
    });

    it('should produce tokens from the vocabulary', () => {
      const graph = createWeatherVPIRGraph('weather in London', makeLabel());
      const tokens = tokenize(graph, vocabulary);

      for (const token of tokens) {
        expect(vocabulary.tokens.has(token.id)).toBe(true);
      }
    });

    it('should handle empty graphs', () => {
      const tokens = tokenize(makeEmptyGraph(), vocabulary);
      expect(tokens).toEqual([]);
    });

    it('should handle single-node graphs', () => {
      const tokens = tokenize(makeSingleNodeGraph(), vocabulary);
      expect(tokens.length).toBeGreaterThan(0);
      // Should have at least: security token + observation token + dataflow token
      expect(tokens.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Detokenize ──

  describe('detokenize', () => {
    it('should reconstruct a graph from tokens', () => {
      const graph = createWeatherVPIRGraph('weather in Tokyo', makeLabel());
      const tokens = tokenize(graph, vocabulary);
      const reconstructed = detokenize(tokens, vocabulary);

      expect(reconstructed.nodes.size).toBeGreaterThan(0);
      expect(reconstructed.roots.length).toBe(1);
      expect(reconstructed.terminals.length).toBe(1);
    });

    it('should preserve the number of VPIR nodes in roundtrip', () => {
      const graph = createWeatherVPIRGraph('weather in Tokyo', makeLabel());
      const tokens = tokenize(graph, vocabulary);
      const reconstructed = detokenize(tokens, vocabulary);

      // Reconstructed should have same number of "real" nodes
      // (node tokens map 1:1 to VPIR nodes)
      expect(reconstructed.nodes.size).toBe(graph.nodes.size);
    });

    it('should handle empty token sequences', () => {
      const reconstructed = detokenize([], vocabulary);
      expect(reconstructed.nodes.size).toBe(0);
      expect(reconstructed.roots).toEqual([]);
      expect(reconstructed.terminals).toEqual([]);
    });
  });

  // ── Well-Formedness ──

  describe('isWellFormed', () => {
    it('should accept tokens from a real VPIR graph', () => {
      const graph = createWeatherVPIRGraph('weather in Tokyo', makeLabel());
      const tokens = tokenize(graph, vocabulary);
      expect(isWellFormed(tokens, vocabulary)).toBe(true);
    });

    it('should accept empty sequences', () => {
      expect(isWellFormed([], vocabulary)).toBe(true);
    });

    it('should accept single-token sequences', () => {
      const token = vocabulary.tokens.values().next().value as CategoricalToken;
      expect(isWellFormed([token], vocabulary)).toBe(true);
    });

    it('should reject sequences with invalid transitions', () => {
      // Create a sequence with an invalid transition
      // assertion → observation has no morphism rule
      const assertToken = Array.from(vocabulary.tokens.values())
        .find((t) => t.category === 'assertion')!;
      const obsToken = Array.from(vocabulary.tokens.values())
        .find((t) => t.category === 'observation')!;

      expect(isWellFormed([assertToken, obsToken], vocabulary)).toBe(false);
    });
  });

  // ── Statistics ──

  describe('computeStats', () => {
    it('should compute correct stats for Weather API tokens', () => {
      const graph = createWeatherVPIRGraph('weather in Tokyo', makeLabel());
      const tokens = tokenize(graph, vocabulary);
      const stats = computeStats(tokens, vocabulary);

      expect(stats.totalTokens).toBe(tokens.length);
      expect(stats.validMorphismPairs + stats.invalidTransitions).toBe(tokens.length - 1);
      expect(stats.compositionCoherence).toBeGreaterThan(0);
      expect(stats.compositionCoherence).toBeLessThanOrEqual(1.0);
    });

    it('should report perfect coherence for well-formed sequences', () => {
      const graph = createWeatherVPIRGraph('weather in Tokyo', makeLabel());
      const tokens = tokenize(graph, vocabulary);
      const stats = computeStats(tokens, vocabulary);

      // Tokenize produces well-formed sequences
      expect(stats.compositionCoherence).toBe(1.0);
      expect(stats.invalidTransitions).toBe(0);
    });

    it('should handle single-token stats', () => {
      const token = vocabulary.tokens.values().next().value as CategoricalToken;
      const stats = computeStats([token], vocabulary);
      expect(stats.totalTokens).toBe(1);
      expect(stats.compositionCoherence).toBe(1.0);
    });
  });

  // ── Approach Comparison ──

  describe('compareApproaches', () => {
    it('should compare all three approaches', () => {
      const graph = createWeatherVPIRGraph('weather in Tokyo', makeLabel());
      const results = compareApproaches(graph, vocabulary);

      expect(results).toHaveLength(3);
      expect(results[0].approach).toBe('baseline');
      expect(results[1].approach).toBe('categorical');
      expect(results[2].approach).toBe('hybrid');
    });

    it('should produce measurable scores for each approach', () => {
      const graph = createWeatherVPIRGraph('weather in Tokyo', makeLabel());
      const results = compareApproaches(graph, vocabulary);

      for (const result of results) {
        expect(result.structuralValidity).toBeGreaterThanOrEqual(0);
        expect(result.structuralValidity).toBeLessThanOrEqual(1.0);
        expect(result.semanticCorrectness).toBeGreaterThanOrEqual(0);
        expect(result.semanticCorrectness).toBeLessThanOrEqual(1.0);
        expect(result.compositionCoherence).toBeGreaterThanOrEqual(0);
        expect(result.compositionCoherence).toBeLessThanOrEqual(1.0);
      }
    });

    it('should show baseline has perfect structural validity', () => {
      const graph = createWeatherVPIRGraph('weather in Tokyo', makeLabel());
      const results = compareApproaches(graph, vocabulary);
      const baseline = results.find((r) => r.approach === 'baseline')!;

      expect(baseline.structuralValidity).toBe(1.0);
      expect(baseline.semanticCorrectness).toBe(1.0);
    });

    it('should show hybrid has perfect structural validity with composition coherence', () => {
      const graph = createWeatherVPIRGraph('weather in Tokyo', makeLabel());
      const results = compareApproaches(graph, vocabulary);
      const hybrid = results.find((r) => r.approach === 'hybrid')!;

      expect(hybrid.structuralValidity).toBe(1.0);
      expect(hybrid.compositionCoherence).toBeGreaterThan(0);
    });

    it('should show categorical approach preserves structure', () => {
      const graph = createWeatherVPIRGraph('weather in Tokyo', makeLabel());
      const results = compareApproaches(graph, vocabulary);
      const categorical = results.find((r) => r.approach === 'categorical')!;

      expect(categorical.structuralValidity).toBeGreaterThan(0);
      expect(categorical.compositionCoherence).toBeGreaterThan(0);
    });
  });
});
