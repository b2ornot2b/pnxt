/**
 * HoTT N-Paths — arbitrary-level paths in the homotopy tower.
 *
 * Generalizes the fixed 2-path (HigherPath) to arbitrary n-paths.
 * An n-path witnesses equivalence of (n-1)-paths, enabling the full
 * truncation tower required for homotopy reasoning.
 *
 * - Level 1: equivalence of morphisms (same as HoTTPath)
 * - Level 2: equivalence of 1-paths (same as HigherPath)
 * - Level n: equivalence of (n-1)-paths
 *
 * Includes truncation level checking, n-groupoid construction, and
 * vertical/horizontal path composition.
 *
 * Based on:
 * - docs/research/original-prompt.md (HoTT higher paths)
 * - Advisory Review 2026-04-05 (Voevodsky — need n-paths, groupoid, univalence)
 */

import type {
  Category,
  NGroupoidStructure,
  NGroupoidValidationResult,
  NGroupoidViolation,
  NPath,
  TruncationLevel,
} from '../types/hott.js';

/**
 * Create an n-path at the given level.
 *
 * Validates that the referenced elements exist at the appropriate level:
 * - Level 1: leftId/rightId must be morphism IDs in the category
 * - Level n>1: leftId/rightId must be (n-1)-path IDs in the category's nPaths
 *
 * @param category - The category containing the elements
 * @param level - Path level (must be >= 1)
 * @param leftId - ID of the left element
 * @param rightId - ID of the right element
 * @param witness - Evidence/proof of equivalence
 * @returns A new NPath
 * @throws If level < 1 or referenced elements don't exist
 */
export function createNPath(
  category: Category,
  level: number,
  leftId: string,
  rightId: string,
  witness: string,
): NPath {
  if (level < 1 || !Number.isInteger(level)) {
    throw new Error(`NPath level must be a positive integer, got ${level}`);
  }

  if (level === 1) {
    // Level 1: references morphisms
    if (!category.morphisms.has(leftId)) {
      throw new Error(`Left morphism '${leftId}' not found in category '${category.id}'`);
    }
    if (!category.morphisms.has(rightId)) {
      throw new Error(`Right morphism '${rightId}' not found in category '${category.id}'`);
    }
    // Validate parallel morphisms (same source/target)
    const left = category.morphisms.get(leftId)!;
    const right = category.morphisms.get(rightId)!;
    if (left.sourceId !== right.sourceId || left.targetId !== right.targetId) {
      throw new Error(
        `Cannot create 1-path: morphisms have different endpoints ` +
        `(${left.sourceId}→${left.targetId} vs ${right.sourceId}→${right.targetId})`,
      );
    }
  } else {
    // Level n>1: references (n-1)-paths
    const lowerLevel = level - 1;
    const lowerPaths = category.nPaths?.get(lowerLevel);

    if (lowerLevel === 1) {
      // Level 2: references 1-paths which may be in category.paths or nPaths level 1
      const leftExists = category.paths?.has(leftId) || lowerPaths?.has(leftId);
      const rightExists = category.paths?.has(rightId) || lowerPaths?.has(rightId);
      if (!leftExists) {
        throw new Error(`Left 1-path '${leftId}' not found in category '${category.id}'`);
      }
      if (!rightExists) {
        throw new Error(`Right 1-path '${rightId}' not found in category '${category.id}'`);
      }
    } else {
      if (!lowerPaths?.has(leftId)) {
        throw new Error(
          `Left ${lowerLevel}-path '${leftId}' not found in category '${category.id}'`,
        );
      }
      if (!lowerPaths?.has(rightId)) {
        throw new Error(
          `Right ${lowerLevel}-path '${rightId}' not found in category '${category.id}'`,
        );
      }
    }
  }

  const id = `np${level}_${leftId}_${rightId}`;
  return { id, level, leftId, rightId, witness };
}

/**
 * Add an n-path to a category.
 *
 * Creates the nPaths map structure if it doesn't exist.
 *
 * @param category - The category to add the path to
 * @param nPath - The n-path to add
 * @throws If an n-path with the same ID already exists at that level
 */
export function addNPath(category: Category, nPath: NPath): void {
  if (!category.nPaths) {
    category.nPaths = new Map();
  }
  if (!category.nPaths.has(nPath.level)) {
    category.nPaths.set(nPath.level, new Map());
  }
  const levelMap = category.nPaths.get(nPath.level)!;
  if (levelMap.has(nPath.id)) {
    throw new Error(
      `NPath '${nPath.id}' already exists at level ${nPath.level} in category '${category.id}'`,
    );
  }
  levelMap.set(nPath.id, nPath);
}

/**
 * Vertical composition of two n-paths at the same level.
 *
 * If p: α ≃ β and q: β ≃ γ (at the same level), then compose(p, q): α ≃ γ.
 * The right endpoint of p must match the left endpoint of q.
 *
 * @param p - First n-path
 * @param q - Second n-path (p.rightId must equal q.leftId)
 * @returns The composed n-path
 * @throws If paths are at different levels or endpoints don't match
 */
export function composeNPaths(p: NPath, q: NPath): NPath {
  if (p.level !== q.level) {
    throw new Error(
      `Cannot compose n-paths at different levels: ${p.level} vs ${q.level}`,
    );
  }
  if (p.rightId !== q.leftId) {
    throw new Error(
      `Cannot compose: right endpoint of '${p.id}' (${p.rightId}) ` +
      `!== left endpoint of '${q.id}' (${q.leftId})`,
    );
  }
  return {
    id: `comp_${p.id}_${q.id}`,
    level: p.level,
    leftId: p.leftId,
    rightId: q.rightId,
    witness: `compose(${p.witness}, ${q.witness})`,
  };
}

/**
 * Horizontal composition (whiskering) of an n-path with a lower-level path.
 *
 * Given an n-path α at level n and a (n-1)-path f, produces an n-path
 * witnessing the "whiskered" equivalence.
 *
 * @param alpha - The higher-level path
 * @param lower - The lower-level path to whisker with
 * @returns The whiskered n-path
 * @throws If the level relationship is not exactly 1 apart
 */
export function horizontalCompose(alpha: NPath, lower: NPath): NPath {
  if (alpha.level !== lower.level + 1) {
    throw new Error(
      `Horizontal composition requires level difference of 1: ` +
      `alpha.level=${alpha.level}, lower.level=${lower.level}`,
    );
  }
  return {
    id: `whisker_${alpha.id}_${lower.id}`,
    level: alpha.level,
    leftId: alpha.leftId,
    rightId: lower.id,
    witness: `whisker(${alpha.witness}, ${lower.witness})`,
  };
}

/**
 * Compute the truncation level of a category.
 *
 * The truncation level is the highest level n for which non-trivial
 * n-paths exist. A category with no paths is 0-truncated (a set).
 * A category with 1-paths but no 2-paths is 1-truncated (a groupoid).
 *
 * @returns The truncation level, or 'infinite' if there's no bound
 */
export function truncationLevel(category: Category): TruncationLevel {
  let maxLevel = 0;

  // Check 1-paths
  if (category.paths && category.paths.size > 0) {
    maxLevel = 1;
  }

  // Check higher paths (legacy)
  if (category.higherPaths && category.higherPaths.size > 0) {
    maxLevel = Math.max(maxLevel, 2);
  }

  // Check n-paths
  if (category.nPaths) {
    for (const [level, paths] of category.nPaths) {
      if (paths.size > 0) {
        maxLevel = Math.max(maxLevel, level);
      }
    }
  }

  return maxLevel;
}

/**
 * Check whether a category is n-truncated.
 *
 * A category is n-truncated if all paths above level n are trivially reflexive
 * (i.e., no non-trivial paths exist above level n).
 */
export function isTruncated(category: Category, n: number): boolean {
  const level = truncationLevel(category);
  if (level === 'infinite') return false;
  return level <= n;
}

/**
 * Build an n-groupoid structure for a category.
 *
 * Computes inverse paths at every level from 1 up to maxLevel.
 * At level 1, an inverse swaps left/right morphism IDs.
 * At level n, an inverse swaps left/right (n-1)-path IDs.
 *
 * @param category - The category to build structure for
 * @param maxLevel - Maximum level to compute inverses for
 * @returns NGroupoidStructure with inverses at each level
 */
export function buildNGroupoidStructure(
  category: Category,
  maxLevel: number,
): NGroupoidStructure {
  const inversesByLevel = new Map<number, Map<string, NPath>>();

  // Level 0: morphism inverses (swap source/target)
  // We store these as level-1 paths for the groupoid
  const level1Inverses = new Map<string, NPath>();

  // Invert 1-paths from category.paths
  if (category.paths) {
    for (const [id, path] of category.paths) {
      level1Inverses.set(id, {
        id: `inv_${id}`,
        level: 1,
        leftId: path.rightId,
        rightId: path.leftId,
        witness: `inverse(${path.witness})`,
      });
    }
  }

  // Invert 1-paths from nPaths level 1
  const nPaths1 = category.nPaths?.get(1);
  if (nPaths1) {
    for (const [id, path] of nPaths1) {
      if (!level1Inverses.has(id)) {
        level1Inverses.set(id, {
          id: `inv_${id}`,
          level: 1,
          leftId: path.rightId,
          rightId: path.leftId,
          witness: `inverse(${path.witness})`,
        });
      }
    }
  }

  if (level1Inverses.size > 0 && maxLevel >= 1) {
    inversesByLevel.set(1, level1Inverses);
  }

  // Levels 2+: invert n-paths by swapping left/right references
  for (let level = 2; level <= maxLevel; level++) {
    const levelPaths = category.nPaths?.get(level);
    const higherPathsAtLevel = level === 2 ? category.higherPaths : undefined;
    const levelInverses = new Map<string, NPath>();

    if (levelPaths) {
      for (const [id, path] of levelPaths) {
        levelInverses.set(id, {
          id: `inv_${id}`,
          level,
          leftId: path.rightId,
          rightId: path.leftId,
          witness: `inverse(${path.witness})`,
        });
      }
    }

    // Also handle legacy higherPaths at level 2
    if (higherPathsAtLevel) {
      for (const [id, hp] of higherPathsAtLevel) {
        if (!levelInverses.has(id)) {
          levelInverses.set(id, {
            id: `inv_${id}`,
            level: 2,
            leftId: hp.rightPathId,
            rightId: hp.leftPathId,
            witness: `inverse(${hp.witness})`,
          });
        }
      }
    }

    if (levelInverses.size > 0) {
      inversesByLevel.set(level, levelInverses);
    }
  }

  return {
    categoryId: category.id,
    maxLevel,
    inversesByLevel,
  };
}

/**
 * Validate that a category with n-groupoid structure satisfies inverse laws at all levels.
 *
 * At each level, for every path p, its inverse p⁻¹ must satisfy:
 * - p ∘ p⁻¹ is reflexive (left inverse)
 * - p⁻¹ ∘ p is reflexive (right inverse)
 *
 * For a path p: α ≃ β, its inverse p⁻¹: β ≃ α.
 * Composition p ∘ p⁻¹ gives β ≃ β (reflexive) and p⁻¹ ∘ p gives α ≃ α (reflexive).
 */
export function validateNGroupoid(
  category: Category,
  structure: NGroupoidStructure,
  maxLevel: number,
): NGroupoidValidationResult {
  const violations: NGroupoidViolation[] = [];

  // Validate level 1 paths
  if (maxLevel >= 1) {
    const level1Inverses = structure.inversesByLevel.get(1);
    const allPaths1 = new Map<string, { leftId: string; rightId: string }>();

    if (category.paths) {
      for (const [id, p] of category.paths) {
        allPaths1.set(id, { leftId: p.leftId, rightId: p.rightId });
      }
    }
    const nPaths1 = category.nPaths?.get(1);
    if (nPaths1) {
      for (const [id, p] of nPaths1) {
        allPaths1.set(id, { leftId: p.leftId, rightId: p.rightId });
      }
    }

    for (const [pathId, path] of allPaths1) {
      const inv = level1Inverses?.get(pathId);
      if (!inv) {
        violations.push({
          level: 1,
          law: 'inverse_left',
          message: `No inverse found for 1-path '${pathId}'`,
          ids: [pathId],
        });
        continue;
      }

      // Check: inv should swap left/right
      if (inv.leftId !== path.rightId || inv.rightId !== path.leftId) {
        violations.push({
          level: 1,
          law: 'inverse_left',
          message: `Inverse of 1-path '${pathId}' does not properly swap endpoints`,
          ids: [pathId, inv.id],
        });
      }
    }
  }

  // Validate levels 2+
  for (let level = 2; level <= maxLevel; level++) {
    const levelInverses = structure.inversesByLevel.get(level);
    const allPathsAtLevel = new Map<string, { leftId: string; rightId: string }>();

    const nPathsLevel = category.nPaths?.get(level);
    if (nPathsLevel) {
      for (const [id, p] of nPathsLevel) {
        allPathsAtLevel.set(id, { leftId: p.leftId, rightId: p.rightId });
      }
    }

    // Level 2: also check legacy higherPaths
    if (level === 2 && category.higherPaths) {
      for (const [id, hp] of category.higherPaths) {
        allPathsAtLevel.set(id, { leftId: hp.leftPathId, rightId: hp.rightPathId });
      }
    }

    for (const [pathId, path] of allPathsAtLevel) {
      const inv = levelInverses?.get(pathId);
      if (!inv) {
        violations.push({
          level,
          law: 'inverse_left',
          message: `No inverse found for ${level}-path '${pathId}'`,
          ids: [pathId],
        });
        continue;
      }

      if (inv.leftId !== path.rightId || inv.rightId !== path.leftId) {
        violations.push({
          level,
          law: 'inverse_left',
          message: `Inverse of ${level}-path '${pathId}' does not properly swap endpoints`,
          ids: [pathId, inv.id],
        });
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
