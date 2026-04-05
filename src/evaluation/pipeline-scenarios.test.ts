/**
 * Tests for End-to-End Pipeline Integration Scenarios.
 */

import {
  runKGToHoTTRoundtrip,
  runLabeledPipeline,
  runParallelCategoricalPreservation,
} from './pipeline-scenarios.js';

describe('Pipeline Integration Scenarios', () => {
  describe('Scenario 1: KG → VPIR → HoTT roundtrip', () => {
    it('should build a knowledge graph with code entities', () => {
      const { kg } = runKGToHoTTRoundtrip();
      expect(kg.nodes.size).toBe(5);
      expect(kg.edges.size).toBe(5);
    });

    it('should convert KG to a valid HoTT category', () => {
      const { kgCategory, kgValid } = runKGToHoTTRoundtrip();
      expect(kgValid).toBe(true);
      expect(kgCategory.objects.size).toBe(5);
      expect(kgCategory.morphisms.size).toBe(5);
    });

    it('should build a VPIR reasoning graph over the codebase', () => {
      const { vpirGraph } = runKGToHoTTRoundtrip();
      expect(vpirGraph.nodes.size).toBe(3);
      expect(vpirGraph.roots).toEqual(['v-observe']);
      expect(vpirGraph.terminals).toEqual(['v-assert']);
    });

    it('should convert VPIR to a valid HoTT category', () => {
      const { vpirCategory, vpirValid } = runKGToHoTTRoundtrip();
      expect(vpirValid).toBe(true);
      expect(vpirCategory.objects.size).toBe(3);
      expect(vpirCategory.morphisms.size).toBe(2);
    });

    it('should have correct object kinds in KG category', () => {
      const { kgCategory } = runKGToHoTTRoundtrip();
      expect(kgCategory.objects.get('mod-main')?.kind).toBe('context');
      expect(kgCategory.objects.get('fn-handler')?.kind).toBe('term');
      expect(kgCategory.objects.get('ty-request')?.kind).toBe('type');
    });

    it('should have correct object kinds in VPIR category', () => {
      const { vpirCategory } = runKGToHoTTRoundtrip();
      expect(vpirCategory.objects.get('v-observe')?.kind).toBe('term');
      expect(vpirCategory.objects.get('v-infer')?.kind).toBe('term');
      expect(vpirCategory.objects.get('v-assert')?.kind).toBe('type');
    });
  });

  describe('Scenario 2: Labeled pipeline with IFC', () => {
    it('should preserve security labels through the pipeline', () => {
      const { allLabelsPresent } = runLabeledPipeline();
      expect(allLabelsPresent).toBe(true);
    });

    it('should detect IFC-relevant label relationships', () => {
      const { labelFlowConsistent } = runLabeledPipeline();
      expect(labelFlowConsistent).toBe(true);
    });

    it('should produce a valid category', () => {
      const { category } = runLabeledPipeline();
      expect(category.objects.size).toBe(2);
      expect(category.morphisms.size).toBe(1);
    });

    it('should track label provenance on objects', () => {
      const { category } = runLabeledPipeline();
      const configObj = category.objects.get('secret-config');
      expect(configObj?.securityLabel?.classification).toBe('confidential');
      expect(configObj?.securityLabel?.trustLevel).toBe(3);
    });
  });

  describe('Scenario 3: Parallel categorical preservation', () => {
    it('should produce a valid diamond-shaped category', () => {
      const { valid } = runParallelCategoricalPreservation();
      expect(valid).toBe(true);
    });

    it('should have correct structure for diamond DAG', () => {
      const { objectCount, morphismCount } = runParallelCategoricalPreservation();
      expect(objectCount).toBe(4);  // root, left, right, join
      expect(morphismCount).toBe(4); // root→left, root→right, left→join, right→join
    });

    it('should preserve all morphism endpoints', () => {
      const { category } = runParallelCategoricalPreservation();
      for (const morphism of category.morphisms.values()) {
        expect(category.objects.has(morphism.sourceId)).toBe(true);
        expect(category.objects.has(morphism.targetId)).toBe(true);
      }
    });
  });
});
