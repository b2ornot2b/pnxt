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
import type { Category, CategoryValidationResult, HoTTObject, Morphism } from '../types/hott.js';
import type { HoTTObjectKind } from '../types/hott.js';
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

  return { equivalences, category: merged };
}
