/**
 * Multi-Agent Task Delegation Benchmark test suite.
 *
 * Sprint 7 — Advisory Panel: Barbara Liskov (practical clarity).
 */

import {
  createDelegationVPIRGraph,
  createDelegationBenchmark,
  checkDelegationIFCFlows,
  RESEARCHER_LABEL,
  ASSISTANT_LABEL,
  REVIEWER_LABEL,
} from './multi-agent-delegation.js';
import { BenchmarkRunner } from './benchmark-runner.js';
import { validateGraph } from '../vpir/vpir-validator.js';
import { canFlowTo } from '../types/ifc.js';

describe('Multi-Agent Delegation Benchmark', () => {
  describe('createDelegationVPIRGraph', () => {
    it('should create a graph with 6 nodes', () => {
      const graph = createDelegationVPIRGraph('Test research task');
      expect(graph.nodes.size).toBe(6);
      expect(graph.roots).toEqual(['research_query']);
      expect(graph.terminals).toEqual(['final_output']);
    });

    it('should pass VPIR validation', () => {
      const graph = createDelegationVPIRGraph('Test research task');
      const result = validateGraph(graph);
      expect(result.valid).toBe(true);
    });

    it('should assign correct agent IDs to nodes', () => {
      const graph = createDelegationVPIRGraph('Test');
      const researcherNodes = [...graph.nodes.values()].filter(n => n.agentId === 'researcher');
      const assistantNodes = [...graph.nodes.values()].filter(n => n.agentId === 'assistant');
      const reviewerNodes = [...graph.nodes.values()].filter(n => n.agentId === 'reviewer');

      expect(researcherNodes.length).toBe(2);
      expect(assistantNodes.length).toBe(1);
      expect(reviewerNodes.length).toBe(1);
    });

    it('should assign correct trust levels to agents', () => {
      const graph = createDelegationVPIRGraph('Test');

      const researcher = graph.nodes.get('task_decomposition')!;
      expect(researcher.label.trustLevel).toBe(3);
      expect(researcher.label.classification).toBe('confidential');

      const assistant = graph.nodes.get('format_summary')!;
      expect(assistant.label.trustLevel).toBe(2);
      expect(assistant.label.classification).toBe('internal');

      const reviewer = graph.nodes.get('review_gate')!;
      expect(reviewer.label.trustLevel).toBe(4);
      expect(reviewer.label.classification).toBe('restricted');
    });
  });

  describe('checkDelegationIFCFlows', () => {
    it('should find no IFC violations in the valid flow path', () => {
      const graph = createDelegationVPIRGraph('Test');
      const violations = checkDelegationIFCFlows(graph);
      // The valid graph design routes data appropriately:
      // public->confidential->restricted (valid upward flow)
      // public->internal (valid)
      // internal->restricted (valid)
      expect(violations.length).toBe(0);
    });

    it('should detect IFC violation when confidential flows to internal', () => {
      // Create a modified graph where research_analysis feeds directly to format_summary
      const graph = createDelegationVPIRGraph('Test');
      const formatNode = graph.nodes.get('format_summary')!;

      // Modify format_summary to take input from research_analysis (confidential->internal = violation)
      const modifiedNode = {
        ...formatNode,
        inputs: [{ nodeId: 'research_analysis', port: 'analysis_result', dataType: 'object' }],
      };
      graph.nodes.set('format_summary', modifiedNode);

      const violations = checkDelegationIFCFlows(graph);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].sourceId).toBe('research_analysis');
      expect(violations[0].targetId).toBe('format_summary');
    });
  });

  describe('agent labels', () => {
    it('should define researcher as trust 3, confidential', () => {
      expect(RESEARCHER_LABEL.trustLevel).toBe(3);
      expect(RESEARCHER_LABEL.classification).toBe('confidential');
    });

    it('should define assistant as trust 2, internal', () => {
      expect(ASSISTANT_LABEL.trustLevel).toBe(2);
      expect(ASSISTANT_LABEL.classification).toBe('internal');
    });

    it('should define reviewer as trust 4, restricted', () => {
      expect(REVIEWER_LABEL.trustLevel).toBe(4);
      expect(REVIEWER_LABEL.classification).toBe('restricted');
    });

    it('should allow researcher->reviewer flow but not researcher->assistant', () => {
      expect(canFlowTo(RESEARCHER_LABEL, REVIEWER_LABEL)).toBe(true);
      expect(canFlowTo(RESEARCHER_LABEL, ASSISTANT_LABEL)).toBe(false);
    });
  });

  describe('BenchmarkRunner integration', () => {
    it('should register and run the benchmark successfully', async () => {
      const runner = new BenchmarkRunner();
      const def = createDelegationBenchmark();
      runner.register(def);

      const result = await runner.runOne('multi-agent-delegation');
      expect(result.passed).toBe(true);
      expect(result.stages.every(s => s.status === 'passed')).toBe(true);
      expect(result.stages.length).toBe(5);
    }, 10000);
  });
});
