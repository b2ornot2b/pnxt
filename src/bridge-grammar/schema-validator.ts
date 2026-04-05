/**
 * Bridge Grammar Schema Validator — parse and validate LLM JSON output
 * into typed VPIR nodes and graphs.
 *
 * This module bridges the gap between raw LLM structured output and the
 * typed VPIR data structures. It validates JSON against the Bridge Grammar
 * schemas, then composes with the existing VPIR structural validator.
 *
 * Based on:
 * - src/bridge-grammar/vpir-schema.ts (JSON Schema definitions)
 * - src/vpir/vpir-validator.ts (structural validation)
 */

import type {
  VPIRNode,
  VPIRGraph,
  VPIRNodeType,
  EvidenceType,
  Evidence,
  VPIRRef,
  VPIROutput,
} from '../types/vpir.js';
import type { SecurityLabel, Classification } from '../types/ifc.js';
import type { TrustLevel } from '../types/agent.js';
import type { BridgeGrammarResult, BridgeGrammarError } from '../types/bridge-grammar.js';
import { validateNode, validateGraph } from '../vpir/vpir-validator.js';

const VALID_NODE_TYPES: VPIRNodeType[] = [
  'inference',
  'observation',
  'action',
  'assertion',
  'composition',
];
const VALID_EVIDENCE_TYPES: EvidenceType[] = ['data', 'rule', 'model_output'];
const VALID_CLASSIFICATIONS: Classification[] = [
  'public',
  'internal',
  'confidential',
  'restricted',
];

/**
 * Parse and validate a JSON value as a single VPIRNode.
 *
 * Performs structural JSON validation followed by VPIR semantic validation.
 */
export function parseVPIRNode(json: unknown): BridgeGrammarResult {
  const errors: BridgeGrammarError[] = [];

  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return {
      valid: false,
      errors: [{ code: 'INVALID_TYPE', path: '', message: 'Expected an object' }],
    };
  }

  const obj = json as Record<string, unknown>;

  // Validate required string fields
  validateRequiredString(obj, 'id', '', errors);
  validateNodeType(obj, errors);
  validateRequiredString(obj, 'operation', '', errors);
  validateRequiredBoolean(obj, 'verifiable', '', errors);
  validateRequiredString(obj, 'createdAt', '', errors);

  // Validate inputs array
  const inputs = validateArray(obj, 'inputs', '', errors);
  const parsedInputs: VPIRRef[] = [];
  if (inputs) {
    for (let i = 0; i < inputs.length; i++) {
      const ref = validateVPIRRef(inputs[i], `/inputs/${i}`, errors);
      if (ref) parsedInputs.push(ref);
    }
  }

  // Validate outputs array
  const outputs = validateArray(obj, 'outputs', '', errors);
  const parsedOutputs: VPIROutput[] = [];
  if (outputs) {
    for (let i = 0; i < outputs.length; i++) {
      const output = validateVPIROutput(outputs[i], `/outputs/${i}`, errors);
      if (output) parsedOutputs.push(output);
    }
  }

  // Validate evidence array
  const evidence = validateArray(obj, 'evidence', '', errors);
  const parsedEvidence: Evidence[] = [];
  if (evidence) {
    for (let i = 0; i < evidence.length; i++) {
      const ev = validateEvidence(evidence[i], `/evidence/${i}`, errors);
      if (ev) parsedEvidence.push(ev);
    }
  }

  // Validate label
  const label = validateSecurityLabel(obj.label, '/label', errors);

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Construct the typed node
  const node: VPIRNode = {
    id: obj.id as string,
    type: obj.type as VPIRNodeType,
    operation: obj.operation as string,
    inputs: parsedInputs,
    outputs: parsedOutputs,
    evidence: parsedEvidence,
    label: label!,
    verifiable: obj.verifiable as boolean,
    createdAt: obj.createdAt as string,
  };

  if (typeof obj.agentId === 'string') {
    node.agentId = obj.agentId;
  }

  // Run VPIR structural validation
  const vpirResult = validateNode(node);
  if (!vpirResult.valid) {
    for (const err of vpirResult.errors) {
      errors.push({
        code: `VPIR_${err.code}`,
        path: '',
        message: err.message,
      });
    }
    return { valid: false, errors };
  }

  return { valid: true, node, errors: [] };
}

/**
 * Parse and validate a JSON value as a VPIRGraph.
 *
 * JSON graphs use an array of nodes (since JSON cannot represent Maps).
 * This function converts to the Map-based VPIRGraph and validates.
 */
export function parseVPIRGraph(json: unknown): BridgeGrammarResult {
  const errors: BridgeGrammarError[] = [];

  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return {
      valid: false,
      errors: [{ code: 'INVALID_TYPE', path: '', message: 'Expected an object' }],
    };
  }

  const obj = json as Record<string, unknown>;

  validateRequiredString(obj, 'id', '', errors);
  validateRequiredString(obj, 'name', '', errors);
  validateRequiredString(obj, 'createdAt', '', errors);

  // Validate nodes array
  const nodesArr = validateArray(obj, 'nodes', '', errors);
  if (nodesArr && nodesArr.length === 0) {
    errors.push({ code: 'EMPTY_NODES', path: '/nodes', message: 'Graph must have at least one node' });
  }

  // Validate roots and terminals arrays
  const roots = validateStringArray(obj, 'roots', '', errors);
  const terminals = validateStringArray(obj, 'terminals', '', errors);

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Parse each node
  const nodeMap = new Map<string, VPIRNode>();
  for (let i = 0; i < nodesArr!.length; i++) {
    const nodeResult = parseVPIRNode(nodesArr![i]);
    if (!nodeResult.valid) {
      for (const err of nodeResult.errors) {
        errors.push({
          code: err.code,
          path: `/nodes/${i}${err.path}`,
          message: err.message,
        });
      }
    } else if (nodeResult.node) {
      if (nodeMap.has(nodeResult.node.id)) {
        errors.push({
          code: 'DUPLICATE_NODE_ID',
          path: `/nodes/${i}/id`,
          message: `Duplicate node ID: "${nodeResult.node.id}"`,
        });
      } else {
        nodeMap.set(nodeResult.node.id, nodeResult.node);
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const graph: VPIRGraph = {
    id: obj.id as string,
    name: obj.name as string,
    nodes: nodeMap,
    roots: roots!,
    terminals: terminals!,
    createdAt: obj.createdAt as string,
  };

  // Run VPIR graph structural validation (cycles, refs, IFC)
  const vpirResult = validateGraph(graph);
  if (!vpirResult.valid) {
    for (const err of vpirResult.errors) {
      errors.push({
        code: `VPIR_${err.code}`,
        path: '',
        message: err.message,
      });
    }
    return { valid: false, errors };
  }

  return { valid: true, graph, errors: [] };
}

// --- Internal validation helpers ---

function validateRequiredString(
  obj: Record<string, unknown>,
  field: string,
  basePath: string,
  errors: BridgeGrammarError[],
): void {
  if (typeof obj[field] !== 'string' || (obj[field] as string).length === 0) {
    errors.push({
      code: 'INVALID_FIELD',
      path: `${basePath}/${field}`,
      message: `"${field}" must be a non-empty string`,
    });
  }
}

function validateRequiredBoolean(
  obj: Record<string, unknown>,
  field: string,
  basePath: string,
  errors: BridgeGrammarError[],
): void {
  if (typeof obj[field] !== 'boolean') {
    errors.push({
      code: 'INVALID_FIELD',
      path: `${basePath}/${field}`,
      message: `"${field}" must be a boolean`,
    });
  }
}

function validateArray(
  obj: Record<string, unknown>,
  field: string,
  basePath: string,
  errors: BridgeGrammarError[],
): unknown[] | null {
  if (!Array.isArray(obj[field])) {
    errors.push({
      code: 'INVALID_FIELD',
      path: `${basePath}/${field}`,
      message: `"${field}" must be an array`,
    });
    return null;
  }
  return obj[field] as unknown[];
}

function validateStringArray(
  obj: Record<string, unknown>,
  field: string,
  basePath: string,
  errors: BridgeGrammarError[],
): string[] | null {
  const arr = validateArray(obj, field, basePath, errors);
  if (!arr) return null;

  for (let i = 0; i < arr.length; i++) {
    if (typeof arr[i] !== 'string' || (arr[i] as string).length === 0) {
      errors.push({
        code: 'INVALID_FIELD',
        path: `${basePath}/${field}/${i}`,
        message: `"${field}[${i}]" must be a non-empty string`,
      });
      return null;
    }
  }
  return arr as string[];
}

function validateNodeType(
  obj: Record<string, unknown>,
  errors: BridgeGrammarError[],
): void {
  if (!VALID_NODE_TYPES.includes(obj.type as VPIRNodeType)) {
    errors.push({
      code: 'INVALID_ENUM',
      path: '/type',
      message: `"type" must be one of: ${VALID_NODE_TYPES.join(', ')}`,
    });
  }
}

function validateVPIRRef(
  value: unknown,
  path: string,
  errors: BridgeGrammarError[],
): VPIRRef | null {
  if (typeof value !== 'object' || value === null) {
    errors.push({ code: 'INVALID_TYPE', path, message: 'Expected an object for VPIRRef' });
    return null;
  }
  const obj = value as Record<string, unknown>;
  const localErrors: BridgeGrammarError[] = [];

  validateRequiredString(obj, 'nodeId', path, localErrors);
  validateRequiredString(obj, 'port', path, localErrors);
  validateRequiredString(obj, 'dataType', path, localErrors);

  if (localErrors.length > 0) {
    errors.push(...localErrors);
    return null;
  }

  return {
    nodeId: obj.nodeId as string,
    port: obj.port as string,
    dataType: obj.dataType as string,
  };
}

function validateVPIROutput(
  value: unknown,
  path: string,
  errors: BridgeGrammarError[],
): VPIROutput | null {
  if (typeof value !== 'object' || value === null) {
    errors.push({ code: 'INVALID_TYPE', path, message: 'Expected an object for VPIROutput' });
    return null;
  }
  const obj = value as Record<string, unknown>;
  const localErrors: BridgeGrammarError[] = [];

  validateRequiredString(obj, 'port', path, localErrors);
  validateRequiredString(obj, 'dataType', path, localErrors);

  if (localErrors.length > 0) {
    errors.push(...localErrors);
    return null;
  }

  const output: VPIROutput = {
    port: obj.port as string,
    dataType: obj.dataType as string,
  };
  if (obj.value !== undefined) {
    output.value = obj.value;
  }
  return output;
}

function validateEvidence(
  value: unknown,
  path: string,
  errors: BridgeGrammarError[],
): Evidence | null {
  if (typeof value !== 'object' || value === null) {
    errors.push({ code: 'INVALID_TYPE', path, message: 'Expected an object for Evidence' });
    return null;
  }
  const obj = value as Record<string, unknown>;
  const localErrors: BridgeGrammarError[] = [];

  if (!VALID_EVIDENCE_TYPES.includes(obj.type as EvidenceType)) {
    localErrors.push({
      code: 'INVALID_ENUM',
      path: `${path}/type`,
      message: `Evidence "type" must be one of: ${VALID_EVIDENCE_TYPES.join(', ')}`,
    });
  }

  validateRequiredString(obj, 'source', path, localErrors);

  if (typeof obj.confidence !== 'number' || obj.confidence < 0 || obj.confidence > 1) {
    localErrors.push({
      code: 'INVALID_RANGE',
      path: `${path}/confidence`,
      message: '"confidence" must be a number between 0 and 1',
    });
  }

  if (localErrors.length > 0) {
    errors.push(...localErrors);
    return null;
  }

  const evidence: Evidence = {
    type: obj.type as EvidenceType,
    source: obj.source as string,
    confidence: obj.confidence as number,
  };
  if (typeof obj.description === 'string') {
    evidence.description = obj.description;
  }
  return evidence;
}

function validateSecurityLabel(
  value: unknown,
  path: string,
  errors: BridgeGrammarError[],
): SecurityLabel | null {
  if (typeof value !== 'object' || value === null) {
    errors.push({ code: 'INVALID_TYPE', path, message: 'Expected an object for SecurityLabel' });
    return null;
  }
  const obj = value as Record<string, unknown>;
  const localErrors: BridgeGrammarError[] = [];

  validateRequiredString(obj, 'owner', path, localErrors);

  if (typeof obj.trustLevel !== 'number' || !Number.isInteger(obj.trustLevel) || obj.trustLevel < 0 || obj.trustLevel > 4) {
    localErrors.push({
      code: 'INVALID_RANGE',
      path: `${path}/trustLevel`,
      message: '"trustLevel" must be an integer between 0 and 4',
    });
  }

  if (!VALID_CLASSIFICATIONS.includes(obj.classification as Classification)) {
    localErrors.push({
      code: 'INVALID_ENUM',
      path: `${path}/classification`,
      message: `"classification" must be one of: ${VALID_CLASSIFICATIONS.join(', ')}`,
    });
  }

  validateRequiredString(obj, 'createdAt', path, localErrors);

  if (localErrors.length > 0) {
    errors.push(...localErrors);
    return null;
  }

  return {
    owner: obj.owner as string,
    trustLevel: obj.trustLevel as TrustLevel,
    classification: obj.classification as Classification,
    createdAt: obj.createdAt as string,
  };
}
