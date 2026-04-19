/**
 * VPIR-to-HoTT Bridge — translates VPIR reasoning graphs into HoTT categories.
 *
 * This is the mathematical translation pipeline described in the original
 * prompt (Phase 2): "how VPIR nodes are translated into HoTT morphisms
 * and SMT constraints." Each VPIR node becomes a HoTT object, each
 * dependency edge becomes a morphism, and composition nodes become
 * composed morphisms.
 *
 * Based on:
 * - docs/research/original-prompt.md (Phase 2: Bridge Layer & Mathematical Spec)
 * - Advisory Review 2026-04-05 (Panel consensus: connect VPIR to HoTT)
 */

import type { VPIRGraph, VPIRNode } from '../types/vpir.js';
import type {
  Category,
  CategoryValidationResult,
  HigherPath,
  HoTTObject,
  HoTTObjectKind,
  HoTTPath,
  Morphism,
} from '../types/hott.js';
import { validateCategory } from './category.js';

/**
 * Map VPIR node types to HoTT object kinds.
 */
function vpirTypeToObjectKind(type: VPIRNode['type']): HoTTObjectKind {
  switch (type) {
    case 'observation':
      return 'term';       // Raw data: a term (value)
    case 'inference':
      return 'term';       // Derived value: a term
    case 'action':
      return 'term';       // Side-effecting operation: a term
    case 'assertion':
      return 'type';       // An invariant/postcondition: a type (proposition)
    case 'composition':
      return 'context';    // Aggregation: a context (environment)
    case 'human':
      return 'term';       // Human-attested value: a term (externally produced)
  }
}

/**
 * Convert a VPIR graph into a HoTT Category.
 *
 * - Each VPIRNode becomes a HoTTObject
 * - Each dependency edge (VPIRRef) becomes a Morphism
 * - Security labels propagate from VPIR nodes to HoTT objects
 *
 * @param graph - A validated VPIR graph
 * @returns A HoTT Category representing the reasoning chain
 */
export function vpirGraphToCategory(graph: VPIRGraph): Category {
  const category: Category = {
    id: `cat_vpir_${graph.id}`,
    name: `Category(${graph.name})`,
    objects: new Map(),
    morphisms: new Map(),
    paths: new Map(),
  };

  // Nodes → Objects
  for (const [nodeId, node] of graph.nodes) {
    const obj: HoTTObject = {
      id: nodeId,
      kind: vpirTypeToObjectKind(node.type),
      label: node.operation,
      securityLabel: node.label,
      metadata: {
        vpirType: node.type,
        verifiable: node.verifiable,
        agentId: node.agentId,
      },
    };
    category.objects.set(nodeId, obj);
  }

  // Dependency edges → Morphisms
  let edgeIdx = 0;
  for (const [nodeId, node] of graph.nodes) {
    for (const ref of node.inputs) {
      const sourceNode = graph.nodes.get(ref.nodeId);
      if (!sourceNode) continue;

      const morphismId = `m_${ref.nodeId}_to_${nodeId}_${edgeIdx}`;
      const morphism: Morphism = {
        id: morphismId,
        sourceId: ref.nodeId,
        targetId: nodeId,
        label: `${ref.port}:${ref.dataType}`,
        properties: [],
      };
      category.morphisms.set(morphismId, morphism);
      edgeIdx++;
    }
  }

  return category;
}

/**
 * Validate that a VPIR graph satisfies categorical laws when viewed as a category.
 *
 * This checks:
 * - Source/target integrity (all morphism endpoints exist as objects)
 * - Identity law compliance
 * - Associativity of composition chains
 */
export function validateCategoricalStructure(graph: VPIRGraph): CategoryValidationResult {
  const category = vpirGraphToCategory(graph);
  return validateCategory(category);
}

/**
 * Given two VPIR graphs that represent the same computation,
 * find path equivalences between their corresponding morphisms.
 *
 * Two morphisms are considered equivalent if they connect the same
 * objects (same VPIR node types) and carry the same data types.
 *
 * This is the basis for proving refactoring correctness: if graph A
 * and graph B have equivalent categorical structures, they are
 * homotopically equivalent transformations.
 *
 * @returns The number of equivalences found, and the unified category
 *          containing both graphs with paths connecting equivalent morphisms
 */
export function findEquivalentPaths(
  graphA: VPIRGraph,
  graphB: VPIRGraph,
): { equivalences: number; category: Category } {
  const catA = vpirGraphToCategory(graphA);
  const catB = vpirGraphToCategory(graphB);

  // Merge into a single category with prefixed IDs to avoid collisions
  const merged: Category = {
    id: `cat_merged_${graphA.id}_${graphB.id}`,
    name: `Merged(${graphA.name}, ${graphB.name})`,
    objects: new Map(),
    morphisms: new Map(),
    paths: new Map(),
  };

  // Add catA objects and morphisms with 'a_' prefix
  for (const [id, obj] of catA.objects) {
    merged.objects.set(`a_${id}`, { ...obj, id: `a_${id}` });
  }
  for (const [id, morphism] of catA.morphisms) {
    merged.morphisms.set(`a_${id}`, {
      ...morphism,
      id: `a_${id}`,
      sourceId: `a_${morphism.sourceId}`,
      targetId: `a_${morphism.targetId}`,
    });
  }

  // Add catB objects and morphisms with 'b_' prefix
  for (const [id, obj] of catB.objects) {
    merged.objects.set(`b_${id}`, { ...obj, id: `b_${id}` });
  }
  for (const [id, morphism] of catB.morphisms) {
    merged.morphisms.set(`b_${id}`, {
      ...morphism,
      id: `b_${id}`,
      sourceId: `b_${morphism.sourceId}`,
      targetId: `b_${morphism.targetId}`,
    });
  }

  // Find equivalent morphisms: same label (data type + port), same source/target kinds
  let equivalences = 0;
  for (const [aId, aMorphism] of catA.morphisms) {
    const aSource = catA.objects.get(aMorphism.sourceId);
    const aTarget = catA.objects.get(aMorphism.targetId);
    if (!aSource || !aTarget) continue;

    for (const [bId, bMorphism] of catB.morphisms) {
      const bSource = catB.objects.get(bMorphism.sourceId);
      const bTarget = catB.objects.get(bMorphism.targetId);
      if (!bSource || !bTarget) continue;

      if (
        aMorphism.label === bMorphism.label &&
        aSource.kind === bSource.kind &&
        aTarget.kind === bTarget.kind
      ) {
        const pathId = `path_${aId}_${bId}`;
        merged.paths.set(pathId, {
          id: pathId,
          leftId: `a_${aId}`,
          rightId: `b_${bId}`,
          witness: `structural_equivalence(${aMorphism.label})`,
        });
        equivalences++;
      }
    }
  }

  // Discover 2-paths: when two different 1-paths connect the same morphism pair,
  // create a higher path witnessing their equivalence
  const pathsByEndpoints = new Map<string, HoTTPath[]>();
  for (const path of merged.paths.values()) {
    const key = `${path.leftId}:${path.rightId}`;
    const reverseKey = `${path.rightId}:${path.leftId}`;
    // Group paths that connect the same pair of morphisms (in either direction)
    const existing = pathsByEndpoints.get(key) ?? pathsByEndpoints.get(reverseKey) ?? [];
    const useKey = pathsByEndpoints.has(reverseKey) ? reverseKey : key;
    existing.push(path);
    pathsByEndpoints.set(useKey, existing);
  }

  const higherPaths = new Map<string, HigherPath>();
  for (const paths of pathsByEndpoints.values()) {
    if (paths.length < 2) continue;
    for (let i = 0; i < paths.length - 1; i++) {
      const hp: HigherPath = {
        id: `hp_${paths[i].id}_${paths[i + 1].id}`,
        leftPathId: paths[i].id,
        rightPathId: paths[i + 1].id,
        level: 2,
        witness: `structural_equivalence_2path(${paths[i].id}, ${paths[i + 1].id})`,
      };
      higherPaths.set(hp.id, hp);
    }
  }

  if (higherPaths.size > 0) {
    merged.higherPaths = higherPaths;
  }

  return { equivalences, category: merged };
}

/**
 * Given three versions of a computation (original, refactored A, refactored B),
 * find 2-paths proving that the two refactoring paths lead to equivalent results.
 *
 * This enables proofs that: if original → refactoredA and original → refactoredB
 * are both valid refactorings, the two refactoring paths are themselves equivalent.
 *
 * @returns Array of HigherPath equivalences discovered
 */
export function findRefactoringEquivalences(
  original: VPIRGraph,
  refactoredA: VPIRGraph,
  refactoredB: VPIRGraph,
): { higherPaths: HigherPath[]; category: Category } {
  // Find 1-path equivalences between original↔A and original↔B
  const { category: catOA } = findEquivalentPaths(original, refactoredA);
  const { category: catOB } = findEquivalentPaths(original, refactoredB);

  const merged: Category = {
    id: `cat_refactoring_${original.id}`,
    name: `Refactoring(${original.name})`,
    objects: new Map(),
    morphisms: new Map(),
    paths: new Map(),
    higherPaths: new Map(),
  };

  // Copy catOA (which has original 'a_' and refactoredA 'b_' prefixed)
  for (const [id, obj] of catOA.objects) {
    merged.objects.set(`oa_${id}`, { ...obj, id: `oa_${id}` });
  }
  for (const [id, m] of catOA.morphisms) {
    merged.morphisms.set(`oa_${id}`, {
      ...m,
      id: `oa_${id}`,
      sourceId: `oa_${m.sourceId}`,
      targetId: `oa_${m.targetId}`,
    });
  }
  for (const [id, p] of catOA.paths) {
    merged.paths.set(`oa_${id}`, {
      ...p,
      id: `oa_${id}`,
      leftId: `oa_${p.leftId}`,
      rightId: `oa_${p.rightId}`,
    });
  }

  // Copy catOB paths (represents original↔refactoredB equivalences)
  for (const [id, p] of catOB.paths) {
    merged.paths.set(`ob_${id}`, {
      ...p,
      id: `ob_${id}`,
      leftId: `ob_${p.leftId}`,
      rightId: `ob_${p.rightId}`,
    });
  }

  // Find 2-paths: where both original→A and original→B have equivalent morphisms,
  // construct a higher path witnessing that the two refactoring paths are equivalent
  const higherPaths: HigherPath[] = [];
  const oaPaths = Array.from(catOA.paths.values());
  const obPaths = Array.from(catOB.paths.values());

  for (const oaPath of oaPaths) {
    for (const obPath of obPaths) {
      // If both paths witness the same structural equivalence
      if (oaPath.witness === obPath.witness) {
        const hp: HigherPath = {
          id: `hp_refactoring_${oaPath.id}_${obPath.id}`,
          leftPathId: `oa_${oaPath.id}`,
          rightPathId: `ob_${obPath.id}`,
          level: 2,
          witness: `refactoring_equivalence(${oaPath.witness})`,
        };
        higherPaths.push(hp);
        merged.higherPaths!.set(hp.id, hp);
      }
    }
  }

  return { higherPaths, category: merged };
}
