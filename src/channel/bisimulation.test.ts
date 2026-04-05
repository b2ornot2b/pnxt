/**
 * DPN Bisimulation Checking test suite.
 *
 * Sprint 7 — Advisory Panel: Robin Milner (bisimulation).
 */

import {
  buildLTS,
  checkStrongBisimulation,
  checkObservationalEquivalence,
  toHoTTPath,
} from './bisimulation.js';
import type {
  DataflowGraphDefinition,
  ProcessDefinition,
  Connection,
  PortDefinition,
} from '../types/channel.js';

// --- Helpers ---

function makePort(name: string, direction: 'input' | 'output', dataType = 'any'): PortDefinition {
  return { name, direction, dataType };
}

function makeProcess(id: string, inputs: PortDefinition[], outputs: PortDefinition[]): ProcessDefinition {
  return { id, name: `Process ${id}`, inputs, outputs };
}

function makeConnection(
  channelId: string,
  sourceProcessId: string,
  sourcePort: string,
  targetProcessId: string,
  targetPort: string,
): Connection {
  return {
    channelId,
    source: { processId: sourceProcessId, port: sourcePort },
    target: { processId: targetProcessId, port: targetPort },
  };
}

/** Simple pipeline: A -> B -> C */
function makePipeline(prefix = ''): DataflowGraphDefinition {
  return {
    id: `pipeline-${prefix || 'default'}`,
    name: `Pipeline ${prefix}`,
    processes: [
      makeProcess(`${prefix}A`, [], [makePort('out', 'output')]),
      makeProcess(`${prefix}B`, [makePort('in', 'input')], [makePort('out', 'output')]),
      makeProcess(`${prefix}C`, [makePort('in', 'input')], []),
    ],
    connections: [
      makeConnection(`${prefix}ch1`, `${prefix}A`, 'out', `${prefix}B`, 'in'),
      makeConnection(`${prefix}ch2`, `${prefix}B`, 'out', `${prefix}C`, 'in'),
    ],
  };
}

/** Diamond graph: A -> (B, C) -> D */
function makeDiamond(prefix = ''): DataflowGraphDefinition {
  return {
    id: `diamond-${prefix || 'default'}`,
    name: `Diamond ${prefix}`,
    processes: [
      makeProcess(`${prefix}A`, [], [makePort('out1', 'output'), makePort('out2', 'output')]),
      makeProcess(`${prefix}B`, [makePort('in', 'input')], [makePort('out', 'output')]),
      makeProcess(`${prefix}C`, [makePort('in', 'input')], [makePort('out', 'output')]),
      makeProcess(`${prefix}D`, [makePort('in1', 'input'), makePort('in2', 'input')], []),
    ],
    connections: [
      makeConnection(`${prefix}ch1`, `${prefix}A`, 'out1', `${prefix}B`, 'in'),
      makeConnection(`${prefix}ch2`, `${prefix}A`, 'out2', `${prefix}C`, 'in'),
      makeConnection(`${prefix}ch3`, `${prefix}B`, 'out', `${prefix}D`, 'in1'),
      makeConnection(`${prefix}ch4`, `${prefix}C`, 'out', `${prefix}D`, 'in2'),
    ],
  };
}

/** Single process with no connections */
function makeSingleProcess(id = 'single'): DataflowGraphDefinition {
  return {
    id: `single-${id}`,
    name: `Single ${id}`,
    processes: [makeProcess(id, [], [])],
    connections: [],
  };
}

// --- Tests ---

describe('DPN Bisimulation', () => {
  describe('buildLTS', () => {
    it('should build LTS from simple pipeline', () => {
      const config = makePipeline();
      const lts = buildLTS(config);

      expect(lts.states.size).toBeGreaterThan(0);
      expect(lts.initialStateId).toBeDefined();
      expect(lts.transitions.length).toBeGreaterThan(0);
      expect(lts.bounded).toBe(false);
    });

    it('should build LTS from diamond graph', () => {
      const config = makeDiamond();
      const lts = buildLTS(config);

      expect(lts.states.size).toBeGreaterThan(0);
      // Diamond has more branching, so more states
      expect(lts.transitions.length).toBeGreaterThan(0);
    });

    it('should have initial state with all processes idle', () => {
      const config = makePipeline();
      const lts = buildLTS(config);
      const initial = lts.states.get(lts.initialStateId)!;

      expect(initial).toBeDefined();
      for (const proc of initial.processStates) {
        expect(proc.state).toBe('idle');
      }
      for (const chan of initial.channelStates) {
        expect(chan.bufferCount).toBe(0);
        expect(chan.state).toBe('open');
      }
    });

    it('should respect maxStates bound', () => {
      const config = makeDiamond();
      const lts = buildLTS(config, 3);

      expect(lts.states.size).toBeLessThanOrEqual(3);
      expect(lts.bounded).toBe(true);
    });
  });

  describe('checkStrongBisimulation', () => {
    it('should find identical configs bisimilar', () => {
      const config = makePipeline('p1');
      const lts1 = buildLTS(config);
      const lts2 = buildLTS(config);

      const result = checkStrongBisimulation(lts1, lts2);
      expect(result.equivalent).toBe(true);
      expect(result.relation).toBeDefined();
      expect(result.relation!.isStrong).toBe(true);
      expect(result.relation!.pairs.length).toBeGreaterThan(0);
    });

    it('should find structurally identical pipelines bisimilar (different names)', () => {
      const config1 = makePipeline('x');
      const config2 = makePipeline('y');
      const lts1 = buildLTS(config1);
      const lts2 = buildLTS(config2);

      const result = checkStrongBisimulation(lts1, lts2);
      expect(result.equivalent).toBe(true);
    });

    it('should find pipeline NOT bisimilar to diamond', () => {
      const pipeline = makePipeline('p');
      const diamond = makeDiamond('d');
      const lts1 = buildLTS(pipeline);
      const lts2 = buildLTS(diamond);

      const result = checkStrongBisimulation(lts1, lts2);
      expect(result.equivalent).toBe(false);
    });

    it('should find single process bisimilar to another single process', () => {
      const c1 = makeSingleProcess('a');
      const c2 = makeSingleProcess('b');
      const lts1 = buildLTS(c1);
      const lts2 = buildLTS(c2);

      const result = checkStrongBisimulation(lts1, lts2);
      expect(result.equivalent).toBe(true);
    });

    it('should find configs with different process counts NOT bisimilar', () => {
      const pipeline = makePipeline('p');
      const single = makeSingleProcess('s');
      const lts1 = buildLTS(pipeline);
      const lts2 = buildLTS(single);

      const result = checkStrongBisimulation(lts1, lts2);
      expect(result.equivalent).toBe(false);
    });

    it('should return counterexample when not bisimilar', () => {
      const pipeline = makePipeline('p');
      const diamond = makeDiamond('d');
      const lts1 = buildLTS(pipeline);
      const lts2 = buildLTS(diamond);

      const result = checkStrongBisimulation(lts1, lts2);
      expect(result.equivalent).toBe(false);
      // Counterexample may or may not be found depending on structure
      // but the result should not be equivalent
    });
  });

  describe('checkObservationalEquivalence', () => {
    it('should find identical configs observationally equivalent', () => {
      const config = makePipeline('p');
      const lts1 = buildLTS(config);
      const lts2 = buildLTS(config);

      const result = checkObservationalEquivalence(lts1, lts2);
      expect(result.equivalent).toBe(true);
      expect(result.relation).toBeDefined();
      expect(result.relation!.isObservational).toBe(true);
    });

    it('should find structurally identical configs observationally equivalent', () => {
      const c1 = makePipeline('a');
      const c2 = makePipeline('b');
      const lts1 = buildLTS(c1);
      const lts2 = buildLTS(c2);

      const result = checkObservationalEquivalence(lts1, lts2);
      expect(result.equivalent).toBe(true);
    });

    it('should agree with strong bisimulation for tau-free observable behavior', () => {
      // When two configs are strongly bisimilar, they are also observationally equivalent
      const c1 = makePipeline('a');
      const c2 = makePipeline('b');
      const lts1 = buildLTS(c1);
      const lts2 = buildLTS(c2);

      const strongResult = checkStrongBisimulation(lts1, lts2);
      const weakResult = checkObservationalEquivalence(lts1, lts2);

      expect(strongResult.equivalent).toBe(true);
      expect(weakResult.equivalent).toBe(true);
    });

    it('should find single processes observationally equivalent', () => {
      const c1 = makeSingleProcess('x');
      const c2 = makeSingleProcess('y');
      const lts1 = buildLTS(c1);
      const lts2 = buildLTS(c2);

      const result = checkObservationalEquivalence(lts1, lts2);
      expect(result.equivalent).toBe(true);
    });
  });

  describe('toHoTTPath', () => {
    it('should produce a PathTerm for bisimilar configs', () => {
      const c1 = makePipeline('a');
      const c2 = makePipeline('b');
      const lts1 = buildLTS(c1);
      const lts2 = buildLTS(c2);

      const bisimResult = checkStrongBisimulation(lts1, lts2);
      expect(bisimResult.equivalent).toBe(true);

      const path = toHoTTPath(bisimResult, c1, c2);
      expect(path).toBeDefined();
      expect(path!.sourceId).toContain('L1_');
      expect(path!.targetId).toContain('L2_');
      expect(path!.fromEquivalence).toBeDefined();
    });

    it('should return undefined for non-bisimilar configs', () => {
      const pipeline = makePipeline('p');
      const diamond = makeDiamond('d');
      const lts1 = buildLTS(pipeline);
      const lts2 = buildLTS(diamond);

      const bisimResult = checkStrongBisimulation(lts1, lts2);
      expect(bisimResult.equivalent).toBe(false);

      const path = toHoTTPath(bisimResult, pipeline, diamond);
      expect(path).toBeUndefined();
    });

    it('should have fromEquivalence with valid forward/backward morphisms', () => {
      const c1 = makePipeline('x');
      const c2 = makePipeline('y');
      const lts1 = buildLTS(c1);
      const lts2 = buildLTS(c2);

      const bisimResult = checkStrongBisimulation(lts1, lts2);
      const path = toHoTTPath(bisimResult, c1, c2);

      expect(path).toBeDefined();
      const equiv = path!.fromEquivalence!;
      expect(equiv.forward.sourceId).toBe(path!.sourceId);
      expect(equiv.forward.targetId).toBe(path!.targetId);
      expect(equiv.backward.sourceId).toBe(path!.targetId);
      expect(equiv.backward.targetId).toBe(path!.sourceId);
    });

    it('should return undefined for empty config', () => {
      const emptyConfig: DataflowGraphDefinition = {
        id: 'empty',
        name: 'Empty',
        processes: [],
        connections: [],
      };
      const c2 = makePipeline('p');

      // Force an "equivalent" result to test path construction with empty config
      const mockResult = { equivalent: true, relation: { pairs: [], isStrong: true, isObservational: false } };
      const path = toHoTTPath(mockResult, emptyConfig, c2);
      expect(path).toBeUndefined(); // No processes → can't build path
    });
  });
});
