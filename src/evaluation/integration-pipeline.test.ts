/**
 * Tests for the Integrated Pipeline — Code-to-Verified-Reasoning.
 *
 * Validates the end-to-end flow: Code → KG → VPIR → HoTT → Verify
 * using real TypeScript source code snippets.
 */

import { runIntegrationPipeline } from './integration-pipeline.js';
import { initParser, cleanupParser } from '../knowledge-graph/ts-parser.js';

// Initialize parser once
beforeAll(async () => {
  await initParser();
}, 30000);

afterAll(() => {
  cleanupParser();
});

describe('Integration Pipeline', () => {
  describe('runIntegrationPipeline', () => {
    it('should process simple TypeScript through the full pipeline', async () => {
      const source = `
function greet(name: string): string {
  return 'Hello, ' + name;
}

function main(): void {
  const result = greet('World');
  console.log(result);
}
`;
      const report = await runIntegrationPipeline(source);

      expect(report.success).toBe(true);
      expect(report.stages).toHaveLength(5);
      expect(report.stages.every((s) => s.completed)).toBe(true);
      expect(report.summary.stagesCompleted).toBe(5);
    });

    it('should extract KG nodes and edges in parse stage', async () => {
      const source = `
function validate(input: string): boolean {
  return input.length > 0;
}

function process(data: string): string {
  if (validate(data)) {
    return data.toUpperCase();
  }
  return '';
}
`;
      const report = await runIntegrationPipeline(source);

      expect(report.success).toBe(true);
      expect(report.summary.kgNodeCount).toBeGreaterThanOrEqual(3); // module + 2 functions
      expect(report.summary.kgEdgeCount).toBeGreaterThanOrEqual(2); // contains edges

      const parseStage = report.stages.find((s) => s.stage === 'parse');
      expect(parseStage).toBeDefined();
      expect(parseStage!.data!.nodeCount).toBeGreaterThanOrEqual(3);
    });

    it('should convert KG to HoTT category in graph stage', async () => {
      const source = `
interface User { id: string; name: string; }
class UserService {
  getUser(id: string): User { return { id, name: 'test' }; }
}
`;
      const report = await runIntegrationPipeline(source);

      const graphStage = report.stages.find((s) => s.stage === 'graph');
      expect(graphStage).toBeDefined();
      expect(graphStage!.completed).toBe(true);
      expect(graphStage!.data!.categoricallyValid).toBe(true);
      expect((graphStage!.data!.objectCount as number)).toBeGreaterThan(0);
    });

    it('should generate VPIR reasoning graph from KG', async () => {
      const source = `
function fetchData(): string[] { return []; }
function processData(data: string[]): number { return data.length; }
`;
      const report = await runIntegrationPipeline(source);

      const reasonStage = report.stages.find((s) => s.stage === 'reason');
      expect(reasonStage).toBeDefined();
      expect(reasonStage!.completed).toBe(true);
      expect(report.summary.vpirNodeCount).toBeGreaterThanOrEqual(3); // observe + 2 analyze + assert

      // Should have both observations and inferences
      const nodeTypes = reasonStage!.data!.nodeTypes as Record<string, number>;
      expect(nodeTypes.observation).toBeGreaterThanOrEqual(1);
      expect(nodeTypes.inference).toBeGreaterThanOrEqual(1);
      expect(nodeTypes.assertion).toBeGreaterThanOrEqual(1);
    });

    it('should formalize VPIR as HoTT category', async () => {
      const source = `
function hello(): string { return 'hello'; }
`;
      const report = await runIntegrationPipeline(source);

      const formalizeStage = report.stages.find((s) => s.stage === 'formalize');
      expect(formalizeStage).toBeDefined();
      expect(formalizeStage!.completed).toBe(true);
      expect(formalizeStage!.data!.categoricallyValid).toBe(true);
      expect(report.summary.hottObjectCount).toBeGreaterThan(0);
      expect(report.summary.hottMorphismCount).toBeGreaterThan(0);
    });

    it('should verify IFC label consistency', async () => {
      const source = `
const API_URL = 'https://api.example.com';
function fetchUser(id: string): Promise<string> {
  return fetch(API_URL + '/users/' + id).then(r => r.text());
}
`;
      const report = await runIntegrationPipeline(source);

      const verifyStage = report.stages.find((s) => s.stage === 'verify');
      expect(verifyStage).toBeDefined();
      expect(verifyStage!.completed).toBe(true);
      expect(report.summary.ifcConsistent).toBe(true);
    });

    it('should report all 5 stages with timing', async () => {
      const source = `function x(): void {}`;
      const report = await runIntegrationPipeline(source);

      const stageNames = report.stages.map((s) => s.stage);
      expect(stageNames).toEqual(['parse', 'graph', 'reason', 'formalize', 'verify']);

      for (const stage of report.stages) {
        expect(stage.durationMs).toBeGreaterThanOrEqual(0);
      }

      expect(report.summary.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle custom security labels', async () => {
      const source = `function secure(): void {}`;
      const label = {
        owner: 'admin',
        trustLevel: 3 as const,
        classification: 'confidential' as const,
        createdAt: new Date().toISOString(),
      };

      const report = await runIntegrationPipeline(source, {
        securityLabel: label,
      });

      expect(report.success).toBe(true);
      expect(report.summary.ifcConsistent).toBe(true);
    });

    it('should accept custom VPIR graph', async () => {
      const source = `function customFn(): void {}`;
      const now = new Date().toISOString();
      const label = {
        owner: 'test',
        trustLevel: 2 as const,
        classification: 'internal' as const,
        createdAt: now,
      };

      const customVPIR = {
        id: 'custom-vpir',
        name: 'Custom VPIR',
        nodes: new Map([
          ['n1', {
            id: 'n1',
            type: 'observation' as const,
            operation: 'custom observe',
            inputs: [],
            outputs: [{ port: 'out', dataType: 'Data' }],
            evidence: [{ type: 'data' as const, source: 'test', confidence: 1.0 }],
            label,
            verifiable: true,
            createdAt: now,
          }],
          ['n2', {
            id: 'n2',
            type: 'assertion' as const,
            operation: 'custom assert',
            inputs: [{ nodeId: 'n1', port: 'out', dataType: 'Data' }],
            outputs: [{ port: 'valid', dataType: 'boolean' }],
            evidence: [{ type: 'rule' as const, source: 'test', confidence: 1.0 }],
            label,
            verifiable: true,
            createdAt: now,
          }],
        ]),
        roots: ['n1'],
        terminals: ['n2'],
        createdAt: now,
      };

      const report = await runIntegrationPipeline(source, {
        customVPIR,
      });

      expect(report.success).toBe(true);
      expect(report.summary.vpirNodeCount).toBe(2);
    });

    it('should handle empty source code gracefully', async () => {
      const report = await runIntegrationPipeline('');
      expect(report.success).toBe(true);
      expect(report.summary.kgNodeCount).toBe(1); // Just the module
    });

    it('should process complex real-world TypeScript', async () => {
      const source = `
import type { SecurityLabel } from './ifc.js';

export interface KGNode {
  id: string;
  kind: string;
  name: string;
  metadata: Record<string, unknown>;
  securityLabel?: SecurityLabel;
}

export type KGRelation = 'defines' | 'imports' | 'calls';

export function createKnowledgeGraph(id: string, name: string): KGNode[] {
  return [];
}

export function addNode(graph: KGNode[], node: KGNode): void {
  graph.push(node);
}

export function query(graph: KGNode[], kind: string): KGNode[] {
  return graph.filter(n => n.kind === kind);
}

function internalHelper(): void {
  const graph = createKnowledgeGraph('test', 'test');
  addNode(graph, { id: '1', kind: 'function', name: 'test', metadata: {} });
  const result = query(graph, 'function');
}
`;
      const report = await runIntegrationPipeline(source, {
        filename: 'knowledge-graph.ts',
      });

      expect(report.success).toBe(true);
      expect(report.summary.kgNodeCount).toBeGreaterThanOrEqual(8);
      expect(report.summary.categoricallyValid).toBe(true);

      // Should detect call relationships
      const reasonStage = report.stages.find((s) => s.stage === 'reason');
      expect(reasonStage!.data!.nodeTypes).toBeDefined();
    });

    it('should handle class inheritance and implementations', async () => {
      const source = `
interface Serializable {
  serialize(): string;
}

class BaseModel {
  id: string = '';
}

class User extends BaseModel {
  name: string = '';

  greet(): string {
    return 'Hello, ' + this.name;
  }
}
`;
      const report = await runIntegrationPipeline(source);

      expect(report.success).toBe(true);
      expect(report.summary.kgNodeCount).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Pipeline summary', () => {
    it('should produce consistent summary statistics', async () => {
      const source = `
function a(): void { b(); }
function b(): void { c(); }
function c(): void {}
`;
      const report = await runIntegrationPipeline(source);
      const summary = report.summary;

      expect(summary.kgNodeCount).toBeGreaterThan(0);
      expect(summary.kgEdgeCount).toBeGreaterThan(0);
      expect(summary.vpirNodeCount).toBeGreaterThan(0);
      expect(summary.hottObjectCount).toBe(summary.vpirNodeCount);
      expect(summary.hottMorphismCount).toBeGreaterThan(0);
      expect(typeof summary.categoricallyValid).toBe('boolean');
      expect(typeof summary.ifcConsistent).toBe('boolean');
    });
  });
});
