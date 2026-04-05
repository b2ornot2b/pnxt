/**
 * Tree-sitter TypeScript Parser — automatic codebase ingestion into Knowledge Graph.
 *
 * Parses TypeScript source code into AST via web-tree-sitter, then extracts
 * code entities (functions, classes, interfaces, types, variables, imports)
 * and their relationships (calls, contains, imports, extends, implements)
 * into typed KG nodes and edges.
 *
 * This is the first step toward the paradigm operating on real code rather
 * than manually constructed knowledge graphs.
 *
 * Based on:
 * - docs/research/original-prompt.md (Tree-sitter DKB Graph DB)
 * - status.md medium-term goal: "Tree-sitter parser integration"
 */

import { Parser, Language } from 'web-tree-sitter';
import type { Node as SyntaxNode } from 'web-tree-sitter';
import type {
  KGNode,
  KGEdge,
  KGRelation,
  KnowledgeGraphDefinition,
} from '../types/knowledge-graph.js';
import { createKnowledgeGraph, addNode, addEdge } from './knowledge-graph.js';

/**
 * Options for parsing TypeScript source code.
 */
export interface TSParserOptions {
  /** IFC security label owner for generated nodes. */
  labelOwner?: string;
  /** Trust level for generated nodes (0-4). */
  trustLevel?: 0 | 1 | 2 | 3 | 4;
}

/**
 * Result of parsing a TypeScript file.
 */
export interface TSParseResult {
  /** The generated knowledge graph. */
  graph: KnowledgeGraphDefinition;
  /** Number of nodes extracted. */
  nodeCount: number;
  /** Number of edges extracted. */
  edgeCount: number;
  /** Any warnings during parsing. */
  warnings: string[];
}

// Singleton parser + language instances
let parserInstance: Parser | null = null;
let languageInstance: Language | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Initialize the Tree-sitter parser with TypeScript grammar.
 * Must be called before parsing. Safe to call multiple times.
 */
export async function initParser(wasmPath?: string): Promise<void> {
  if (parserInstance && languageInstance) return;
  if (initPromise) return initPromise;

  initPromise = (async (): Promise<void> => {
    await Parser.init();
    parserInstance = new Parser();

    const tsWasmPath =
      wasmPath ??
      new URL(
        '../../node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm',
        import.meta.url,
      ).pathname;

    languageInstance = await Language.load(tsWasmPath);
    parserInstance.setLanguage(languageInstance);
  })();

  return initPromise;
}

/**
 * Clean up parser resources. Call when done parsing.
 */
export function cleanupParser(): void {
  if (parserInstance) {
    parserInstance.delete();
    parserInstance = null;
  }
  languageInstance = null;
  initPromise = null;
}

/**
 * Parse a single TypeScript source file into a Knowledge Graph.
 *
 * Extracts functions, classes, interfaces, type aliases, variables,
 * imports/exports and their relationships.
 *
 * @param source - TypeScript source code
 * @param filename - File name (used for node metadata and IDs)
 * @param options - Optional parser configuration
 * @returns Parse result with knowledge graph
 */
export async function parseFile(
  source: string,
  filename: string,
  options?: TSParserOptions,
): Promise<TSParseResult> {
  await initParser();

  const tree = parserInstance!.parse(source);
  if (!tree) {
    return {
      graph: createKnowledgeGraph(`kg-${filename}`, filename),
      nodeCount: 0,
      edgeCount: 0,
      warnings: ['Failed to parse source code'],
    };
  }

  const graph = createKnowledgeGraph(`kg-${filename}`, filename);
  const warnings: string[] = [];
  const context: ExtractionContext = {
    filename,
    source,
    options: options ?? {},
    warnings,
    nodeCounter: 0,
    edgeCounter: 0,
    identifierRefs: new Map(),
    definedNames: new Map(),
  };

  // Add module node for the file itself
  const moduleId = `mod-${sanitizeId(filename)}`;
  addNode(graph, {
    id: moduleId,
    kind: 'module',
    name: filename,
    metadata: { path: filename },
  });

  // Extract declarations from the root
  extractDeclarations(tree.rootNode, graph, context, moduleId);

  // Resolve call/reference edges from identifiers
  resolveReferences(graph, context);

  tree.delete();

  return {
    graph,
    nodeCount: graph.nodes.size,
    edgeCount: graph.edges.size,
    warnings,
  };
}

/**
 * Parse multiple TypeScript files into a single Knowledge Graph.
 *
 * Resolves cross-file import edges.
 *
 * @param files - Map of filename → source code
 * @param options - Optional parser configuration
 * @returns Parse result with unified knowledge graph
 */
export async function parseDirectory(
  files: Map<string, string>,
  options?: TSParserOptions,
): Promise<TSParseResult> {
  await initParser();

  const graph = createKnowledgeGraph('kg-directory', 'Directory');
  const allWarnings: string[] = [];
  const exportedNames = new Map<string, string>(); // name → nodeId
  let edgeCounter = 0;

  // First pass: parse each file and collect exports
  for (const [filename, source] of files) {
    const tree = parserInstance!.parse(source);
    if (!tree) {
      allWarnings.push(`Failed to parse: ${filename}`);
      continue;
    }

    const context: ExtractionContext = {
      filename,
      source,
      options: options ?? {},
      warnings: allWarnings,
      nodeCounter: 0,
      edgeCounter: edgeCounter,
      identifierRefs: new Map(),
      definedNames: new Map(),
    };

    const moduleId = `mod-${sanitizeId(filename)}`;
    addNode(graph, {
      id: moduleId,
      kind: 'module',
      name: filename,
      metadata: { path: filename },
    });

    extractDeclarations(tree.rootNode, graph, context, moduleId);
    resolveReferences(graph, context);

    edgeCounter = context.edgeCounter;

    // Collect exported names
    for (const [name, nodeId] of context.definedNames) {
      exportedNames.set(`${filename}:${name}`, nodeId);
    }

    tree.delete();
  }

  // Second pass: resolve cross-file imports
  for (const edge of graph.edges.values()) {
    if (edge.relation === 'imports' && edge.metadata?.importSource) {
      const importSource = edge.metadata.importSource as string;
      const importName = edge.metadata.importName as string;

      // Try to find the target in exports
      for (const [key, nodeId] of exportedNames) {
        if (key.includes(importSource) && key.endsWith(`:${importName}`)) {
          const crossEdgeId = `e-cross-${edgeCounter++}`;
          const targetNode = graph.nodes.get(edge.target);
          if (targetNode && graph.nodes.has(nodeId)) {
            try {
              addEdge(graph, {
                id: crossEdgeId,
                source: edge.target,
                target: nodeId,
                relation: 'references',
                metadata: { crossFile: true },
              });
            } catch {
              // Skip if edge already exists or nodes missing
            }
          }
        }
      }
    }
  }

  return {
    graph,
    nodeCount: graph.nodes.size,
    edgeCount: graph.edges.size,
    warnings: allWarnings,
  };
}

// --- Internal extraction logic ---

interface ExtractionContext {
  filename: string;
  source: string;
  options: TSParserOptions;
  warnings: string[];
  nodeCounter: number;
  edgeCounter: number;
  /** Identifier references found in function bodies (name → containing node IDs). */
  identifierRefs: Map<string, Set<string>>;
  /** Defined names → node IDs for reference resolution. */
  definedNames: Map<string, string>;
}

function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_{2,}/g, '_');
}

function makeNodeId(context: ExtractionContext, kind: string, name: string): string {
  return `${kind}-${sanitizeId(name)}-${sanitizeId(context.filename)}-${context.nodeCounter++}`;
}

function makeEdgeId(context: ExtractionContext): string {
  return `e-${context.edgeCounter++}`;
}

function safeAddNode(
  graph: KnowledgeGraphDefinition,
  node: KGNode,
  context: ExtractionContext,
): boolean {
  try {
    addNode(graph, node);
    context.definedNames.set(node.name, node.id);
    return true;
  } catch {
    context.warnings.push(`Duplicate node: ${node.id}`);
    return false;
  }
}

function safeAddEdge(
  graph: KnowledgeGraphDefinition,
  edge: KGEdge,
  _context: ExtractionContext,
): boolean {
  try {
    addEdge(graph, edge);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract top-level declarations from an AST node.
 */
function extractDeclarations(
  node: SyntaxNode,
  graph: KnowledgeGraphDefinition,
  context: ExtractionContext,
  parentModuleId: string,
): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    switch (child.type) {
      case 'function_declaration':
        extractFunction(child, graph, context, parentModuleId);
        break;

      case 'class_declaration':
        extractClass(child, graph, context, parentModuleId);
        break;

      case 'interface_declaration':
        extractInterface(child, graph, context, parentModuleId);
        break;

      case 'type_alias_declaration':
        extractTypeAlias(child, graph, context, parentModuleId);
        break;

      case 'lexical_declaration':
        extractVariable(child, graph, context, parentModuleId);
        break;

      case 'import_statement':
        extractImport(child, graph, context, parentModuleId);
        break;

      case 'export_statement':
        extractExport(child, graph, context, parentModuleId);
        break;

      case 'expression_statement':
        // Could contain assignments or function calls at top level
        break;
    }
  }
}

function extractFunction(
  node: SyntaxNode,
  graph: KnowledgeGraphDefinition,
  context: ExtractionContext,
  parentId: string,
): void {
  const nameNode = node.childForFieldName('name');
  const name = nameNode?.text ?? 'anonymous';
  const nodeId = makeNodeId(context, 'fn', name);

  const kgNode: KGNode = {
    id: nodeId,
    kind: 'function',
    name,
    metadata: {
      path: context.filename,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      parameters: extractParameterNames(node),
      returnType: extractReturnType(node),
    },
  };

  if (safeAddNode(graph, kgNode, context)) {
    safeAddEdge(graph, {
      id: makeEdgeId(context),
      source: parentId,
      target: nodeId,
      relation: 'contains',
    }, context);

    // Collect identifier references in function body
    const body = node.childForFieldName('body');
    if (body) {
      collectIdentifierReferences(body, nodeId, context);
    }
  }
}

function extractClass(
  node: SyntaxNode,
  graph: KnowledgeGraphDefinition,
  context: ExtractionContext,
  parentId: string,
): void {
  const nameNode = node.childForFieldName('name');
  const name = nameNode?.text ?? 'AnonymousClass';
  const nodeId = makeNodeId(context, 'class', name);

  const kgNode: KGNode = {
    id: nodeId,
    kind: 'class',
    name,
    metadata: {
      path: context.filename,
      line: node.startPosition.row + 1,
    },
  };

  if (!safeAddNode(graph, kgNode, context)) return;

  safeAddEdge(graph, {
    id: makeEdgeId(context),
    source: parentId,
    target: nodeId,
    relation: 'contains',
  }, context);

  // Check for extends clause
  const heritage = findChildByType(node, 'class_heritage');
  if (heritage) {
    const extendsClause = findChildByType(heritage, 'extends_clause');
    if (extendsClause) {
      const superName = getFirstIdentifierText(extendsClause);
      if (superName) {
        addDeferredEdge(context, nodeId, superName, 'extends');
      }
    }

    const implementsClause = findChildByType(heritage, 'implements_clause');
    if (implementsClause) {
      for (let i = 0; i < implementsClause.childCount; i++) {
        const child = implementsClause.child(i);
        if (child && (child.type === 'type_identifier' || child.type === 'identifier')) {
          addDeferredEdge(context, nodeId, child.text, 'implements');
        }
      }
    }
  }

  // Extract methods
  const body = node.childForFieldName('body');
  if (body) {
    for (let i = 0; i < body.childCount; i++) {
      const member = body.child(i);
      if (!member) continue;

      if (member.type === 'method_definition' || member.type === 'public_field_definition') {
        const methodName = member.childForFieldName('name');
        if (methodName) {
          const methodId = makeNodeId(context, 'fn', `${name}.${methodName.text}`);
          const methodKgNode: KGNode = {
            id: methodId,
            kind: 'function',
            name: `${name}.${methodName.text}`,
            metadata: {
              path: context.filename,
              line: member.startPosition.row + 1,
              className: name,
            },
          };
          if (safeAddNode(graph, methodKgNode, context)) {
            safeAddEdge(graph, {
              id: makeEdgeId(context),
              source: nodeId,
              target: methodId,
              relation: 'contains',
            }, context);

            const methodBody = member.childForFieldName('body');
            if (methodBody) {
              collectIdentifierReferences(methodBody, methodId, context);
            }
          }
        }
      }
    }
  }
}

function extractInterface(
  node: SyntaxNode,
  graph: KnowledgeGraphDefinition,
  context: ExtractionContext,
  parentId: string,
): void {
  const nameNode = node.childForFieldName('name');
  const name = nameNode?.text ?? 'AnonymousInterface';
  const nodeId = makeNodeId(context, 'iface', name);

  const kgNode: KGNode = {
    id: nodeId,
    kind: 'interface',
    name,
    metadata: {
      path: context.filename,
      line: node.startPosition.row + 1,
    },
  };

  if (safeAddNode(graph, kgNode, context)) {
    safeAddEdge(graph, {
      id: makeEdgeId(context),
      source: parentId,
      target: nodeId,
      relation: 'contains',
    }, context);

    // Check for extends
    const extendsClause = findChildByType(node, 'extends_type_clause');
    if (extendsClause) {
      const superName = getFirstIdentifierText(extendsClause);
      if (superName) {
        addDeferredEdge(context, nodeId, superName, 'extends');
      }
    }
  }
}

function extractTypeAlias(
  node: SyntaxNode,
  graph: KnowledgeGraphDefinition,
  context: ExtractionContext,
  parentId: string,
): void {
  const nameNode = node.childForFieldName('name');
  const name = nameNode?.text ?? 'AnonymousType';
  const nodeId = makeNodeId(context, 'type', name);

  const kgNode: KGNode = {
    id: nodeId,
    kind: 'type',
    name,
    metadata: {
      path: context.filename,
      line: node.startPosition.row + 1,
    },
  };

  if (safeAddNode(graph, kgNode, context)) {
    safeAddEdge(graph, {
      id: makeEdgeId(context),
      source: parentId,
      target: nodeId,
      relation: 'contains',
    }, context);
  }
}

function extractVariable(
  node: SyntaxNode,
  graph: KnowledgeGraphDefinition,
  context: ExtractionContext,
  parentId: string,
): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child?.type !== 'variable_declarator') continue;

    const nameNode = child.childForFieldName('name');
    const name = nameNode?.text ?? 'anonymous';
    const nodeId = makeNodeId(context, 'var', name);

    // Check if the value is an arrow function or function expression
    const value = child.childForFieldName('value');
    const isFunction =
      value?.type === 'arrow_function' || value?.type === 'function_expression';

    const kgNode: KGNode = {
      id: nodeId,
      kind: isFunction ? 'function' : 'variable',
      name,
      metadata: {
        path: context.filename,
        line: node.startPosition.row + 1,
        isArrowFunction: value?.type === 'arrow_function',
      },
    };

    if (safeAddNode(graph, kgNode, context)) {
      safeAddEdge(graph, {
        id: makeEdgeId(context),
        source: parentId,
        target: nodeId,
        relation: 'contains',
      }, context);

      if (value) {
        collectIdentifierReferences(value, nodeId, context);
      }
    }
  }
}

function extractImport(
  node: SyntaxNode,
  graph: KnowledgeGraphDefinition,
  context: ExtractionContext,
  parentId: string,
): void {
  const sourceNode = node.childForFieldName('source') ?? findChildByType(node, 'string');
  const importSource = sourceNode?.text?.replace(/['"]/g, '') ?? 'unknown';

  // Find import specifiers
  const importClause = findChildByType(node, 'import_clause');
  if (!importClause) return;

  const namedImports = findChildByType(importClause, 'named_imports');
  if (namedImports) {
    for (let i = 0; i < namedImports.childCount; i++) {
      const spec = namedImports.child(i);
      if (spec?.type !== 'import_specifier') continue;

      const importedName = spec.childForFieldName('name')?.text ?? spec.text;
      const nodeId = makeNodeId(context, 'import', importedName);

      const kgNode: KGNode = {
        id: nodeId,
        kind: 'import',
        name: importedName,
        metadata: {
          path: context.filename,
          line: node.startPosition.row + 1,
          importSource,
        },
      };

      if (safeAddNode(graph, kgNode, context)) {
        safeAddEdge(graph, {
          id: makeEdgeId(context),
          source: parentId,
          target: nodeId,
          relation: 'contains',
        }, context);

        safeAddEdge(graph, {
          id: makeEdgeId(context),
          source: nodeId,
          target: parentId,
          relation: 'imports',
          metadata: { importSource, importName: importedName },
        }, context);

        context.definedNames.set(importedName, nodeId);
      }
    }
  }

  // Default import
  const defaultImport = findChildByType(importClause, 'identifier');
  if (defaultImport) {
    const importedName = defaultImport.text;
    const nodeId = makeNodeId(context, 'import', importedName);

    const kgNode: KGNode = {
      id: nodeId,
      kind: 'import',
      name: importedName,
      metadata: {
        path: context.filename,
        line: node.startPosition.row + 1,
        importSource,
        isDefault: true,
      },
    };

    if (safeAddNode(graph, kgNode, context)) {
      safeAddEdge(graph, {
        id: makeEdgeId(context),
        source: parentId,
        target: nodeId,
        relation: 'contains',
      }, context);
    }
  }
}

function extractExport(
  node: SyntaxNode,
  graph: KnowledgeGraphDefinition,
  context: ExtractionContext,
  parentId: string,
): void {
  // Export wraps another declaration
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    switch (child.type) {
      case 'function_declaration':
        extractFunction(child, graph, context, parentId);
        // Mark the function as exported
        markAsExported(child, graph, context);
        break;
      case 'class_declaration':
        extractClass(child, graph, context, parentId);
        markAsExported(child, graph, context);
        break;
      case 'interface_declaration':
        extractInterface(child, graph, context, parentId);
        markAsExported(child, graph, context);
        break;
      case 'type_alias_declaration':
        extractTypeAlias(child, graph, context, parentId);
        markAsExported(child, graph, context);
        break;
      case 'lexical_declaration':
        extractVariable(child, graph, context, parentId);
        break;
    }
  }
}

function markAsExported(
  node: SyntaxNode,
  graph: KnowledgeGraphDefinition,
  context: ExtractionContext,
): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  const name = nameNode.text;
  const nodeId = context.definedNames.get(name);
  if (nodeId) {
    const kgNode = graph.nodes.get(nodeId);
    if (kgNode) {
      kgNode.metadata.exported = true;
    }
  }
}

// --- Reference collection and resolution ---

function addDeferredEdge(
  context: ExtractionContext,
  sourceId: string,
  targetName: string,
  _relation: KGRelation,
): void {
  // Store as identifier ref with special prefix for non-call relationships
  const key = `__${_relation}__${targetName}`;
  if (!context.identifierRefs.has(key)) {
    context.identifierRefs.set(key, new Set());
  }
  context.identifierRefs.get(key)!.add(sourceId);
}

function collectIdentifierReferences(
  node: SyntaxNode,
  containingNodeId: string,
  context: ExtractionContext,
): void {
  if (node.type === 'call_expression') {
    const funcNode = node.childForFieldName('function');
    if (funcNode) {
      const calledName = funcNode.type === 'member_expression'
        ? funcNode.text
        : funcNode.text;
      if (!context.identifierRefs.has(calledName)) {
        context.identifierRefs.set(calledName, new Set());
      }
      context.identifierRefs.get(calledName)!.add(containingNodeId);
    }
    // Still recurse into arguments
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child !== funcNode) {
        collectIdentifierReferences(child, containingNodeId, context);
      }
    }
    return;
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      collectIdentifierReferences(child, containingNodeId, context);
    }
  }
}

function resolveReferences(
  graph: KnowledgeGraphDefinition,
  context: ExtractionContext,
): void {
  for (const [name, callerIds] of context.identifierRefs) {
    // Handle deferred edges (extends, implements)
    if (name.startsWith('__')) {
      const match = name.match(/^__(\w+)__(.+)$/);
      if (match) {
        const relation = match[1] as KGRelation;
        const targetName = match[2];
        const targetId = context.definedNames.get(targetName);
        if (targetId) {
          for (const sourceId of callerIds) {
            safeAddEdge(graph, {
              id: makeEdgeId(context),
              source: sourceId,
              target: targetId,
              relation,
            }, context);
          }
        }
      }
      continue;
    }

    // Resolve call references
    const targetId = context.definedNames.get(name);
    if (targetId) {
      for (const callerId of callerIds) {
        if (callerId !== targetId) {
          safeAddEdge(graph, {
            id: makeEdgeId(context),
            source: callerId,
            target: targetId,
            relation: 'calls',
          }, context);
        }
      }
    }
  }
}

// --- AST helper utilities ---

function findChildByType(node: SyntaxNode, type: string): SyntaxNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child?.type === type) return child;
  }
  return null;
}

function getFirstIdentifierText(node: SyntaxNode): string | null {
  if (node.type === 'type_identifier' || node.type === 'identifier') {
    return node.text;
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      const result = getFirstIdentifierText(child);
      if (result) return result;
    }
  }
  return null;
}

function extractParameterNames(funcNode: SyntaxNode): string[] {
  const params = funcNode.childForFieldName('parameters');
  if (!params) return [];

  const names: string[] = [];
  for (let i = 0; i < params.childCount; i++) {
    const param = params.child(i);
    if (!param) continue;

    if (param.type === 'required_parameter' || param.type === 'optional_parameter') {
      const nameNode = param.childForFieldName('pattern') ?? param.childForFieldName('name');
      if (nameNode) names.push(nameNode.text);
    } else if (param.type === 'identifier') {
      names.push(param.text);
    }
  }
  return names;
}

function extractReturnType(funcNode: SyntaxNode): string | undefined {
  const returnType = funcNode.childForFieldName('return_type');
  if (!returnType) return undefined;

  // The return_type field includes the colon, find the type annotation
  const typeAnnotation = findChildByType(returnType, 'type_annotation');
  if (typeAnnotation) return typeAnnotation.text.replace(/^:\s*/, '');

  // Direct type node
  return returnType.text.replace(/^:\s*/, '');
}
