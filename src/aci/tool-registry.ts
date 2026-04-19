/**
 * Declarative Tool Registry — maps VPIR operations to ACI tool handlers.
 *
 * Provides auto-registration from the standard handler library, operation-to-tool
 * mapping for VPIR graphs, discovery APIs, and trust pre-validation.
 *
 * The registry decouples VPIR graph authoring from handler implementation:
 * a VPIR node references an operation name (e.g., "http-fetch"), and the
 * registry resolves it to the appropriate ToolHandler at execution time.
 *
 * Sprint 10 deliverable — Advisory Panel: Kay, Liskov, Milner.
 */

import type { ToolRegistration, SideEffect } from '../types/aci.js';
import type { TrustLevel } from '../types/agent.js';
import type { VPIRGraph } from '../types/vpir.js';
import type { ToolHandler } from './aci-gateway.js';
import { STANDARD_HANDLERS } from './handler-library.js';

// ── Types ─────────────────────────────────────────────────────────

export interface RegisteredToolEntry {
  registration: ToolRegistration;
  handler: ToolHandler;
  /** Operation aliases that map to this tool. */
  aliases: string[];
}

export interface ToolDiscoveryResult {
  /** Tools required by the graph that are available in the registry. */
  available: Array<{ operation: string; toolName: string }>;
  /** Operations referenced in the graph with no matching tool. */
  missing: string[];
  /** Whether all required tools are available. */
  allAvailable: boolean;
}

export interface TrustValidationResult {
  /** Whether the agent has sufficient trust for all tools. */
  sufficient: boolean;
  /** Tools that require higher trust than the agent has. */
  insufficientTools: Array<{
    toolName: string;
    requiredTrust: TrustLevel;
    agentTrust: TrustLevel;
  }>;
}

/**
 * Manifest entry summarising a registered tool for catalog UIs and for
 * bridge-grammar system-prompt injection.
 *
 * Sprint 18 — M7 (First-Class LLM + Catalog Discovery).
 */
export interface ToolManifestEntry {
  name: string;
  description: string;
  sideEffects: SideEffect[];
  requiredTrustLevel: TrustLevel;
  displayName?: string;
  category?: string;
  tags?: string[];
}

// ── Tool Registry ─────────────────────────────────────────────────

export class ToolRegistry {
  /** Tools keyed by canonical name. */
  private tools = new Map<string, RegisteredToolEntry>();
  /** Alias → canonical tool name mapping. */
  private aliasMap = new Map<string, string>();

  /**
   * Register a tool with its handler.
   *
   * @param registration - ACI tool registration with schema and metadata
   * @param handler - The function that executes the tool
   * @param aliases - Optional operation name aliases
   */
  register(
    registration: ToolRegistration,
    handler: ToolHandler,
    aliases: string[] = [],
  ): void {
    if (this.tools.has(registration.name)) {
      throw new Error(`Tool already registered: ${registration.name}`);
    }

    // Check alias conflicts
    for (const alias of aliases) {
      if (this.aliasMap.has(alias)) {
        throw new Error(
          `Alias "${alias}" already mapped to tool "${this.aliasMap.get(alias)}"`,
        );
      }
    }

    const entry: RegisteredToolEntry = { registration, handler, aliases };
    this.tools.set(registration.name, entry);

    // Register the tool name itself as an alias for lookup
    this.aliasMap.set(registration.name, registration.name);
    for (const alias of aliases) {
      this.aliasMap.set(alias, registration.name);
    }
  }

  /**
   * Register all standard handlers from the handler library.
   */
  registerStandardHandlers(): void {
    for (const { registration, handler } of STANDARD_HANDLERS) {
      if (!this.tools.has(registration.name)) {
        this.register(registration, handler);
      }
    }
  }

  /**
   * Resolve an operation name to a tool handler.
   *
   * Checks the canonical name first, then aliases.
   */
  resolve(operation: string): { registration: ToolRegistration; handler: ToolHandler } | undefined {
    const canonicalName = this.aliasMap.get(operation);
    if (!canonicalName) return undefined;

    const entry = this.tools.get(canonicalName);
    if (!entry) return undefined;

    return { registration: entry.registration, handler: entry.handler };
  }

  /**
   * Check if an operation can be resolved to a tool.
   */
  has(operation: string): boolean {
    return this.aliasMap.has(operation);
  }

  /**
   * Get all registered tool names.
   */
  listTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get all registered tool registrations.
   */
  listRegistrations(): ToolRegistration[] {
    return Array.from(this.tools.values()).map((e) => e.registration);
  }

  /**
   * Get a structural manifest of every registered tool.
   *
   * Merges the core registration (name, description, side effects, trust level)
   * with the optional `uiMetadata` (category, tags, displayName). Intended for
   * bridge-grammar prompt injection and catalog UIs; callers must not mutate
   * the returned entries (results are fresh objects on each call).
   */
  getManifest(): ToolManifestEntry[] {
    return Array.from(this.tools.values()).map((entry) => {
      const { registration } = entry;
      const requiredTrust = registration.requiredTrustLevel ?? 0;
      const manifest: ToolManifestEntry = {
        name: registration.name,
        description: registration.description,
        sideEffects: [...registration.sideEffects],
        requiredTrustLevel: requiredTrust,
      };
      if (registration.uiMetadata) {
        manifest.displayName = registration.uiMetadata.displayName;
        manifest.category = registration.uiMetadata.category;
        if (registration.uiMetadata.tags) {
          manifest.tags = [...registration.uiMetadata.tags];
        }
      }
      return manifest;
    });
  }

  /**
   * Get the count of registered tools.
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Discover which tools a VPIR graph needs and whether they are available.
   *
   * Inspects all `action` nodes in the graph and checks their operations
   * against the registry. Inference nodes are not checked (they use
   * VPIRExecutionContext.handlers).
   */
  discoverTools(graph: VPIRGraph): ToolDiscoveryResult {
    const available: Array<{ operation: string; toolName: string }> = [];
    const missing: string[] = [];

    for (const node of graph.nodes.values()) {
      if (node.type !== 'action') continue;

      const canonicalName = this.aliasMap.get(node.operation);
      if (canonicalName && this.tools.has(canonicalName)) {
        available.push({ operation: node.operation, toolName: canonicalName });
      } else {
        missing.push(node.operation);
      }
    }

    return {
      available,
      missing,
      allAvailable: missing.length === 0,
    };
  }

  /**
   * Validate that an agent has sufficient trust for all tools in a VPIR graph.
   *
   * @param graph - The VPIR graph to check
   * @param agentTrust - The agent's current trust level
   */
  validateTrust(graph: VPIRGraph, agentTrust: TrustLevel): TrustValidationResult {
    const insufficientTools: TrustValidationResult['insufficientTools'] = [];

    for (const node of graph.nodes.values()) {
      if (node.type !== 'action') continue;

      const resolved = this.resolve(node.operation);
      if (!resolved) continue; // Missing tools handled by discoverTools

      const requiredTrust = resolved.registration.requiredTrustLevel ?? 0;
      if (agentTrust < requiredTrust) {
        insufficientTools.push({
          toolName: resolved.registration.name,
          requiredTrust,
          agentTrust,
        });
      }
    }

    return {
      sufficient: insufficientTools.length === 0,
      insufficientTools,
    };
  }

  /**
   * Remove a tool from the registry.
   */
  unregister(name: string): boolean {
    const entry = this.tools.get(name);
    if (!entry) return false;

    this.tools.delete(name);
    this.aliasMap.delete(name);
    for (const alias of entry.aliases) {
      this.aliasMap.delete(alias);
    }
    return true;
  }
}

/**
 * Create a tool registry pre-populated with all standard handlers.
 */
export function createStandardRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerStandardHandlers();
  return registry;
}
