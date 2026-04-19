/**
 * VPIR Validator — structural validation for VPIR nodes and graphs.
 *
 * Validates that VPIR reasoning chains are structurally sound:
 * - All node references resolve to existing nodes
 * - The graph is a DAG (no cycles)
 * - IFC labels are consistent across node boundaries
 * - Required fields are present and well-formed
 *
 * This is NOT a full VPIR compiler — it validates structure, not semantics.
 * The Bridge Grammar (future sprint) will handle semantic validation.
 */

import type {
  VPIRNode,
  VPIRGraph,
  VPIRValidationResult,
  VPIRValidationError,
  VPIRValidationWarning,
} from '../types/vpir.js';
import { canFlowTo } from '../types/ifc.js';

/**
 * Validate a single VPIR node for structural integrity.
 */
export function validateNode(node: VPIRNode): VPIRValidationResult {
  const errors: VPIRValidationError[] = [];
  const warnings: VPIRValidationWarning[] = [];

  if (!node.id) {
    errors.push({ nodeId: node.id ?? '', code: 'MISSING_ID', message: 'Node must have an ID' });
  }

  if (!node.type) {
    errors.push({ nodeId: node.id, code: 'MISSING_TYPE', message: 'Node must have a type' });
  }

  if (!node.operation) {
    errors.push({
      nodeId: node.id,
      code: 'MISSING_OPERATION',
      message: 'Node must have an operation description',
    });
  }

  if (!node.label) {
    errors.push({
      nodeId: node.id,
      code: 'MISSING_LABEL',
      message: 'Node must have an IFC security label',
    });
  }

  if (node.evidence.length === 0) {
    warnings.push({
      nodeId: node.id,
      code: 'NO_EVIDENCE',
      message: 'Node has no evidence — consider adding justification',
    });
  }

  for (const ev of node.evidence) {
    if (ev.confidence < 0 || ev.confidence > 1) {
      errors.push({
        nodeId: node.id,
        code: 'INVALID_CONFIDENCE',
        message: `Evidence confidence must be 0–1, got ${ev.confidence}`,
      });
    }
  }

  if (node.outputs.length === 0 && node.type !== 'assertion') {
    warnings.push({
      nodeId: node.id,
      code: 'NO_OUTPUTS',
      message: 'Non-assertion node has no outputs',
    });
  }

  if (node.type === 'human') {
    if (node.verifiable === true) {
      errors.push({
        nodeId: node.id,
        code: 'HUMAN_NODE_VERIFIABLE',
        message: 'Human nodes must have verifiable: false',
      });
    }
    if (!node.humanPromptSpec) {
      errors.push({
        nodeId: node.id,
        code: 'HUMAN_NODE_MISSING_PROMPT_SPEC',
        message: 'Human nodes must have a humanPromptSpec',
      });
    } else if (!node.humanPromptSpec.message) {
      errors.push({
        nodeId: node.id,
        code: 'HUMAN_PROMPT_MISSING_MESSAGE',
        message: 'humanPromptSpec.message is required',
      });
    }
  } else if (node.humanPromptSpec) {
    errors.push({
      nodeId: node.id,
      code: 'UNEXPECTED_HUMAN_PROMPT_SPEC',
      message: 'humanPromptSpec is only valid on nodes with type === "human"',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate an entire VPIR graph for structural integrity.
 */
export function validateGraph(graph: VPIRGraph): VPIRValidationResult {
  const errors: VPIRValidationError[] = [];
  const warnings: VPIRValidationWarning[] = [];

  if (graph.nodes.size === 0) {
    errors.push({ nodeId: '', code: 'EMPTY_GRAPH', message: 'Graph has no nodes' });
    return { valid: false, errors, warnings };
  }

  // Validate each node individually.
  for (const node of graph.nodes.values()) {
    const result = validateNode(node);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  // Validate all input references resolve.
  for (const node of graph.nodes.values()) {
    for (const ref of node.inputs) {
      if (!graph.nodes.has(ref.nodeId)) {
        errors.push({
          nodeId: node.id,
          code: 'UNRESOLVED_REF',
          message: `Input references non-existent node "${ref.nodeId}"`,
        });
        continue;
      }

      const referenced = graph.nodes.get(ref.nodeId)!;
      const hasPort = referenced.outputs.some((o) => o.port === ref.port);
      if (!hasPort) {
        errors.push({
          nodeId: node.id,
          code: 'INVALID_PORT_REF',
          message: `Input references port "${ref.port}" on node "${ref.nodeId}", but that port doesn't exist`,
        });
      }
    }
  }

  // Validate roots are declared correctly.
  for (const rootId of graph.roots) {
    if (!graph.nodes.has(rootId)) {
      errors.push({
        nodeId: rootId,
        code: 'INVALID_ROOT',
        message: `Root node "${rootId}" does not exist in graph`,
      });
    } else {
      const root = graph.nodes.get(rootId)!;
      if (root.inputs.length > 0) {
        warnings.push({
          nodeId: rootId,
          code: 'ROOT_HAS_INPUTS',
          message: 'Root node has inputs — typically roots have no predecessors',
        });
      }
    }
  }

  // Validate terminals are declared correctly.
  for (const termId of graph.terminals) {
    if (!graph.nodes.has(termId)) {
      errors.push({
        nodeId: termId,
        code: 'INVALID_TERMINAL',
        message: `Terminal node "${termId}" does not exist in graph`,
      });
    }
  }

  // Check for cycles (DAG property).
  const cycleError = detectCycle(graph);
  if (cycleError) {
    errors.push(cycleError);
  }

  // Check IFC label consistency: data flowing from node A to node B
  // requires that A's label can flow to B's label.
  for (const node of graph.nodes.values()) {
    for (const ref of node.inputs) {
      const source = graph.nodes.get(ref.nodeId);
      if (source && node.label && source.label) {
        if (!canFlowTo(source.label, node.label)) {
          errors.push({
            nodeId: node.id,
            code: 'IFC_VIOLATION',
            message: `IFC violation: data from "${source.id}" (trust ${source.label.trustLevel}) cannot flow to "${node.id}" (trust ${node.label.trustLevel})`,
          });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Detect cycles in the VPIR graph using DFS.
 */
function detectCycle(graph: VPIRGraph): VPIRValidationError | null {
  const visited = new Set<string>();
  const inStack = new Set<string>();

  for (const nodeId of graph.nodes.keys()) {
    if (visited.has(nodeId)) continue;

    const hasCycle = dfs(nodeId, graph, visited, inStack);
    if (hasCycle) {
      return {
        nodeId: hasCycle,
        code: 'CYCLE_DETECTED',
        message: `Graph contains a cycle involving node "${hasCycle}"`,
      };
    }
  }

  return null;
}

function dfs(
  nodeId: string,
  graph: VPIRGraph,
  visited: Set<string>,
  inStack: Set<string>,
): string | null {
  visited.add(nodeId);
  inStack.add(nodeId);

  const node = graph.nodes.get(nodeId);
  if (node) {
    // Follow edges: this node's outputs are consumed by other nodes' inputs.
    for (const other of graph.nodes.values()) {
      for (const ref of other.inputs) {
        if (ref.nodeId === nodeId) {
          if (inStack.has(other.id)) {
            return other.id;
          }
          if (!visited.has(other.id)) {
            const result = dfs(other.id, graph, visited, inStack);
            if (result) return result;
          }
        }
      }
    }
  }

  inStack.delete(nodeId);
  return null;
}
