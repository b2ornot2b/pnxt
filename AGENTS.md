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

### Commits

```bash
# Use conventional commit format
git commit -m "feat(auth): add OAuth2 login support"
git commit -m "fix(api): handle null response from upstream"
git commit -m "docs(readme): update installation instructions"

# Types: feat, fix, docs, style, refactor, test, chore
```

### Branch Naming

```bash
# Format: type/description
feat/user-authentication
fix/redirect-loop-on-login
refactor/extract-validation-utils
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

## 5. Agent-Specific Guidelines

Since pnxt is an **Agent-Native Programming** project, agents are first-class participants:

### Agent Identity

- Agents have unique identifiers and behavioral profiles
- Maintain persistent memory across sessions
- Track project context and learned patterns

### Collaboration

- Communicate in natural language
- Propose changes with clear rationale
- Ask for clarification when requirements are ambiguous
- Respect human decisions and constraints

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
├── components/     # Reusable UI components
├── features/       # Feature-specific modules
├── hooks/          # Custom React hooks
├── lib/            # Third-party integrations
├── services/       # Business logic and API clients
├── stores/         # Global state management
├── types/          # Shared type definitions
└── utils/          # Pure utility functions

tests/
├── e2e/            # End-to-end tests
├── integration/    # Integration tests
└── unit/           # Unit tests
```

---

## 8. Getting Help

- Read existing code to understand patterns
- Check tests for usage examples
- Ask maintainers when uncertain
- Document unclear code with comments
