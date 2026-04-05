/**
 * VPIR Renderer — text-based visualization of VPIR graphs and execution traces.
 *
 * Produces human-readable ASCII representations for oversight and debugging.
 * Two modes:
 * - Graph view: DAG structure with node types, labels, and connections
 * - Trace view: Step-by-step execution with timing, inputs/outputs, and status
 *
 * No external dependencies — pure string output.
 */

import type { VPIRNode, VPIRGraph } from '../types/vpir.js';
import type { VPIRExecutionResult, VPIRExecutionTrace } from '../types/vpir-execution.js';

/**
 * Render a single VPIR node as a multi-line text block.
 */
export function renderNode(node: VPIRNode): string {
  const lines: string[] = [];

  lines.push(`[${node.id}] ${node.type}: "${node.operation}"`);

  if (node.label) {
    lines.push(`  \u251C\u2500 label: ${node.label.owner} / trust:${node.label.trustLevel} / ${node.label.classification}`);
  }

  if (node.inputs.length > 0) {
    const inputStr = node.inputs.map((ref) => `${ref.nodeId}:${ref.port}`).join(', ');
    lines.push(`  \u251C\u2500 inputs: ${inputStr}`);
  }

  if (node.evidence.length > 0) {
    for (const ev of node.evidence) {
      lines.push(`  \u251C\u2500 evidence: ${ev.type} (confidence: ${ev.confidence})`);
    }
  }

  if (node.outputs.length > 0) {
    const outputStr = node.outputs.map((o) => `${o.port} (${o.dataType})`).join(', ');
    const prefix = node.inputs.length === 0 && node.evidence.length === 0 ? '\u2514\u2500' : '\u2514\u2500';
    lines.push(`  ${prefix} outputs: ${outputStr}`);
  }

  return lines.join('\n');
}

/**
 * Render a VPIR graph as an ASCII DAG.
 *
 * Nodes are displayed in topological order with connection arrows
 * showing the flow of data between them.
 */
export function renderGraph(graph: VPIRGraph): string {
  if (graph.nodes.size === 0) {
    return `VPIR Graph: "${graph.name}" (empty)`;
  }

  const lines: string[] = [];
  const nodeCount = graph.nodes.size;
  const header = `VPIR Graph: "${graph.name}" (${nodeCount} node${nodeCount !== 1 ? 's' : ''})`;
  lines.push(header);
  lines.push('\u2500'.repeat(header.length));

  // Compute topological order.
  const order = topologicalSort(graph);

  // Build successor map for drawing arrows.
  const successors = new Map<string, string[]>();
  for (const node of graph.nodes.values()) {
    for (const ref of node.inputs) {
      if (!successors.has(ref.nodeId)) {
        successors.set(ref.nodeId, []);
      }
      successors.get(ref.nodeId)!.push(node.id);
    }
  }

  for (let i = 0; i < order.length; i++) {
    const node = graph.nodes.get(order[i])!;
    lines.push(renderNode(node));

    // Draw arrow to successors if this isn't the last node.
    const succs = successors.get(node.id) ?? [];
    if (succs.length > 0 && i < order.length - 1) {
      lines.push('        \u2502');
      lines.push('        \u25BC');
    }
  }

  return lines.join('\n');
}

/**
 * Render a VPIR execution trace as a table.
 */
export function renderTrace(result: VPIRExecutionResult): string {
  const lines: string[] = [];

  // Header.
  const statusIcon = result.status === 'completed' ? 'OK' : result.status === 'failed' ? 'FAIL' : 'TIMEOUT';
  lines.push(`Execution Trace: graph "${result.graphId}" [${statusIcon}] (${result.durationMs}ms)`);
  lines.push('='.repeat(72));

  if (result.trace.length === 0) {
    lines.push('(no steps executed)');
    return lines.join('\n');
  }

  // Column headers.
  lines.push(formatRow('Step', 'Node', 'Operation', 'Status', 'Output'));
  lines.push('-'.repeat(72));

  for (let i = 0; i < result.trace.length; i++) {
    const step = result.trace[i];
    const status = step.success ? 'OK' : 'FAIL';
    const outputStr = formatOutput(step.output);

    lines.push(formatRow(
      String(i + 1),
      step.nodeId,
      truncate(step.operation, 20),
      status,
      truncate(outputStr, 20),
    ));
  }

  lines.push('-'.repeat(72));

  // Errors section.
  if (result.errors.length > 0) {
    lines.push('');
    lines.push('Errors:');
    for (const err of result.errors) {
      lines.push(`  [${err.code}] ${err.nodeId}: ${err.message}`);
    }
  }

  // Outputs section.
  const outputKeys = Object.keys(result.outputs);
  if (outputKeys.length > 0) {
    lines.push('');
    lines.push('Outputs:');
    for (const key of outputKeys) {
      lines.push(`  ${key}: ${formatOutput(result.outputs[key])}`);
    }
  }

  return lines.join('\n');
}

/**
 * Render a single trace step in detail.
 */
export function renderTraceStep(step: VPIRExecutionTrace): string {
  const lines: string[] = [];
  const status = step.success ? 'OK' : 'FAIL';

  lines.push(`[${step.nodeId}] ${step.operation} [${status}]`);

  if (step.label) {
    lines.push(`  label: ${step.label.owner} / trust:${step.label.trustLevel} / ${step.label.classification}`);
  }

  const inputKeys = Object.keys(step.inputs);
  if (inputKeys.length > 0) {
    lines.push('  inputs:');
    for (const key of inputKeys) {
      lines.push(`    ${key}: ${formatOutput(step.inputs[key])}`);
    }
  }

  if (step.output !== undefined) {
    lines.push(`  output: ${formatOutput(step.output)}`);
  }

  if (step.error) {
    lines.push(`  error: ${step.error}`);
  }

  lines.push(`  timestamp: ${step.timestamp}`);

  return lines.join('\n');
}

/**
 * Format a table row with fixed-width columns.
 */
function formatRow(step: string, node: string, op: string, status: string, output: string): string {
  return `  ${step.padEnd(5)} ${node.padEnd(12)} ${op.padEnd(22)} ${status.padEnd(7)} ${output}`;
}

/**
 * Format an output value for display.
 */
function formatOutput(value: unknown): string {
  if (value === undefined) return '(none)';
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return `{${keys.join(', ')}}`;
  }
  return String(value);
}

/**
 * Truncate a string to max length with ellipsis.
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Topological sort using Kahn's algorithm.
 */
function topologicalSort(graph: VPIRGraph): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const nodeId of graph.nodes.keys()) {
    inDegree.set(nodeId, 0);
    adjacency.set(nodeId, []);
  }

  for (const node of graph.nodes.values()) {
    for (const ref of node.inputs) {
      if (graph.nodes.has(ref.nodeId)) {
        adjacency.get(ref.nodeId)!.push(node.id);
        inDegree.set(node.id, (inDegree.get(node.id) ?? 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    sorted.push(nodeId);

    for (const neighbor of adjacency.get(nodeId)!) {
      const newDegree = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  return sorted;
}
