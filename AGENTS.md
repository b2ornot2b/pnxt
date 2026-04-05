# Agent Instructions for pnxt

This file provides guidelines for AI agents working in the pnxt repository. Follow these conventions to ensure consistency and quality across contributions.

---

## 1. Build Commands

### Testing

```bash
# Run all tests
npm test

# Run a single test file
npm test -- path/to/test.file

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run tests matching a pattern
npm test -- --testNamePattern="pattern"
```

### Linting & Formatting

```bash
# Run ESLint
npm run lint

# Run ESLint with auto-fix
npm run lint:fix

# Format code with Prettier
npm run format

# Check formatting without changes
npm run format:check
```

### Building

```bash
# Build for production
npm run build

# Build for development (watch mode)
npm run build:dev
```

### Type Checking

```bash
# Run TypeScript type checking
npm run typecheck

# Or via tsc directly
npx tsc --noEmit
```

### CI Pipeline

```bash
# Run full CI locally
npm run ci
```

---

## 2. Code Style Guidelines

### 2.1 General Principles

- Write self-documenting code with clear intent
- Prefer explicit over implicit
- Keep functions small and focused (single responsibility)
- Avoid premature optimization
- Follow existing patterns in the codebase

### 2.2 TypeScript/JavaScript

#### Imports

```typescript
// Group imports by type, separated by blank lines:
// 1. External libraries
// 2. Internal modules (using absolute paths)
// 3. Relative imports
// 4. Type imports

import React from 'react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { formatDate } from '../utils';
import type { User } from '@/types';

// Use named exports; default exports only when semantically appropriate
```

#### Naming Conventions

```typescript
// Variables and functions: camelCase
const userName = 'Alice';
function calculateTotal() {}

// Classes and types: PascalCase
class UserService {}
interface UserProfile {}
type ApiResponse = {}

// Constants: SCREAMING_SNAKE_CASE
const MAX_RETRY_ATTEMPTS = 3;
const API_BASE_URL = 'https://api.example.com';

// Files: kebab-case for modules, PascalCase for React components
// user-service.ts, UserProfile.tsx
```

#### Types

```typescript
// Always use explicit types for function parameters and return values
function greet(name: string): string {
  return `Hello, ${name}`;
}

// Prefer interfaces for object shapes, types for unions/intersections
interface User {
  id: string;
  name: string;
  email: string;
}

type Status = 'pending' | 'active' | 'inactive';
type Result = Success | Error;

// Use optional chaining and nullish coalescing appropriately
const value = obj?.property ?? 'default';

// Avoid `any` - use `unknown` when type is truly unknown
function parseJSON(input: string): unknown {
  return JSON.parse(input);
}
```

#### Formatting

```typescript
// 2-space indentation
// Semicolons required
// Single quotes for strings
// Trailing commas in multiline constructs
// Max line length: 100 characters

const user = {
  id: '123',
  name: 'Alice',
  email: 'alice@example.com',
};

// Use async/await over raw Promises
async function fetchUser(id: string): Promise<User> {
  const response = await api.get(`/users/${id}`);
  return response.data;
}
```

### 2.3 Error Handling

```typescript
// Always handle errors explicitly
try {
  await saveData(payload);
} catch (error) {
  if (error instanceof ValidationError) {
    logger.warn('Validation failed', { details: error.details });
  } else {
    throw new AppError('Failed to save', { cause: error });
  }
}

// Use custom error classes for domain-specific errors
class NotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

// Never swallow errors silently
// Either handle them or re-throw with context
```

### 2.4 Comments

```typescript
// Use JSDoc for public APIs and complex functions
/**
 * Calculates the total price including tax and discounts.
 * @param items - Cart items to calculate
 * @param taxRate - Tax rate as decimal (e.g., 0.08 for 8%)
 * @returns Total price in cents
 */
function calculateTotal(items: CartItem[], taxRate: number): number {
  // Use inline comments sparingly for non-obvious logic
  // Prefer self-documenting code over explanatory comments
}
```

---

## 3. Git Workflow

This project uses **git flow** for branching strategy and **git bug** for issue tracking.

### git flow

```bash
# Initialize git flow (one-time setup)
git flow init

# Start a new feature
git flow feature start feature-name

# Finish a feature (merges into develop)
git flow feature finish feature-name

# Start a release
git flow release start v1.0.0

# Finish a release (merges to main and develop, tags)
git flow release finish v1.0.0

# Start a hotfix
git flow hotfix start hotfix-name

# Finish a hotfix (merges to main and develop)
git flow hotfix finish hotfix-name

# Publish a feature/release/hotfix
git flow feature publish feature-name
git flow release publish v1.0.0
git flow hotfix publish hotfix-name

# Pull a published feature
git flow feature pull origin feature-name
```

### git bug

```bash
# List all bugs
git bug

# Create a new bug
git bug add "Bug title"

# Update bug status
git bug update <id> status <new-status>

# List available statuses
git bug ls_labels

# Assign bug to someone
git bug update <id> assign "user@example.com"

# Show bug details
git bug show <id>

# Filter bugs by status
git bug list status:open
git bug list status:in-progress
git bug list status:closed

# Add comment to bug
git bug comment <id> "Comment text"

# Link current branch to a bug
git bug link <id>

# Filter bugs assigned to you
git bug list assignee:"your@email.com"
```

### Commits

```bash
# Use conventional commit format
git commit -m "feat(auth): add OAuth2 login support"
git commit -m "fix(api): handle null response from upstream"
git commit -m "docs(readme): update installation instructions"
git commit -m "fix(bug #123): resolve null pointer in user service"

# Types: feat, fix, docs, style, refactor, test, chore
# Reference bugs in commits when applicable
```

### Branch Naming

```bash
# Feature branches (git flow)
git flow feature start user-authentication
git flow feature start 123-user-authentication  # Linked to bug

# Bugfix branches
git flow bugfix start 123-fix-redirect-loop

# Format when not using git flow
feat/123-user-authentication
fix/123-redirect-loop
bugfix/123-fix-null-pointer
```

---

## 4. Testing Guidelines

### Test Structure

```typescript
// Follow Arrange-Act-Assert pattern
describe('UserService', () => {
  describe('createUser', () => {
    it('should create a user with hashed password', async () => {
      // Arrange
      const input = { name: 'Alice', email: 'alice@example.com' };
      
      // Act
      const result = await userService.createUser(input);
      
      // Assert
      expect(result.password).not.toBe(input.password);
      expect(await bcrypt.compare(input.password, result.password)).toBe(true);
    });
    
    it('should throw ValidationError for duplicate email', async () => {
      // ...
    });
  });
});
```

### What to Test

- Unit tests for pure functions and utilities
- Integration tests for API endpoints
- Happy path AND edge cases
- Error handling scenarios
- Never test implementation details

---

## 5. Research Context & Agent-Specific Guidelines

### Original Research Prompt

The foundational vision for this project is defined in [`docs/research/original-prompt.md`](docs/research/original-prompt.md). **All research and implementation work must align with this master prompt.**

The project designs a **net-new programming paradigm built exclusively for LLMs**, not a conventional agent-tooling framework. Key pillars:

- **Typed Tokenization (HoTT)**: Code as categorical objects, morphisms, and paths — not flat text
- **VPIR**: Verifiable Programmatic Intermediate Representation with mechanically verifiable reasoning chains
- **Dataflow Process Networks**: Actors communicating via FIFO channels, eliminating imperative loops
- **LLMbda Calculus (IFC)**: Lambda calculus with Information Flow Control for noninterference guarantees
- **SMT Solvers**: Z3/CVC5 for constraint satisfaction and formal verification
- **Bridge Grammar**: Constrained-decoding JSON schema forcing LLMs to output valid VPIR nodes
- **Tree-sitter DKB Knowledge Graph**: Codebase stored as a non-Euclidean graph, not flat files

### Research Phases

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 1 | Core Architecture, State Separation & FFI | Complete (external) |
| Phase 2 | Bridge Layer & Mathematical Spec | Complete (external) |
| Phase 3 | Deep analysis of pillars, patterns, and architecture | Complete |
| Phase 4 | Infrastructure prototype & empirical evaluation | Complete |
| Phase 5 | Paradigm Foundation (DPN, VPIR, Bridge Grammar, HoTT, Z3) | Complete |
| Phase 6 | Integration & Deepening (9 sprints — categorical tokenization, self-hosting) | Complete |

### Project Status

For the current project status, roadmap, and next steps, see [`status.md`](status.md).

### Agent Identity

- Agents have unique identifiers and behavioral profiles
- Maintain persistent memory across sessions
- Track project context and learned patterns

### Advisory Review Panel

The project maintains a **Dream Team Advisory Board** of 10 domain experts (historical and living) whose perspectives are simulated during design reviews. When the user requests an **"advisor review"**, the agent convenes this panel as a round-table discussion covering type theory, concurrency, security, LLM architecture, language design, and paradigm vision.

See [`docs/advisory-review-panel.md`](docs/advisory-review-panel.md) for the full panel roster, domain coverage matrix, and review output format.

### Collaboration

- Communicate in natural language
- Propose changes with clear rationale
- Ask for clarification when requirements are ambiguous
- Respect human decisions and constraints
- **Always reference the original prompt when proposing research directions**
- **Invoke the Advisory Review Panel when the user requests an "advisor review"**

### Memory Management

- Persist important decisions and patterns
- Query semantic memory before making suggestions
- Maintain episodic memory of past sessions

### Tool Usage

- Use file system operations appropriately
- Respect scope boundaries
- Request human approval for destructive operations
- Maintain audit trail of changes

---

## 6. Security Best Practices

- Never commit secrets or credentials
- Use environment variables for sensitive configuration
- Validate and sanitize all user inputs
- Follow principle of least privilege
- Report security concerns to maintainers

---

## 7. File Organization

```
src/
├── types/             # Shared type definitions (18 files)
├── memory/            # Memory Service — three-layer model with IFC
├── aci/               # ACI Gateway �� trust + IFC checking, audit logging
├── agent/             # Agent Runtime — lifecycle management
├── capability/        # Capability Negotiation — 3-phase handshake
├── trust/             # Trust Engine — 5-level graduated trust, causal scoring
├── vpir/              # VPIR ��� validator, interpreter, optimizer, renderer, export
├── bridge-grammar/    # Bridge Grammar — JSON Schema + Claude API integration
├── channel/           # DPN — channels, processes, DPN runtime, bisimulation
├── hott/              # HoTT — categories, higher paths, univalence, transport
├── knowledge-graph/   # Tree-sitter DKB — typed graph + TypeScript parser
├── lambda/            # LLMbda Calculus — typed lambda with IFC, VPIR bridge
├── protocol/          # NL Protocols — state machines over DPN channels
├── verification/      # Formal Verification — Z3, noninterference, liveness, CVC5
├── benchmarks/        # Benchmarks — weather API, multi-agent delegation, pipeline
├── evaluation/        # Evaluation — integration scenarios, security tests
├── neurosymbolic/     # Neurosymbolic — P-ASP, Active Inference, refinement
├── experiments/       # Experiments — categorical tokenizer, self-hosting PoC
└���─ errors/            # Error hierarchy
```

---

## 8. Website (GitHub Pages)

The project website is built with [Astro Starlight](https://starlight.astro.build/) and deployed automatically to GitHub Pages.

### Structure

```
website/
├── astro.config.mjs              # Site configuration, sidebar, metadata
├── package.json                  # Dependencies
├── src/
│   ├── content/docs/             # All page content (Markdown/MDX)
│   │   ├── index.mdx             # Landing page (splash hero)
│   │   ├── introduction.mdx      # Project introduction
│   │   ├── quickstart.md         # Quick start guide (mirrors QuickStart.md)
│   │   ├── status.md             # Project status (mirrors status.md)
│   │   ├── concepts/             # Core concepts (pillars, foundations)
│   │   ├── research/             # Research summaries
│   │   │   ├── overview.md
│   │   │   └── phase-3/          # Phase 3 document summaries
│   │   ├── roadmap/              # Phase 4 plan, future vision
│   │   └── contributing/         # Contributing guidelines
│   ├── assets/                   # Logos and images
│   └── styles/custom.css         # Custom theme
```

### Keeping the Website in Sync

The website is designed to reference source documents dynamically. When updating documentation:

1. **When editing `status.md`**: Also update `website/src/content/docs/status.md` to reflect changes
2. **When editing `QuickStart.md`**: Also update `website/src/content/docs/quickstart.md` to reflect changes
3. **When editing research docs in `docs/research/phase-3/`**: Update the corresponding summary page in `website/src/content/docs/research/phase-3/`
4. **When adding new research phases**: Add new sidebar entries in `website/astro.config.mjs` and create corresponding content pages
5. **When updating `README.md`**: Review `website/src/content/docs/index.mdx` and `introduction.mdx` for consistency
6. **When updating `AGENTS.md`**: Review `website/src/content/docs/contributing/guidelines.md` for consistency

Each website page includes a tip/note linking to its source document in the repository, so readers can always find the authoritative version.

### Deployment

- **Automatic**: Pushes to `main` that touch `website/`, `docs/`, `README.md`, `status.md`, or `AGENTS.md` trigger a rebuild and deploy via GitHub Actions
- **PR validation**: Pull requests touching those paths run a build check to catch errors before merge
- **Manual**: The deploy workflow can be triggered manually via `workflow_dispatch`

### Local Development

```bash
cd website
npm install
npm run dev       # Start dev server
npm run build     # Production build
npm run preview   # Preview production build
```

### Adding New Pages

1. Create a `.md` or `.mdx` file in the appropriate `website/src/content/docs/` subdirectory
2. Add a frontmatter block with `title` and `description`
3. Add a sidebar entry in `website/astro.config.mjs` under the appropriate section
4. If the page summarizes a source document, add a tip/note linking to the source

---

## 9. Getting Help

- Read existing code to understand patterns
- Check tests for usage examples
- Ask maintainers when uncertain
- Document unclear code with comments
