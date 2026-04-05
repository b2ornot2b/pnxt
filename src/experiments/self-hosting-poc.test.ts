/**
 * Self-Hosting Proof of Concept test suite.
 *
 * Sprint 9 — Advisory Panel: Alan Kay (paradigm actualization),
 * Vladimir Voevodsky (categorical structure), Ilya Sutskever (LLM alignment).
 */

import {
  describePipelineAsVPIR,
  createSelfVerificationProperties,
  categorizePipelineDescription,
  executePipelineDescription,
  runSelfHostingPoC,
} from './self-hosting-poc.js';
import { validateGraph } from '../vpir/vpir-validator.js';
import type { VPIRGraph } from '../types/vpir.js';

// ── Tests ────────────────────────────────────────────────────────────

describe('Self-Hosting Proof of Concept', () => {
  let pipelineGraph: VPIRGraph;

  beforeAll(() => {
    pipelineGraph = describePipelineAsVPIR();
  });

  // ── Self-Description ──

  describe('describePipelineAsVPIR', () => {
    it('should produce a VPIR graph with 6 pipeline stages', () => {
      expect(pipelineGraph.nodes.size).toBe(6);
    });

    it('should have nl-input as the root', () => {
      expect(pipelineGraph.roots).toEqual(['nl-input']);
    });

    it('should have dpn-execution as the terminal', () => {
      expect(pipelineGraph.terminals).toEqual(['dpn-execution']);
    });

    it('should pass structural validation', () => {
      const result = validateGraph(pipelineGraph);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should include all six pipeline stages', () => {
      const expectedIds = [
        'nl-input',
        'bridge-grammar',
        'vpir-generation',
        'hott-categorization',
        'z3-verification',
        'dpn-execution',
      ];
      for (const id of expectedIds) {
        expect(pipelineGraph.nodes.has(id)).toBe(true);
      }
    });

    it('should have correct node types for each stage', () => {
      expect(pipelineGraph.nodes.get('nl-input')!.type).toBe('observation');
      expect(pipelineGraph.nodes.get('bridge-grammar')!.type).toBe('inference');
      expect(pipelineGraph.nodes.get('vpir-generation')!.type).toBe('action');
      expect(pipelineGraph.nodes.get('hott-categorization')!.type).toBe('inference');
      expect(pipelineGraph.nodes.get('z3-verification')!.type).toBe('assertion');
      expect(pipelineGraph.nodes.get('dpn-execution')!.type).toBe('action');
    });

    it('should have proper data flow (each stage depends on previous)', () => {
      const stages = [
        'nl-input',
        'bridge-grammar',
        'vpir-generation',
        'hott-categorization',
        'z3-verification',
        'dpn-execution',
      ];

      // First stage has no inputs
      expect(pipelineGraph.nodes.get(stages[0])!.inputs).toHaveLength(0);

      // Each subsequent stage depends on its predecessor
      for (let i = 1; i < stages.length; i++) {
        const node = pipelineGraph.nodes.get(stages[i])!;
        expect(node.inputs).toHaveLength(1);
        expect(node.inputs[0].nodeId).toBe(stages[i - 1]);
      }
    });

    it('should have IFC labels with increasing trust levels', () => {
      const nlInput = pipelineGraph.nodes.get('nl-input')!;
      const dpnExecution = pipelineGraph.nodes.get('dpn-execution')!;

      expect(nlInput.label.trustLevel).toBeLessThan(dpnExecution.label.trustLevel);
    });

    it('should carry evidence for each stage', () => {
      for (const node of pipelineGraph.nodes.values()) {
        expect(node.evidence.length).toBeGreaterThan(0);
        expect(node.evidence[0].confidence).toBe(1.0);
        expect(node.evidence[0].source).toBe('pnxt-architecture');
      }
    });
  });

  // ── Self-Verification Properties ──

  describe('createSelfVerificationProperties', () => {
    it('should define precondition, postcondition, and invariant properties', () => {
      const properties = createSelfVerificationProperties();
      expect(properties).toHaveLength(3);

      const kinds = properties.map((p) => p.kind);
      expect(kinds).toContain('precondition');
      expect(kinds).toContain('postcondition');
      expect(kinds).toContain('invariant');
    });

    it('should reference valid node IDs from the pipeline', () => {
      const properties = createSelfVerificationProperties();
      const validIds = new Set(pipelineGraph.nodes.keys());

      for (const prop of properties) {
        for (const nodeId of prop.targetNodes) {
          expect(validIds.has(nodeId)).toBe(true);
        }
      }
    });

    it('should have SMT-LIB2 formulas', () => {
      const properties = createSelfVerificationProperties();
      for (const prop of properties) {
        expect(prop.formula).toBeDefined();
        expect(prop.formula.length).toBeGreaterThan(0);
        // SMT-LIB2 formulas start with '('
        expect(prop.formula.startsWith('(')).toBe(true);
      }
    });
  });

  // ── Self-Categorization ──

  describe('categorizePipelineDescription', () => {
    it('should produce a valid HoTT category', () => {
      const { category, validation } = categorizePipelineDescription(pipelineGraph);

      expect(category).toBeDefined();
      expect(category.objects.size).toBe(6); // 6 pipeline stages
      expect(validation.valid).toBe(true);
    });

    it('should have morphisms for pipeline edges', () => {
      const { category } = categorizePipelineDescription(pipelineGraph);
      // 5 edges in a 6-node chain + identity morphisms
      expect(category.morphisms.size).toBeGreaterThanOrEqual(5);
    });

    it('should name the category after the pipeline', () => {
      const { category } = categorizePipelineDescription(pipelineGraph);
      expect(category.name).toContain('pnxt');
    });
  });

  // ── Self-Execution ──

  describe('executePipelineDescription', () => {
    it('should execute the self-describing graph through DPN', async () => {
      const result = await executePipelineDescription(pipelineGraph);

      expect(result.status).toBe('completed');
      expect(result.errors).toHaveLength(0);
    });

    it('should produce outputs from terminal nodes', async () => {
      const result = await executePipelineDescription(pipelineGraph);
      expect(Object.keys(result.outputs).length).toBeGreaterThan(0);
    });

    it('should complete within timeout', async () => {
      const result = await executePipelineDescription(pipelineGraph);
      expect(result.durationMs).toBeLessThan(10_000);
    });
  });

  // ── Full Self-Hosting Run ──

  describe('runSelfHostingPoC', () => {
    it('should complete the full self-hosting proof of concept', async () => {
      const result = await runSelfHostingPoC();

      // Step 1: Self-description produces valid VPIR
      expect(result.graph.nodes.size).toBe(6);
      expect(result.validation.valid).toBe(true);

      // Step 2: Categorization produces valid category
      expect(result.categorization.category.objects.size).toBe(6);
      expect(result.categorization.validation.valid).toBe(true);

      // Step 3: DPN execution completes
      expect(result.execution.status).toBe('completed');
      expect(result.execution.errors).toHaveLength(0);
    });
  });
});
