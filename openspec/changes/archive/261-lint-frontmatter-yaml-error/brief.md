---
queue_item: lint-frontmatter-yaml-error
queue_hash: sha256:60615653720c6cde8310593720a4f844378866daf73a544de07cae57340f7c1a
planner: null
date: 2026-10-21
---

### Goal

When a proposal's frontmatter is invalid YAML, lint says "proposal.md must declare a verify command in frontmatter" and nothing about the real problem. Lint should name the YAML error and its line.

### Context

As of 2026-10-21:

- Planning 253: an unquoted colon in `title:` made the frontmatter invalid. Lint reported only the missing verify, which cost a round of guessing.
- `parseFrontmatter` in `src/core/spec/parser.ts` catches the `YAML.parse` error and returns empty data. Every later check then sees an empty frontmatter.
- The same parser reads task files, so a broken task frontmatter also hides behind findings about missing scope or verify.

### Requirements

- Lint reports one error naming the file and the YAML parser's message and line when a proposal's or task file's frontmatter does not parse, and skips the findings that only follow from the empty frontmatter.
- Callers outside lint keep today's behaviour for unparseable frontmatter.
- Tests cover a proposal and a task file with a colon in an unquoted value.

### Non-goals

- Accepting unquoted colons.
