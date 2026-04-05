/**
 * Tests for LLM-integrated pipeline — live LLM VPIR generation
 * wired into the Code→KG→VPIR→HoTT→Z3 pipeline.
 */

import { runIntegrationPipeline, serializeKGForLLM } from './integration-pipeline.js';
import { createMockClient, createSampleVPIRGraphJSON } from '../bridge-grammar/llm-vpir-generator.js';
import { initParser, cleanupParser } from '../knowledge-graph/ts-parser.js';
import { createKnowledgeGraph, addNode, addEdge } from '../knowledge-graph/knowledge-graph.js';

beforeAll(async () => {
  await initParser();
}, 30000);

afterAll(() => {
  cleanupParser();
});

const SIMPLE_SOURCE = `
function greet(name: string): string {
  return 'Hello, ' + name;
}

function main(): void {
  const result = greet('World');
  console.log(result);
}
`;

describe('LLM Pipeline Integration', () => {
  it('should run pipeline with mock LLM client returning valid VPIR', async () => {
    const sampleJSON = createSampleVPIRGraphJSON('llm-test');
    const mockClient = createMockClient(sampleJSON);

    const report = await runIntegrationPipeline(SIMPLE_SOURCE, {
      llmGeneration: {
        enabled: true,
        client: mockClient,
      },
    });

    expect(report.success).toBe(true);
    expect(report.summary.vpirSource).toBe('llm');
    expect(report.summary.stagesCompleted).toBe(5);
  });

  it('should include LLM metadata in reason stage', async () => {
    const sampleJSON = createSampleVPIRGraphJSON('metadata-test');
    const mockClient = createMockClient(sampleJSON);

    const report = await runIntegrationPipeline(SIMPLE_SOURCE, {
      llmGeneration: {
        enabled: true,
        client: mockClient,
        model: 'claude-sonnet-4-20250514',
      },
    });

    const reasonStage = report.stages.find((s) => s.stage === 'reason');
    expect(reasonStage).toBeDefined();
    expect(reasonStage!.data?.source).toBe('llm');
    expect(reasonStage!.data?.llmAttempts).toBe(1);
    expect(reasonStage!.data?.llmModel).toBe('claude-sonnet-4-20250514');
  });

  it('should fallback to deterministic when LLM returns no tool_use', async () => {
    // Create a client that always returns text-only (no tool_use)
    const mockClient = createMockClient({}, true);
    // failFirst=true means first call is text-only.
    // But with maxRetries=0, there's only 1 attempt total, so it fails.
    // The pipeline should fallback to deterministic.

    const report = await runIntegrationPipeline(SIMPLE_SOURCE, {
      llmGeneration: {
        enabled: true,
        client: mockClient,
        maxRetries: 0,
      },
    });

    expect(report.success).toBe(true);
    // Should fallback to deterministic since LLM failed
    expect(report.summary.vpirSource).toBe('deterministic');
  });

  it('should retry on invalid output then succeed', async () => {
    const sampleJSON = createSampleVPIRGraphJSON('retry-test');
    // failFirst=true: first call returns text-only, second call returns valid tool_use
    const mockClient = createMockClient(sampleJSON, true);

    const report = await runIntegrationPipeline(SIMPLE_SOURCE, {
      llmGeneration: {
        enabled: true,
        client: mockClient,
        maxRetries: 2,
      },
    });

    expect(report.success).toBe(true);
    expect(report.summary.vpirSource).toBe('llm');
    const reasonStage = report.stages.find((s) => s.stage === 'reason');
    expect(reasonStage!.data?.llmAttempts).toBe(2); // Failed once, succeeded on retry
  });

  it('should propagate IFC labels through LLM-generated nodes', async () => {
    const sampleJSON = createSampleVPIRGraphJSON('ifc-test');
    const mockClient = createMockClient(sampleJSON);

    const report = await runIntegrationPipeline(SIMPLE_SOURCE, {
      llmGeneration: {
        enabled: true,
        client: mockClient,
      },
      securityLabel: {
        owner: 'test-pipeline',
        trustLevel: 2,
        classification: 'internal',
        createdAt: new Date().toISOString(),
      },
    });

    expect(report.success).toBe(true);
    expect(report.summary.ifcConsistent).toBe(true);
  });

  it('should use deterministic source when llmGeneration is not enabled', async () => {
    const report = await runIntegrationPipeline(SIMPLE_SOURCE, {
      llmGeneration: {
        enabled: false,
      },
    });

    expect(report.success).toBe(true);
    expect(report.summary.vpirSource).toBe('deterministic');
  });

  it('should use custom source when customVPIR is provided', async () => {
    const sampleJSON = createSampleVPIRGraphJSON('custom-test');
    // Parse the sample JSON to a real VPIRGraph to use as customVPIR
    const { parseVPIRGraph } = await import('../bridge-grammar/schema-validator.js');
    const parsed = parseVPIRGraph(sampleJSON);

    if (parsed.valid && parsed.graph) {
      const report = await runIntegrationPipeline(SIMPLE_SOURCE, {
        customVPIR: parsed.graph,
      });

      expect(report.success).toBe(true);
      expect(report.summary.vpirSource).toBe('custom');
    }
  });
});

describe('serializeKGForLLM', () => {
  it('should produce a structured prompt from a knowledge graph', () => {
    const kg = createKnowledgeGraph('test-kg', 'Test KG');
    addNode(kg, {
      id: 'n1', kind: 'function', name: 'greet',
      location: { file: 'test.ts', startLine: 1, endLine: 3 },
    });
    addNode(kg, {
      id: 'n2', kind: 'function', name: 'main',
      location: { file: 'test.ts', startLine: 5, endLine: 8 },
    });
    addEdge(kg, {
      id: 'e1', source: 'n2', target: 'n1', relation: 'calls',
    });

    const prompt = serializeKGForLLM(kg);
    expect(prompt).toContain('Test KG');
    expect(prompt).toContain('function');
    expect(prompt).toContain('greet');
    expect(prompt).toContain('main');
    expect(prompt).toContain('calls');
    expect(prompt).toContain('VPIR');
  });

  it('should group entities by kind', () => {
    const kg = createKnowledgeGraph('kind-test', 'Kind Test');
    addNode(kg, {
      id: 'f1', kind: 'function', name: 'foo',
      location: { file: 'test.ts', startLine: 1, endLine: 1 },
    });
    addNode(kg, {
      id: 'c1', kind: 'class', name: 'Bar',
      location: { file: 'test.ts', startLine: 2, endLine: 5 },
    });

    const prompt = serializeKGForLLM(kg);
    expect(prompt).toContain('function: foo');
    expect(prompt).toContain('class: Bar');
  });

  it('should summarize relationship counts', () => {
    const kg = createKnowledgeGraph('rel-test', 'Rel Test');
    addNode(kg, {
      id: 'n1', kind: 'function', name: 'a',
      location: { file: 'test.ts', startLine: 1, endLine: 1 },
    });
    addNode(kg, {
      id: 'n2', kind: 'function', name: 'b',
      location: { file: 'test.ts', startLine: 2, endLine: 2 },
    });
    addEdge(kg, { id: 'e1', source: 'n1', target: 'n2', relation: 'calls' });
    addEdge(kg, { id: 'e2', source: 'n2', target: 'n1', relation: 'calls' });

    const prompt = serializeKGForLLM(kg);
    expect(prompt).toContain('calls: 2');
  });
});
