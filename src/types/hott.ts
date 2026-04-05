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
 * A path between two morphisms — a homotopy (1-path).
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
 * Path level for distinguishing 1-paths and 2-paths.
 */
export type PathLevel = 1 | 2;

/**
 * Truncation level for a category.
 * A finite number n means all paths above level n are trivially reflexive.
 * 'infinite' means non-trivial paths exist at unbounded levels.
 */
export type TruncationLevel = number | 'infinite';

/**
 * An n-path — a path at arbitrary level in the homotopy tower.
 *
 * - Level 1: witnesses equivalence of morphisms (same as HoTTPath)
 * - Level 2: witnesses equivalence of 1-paths (same as HigherPath)
 * - Level n: witnesses equivalence of (n-1)-paths
 *
 * At level 1, leftId/rightId reference morphism IDs.
 * At level n>1, leftId/rightId reference (n-1)-path IDs.
 */
export interface NPath {
  /** Unique identifier. */
  id: string;

  /** Path level (1 = morphism equivalence, 2+ = higher). */
  level: number;

  /** ID of the left element (morphism if level 1, (n-1)-path if level > 1). */
  leftId: string;

  /** ID of the right element. */
  rightId: string;

  /** Evidence/proof of equivalence. */
  witness: string;
}

/**
 * N-groupoid structure — inverses at every path level.
 */
export interface NGroupoidStructure {
  /** Category this structure belongs to. */
  categoryId: string;

  /** Maximum level for which inverses are computed. */
  maxLevel: number;

  /** Inverses by level: level → (path ID → inverse NPath). */
  inversesByLevel: Map<number, Map<string, NPath>>;
}

/**
 * Result of validating n-groupoid laws at all levels.
 */
export interface NGroupoidValidationResult {
  /** Whether all laws hold at all levels. */
  valid: boolean;

  /** Specific violations found. */
  violations: NGroupoidViolation[];
}

/**
 * A violation of an n-groupoid law.
 */
export interface NGroupoidViolation {
  /** Path level where violation occurred. */
  level: number;

  /** Which law was violated. */
  law: 'inverse_left' | 'inverse_right' | 'coherence';

  /** Human-readable description. */
  message: string;

  /** IDs of involved paths. */
  ids: string[];
}

/**
 * A higher path (2-path) — a path between two 1-paths.
 *
 * Witnesses that two refactoring equivalences are themselves equivalent.
 * In HoTT, this is a homotopy between homotopies. This enables proofs
 * that different refactoring sequences produce the same result.
 */
export interface HigherPath {
  /** Unique identifier. */
  id: string;

  /** Left 1-path ID (p). */
  leftPathId: string;

  /** Right 1-path ID (q). */
  rightPathId: string;

  /** Path level — always 2 for higher paths. */
  level: 2;

  /** Evidence/proof that p ≃ q. */
  witness: string;
}

/**
 * Groupoid structure for a category — every morphism is invertible.
 *
 * A groupoid is a category where every morphism has an inverse.
 * This is the natural structure for refactoring: every transformation
 * can be undone.
 */
export interface GroupoidStructure {
  /** Category this structure belongs to. */
  categoryId: string;

  /** Map from morphism ID to its inverse morphism. */
  inverses: Map<string, Morphism>;

  /** Map from path ID to its inverse path. */
  pathInverses: Map<string, HoTTPath>;
}

/**
 * Result of validating groupoid laws.
 */
export interface GroupoidValidationResult {
  /** Whether all groupoid laws hold. */
  valid: boolean;

  /** Specific violations found. */
  violations: GroupoidViolation[];
}

/**
 * A violation of a groupoid law.
 */
export interface GroupoidViolation {
  /** Which law was violated. */
  law: 'inverse_left' | 'inverse_right' | 'path_inverse';

  /** Human-readable description. */
  message: string;

  /** IDs of involved morphisms or paths. */
  ids: string[];
}

/**
 * A functor between two categories — structure-preserving map.
 */
export interface Functor {
  /** Unique identifier. */
  id: string;

  /** Source category ID. */
  sourceCategoryId: string;

  /** Target category ID. */
  targetCategoryId: string;

  /** Object mapping: source object ID → target object ID. */
  objectMap: Map<string, string>;

  /** Morphism mapping: source morphism ID → target morphism ID. */
  morphismMap: Map<string, string>;
}

/**
 * A categorical equivalence between two categories.
 *
 * Two categories are equivalent when there exist functors F: A→B and
 * G: B→A such that G∘F ≃ id_A and F∘G ≃ id_B (natural isomorphisms).
 */
export interface CategoryEquivalence {
  /** Forward functor F: A → B. */
  forward: Functor;

  /** Backward functor G: B → A. */
  backward: Functor;

  /** Witness that G∘F ≃ id_A (for each object a, G(F(a)) ≃ a). */
  unitWitness: string;

  /** Witness that F∘G ≃ id_B (for each object b, F(G(b)) ≃ b). */
  counitWitness: string;
}

/**
 * Univalence witness — evidence that equivalent categories are equal.
 *
 * The univalence axiom states that equivalence of types is equivalent
 * to equality of types: (A ≃ B) ≃ (A = B). In our context, this means
 * categorically equivalent codebases are "the same" for all practical purposes.
 */
export interface UnivalenceWitness {
  /** The equivalence being witnessed. */
  equivalence: CategoryEquivalence;

  /** Human-readable justification. */
  justification: string;

  /** Whether the univalence check passed. */
  valid: boolean;

  /** Specific objects where equivalence was verified. */
  verifiedObjects: string[];

  /** Specific morphisms where equivalence was verified. */
  verifiedMorphisms: string[];
}

/**
 * A type equivalence A ≃ B between two HoTT objects.
 *
 * An equivalence consists of morphisms f: A → B and g: B → A
 * such that g∘f = id_A and f∘g = id_B (witnessed by sections
 * and retractions).
 */
export interface TypeEquivalence {
  /** Unique identifier. */
  id: string;

  /** The left type (A). */
  leftType: HoTTObject;

  /** The right type (B). */
  rightType: HoTTObject;

  /** Forward morphism f: A → B. */
  forward: Morphism;

  /** Backward morphism g: B → A. */
  backward: Morphism;

  /** Witness that g(f(a)) = a for all a in A. */
  sectionWitness: string;

  /** Witness that f(g(b)) = b for all b in B. */
  retractionWitness: string;
}

/**
 * A path term representing identity A = B in the universe of types.
 *
 * In HoTT, paths in the universe are the identity type: they witness
 * that two types are equal. The univalence axiom states that every
 * equivalence gives rise to such a path, and vice versa.
 */
export interface PathTerm {
  /** Unique identifier. */
  id: string;

  /** Source type ID (A). */
  sourceId: string;

  /** Target type ID (B). */
  targetId: string;

  /** Evidence/proof witness. */
  witness: string;

  /** The equivalence this path was constructed from (if any). */
  fromEquivalence?: TypeEquivalence;
}

/**
 * A type family P: Type → Type.
 *
 * Maps types (HoTT objects) to their "fibers" — properties or
 * structures that depend on the type. Transport moves values
 * between fibers along paths.
 */
export interface TypeFamily {
  /** Unique identifier. */
  id: string;

  /** Human-readable label. */
  label: string;

  /** Maps object IDs to their fiber values. */
  fibers: Map<string, TypeFamilyValue>;
}

/**
 * A value in a type family fiber — represents a property or
 * structure that a type possesses.
 */
export interface TypeFamilyValue {
  /** The type (object) this value belongs to. */
  typeId: string;

  /** The actual value/property. */
  value: unknown;

  /** Human-readable label. */
  label: string;
}

/**
 * Result of transporting a value along a path.
 */
export interface TransportResult {
  /** Whether transport succeeded. */
  success: boolean;

  /** The original value at the source type. */
  sourceValue: TypeFamilyValue;

  /** The transported value at the target type (if successful). */
  transportedValue?: TypeFamilyValue;

  /** The path used for transport. */
  path: PathTerm;

  /** The type family being transported over. */
  typeFamily: TypeFamily;
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

  /** Path equivalences between morphisms (1-paths). */
  paths: Map<string, HoTTPath>;

  /** Higher path equivalences between 1-paths (2-paths). Optional for backward compatibility. */
  higherPaths?: Map<string, HigherPath>;

  /** N-paths at arbitrary levels. Level → (path ID → NPath). Optional for backward compatibility. */
  nPaths?: Map<number, Map<string, NPath>>;
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
  law: 'identity' | 'associativity' | 'composition_closure' | 'source_target' | 'higher_path';

  /** Human-readable description. */
  message: string;

  /** IDs of involved morphisms. */
  morphismIds: string[];
}
