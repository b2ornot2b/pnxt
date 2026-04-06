---
title: Contributing Guidelines
description: How to contribute to the pnxt project — for both humans and AI agents.
---

:::note[Source Document]
Development guidelines are maintained in [AGENTS.md](https://github.com/b2ornot2b/pnxt/blob/main/AGENTS.md) (symlinked as `CLAUDE.md`). This page summarizes the key points — see the source file for full detail.
:::

## Getting Started

pnxt is in **Phase 7** (Self-Hosting Paradigm) with a comprehensive TypeScript prototype spanning 68 test suites and 1220+ tests. Contributions may include:
- Implementation of new paradigm features (M4 Self-Modification, M5 Self-Hosting)
- Bug reports and issue discussion
- Research analysis and documentation
- Review and feedback on research documents
- Additional Tree-sitter parsers for non-TypeScript languages

---

## Git Workflow

pnxt uses **git flow** for branching and **conventional commits** for messages.

### Branching

```
main          ← production releases
develop       ← integration branch
feature/*     ← new features
fix/*         ← bug fixes
release/*     ← release preparation
hotfix/*      ← production fixes
```

### Commit Format

```
type(scope): description

# Types: feat, fix, docs, style, refactor, test, chore
# Examples:
feat(memory): add semantic memory query API
fix(aci): handle null response from capability negotiation
docs(research): update Phase 3 trust framework
```

---

## Code Style

### TypeScript Conventions

- **2-space indentation**, semicolons, single quotes, trailing commas
- **camelCase** for variables/functions, **PascalCase** for types/classes
- **Explicit types** for function parameters and return values
- **No `any`** — use `unknown` when type is truly unknown
- **async/await** over raw Promises

### Error Handling

- Always handle errors explicitly
- Use custom error classes for domain-specific errors
- Never swallow errors silently

---

## Testing

Follow the **Arrange-Act-Assert** pattern:

```typescript
describe('MemoryService', () => {
  describe('query', () => {
    it('should retrieve semantically similar memories', async () => {
      // Arrange
      const memory = createMemoryService();
      await memory.store({ content: 'project uses TypeScript' });

      // Act
      const results = await memory.query('what language?');

      // Assert
      expect(results[0].content).toContain('TypeScript');
    });
  });
});
```

### What to Test

- Unit tests for pure functions and utilities
- Integration tests for API endpoints
- Happy path AND edge cases
- Error handling scenarios

---

## For AI Agents

If you're an AI agent contributing to pnxt:

- **Read [AGENTS.md](https://github.com/b2ornot2b/pnxt/blob/main/AGENTS.md)** — It contains full guidelines including research context
- **Reference the [original research prompt](https://github.com/b2ornot2b/pnxt/blob/main/docs/research/original-prompt.md)** when proposing research directions
- **Maintain persistent memory** of project decisions and patterns
- **Follow existing patterns** in the codebase
- **Propose changes with clear rationale**
- **Ask for clarification** when requirements are ambiguous

---

## Security

- Never commit secrets or credentials
- Use environment variables for sensitive configuration
- Validate and sanitize all user inputs
- Follow principle of least privilege
