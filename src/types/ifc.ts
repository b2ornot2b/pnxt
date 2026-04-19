/**
 * Information Flow Control (IFC) types.
 *
 * Implements a lattice-based security label model where data is tagged with
 * trust-level provenance and classification. Labels enforce that information
 * can only flow "upward" in the trust lattice — low-trust agents cannot read
 * high-trust data, preventing confused deputy attacks.
 *
 * Based on:
 * - docs/research/original-prompt.md (LLMbda Calculus with IFC)
 * - Advisory Review 2026-04-05 (Andrew Myers — IFC pillar)
 */

import type { TrustLevel } from './agent.js';

/**
 * Data classification levels, ordered from least to most restrictive.
 * Forms a total order:
 *   public < internal < confidential < restricted < external.
 *
 * `external` is the tainted band reserved for untrusted third-party
 * oracles (LLM output, remote APIs that return unvetted data). It sits
 * above `restricted` so tainted data cannot flow to any trusted sink
 * without passing through an explicit declassification node — Myers's
 * noninterference rule (Sprint 18 / M7).
 */
export type Classification =
  | 'public'
  | 'internal'
  | 'confidential'
  | 'restricted'
  | 'external';

/**
 * Numeric ordering for classifications, used in lattice comparisons.
 */
export const CLASSIFICATION_ORDER: Record<Classification, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
  external: 4,
};

/**
 * Security label attached to data for information flow tracking.
 *
 * The label records who produced the data (owner), at what trust level,
 * and what classification was assigned. Labels propagate through
 * computations and are checked at access boundaries.
 */
export interface SecurityLabel {
  /** Agent that produced/stored this data. */
  owner: string;

  /** Trust level of the owner at the time of production. */
  trustLevel: TrustLevel;

  /** Data classification. */
  classification: Classification;

  /** When this label was created (ISO 8601). */
  createdAt: string;
}

/**
 * Wrapper type that pairs a value with its security label.
 * Used when label must travel with the value through computations.
 */
export interface Labeled<T> {
  value: T;
  label: SecurityLabel;
}

/**
 * Lattice operations for security labels.
 *
 * The lattice is the product of (TrustLevel, Classification) where:
 * - TrustLevel: 0 <= 1 <= 2 <= 3 <= 4
 * - Classification: public <= internal <= confidential <= restricted
 *
 * Data at label L1 can flow to a context with label L2 iff:
 *   L1.trustLevel <= L2.trustLevel AND L1.classification <= L2.classification
 *
 * This means high-trust data cannot flow to low-trust contexts.
 */
export function canFlowTo(from: SecurityLabel, to: SecurityLabel): boolean {
  return (
    from.trustLevel <= to.trustLevel &&
    CLASSIFICATION_ORDER[from.classification] <= CLASSIFICATION_ORDER[to.classification]
  );
}

/**
 * Compute the least upper bound (join) of two labels.
 * The join has the maximum trust level and classification of both labels.
 * Used when combining data from multiple sources.
 */
export function joinLabels(a: SecurityLabel, b: SecurityLabel): SecurityLabel {
  const trustLevel = Math.max(a.trustLevel, b.trustLevel) as TrustLevel;

  const classOrder = Math.max(
    CLASSIFICATION_ORDER[a.classification],
    CLASSIFICATION_ORDER[b.classification],
  );

  const classifications: Classification[] = [
    'public',
    'internal',
    'confidential',
    'restricted',
    'external',
  ];
  const classification = classifications[classOrder];

  return {
    owner: a.owner,
    trustLevel,
    classification,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Create a default security label for an agent at a given trust level.
 */
export function createLabel(owner: string, trustLevel: TrustLevel, classification: Classification = 'internal'): SecurityLabel {
  return {
    owner,
    trustLevel,
    classification,
    createdAt: new Date().toISOString(),
  };
}
