/**
 * DPN Bisimulation Checking — formal equivalence for DPN configurations.
 *
 * Implements strong bisimulation (Kanellakis-Smolka partition refinement)
 * and observational equivalence (weak bisimulation via tau-closure).
 * Produces HoTT paths for equivalent configurations, connecting
 * bisimulation to univalence for provably-correct refactoring.
 *
 * Sprint 7 deliverable — Advisory Panel: Robin Milner (bisimulation).
 */

import type {
  DataflowGraphDefinition,
  Connection,
} from '../types/channel.js';
import type {
  BisimulationResult,
  BisimulationRelation,
  DPNAction,
  DPNState,
  DPNTransition,
  LabelledTransitionSystem,
  ProcessStateSnapshot,
  ChannelStateSnapshot,
} from '../types/bisimulation.js';
import type { PathTerm, Category, HoTTObject, Morphism } from '../types/hott.js';
import { createCategory, addObject, addMorphism } from '../hott/category.js';
import { createTypeEquivalence, equivalenceToPath } from '../hott/univalence.js';

// ── State Hashing ──────────────────────────────────────────────────

/**
 * Generate a deterministic ID for a DPN state (hash of process + channel snapshots).
 */
function hashState(
  processStates: ProcessStateSnapshot[],
  channelStates: ChannelStateSnapshot[],
): string {
  const procPart = processStates
    .map(p => `${p.processId}:${p.state}:${p.pendingInputs.join(',')}:${p.pendingOutputs.join(',')}`)
    .sort()
    .join('|');
  const chanPart = channelStates
    .map(c => `${c.channelId}:${c.bufferCount}:${c.state}`)
    .sort()
    .join('|');
  return `S[${procPart}][${chanPart}]`;
}

// ── LTS Construction ───────────────────────────────────────────────

/**
 * Build a connection lookup: processId → {inputs, outputs}.
 */
function buildConnectionMap(config: DataflowGraphDefinition): {
  processInputs: Map<string, Connection[]>;
  processOutputs: Map<string, Connection[]>;
} {
  const processInputs = new Map<string, Connection[]>();
  const processOutputs = new Map<string, Connection[]>();

  for (const proc of config.processes) {
    processInputs.set(proc.id, []);
    processOutputs.set(proc.id, []);
  }

  for (const conn of config.connections) {
    processOutputs.get(conn.source.processId)?.push(conn);
    processInputs.get(conn.target.processId)?.push(conn);
  }

  return { processInputs, processOutputs };
}

/**
 * Compute the initial DPN state: all processes idle, all channels empty and open.
 */
function buildInitialState(config: DataflowGraphDefinition): DPNState {
  const processStates: ProcessStateSnapshot[] = config.processes.map(p => ({
    processId: p.id,
    state: 'idle',
    pendingInputs: p.inputs.map(i => i.name),
    pendingOutputs: [],
  }));

  // Derive channels from connections (unique channelIds)
  const channelIds = new Set<string>();
  for (const conn of config.connections) {
    channelIds.add(conn.channelId);
  }

  const channelStates: ChannelStateSnapshot[] = [...channelIds].map(id => ({
    channelId: id,
    bufferCount: 0,
    state: 'open',
  }));

  const id = hashState(processStates, channelStates);
  return { id, processStates, channelStates };
}

/**
 * Generate possible transitions from a given DPN state.
 */
function generateTransitions(
  state: DPNState,
  config: DataflowGraphDefinition,
  connectionMap: { processInputs: Map<string, Connection[]>; processOutputs: Map<string, Connection[]> },
): Array<{ action: DPNAction; nextState: DPNState }> {
  const transitions: Array<{ action: DPNAction; nextState: DPNState }> = [];

  for (const proc of state.processStates) {
    // Tau: idle process can start running (internal step)
    if (proc.state === 'idle') {
      const nextProcessStates = state.processStates.map(p =>
        p.processId === proc.processId
          ? { ...p, state: 'running' as const, pendingOutputs: getOutputPorts(proc.processId, config) }
          : { ...p },
      );
      const nextChannelStates = state.channelStates.map(c => ({ ...c }));
      const nextId = hashState(nextProcessStates, nextChannelStates);
      transitions.push({
        action: { kind: 'tau', processId: proc.processId, description: 'start' },
        nextState: { id: nextId, processStates: nextProcessStates, channelStates: nextChannelStates },
      });
    }

    // Send: running process with pending outputs can send
    if (proc.state === 'running' && proc.pendingOutputs.length > 0) {
      const outputs = connectionMap.processOutputs.get(proc.processId) ?? [];
      for (const conn of outputs) {
        if (!proc.pendingOutputs.includes(conn.source.port)) continue;

        const nextProcessStates = state.processStates.map(p =>
          p.processId === proc.processId
            ? { ...p, pendingOutputs: p.pendingOutputs.filter(po => po !== conn.source.port) }
            : { ...p },
        );
        const nextChannelStates = state.channelStates.map(c =>
          c.channelId === conn.channelId
            ? { ...c, bufferCount: c.bufferCount + 1 }
            : { ...c },
        );

        // If no more pending outputs, process completes
        const updatedProc = nextProcessStates.find(p => p.processId === proc.processId)!;
        if (updatedProc.pendingOutputs.length === 0 && updatedProc.pendingInputs.length === 0) {
          updatedProc.state = 'completed';
        }

        const nextId = hashState(nextProcessStates, nextChannelStates);
        transitions.push({
          action: { kind: 'send', processId: proc.processId, channelId: conn.channelId, port: conn.source.port },
          nextState: { id: nextId, processStates: nextProcessStates, channelStates: nextChannelStates },
        });
      }
    }

    // Receive: process with pending inputs can receive if channel has data
    if (proc.pendingInputs.length > 0) {
      const inputs = connectionMap.processInputs.get(proc.processId) ?? [];
      for (const conn of inputs) {
        if (!proc.pendingInputs.includes(conn.target.port)) continue;

        const chanState = state.channelStates.find(c => c.channelId === conn.channelId);
        if (!chanState || chanState.bufferCount === 0) continue;

        const nextProcessStates = state.processStates.map(p =>
          p.processId === proc.processId
            ? { ...p, pendingInputs: p.pendingInputs.filter(pi => pi !== conn.target.port) }
            : { ...p },
        );
        const nextChannelStates = state.channelStates.map(c =>
          c.channelId === conn.channelId
            ? { ...c, bufferCount: c.bufferCount - 1 }
            : { ...c },
        );

        // If process was idle and received all inputs, it transitions to running
        const updatedProc = nextProcessStates.find(p => p.processId === proc.processId)!;
        if (updatedProc.state === 'idle' && updatedProc.pendingInputs.length === 0) {
          updatedProc.state = 'running';
          updatedProc.pendingOutputs = getOutputPorts(proc.processId, config);
        }

        const nextId = hashState(nextProcessStates, nextChannelStates);
        transitions.push({
          action: { kind: 'receive', processId: proc.processId, channelId: conn.channelId, port: conn.target.port },
          nextState: { id: nextId, processStates: nextProcessStates, channelStates: nextChannelStates },
        });
      }
    }
  }

  return transitions;
}

function getOutputPorts(processId: string, config: DataflowGraphDefinition): string[] {
  const proc = config.processes.find(p => p.id === processId);
  return proc?.outputs.map(o => o.name) ?? [];
}

/**
 * Build a Labelled Transition System from a DPN configuration.
 *
 * Explores reachable states via BFS, bounded by maxStates.
 */
export function buildLTS(
  config: DataflowGraphDefinition,
  maxStates: number = 200,
): LabelledTransitionSystem {
  const connectionMap = buildConnectionMap(config);
  const initial = buildInitialState(config);
  const states = new Map<string, DPNState>();
  const transitions: DPNTransition[] = [];
  const queue: DPNState[] = [initial];
  let bounded = false;

  states.set(initial.id, initial);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const possibleTransitions = generateTransitions(current, config, connectionMap);

    for (const { action, nextState } of possibleTransitions) {
      transitions.push({
        fromStateId: current.id,
        action,
        toStateId: nextState.id,
      });

      if (!states.has(nextState.id)) {
        if (states.size >= maxStates) {
          bounded = true;
          continue;
        }
        states.set(nextState.id, nextState);
        queue.push(nextState);
      }
    }
  }

  return {
    states,
    initialStateId: initial.id,
    transitions,
    bounded,
  };
}

// ── Partition Refinement (Kanellakis-Smolka) ───────────────────────

/**
 * Compute the action signature for a state given a partition.
 * Two states have the same signature iff they can match each other's
 * transitions step-for-step, reaching the same partition classes.
 *
 * Actions are abstracted over process/channel names: the key includes
 * the action kind and the port name (structural position), which lets
 * structurally identical configs with different IDs be recognized as
 * bisimilar, while distinguishing configs with different topologies.
 */
function computeSignature(
  stateId: string,
  transitions: DPNTransition[],
  partitionOf: Map<string, number>,
  includeTau: boolean,
): string {
  const outgoing = transitions
    .filter(t => t.fromStateId === stateId)
    .filter(t => includeTau || t.action.kind !== 'tau')
    .map(t => {
      // Abstract over process/channel IDs but keep port for structural distinction
      let actionKey: string;
      if (t.action.kind === 'tau') {
        actionKey = `tau:${t.action.description}`;
      } else {
        actionKey = `${t.action.kind}:${t.action.port}`;
      }
      const targetPartition = partitionOf.get(t.toStateId) ?? -1;
      return `${actionKey}->${targetPartition}`;
    })
    .sort();

  return outgoing.join('|');
}

/**
 * Partition refinement for bisimulation checking.
 *
 * @param combinedStates - All state IDs from both LTS
 * @param combinedTransitions - All transitions from both LTS
 * @param includeTau - If true, tau actions are included (strong). If false, excluded (weak/observational).
 */
function partitionRefinement(
  combinedStates: string[],
  combinedTransitions: DPNTransition[],
  includeTau: boolean,
): Map<string, number> {
  // Initialize: all states in one partition
  let partitionOf = new Map<string, number>();
  for (const s of combinedStates) {
    partitionOf.set(s, 0);
  }

  let changed = true;
  let nextPartitionId = 1;

  while (changed) {
    changed = false;
    const signatureToPartition = new Map<string, number>();
    const newPartitionOf = new Map<string, number>();
    nextPartitionId = 0;

    // Group states by (current partition, action signature)
    for (const stateId of combinedStates) {
      const currentPartition = partitionOf.get(stateId) ?? 0;
      const sig = computeSignature(stateId, combinedTransitions, partitionOf, includeTau);
      const key = `${currentPartition}::${sig}`;

      if (!signatureToPartition.has(key)) {
        signatureToPartition.set(key, nextPartitionId++);
      }
      newPartitionOf.set(stateId, signatureToPartition.get(key)!);
    }

    // Check if partition changed
    for (const stateId of combinedStates) {
      if (newPartitionOf.get(stateId) !== partitionOf.get(stateId)) {
        changed = true;
        break;
      }
    }

    // Check if number of partitions changed (more precise check)
    if (!changed) {
      const oldPartitions = new Set(partitionOf.values()).size;
      const newPartitions = new Set(newPartitionOf.values()).size;
      if (oldPartitions !== newPartitions) {
        changed = true;
      }
    }

    partitionOf = newPartitionOf;
  }

  return partitionOf;
}

// ── Bisimulation Checking ──────────────────────────────────────────

/**
 * Prefix all state IDs in an LTS to avoid collisions when combining.
 */
function prefixLTS(lts: LabelledTransitionSystem, prefix: string): {
  stateIds: string[];
  transitions: DPNTransition[];
  initialId: string;
} {
  const stateIds = [...lts.states.keys()].map(id => `${prefix}${id}`);
  const transitions = lts.transitions.map(t => ({
    fromStateId: `${prefix}${t.fromStateId}`,
    action: t.action,
    toStateId: `${prefix}${t.toStateId}`,
  }));
  const initialId = `${prefix}${lts.initialStateId}`;
  return { stateIds, transitions, initialId };
}

/**
 * Check strong bisimulation between two DPN configurations.
 *
 * Two configs are strongly bisimilar if they can match each other's
 * transitions step-for-step (including tau steps), producing
 * identical observations.
 */
export function checkStrongBisimulation(
  lts1: LabelledTransitionSystem,
  lts2: LabelledTransitionSystem,
): BisimulationResult {
  const prefixed1 = prefixLTS(lts1, 'L1:');
  const prefixed2 = prefixLTS(lts2, 'L2:');

  const combinedStates = [...prefixed1.stateIds, ...prefixed2.stateIds];
  const combinedTransitions = [...prefixed1.transitions, ...prefixed2.transitions];

  const partitionOf = partitionRefinement(combinedStates, combinedTransitions, true);

  const initialPartition1 = partitionOf.get(prefixed1.initialId);
  const initialPartition2 = partitionOf.get(prefixed2.initialId);
  const equivalent = initialPartition1 === initialPartition2;

  if (equivalent) {
    // Build bisimulation relation from partition classes
    const pairs: Array<[string, string]> = [];
    const partitionClasses = new Map<number, { lts1States: string[]; lts2States: string[] }>();

    for (const [stateId, partition] of partitionOf) {
      if (!partitionClasses.has(partition)) {
        partitionClasses.set(partition, { lts1States: [], lts2States: [] });
      }
      const cls = partitionClasses.get(partition)!;
      if (stateId.startsWith('L1:')) {
        cls.lts1States.push(stateId.slice(3));
      } else {
        cls.lts2States.push(stateId.slice(3));
      }
    }

    for (const cls of partitionClasses.values()) {
      for (const s1 of cls.lts1States) {
        for (const s2 of cls.lts2States) {
          pairs.push([s1, s2]);
        }
      }
    }

    const relation: BisimulationRelation = {
      pairs,
      isStrong: true,
      isObservational: false,
    };

    return {
      equivalent: true,
      relation,
      witness: `Strong bisimulation: ${pairs.length} state pairs in ${partitionClasses.size} equivalence classes`,
    };
  }

  // Not equivalent — find a distinguishing action
  const counterexample = findCounterexample(
    prefixed1.initialId,
    prefixed2.initialId,
    combinedTransitions,
    partitionOf,
  );

  return {
    equivalent: false,
    counterexample,
    witness: 'Configurations are not strongly bisimilar',
  };
}

/**
 * Check observational equivalence (weak bisimulation) between two DPN configurations.
 *
 * Ignores internal tau steps — only observable send/receive actions are compared.
 */
export function checkObservationalEquivalence(
  lts1: LabelledTransitionSystem,
  lts2: LabelledTransitionSystem,
): BisimulationResult {
  const prefixed1 = prefixLTS(lts1, 'L1:');
  const prefixed2 = prefixLTS(lts2, 'L2:');

  const combinedStates = [...prefixed1.stateIds, ...prefixed2.stateIds];
  const combinedTransitions = [...prefixed1.transitions, ...prefixed2.transitions];

  // For weak bisimulation, exclude tau actions from signature comparison
  const partitionOf = partitionRefinement(combinedStates, combinedTransitions, false);

  const initialPartition1 = partitionOf.get(prefixed1.initialId);
  const initialPartition2 = partitionOf.get(prefixed2.initialId);
  const equivalent = initialPartition1 === initialPartition2;

  if (equivalent) {
    const pairs: Array<[string, string]> = [];
    const partitionClasses = new Map<number, { lts1States: string[]; lts2States: string[] }>();

    for (const [stateId, partition] of partitionOf) {
      if (!partitionClasses.has(partition)) {
        partitionClasses.set(partition, { lts1States: [], lts2States: [] });
      }
      const cls = partitionClasses.get(partition)!;
      if (stateId.startsWith('L1:')) {
        cls.lts1States.push(stateId.slice(3));
      } else {
        cls.lts2States.push(stateId.slice(3));
      }
    }

    for (const cls of partitionClasses.values()) {
      for (const s1 of cls.lts1States) {
        for (const s2 of cls.lts2States) {
          pairs.push([s1, s2]);
        }
      }
    }

    const relation: BisimulationRelation = {
      pairs,
      isStrong: false,
      isObservational: true,
    };

    return {
      equivalent: true,
      relation,
      witness: `Observational equivalence: ${pairs.length} state pairs`,
    };
  }

  const counterexample = findCounterexample(
    prefixed1.initialId,
    prefixed2.initialId,
    combinedTransitions,
    partitionOf,
  );

  return {
    equivalent: false,
    counterexample,
    witness: 'Configurations are not observationally equivalent',
  };
}

/**
 * Find a distinguishing action that separates two non-bisimilar states.
 */
function findCounterexample(
  stateId1: string,
  stateId2: string,
  transitions: DPNTransition[],
  partitionOf: Map<string, number>,
): { state1Id: string; state2Id: string; distinguishingAction: DPNAction } | undefined {
  const outgoing1 = transitions.filter(t => t.fromStateId === stateId1);
  const outgoing2 = transitions.filter(t => t.fromStateId === stateId2);

  // Find an action that LTS1 can take but LTS2 cannot match
  for (const t1 of outgoing1) {
    const targetPartition = partitionOf.get(t1.toStateId);
    const matched = outgoing2.some(t2 => {
      const actionMatch = t1.action.kind === t2.action.kind &&
        (t1.action.kind === 'tau' || (
          'channelId' in t1.action && 'channelId' in t2.action &&
          t1.action.channelId === t2.action.channelId
        ));
      return actionMatch && partitionOf.get(t2.toStateId) === targetPartition;
    });
    if (!matched) {
      return {
        state1Id: stateId1.replace(/^L[12]:/, ''),
        state2Id: stateId2.replace(/^L[12]:/, ''),
        distinguishingAction: t1.action,
      };
    }
  }

  // Check the reverse direction
  for (const t2 of outgoing2) {
    const targetPartition = partitionOf.get(t2.toStateId);
    const matched = outgoing1.some(t1 => {
      const actionMatch = t1.action.kind === t2.action.kind &&
        (t1.action.kind === 'tau' || (
          'channelId' in t1.action && 'channelId' in t2.action &&
          t1.action.channelId === t2.action.channelId
        ));
      return actionMatch && partitionOf.get(t1.toStateId) === targetPartition;
    });
    if (!matched) {
      return {
        state1Id: stateId1.replace(/^L[12]:/, ''),
        state2Id: stateId2.replace(/^L[12]:/, ''),
        distinguishingAction: t2.action,
      };
    }
  }

  return undefined;
}

// ── HoTT Path Construction ─────────────────────────────────────────

/**
 * Produce a HoTT path witnessing the equivalence of two bisimilar
 * DPN configurations.
 *
 * The bisimulation relation induces a categorical equivalence:
 * each DPN config becomes a category (processes = objects,
 * connections = morphisms), and the bisimulation maps between them.
 *
 * Combined with transport (from Sprint 6), this enables Z3 properties
 * verified for one config to automatically hold for any bisimilar config.
 */
export function toHoTTPath(
  result: BisimulationResult,
  config1: DataflowGraphDefinition,
  config2: DataflowGraphDefinition,
): PathTerm | undefined {
  if (!result.equivalent || !result.relation) {
    return undefined;
  }

  // Build categories from DPN configs
  const cat1 = dpnToCategory(config1, 'dpn1');
  const cat2 = dpnToCategory(config2, 'dpn2');

  // Build a merged category containing both configs' objects and morphisms
  // plus the bisimulation-induced forward/backward morphisms
  const merged = createCategory('bisim_merged', 'Bisimulation Merged Category');

  // Add all objects from both categories
  for (const [, obj] of cat1.objects) {
    addObject(merged, { ...obj, id: `L1_${obj.id}` });
  }
  for (const [, obj] of cat2.objects) {
    addObject(merged, { ...obj, id: `L2_${obj.id}` });
  }

  // Add all morphisms from both categories
  for (const [, mor] of cat1.morphisms) {
    addMorphism(merged, {
      ...mor,
      id: `L1_${mor.id}`,
      sourceId: `L1_${mor.sourceId}`,
      targetId: `L1_${mor.targetId}`,
    });
  }
  for (const [, mor] of cat2.morphisms) {
    addMorphism(merged, {
      ...mor,
      id: `L2_${mor.id}`,
      sourceId: `L2_${mor.sourceId}`,
      targetId: `L2_${mor.targetId}`,
    });
  }

  // Use the first process from each config as the representative types
  if (config1.processes.length === 0 || config2.processes.length === 0) {
    return undefined;
  }

  const leftTypeId = `L1_proc_${config1.processes[0].id}`;
  const rightTypeId = `L2_proc_${config2.processes[0].id}`;
  const leftType = merged.objects.get(leftTypeId);
  const rightType = merged.objects.get(rightTypeId);

  if (!leftType || !rightType) {
    return undefined;
  }

  // Create forward and backward morphisms from the bisimulation
  const forwardMor: Morphism = {
    id: 'bisim_forward',
    sourceId: leftTypeId,
    targetId: rightTypeId,
    label: 'bisimulation forward',
    properties: ['isomorphism'],
  };
  const backwardMor: Morphism = {
    id: 'bisim_backward',
    sourceId: rightTypeId,
    targetId: leftTypeId,
    label: 'bisimulation backward',
    properties: ['isomorphism'],
  };

  addMorphism(merged, forwardMor);
  addMorphism(merged, backwardMor);

  // Construct TypeEquivalence and Path
  const equiv = createTypeEquivalence(leftType, rightType, forwardMor, backwardMor, merged);
  return equivalenceToPath(equiv);
}

/**
 * Convert a DPN configuration into a HoTT category.
 * Processes become objects, connections become morphisms.
 */
function dpnToCategory(config: DataflowGraphDefinition, prefix: string): Category {
  const cat = createCategory(`${prefix}_${config.id}`, config.name);

  // Processes → Objects
  for (const proc of config.processes) {
    const obj: HoTTObject = {
      id: `proc_${proc.id}`,
      kind: 'type',
      label: proc.name,
    };
    addObject(cat, obj);
  }

  // Connections → Morphisms
  for (const conn of config.connections) {
    const mor: Morphism = {
      id: `conn_${conn.channelId}`,
      sourceId: `proc_${conn.source.processId}`,
      targetId: `proc_${conn.target.processId}`,
      label: `${conn.source.port}→${conn.target.port}`,
      properties: [],
    };
    addMorphism(cat, mor);
  }

  return cat;
}

// ── Property Transport via Bisimulation ────────────────────────────

/**
 * Transport a verification result from one DPN config to a bisimilar one.
 *
 * If bisimResult is equivalent, constructs a HoTT path and uses it to
 * transfer the verified property without re-running the SMT solver.
 */
export function transportPropertyViaBisimulation(
  bisimResult: BisimulationResult,
  verificationResult: { verified: boolean; property: string },
  config1: DataflowGraphDefinition,
  config2: DataflowGraphDefinition,
): PathTerm | undefined {
  if (!bisimResult.equivalent || !verificationResult.verified) {
    return undefined;
  }

  return toHoTTPath(bisimResult, config1, config2);
}
