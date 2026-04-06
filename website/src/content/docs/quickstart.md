---
title: Quick Start
description: Get up and running with pnxt in under 5 minutes.
---

:::tip[Source Document]
This page mirrors [`QuickStart.md`](https://github.com/b2ornot2b/pnxt/blob/main/QuickStart.md) in the repository root.
:::

## Prerequisites

- **Node.js** >= 20.0.0
- **npm**

## Install & Build

```bash
# Clone the repository
git clone https://github.com/b2ornot2b/pnxt.git
cd pnxt

# Install dependencies
npm install

# Build the project
npm run build
```

## Run Tests

```bash
# Run all 1220+ tests across 68 suites
npm test

# Type check
npm run typecheck

# Lint
npm run lint

# Full CI pipeline (typecheck + lint + test)
npm run ci
```

## Try Key Features

### 1. VPIR Interpreter — Execute a Reasoning Graph

VPIR (Verifiable Programmatic Intermediate Representation) is the core execution model. Each node represents a verifiable reasoning step.

```typescript
import {
  VPIRNode,
  VPIRGraph,
  validateVPIRGraph,
  executeGraph,
} from 'pnxt';

// Create a simple 3-node reasoning graph
const nodes: VPIRNode[] = [
  {
    id: 'observe',
    type: 'observation',
    label: 'Observe input',
    inputs: [],
    output: { type: 'string', value: 'temperature=25' },
    securityLabel: { confidentiality: 'public', integrity: 'trusted' },
  },
  {
    id: 'infer',
    type: 'inference',
    label: 'Classify temperature',
    inputs: ['observe'],
    output: { type: 'string', value: 'moderate' },
    securityLabel: { confidentiality: 'public', integrity: 'trusted' },
  },
  {
    id: 'assert',
    type: 'assertion',
    label: 'Verify classification',
    inputs: ['infer'],
    output: { type: 'boolean', value: true },
    securityLabel: { confidentiality: 'public', integrity: 'trusted' },
  },
];

const graph: VPIRGraph = { id: 'temp-check', nodes, edges: [
  { from: 'observe', to: 'infer' },
  { from: 'infer', to: 'assert' },
]};

// Validate structure (DAG property, references, IFC labels)
const validation = validateVPIRGraph(graph);
console.log('Valid:', validation.valid);

// Execute the graph
const result = await executeGraph(graph);
console.log('Result:', result);
```

### 2. Bridge Grammar — Constrained LLM Output

Bridge Grammar provides JSON Schemas that force LLMs to output valid VPIR nodes via function calling or structured output.

```typescript
import {
  VPIRNodeSchema,
  VPIRGraphSchema,
  toAnthropicToolSchema,
  toFunctionCallingSchema,
  parseVPIRNode,
} from 'pnxt';

// Get a Claude-compatible tool schema
const toolSchema = toAnthropicToolSchema();
console.log('Tool schema for Claude:', JSON.stringify(toolSchema, null, 2));

// Get an OpenAI-compatible function calling schema
const fnSchema = toFunctionCallingSchema();

// Validate LLM output against the schema
const llmOutput = {
  id: 'n1', type: 'observation', label: 'test',
  inputs: [], output: { type: 'string', value: 'hello' },
  securityLabel: { confidentiality: 'public', integrity: 'trusted' },
};
const parsed = parseVPIRNode(JSON.stringify(llmOutput));
console.log('Parsed node:', parsed);
```

For live LLM integration (requires `ANTHROPIC_API_KEY`):

```typescript
import { LLMVPIRGenerator } from 'pnxt';

const generator = new LLMVPIRGenerator({ apiKey: process.env.ANTHROPIC_API_KEY });
const graph = await generator.generate('Check the weather in Tokyo');
console.log('Generated VPIR graph:', graph);
```

### 3. Z3 Formal Verification — Verify Properties

pnxt uses Z3 SMT solver to formally verify 21 properties including capability consistency, trust monotonicity, IFC noninterference, DPN liveness, and graph pre-verification.

```typescript
import { createZ3Context } from 'pnxt';

const z3 = await createZ3Context();

// Verify capability grant consistency
const result = await z3.verifyProperty('capability_grant_consistency');
console.log('Property holds:', result.status === 'verified');

// Verify IFC noninterference
const nResult = await z3.verifyNoninterference();
console.log('Noninterference:', nResult.status);

// Verify DPN deadlock freedom
const dResult = await z3.verifyDPNDeadlockFreedom();
console.log('Deadlock-free:', dResult.status);
```

### 4. Knowledge Graph — Parse TypeScript into a Graph

The Tree-sitter DKB Knowledge Graph parses source code into a typed graph with 8 entity kinds and 8 relation types.

```typescript
import { KnowledgeGraph, parseTypeScriptFile } from 'pnxt';

// Create a knowledge graph and parse a TypeScript file
const kg = new KnowledgeGraph();
await parseTypeScriptFile(kg, 'src/memory/memory-service.ts');

// Query the graph
const results = kg.query({
  startNodeId: 'MemoryService',
  direction: 'outgoing',
  maxDepth: 2,
});
console.log('Related entities:', results);

// Convert to HoTT category for categorical reasoning
const category = kg.toHoTTCategory();
console.log('Category objects:', category.objects.length);
```

### 5. End-to-End Pipeline — NL to Verified Result

The full paradigm pipeline: Natural Language → Bridge Grammar → VPIR → HoTT → Z3 → DPN → Result.

```typescript
import { runIntegrationPipeline } from 'pnxt';

// Run the weather API benchmark (end-to-end paradigm proof)
const result = await runIntegrationPipeline({
  query: "What's the weather in Tokyo?",
  stages: ['bridge-grammar', 'vpir', 'hott', 'z3', 'dpn'],
});
console.log('Pipeline result:', result);
```

## Module Overview

| Category | Module | Description |
|----------|--------|-------------|
| **Core** | `memory/` | Three-layer memory model (working, semantic, episodic) |
| | `aci/` | Agent-Computer Interface with trust checking and audit |
| | `agent/` | Agent lifecycle management |
| | `capability/` | Versioned capability negotiation with 3-phase handshake |
| | `trust/` | 5-level graduated trust with causal scoring |
| **Paradigm** | `vpir/` | VPIR validator, interpreter, optimizer, renderer, export |
| | `bridge-grammar/` | JSON Schema constrained decoding + Claude API integration |
| | `channel/` | Typed FIFO channels, DPN runtime, tracing, bisimulation |
| | `hott/` | HoTT categories, higher paths, univalence, transport |
| | `knowledge-graph/` | Tree-sitter DKB with typed edges and HoTT conversion |
| | `lambda/` | LLMbda Calculus with IFC and VPIR semantic bridge |
| | `protocol/` | NL protocol state machines over DPN channels |
| **Verification** | `verification/` | Z3 invariants, noninterference, liveness, univalence, CVC5 |
| | `benchmarks/` | Weather API and multi-agent delegation benchmarks |
| | `evaluation/` | Integration scenarios, security tests, benchmark framework |
| **Experimental** | `neurosymbolic/` | P-ASP, Active Inference, refinement pipeline |
| | `experiments/` | Categorical tokenization (42-token vocab), self-hosting PoC |
| **Shared** | `types/` | 18 type definition files |
| | `errors/` | VPIR execution error hierarchy |

## Stats

- **68** test suites, **1220+** tests
- **21** formally verified Z3 properties
- **21** source modules
- Advisory panel composite score: **9.35/10**
