---
title: osq lint reports a proposal's broken frontmatter YAML instead of a missing verify
depends_on: []
verify: pnpm verify
features:
  reads: ["cli-foundation", "languages", "metrics-and-reporting", "status-inspection", "watcher-and-harness"]
---
## Goal

When a proposal's frontmatter is not valid YAML, `osq lint` says `proposal.md must declare a verify command in frontmatter` and nothing about the real problem. `parseFrontmatter` in `src/core/spec/parser.ts` catches the `YAML.parse` error and returns empty data, so every later check sees an empty frontmatter. Planning 253 lost a round to an unquoted colon in `title:`. Task files are read through the same parser, so a broken task frontmatter hides behind findings about its scope or verify.

After this change lint names the YAML error and its file line, and leaves out the findings that only follow from the empty frontmatter.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new test `tests/lint-frontmatter-yaml.test.ts` lints a proposal and a task file that each hold a colon in an unquoted value, and checks that `parseFrontmatter` still reads such a file as empty data.

## Non-goals

- Accepting unquoted colons, or repairing the YAML.
- Changing how any reader outside lint handles frontmatter that does not parse.
- Reporting more than the first YAML error of one file.

## Surface

- Added: lint error `<document> frontmatter is not valid YAML at line <line>: <message>` and `Task in <file> frontmatter is not valid YAML at line <line>: <message>`.

## Decisions

- ADR 004: the OpenSpec validator run is untouched.
- ADR 005: the validator peer range is untouched.

## Assumptions

- The message is the `yaml` package's own error message without its position, read through `parseDocument` with a `LineCounter` and `prettyErrors: false`. With `yaml` 2.9.1, an unquoted `title: Lint: broken` gives `Nested mappings are not allowed in compact mappings` at frontmatter line 1, which is file line 2.
- `parseDocument` reports an error exactly when `YAML.parse` throws, so lint and the other readers agree on which frontmatter is broken.
- Leaving a broken task out of the checks across tasks means a scope overlap or missing read with that task shows up only after its YAML is fixed. That is one more lint run, not a missed gate, because lint fails on the YAML error itself.
- `src/core/spec/linter.ts` and `src/core/spec/parser.ts` are on `tests/line-budget.test.ts`'s allow list, and `lintChangeFolder` is on `tests/function-budget.test.ts`'s grandfather list, so neither budget test changes.
- The test proves the scenarios with `node:test` titles, because the living spec-lint-and-approve spec holds duplicate scenario names the `scenario` helper refuses.

## Contract

### Requirement: Frontmatter YAML errors

See `specs/spec-lint-and-approve/spec.md`.

### Requirement: Change document frontmatter YAML error

See `specs/spec-lint-and-approve/spec.md`.

### Requirement: Task frontmatter YAML error

See `specs/spec-lint-and-approve/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/spec-lint-and-approve/spec.md`: ADDED "Frontmatter YAML errors" (scenario "Other readers of frontmatter that does not parse"), "Change document frontmatter YAML error" (scenario "Proposal frontmatter that does not parse") and "Task frontmatter YAML error" (scenario "Task frontmatter that does not parse").
