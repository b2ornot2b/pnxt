/**
 * VPIR Graph Builder — fluent API for constructing valid VPIR graphs from plain data.
 *
 * The M2 linchpin: enables LLMs to author VPIR graphs without TypeScript.
 * Accepts JSON-compatible descriptions (bridge grammar output) and produces
 * validated, execution-ready VPIRGraph objects.
 *
 * Sprint 11 deliverable — Advisory Panel: Kay, Liskov, Agha.
 */

import type {
  VPIRNode,
  VPIRNodeType,
  VPIRGraph,
  VPIRRef,
  VPIROutput,
  Evidence,
} from '../types/vpir.js';
import type { SecurityLabel } from '../types/ifc.js';
import type { ToolRegistry } from '../aci/tool-registry.js';
import { validateGraph } from './vpir-validator.js';
import { parseVPIRGraph } from '../bridge-grammar/schema-validator.js';

// ── Types ─────────────────────────────────────────────────────────

/**
 * Plain JSON description of a VPIR node (no Map, no class instances).
 */
export interface NodeSpec {
  id: string;
  type: VPIRNodeType;
  operation: string;
  inputs?: Array<{ nodeId: string; port: string; dataType: string }>;
  outputs?: Array<{ port: string; dataType: string; value?: unknown }>;
  evidence?: Array<{
    type: 'data' | 'rule' | 'model_output';
    source: string;
    confidence: number;
    description?: string;
  }>;
  label?: {
    owner: string;
    trustLevel: number;
    classification: string;
    createdAt?: string;
  };
  verifiable?: boolean;
  agentId?: string;
}

export interface BuildResult {
  success: boolean;
  graph?: VPIRGraph;
  errors: string[];
  warnings: string[];
}

// ── Builder ───────────────────────────────────────────────────────

export class VPIRGraphBuilder {
  private id: string;
  private name: string;
  private nodes: NodeSpec[] = [];
  private defaultLabel: SecurityLabel;
  private defaultAgentId: string;
  private registry: ToolRegistry | undefined;

  constructor(options: {
    id?: string;
    name?: string;
    defaultLabel?: SecurityLabel;
    defaultAgentId?: string;
  } = {}) {
    this.id = options.id ?? `vpir-${Date.now()}`;
    this.name = options.name ?? 'VPIR Graph';
    this.defaultAgentId = options.defaultAgentId ?? 'graph-builder';
    this.defaultLabel = options.defaultLabel ?? {
      owner: this.defaultAgentId,
      trustLevel: 2,
      classification: 'internal',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Attach a tool registry for pre-build validation of action operations.
   */
  withToolRegistry(registry: ToolRegistry): this {
    this.registry = registry;
    return this;
  }

  /**
   * Add an observation node (raw data source, no inputs).
   */
  addObservation(spec: Omit<NodeSpec, 'type'> & { type?: never }): this {
    this.nodes.push({ ...spec, type: 'observation' });
    return this;
  }

  /**
   * Add an inference node (derived conclusion from inputs).
   */
  addInference(spec: Omit<NodeSpec, 'type'> & { type?: never }): this {
    this.nodes.push({ ...spec, type: 'inference' });
    return this;
  }

  /**
   * Add an action node (side-effecting operation, resolved via tool registry).
   */
  addAction(spec: Omit<NodeSpec, 'type'> & { type?: never }): this {
    this.nodes.push({ ...spec, type: 'action' });
    return this;
  }

  /**
   * Add an assertion node (invariant or postcondition check).
   */
  addAssertion(spec: Omit<NodeSpec, 'type'> & { type?: never }): this {
    this.nodes.push({ ...spec, type: 'assertion' });
    return this;
  }

  /**
   * Add a composition node (aggregation of sub-steps).
   */
  addComposition(spec: Omit<NodeSpec, 'type'> & { type?: never }): this {
    this.nodes.push({ ...spec, type: 'composition' });
    return this;
  }

  /**
   * Add a node with an explicit type.
   */
  addNode(spec: NodeSpec): this {
    this.nodes.push(spec);
    return this;
  }

  /**
   * Build the VPIR graph from accumulated nodes.
   * Validates structure, computes roots/terminals, and optionally checks tool availability.
   */
  build(): BuildResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const now = new Date().toISOString();

    if (this.nodes.length === 0) {
      return { success: false, errors: ['Graph has no nodes'], warnings };
    }

    // Check for duplicate IDs
    const ids = new Set<string>();
    for (const spec of this.nodes) {
      if (ids.has(spec.id)) {
        errors.push(`Duplicate node ID: "${spec.id}"`);
      }
      ids.add(spec.id);
    }
    if (errors.length > 0) {
      return { success: false, errors, warnings };
    }

    // Build the node map
    const nodeMap = new Map<string, VPIRNode>();

    for (const spec of this.nodes) {
      const label = spec.label
        ? {
            owner: spec.label.owner,
            trustLevel: spec.label.trustLevel as 0 | 1 | 2 | 3 | 4,
            classification: spec.label.classification as SecurityLabel['classification'],
            createdAt: spec.label.createdAt ?? now,
          }
        : { ...this.defaultLabel };

      const inputs: VPIRRef[] = (spec.inputs ?? []).map((i) => ({
        nodeId: i.nodeId,
        port: i.port,
        dataType: i.dataType,
      }));

      const outputs: VPIROutput[] = (spec.outputs ?? []).map((o) => {
        const out: VPIROutput = { port: o.port, dataType: o.dataType };
        if (o.value !== undefined) out.value = o.value;
        return out;
      });

      // Default output if none specified (non-assertion nodes)
      if (outputs.length === 0 && spec.type !== 'assertion') {
        outputs.push({ port: 'result', dataType: 'unknown' });
      }

      const evidence: Evidence[] = (spec.evidence ?? []).map((e) => {
        const ev: Evidence = {
          type: e.type,
          source: e.source,
          confidence: e.confidence,
        };
        if (e.description) ev.description = e.description;
        return ev;
      });

      // Default evidence if none specified
      if (evidence.length === 0) {
        evidence.push({
          type: spec.type === 'observation' ? 'data' : 'rule',
          source: spec.agentId ?? this.defaultAgentId,
          confidence: 1.0,
        });
      }

      const node: VPIRNode = {
        id: spec.id,
        type: spec.type,
        operation: spec.operation,
        inputs,
        outputs,
        evidence,
        label,
        verifiable: spec.verifiable ?? true,
        createdAt: now,
      };

      if (spec.agentId) node.agentId = spec.agentId;

      nodeMap.set(spec.id, node);
    }

    // Compute roots (nodes with no inputs)
    const roots: string[] = [];
    for (const [id, node] of nodeMap) {
      if (node.inputs.length === 0) {
        roots.push(id);
      }
    }

    // Compute terminals (nodes whose outputs are not consumed by any other node)
    const consumedPorts = new Set<string>();
    for (const node of nodeMap.values()) {
      for (const ref of node.inputs) {
        consumedPorts.add(`${ref.nodeId}:${ref.port}`);
      }
    }

    const terminals: string[] = [];
    for (const [id, node] of nodeMap) {
      const hasConsumedOutput = node.outputs.some(
        (o) => consumedPorts.has(`${id}:${o.port}`),
      );
      if (!hasConsumedOutput) {
        terminals.push(id);
      }
    }

    const graph: VPIRGraph = {
      id: this.id,
      name: this.name,
      nodes: nodeMap,
      roots,
      terminals,
      createdAt: now,
    };

    // Structural validation
    const validation = validateGraph(graph);
    if (!validation.valid) {
      for (const err of validation.errors) {
        errors.push(`[${err.code}] ${err.message}`);
      }
      return { success: false, errors, warnings };
    }
    for (const warn of validation.warnings) {
      warnings.push(`[${warn.code}] ${warn.message}`);
    }

    // Tool registry validation (if attached)
    if (this.registry) {
      const discovery = this.registry.discoverTools(graph);
      if (!discovery.allAvailable) {
        for (const missing of discovery.missing) {
          errors.push(`Missing tool handler for operation: "${missing}"`);
        }
        return { success: false, errors, warnings };
      }
    }

    return { success: true, graph, errors: [], warnings };
  }

  /**
   * Construct a VPIRGraph from raw JSON (bridge grammar output format).
   *
   * This is the M2 bridge: LLM output → fromJSON() → executable VPIRGraph.
   * Accepts the same JSON format as parseVPIRGraph but returns a BuildResult.
   */
  static fromJSON(
    json: unknown,
    options?: { toolRegistry?: ToolRegistry },
  ): BuildResult {
    const warnings: string[] = [];

    const result = parseVPIRGraph(json);

    if (!result.valid || !result.graph) {
      const errors = result.errors.map(
        (e) => `[${e.code}] ${e.path}: ${e.message}`,
      );
      return { success: false, errors, warnings };
    }

    // Tool registry validation if provided
    if (options?.toolRegistry) {
      const discovery = options.toolRegistry.discoverTools(result.graph);
      if (!discovery.allAvailable) {
        const errors = discovery.missing.map(
          (m) => `Missing tool handler for operation: "${m}"`,
        );
        return { success: false, errors, warnings };
      }
    }

    return { success: true, graph: result.graph, errors: [], warnings };
  }
}
