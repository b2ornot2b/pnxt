/**
 * Tests for VPIR Graph Export — structured JSON visualization.
 */

import {
  exportGraphToJSON,
  exportCategoryToJSON,
  exportPipelineToJSON,
  exportTraceToJSON,
} from './vpir-graph-export.js';
import { createCategory, addObject, addMorphism, addPath, addHigherPath } from '../hott/category.js';
import type { VPIRGraph, VPIRNode, SecurityLabel } from '../types/index.js';
import type { VPIRExecutionResult, VPIRExecutionTrace } from '../types/vpir-execution.js';
import type { PipelineReport } from '../evaluation/integration-pipeline.js';
import type { HoTTObject, Morphism, HigherPath } from '../types/hott.js';

// --- Helpers ---

function makeLabel(owner: string, trustLevel: 0 | 1 | 2 | 3 | 4 = 2): SecurityLabel {
  return { owner, trustLevel, classification: 'internal', createdAt: new Date().toISOString() };
}

function makeNode(
  id: string,
  type: VPIRNode['type'],
  inputs: { nodeId: string; port: string; dataType: string }[] = [],
): VPIRNode {
  return {
    id,
    type,
    operation: `op_${id}`,
    inputs,
    outputs: [{ port: 'out', dataType: 'string' }],
    evidence: [{ type: 'data', source: 'test', confidence: 1.0 }],
    label: makeLabel('agent-1'),
    verifiable: true,
    createdAt: new Date().toISOString(),
  };
}

function makeGraph(id: string, nodes: VPIRNode[]): VPIRGraph {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const roots = nodes.filter((n) => n.inputs.length === 0).map((n) => n.id);
  const referencedAsInput = new Set(nodes.flatMap((n) => n.inputs.map((i) => i.nodeId)));
  const terminals = nodes.filter((n) => !referencedAsInput.has(n.id)).map((n) => n.id);
  return {
    id,
    name: `Graph ${id}`,
    nodes: nodeMap,
    roots,
    terminals,
    createdAt: new Date().toISOString(),
  };
}

function makeObject(id: string, kind: 'type' | 'term' | 'context' = 'term'): HoTTObject {
  return { id, kind, label: id };
}

function makeMorphism(id: string, sourceId: string, targetId: string): Morphism {
  return { id, sourceId, targetId, label: `${sourceId}->${targetId}`, properties: [] };
}

// --- Tests ---

describe('VPIR Graph Export', () => {
  describe('exportGraphToJSON', () => {
    it('should export a single-node graph', () => {
      const graph = makeGraph('g1', [makeNode('n1', 'observation')]);
      const json = exportGraphToJSON(graph);

      expect(json.nodes).toHaveLength(1);
      expect(json.edges).toHaveLength(0);
      expect(json.nodes[0].id).toBe('n1');
      expect(json.nodes[0].type).toBe('observation');
      expect(json.nodes[0].label).toBe('op_n1');
      expect(json.nodes[0].position.layer).toBe(0);
      expect(json.metadata.nodeCount).toBe(1);
      expect(json.metadata.edgeCount).toBe(0);
    });

    it('should export a linear chain graph with correct layers', () => {
      const graph = makeGraph('g1', [
        makeNode('n1', 'observation'),
        makeNode('n2', 'inference', [{ nodeId: 'n1', port: 'out', dataType: 'string' }]),
        makeNode('n3', 'action', [{ nodeId: 'n2', port: 'out', dataType: 'string' }]),
      ]);
      const json = exportGraphToJSON(graph);

      expect(json.nodes).toHaveLength(3);
      expect(json.edges).toHaveLength(2);

      const n1 = json.nodes.find((n) => n.id === 'n1')!;
      const n2 = json.nodes.find((n) => n.id === 'n2')!;
      const n3 = json.nodes.find((n) => n.id === 'n3')!;

      expect(n1.position.layer).toBe(0);
      expect(n2.position.layer).toBe(1);
      expect(n3.position.layer).toBe(2);
    });

    it('should preserve edges with port and data type info', () => {
      const graph = makeGraph('g1', [
        makeNode('n1', 'observation'),
        makeNode('n2', 'inference', [{ nodeId: 'n1', port: 'data', dataType: 'number' }]),
      ]);
      const json = exportGraphToJSON(graph);

      expect(json.edges).toHaveLength(1);
      expect(json.edges[0].source).toBe('n1');
      expect(json.edges[0].target).toBe('n2');
      expect(json.edges[0].label).toBe('data');
      expect(json.edges[0].dataType).toBe('number');
    });

    it('should handle a diamond DAG', () => {
      const graph = makeGraph('g1', [
        makeNode('root', 'observation'),
        makeNode('left', 'inference', [{ nodeId: 'root', port: 'out', dataType: 'string' }]),
        makeNode('right', 'inference', [{ nodeId: 'root', port: 'out', dataType: 'string' }]),
        makeNode('join', 'action', [
          { nodeId: 'left', port: 'out', dataType: 'string' },
          { nodeId: 'right', port: 'out', dataType: 'string' },
        ]),
      ]);
      const json = exportGraphToJSON(graph);

      expect(json.nodes).toHaveLength(4);
      expect(json.edges).toHaveLength(4);
      expect(json.metadata.roots).toContain('root');
      expect(json.metadata.terminals).toContain('join');

      const join = json.nodes.find((n) => n.id === 'join')!;
      expect(join.position.layer).toBe(2);
    });

    it('should export empty graph', () => {
      const graph: VPIRGraph = {
        id: 'empty',
        name: 'Empty',
        nodes: new Map(),
        roots: [],
        terminals: [],
        createdAt: new Date().toISOString(),
      };
      const json = exportGraphToJSON(graph);

      expect(json.nodes).toHaveLength(0);
      expect(json.edges).toHaveLength(0);
      expect(json.metadata.nodeCount).toBe(0);
    });

    it('should include security labels and verifiable flags', () => {
      const graph = makeGraph('g1', [makeNode('n1', 'observation')]);
      const json = exportGraphToJSON(graph);

      expect(json.nodes[0].securityLabel?.owner).toBe('agent-1');
      expect(json.nodes[0].verifiable).toBe(true);
    });
  });

  describe('exportCategoryToJSON', () => {
    it('should export objects, morphisms, and paths', () => {
      const cat = createCategory('c1', 'TestCat');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));
      addMorphism(cat, makeMorphism('g', 'A', 'B'));
      addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'refactoring' });

      const json = exportCategoryToJSON(cat);

      expect(json.id).toBe('c1');
      expect(json.name).toBe('TestCat');
      expect(json.objects).toHaveLength(2);
      expect(json.morphisms).toHaveLength(2);
      expect(json.paths).toHaveLength(1);
      expect(json.higherPaths).toHaveLength(0);
    });

    it('should include higher paths when present', () => {
      const cat = createCategory('c1', 'TestCat');
      addObject(cat, makeObject('A'));
      addObject(cat, makeObject('B'));
      addMorphism(cat, makeMorphism('f', 'A', 'B'));
      addMorphism(cat, makeMorphism('g', 'A', 'B'));
      addMorphism(cat, makeMorphism('h', 'A', 'B'));
      addPath(cat, { id: 'p1', leftId: 'f', rightId: 'g', witness: 'r1' });
      addPath(cat, { id: 'p2', leftId: 'g', rightId: 'h', witness: 'r2' });

      const hp: HigherPath = {
        id: 'hp1',
        leftPathId: 'p1',
        rightPathId: 'p2',
        level: 2,
        witness: 'both equivalent',
      };
      addHigherPath(cat, hp);

      const json = exportCategoryToJSON(cat);

      expect(json.higherPaths).toHaveLength(1);
      expect(json.higherPaths[0].leftPathId).toBe('p1');
      expect(json.higherPaths[0].rightPathId).toBe('p2');
    });

    it('should export empty category', () => {
      const cat = createCategory('empty', 'Empty');
      const json = exportCategoryToJSON(cat);

      expect(json.objects).toHaveLength(0);
      expect(json.morphisms).toHaveLength(0);
      expect(json.paths).toHaveLength(0);
      expect(json.higherPaths).toHaveLength(0);
    });

    it('should preserve security labels on objects', () => {
      const cat = createCategory('c1', 'TestCat');
      addObject(cat, {
        id: 'A',
        kind: 'type',
        label: 'A',
        securityLabel: makeLabel('agent-1', 3),
      });

      const json = exportCategoryToJSON(cat);
      expect(json.objects[0].securityLabel?.trustLevel).toBe(3);
    });
  });

  describe('exportPipelineToJSON', () => {
    it('should export a successful pipeline report', () => {
      const report: PipelineReport = {
        success: true,
        stages: [
          { stage: 'parse', completed: true, durationMs: 10, data: {} },
          { stage: 'graph', completed: true, durationMs: 5, data: {} },
          { stage: 'reason', completed: true, durationMs: 15, data: {} },
          { stage: 'formalize', completed: true, durationMs: 8, data: {} },
          { stage: 'verify', completed: true, durationMs: 20, data: {} },
        ],
        summary: {
          totalDurationMs: 58,
          kgNodeCount: 10,
          kgEdgeCount: 15,
          vpirNodeCount: 5,
          hottObjectCount: 5,
          hottMorphismCount: 4,
          categoricallyValid: true,
          ifcConsistent: true,
          stagesCompleted: 5,
        },
      };

      const json = exportPipelineToJSON(report);

      expect(json.success).toBe(true);
      expect(json.stages).toHaveLength(5);
      expect(json.connections).toHaveLength(4);
      expect(json.summary.totalDurationMs).toBe(58);
      expect(json.summary.categoricallyValid).toBe(true);
    });

    it('should export a failed pipeline report', () => {
      const report: PipelineReport = {
        success: false,
        failedStage: 'reason',
        error: 'VPIR generation failed',
        stages: [
          { stage: 'parse', completed: true, durationMs: 10 },
          { stage: 'graph', completed: true, durationMs: 5 },
          { stage: 'reason', completed: false, durationMs: 0, error: 'Failed' },
        ],
        summary: {
          totalDurationMs: 15,
          kgNodeCount: 10,
          kgEdgeCount: 15,
          vpirNodeCount: 0,
          hottObjectCount: 0,
          hottMorphismCount: 0,
          categoricallyValid: false,
          ifcConsistent: false,
          stagesCompleted: 2,
        },
      };

      const json = exportPipelineToJSON(report);
      expect(json.success).toBe(false);
      expect(json.stages[2].completed).toBe(false);
      expect(json.summary.stagesCompleted).toBe(2);
    });
  });

  describe('exportTraceToJSON', () => {
    it('should export execution trace with steps and timeline', () => {
      const now = new Date();
      const trace: VPIRExecutionTrace[] = [
        {
          nodeId: 'n1',
          operation: 'observe',
          inputs: {},
          output: 'data',
          success: true,
          timestamp: now.toISOString(),
        },
        {
          nodeId: 'n2',
          operation: 'infer',
          inputs: { data: 'data' },
          output: 'result',
          success: true,
          timestamp: new Date(now.getTime() + 10).toISOString(),
        },
      ];

      const result: VPIRExecutionResult = {
        graphId: 'g1',
        status: 'completed',
        durationMs: 10,
        trace,
        outputs: { result: 'result' },
        errors: [],
      };

      const json = exportTraceToJSON(result);

      expect(json.steps).toHaveLength(2);
      expect(json.steps[0].nodeId).toBe('n1');
      expect(json.steps[0].success).toBe(true);
      expect(json.steps[1].index).toBe(1);

      expect(json.timeline).toHaveLength(2);
      expect(json.timeline[0].startMs).toBe(0);
      expect(json.timeline[1].startMs).toBe(10);

      expect(json.summary.graphId).toBe('g1');
      expect(json.summary.status).toBe('completed');
      expect(json.summary.totalSteps).toBe(2);
      expect(json.summary.successfulSteps).toBe(2);
      expect(json.summary.failedSteps).toBe(0);
      expect(json.summary.outputKeys).toContain('result');
    });

    it('should handle empty trace', () => {
      const result: VPIRExecutionResult = {
        graphId: 'g1',
        status: 'completed',
        durationMs: 0,
        trace: [],
        outputs: {},
        errors: [],
      };

      const json = exportTraceToJSON(result);
      expect(json.steps).toHaveLength(0);
      expect(json.timeline).toHaveLength(0);
      expect(json.summary.totalSteps).toBe(0);
    });

    it('should export trace with failed steps', () => {
      const now = new Date();
      const trace: VPIRExecutionTrace[] = [
        {
          nodeId: 'n1',
          operation: 'observe',
          inputs: {},
          output: 'data',
          success: true,
          timestamp: now.toISOString(),
        },
        {
          nodeId: 'n2',
          operation: 'fail_op',
          inputs: { data: 'data' },
          success: false,
          error: 'Something went wrong',
          timestamp: new Date(now.getTime() + 5).toISOString(),
        },
      ];

      const result: VPIRExecutionResult = {
        graphId: 'g1',
        status: 'failed',
        durationMs: 5,
        trace,
        outputs: {},
        errors: [{ code: 'HANDLER_ERROR', nodeId: 'n2', message: 'Something went wrong' }],
      };

      const json = exportTraceToJSON(result);

      expect(json.summary.status).toBe('failed');
      expect(json.summary.successfulSteps).toBe(1);
      expect(json.summary.failedSteps).toBe(1);
      expect(json.timeline[1].status).toBe('failed');
      expect(json.steps[1].error).toBe('Something went wrong');
    });
  });
});
