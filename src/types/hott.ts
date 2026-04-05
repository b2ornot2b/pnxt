/**
 * Homotopy Type Theory (HoTT) types.
 *
 * Defines categorical objects, morphisms, and paths that form the
 * mathematical foundation for typed tokenization. Code entities are
 * objects in a category, transformations are morphisms, and refactoring
 * equivalences are paths (homotopies between morphisms).
 *
 * Based on:
 * - docs/research/original-prompt.md (Category Theory & Typed Tokenization)
 * - Advisory Review 2026-04-05 (Vladimir Voevodsky — HoTT pillar)
 */

import type { SecurityLabel } from './ifc.js';

/**
 * Properties a morphism may possess.
 */
export type MorphismProperty =
  | 'identity'
  | 'composition'
  | 'isomorphism'
  | 'epimorphism'
  | 'monomorphism';

/**
 * Kind of categorical object.
 */
export type HoTTObjectKind = 'type' | 'term' | 'context';

/**
 * A categorical object — the base unit of typed tokenization.
 *
 * In the paradigm, code entities (functions, types, modules) are
 * represented as objects in a category rather than flat text strings.
 */
export interface HoTTObject {
  /** Unique identifier. */
  id: string;

  /** What kind of categorical entity this is. */
  kind: HoTTObjectKind;

  /** Human-readable label. */
  label: string;

  /** Optional IFC security label for provenance tracking. */
  securityLabel?: SecurityLabel;

  /** Optional metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * A morphism between two objects — a typed transformation.
 *
 * Morphisms are the arrows in the category: they represent
 * computations, transformations, or relationships between objects.
 */
export interface Morphism {
  /** Unique identifier. */
  id: string;

  /** Source object ID. */
  sourceId: string;

  /** Target object ID. */
  targetId: string;

  /** Human-readable label describing the transformation. */
  label: string;

  /** Algebraic properties of this morphism. */
  properties: MorphismProperty[];
}

/**
 * A path between two morphisms — a homotopy.
 *
 * Paths witness that two morphisms are equivalent. In the paradigm,
 * this captures the idea that two different code transformations
 * (refactorings) produce equivalent results.
 */
export interface HoTTPath {
  /** Unique identifier. */
  id: string;

  /** Left morphism ID (f). */
  leftId: string;

  /** Right morphism ID (g). */
  rightId: string;

  /** Evidence/proof that f ≃ g. */
  witness: string;
}

/**
 * A category: objects + morphisms + composition + identity laws.
 *
 * This is the core structure for typed tokenization — a codebase
 * is represented as a category where objects are code entities
 * and morphisms are typed transformations.
 */
export interface Category {
  /** Unique identifier. */
  id: string;

  /** Human-readable name. */
  name: string;

  /** Objects in the category. */
  objects: Map<string, HoTTObject>;

  /** Morphisms (arrows) in the category. */
  morphisms: Map<string, Morphism>;

  /** Path equivalences between morphisms. */
  paths: Map<string, HoTTPath>;
}

/**
 * Result of validating a category's laws.
 */
export interface CategoryValidationResult {
  /** Whether all laws hold. */
  valid: boolean;

  /** Specific law violations. */
  violations: CategoryViolation[];
}

/**
 * A violation of a categorical law.
 */
export interface CategoryViolation {
  /** Which law was violated. */
  law: 'identity' | 'associativity' | 'composition_closure' | 'source_target';

  /** Human-readable description. */
  message: string;

  /** IDs of involved morphisms. */
  morphismIds: string[];
}
