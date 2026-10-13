---
title: Words a project bans from its source are config, and lint checks plans against them
depends_on: []
verify: pnpm verify
features:
  reads: []
---
## Goal

A word a project bans from its code, such as osq's ban on one word in `src/`,
lives in config as `bannedWords`, where `osq lint` and the test that enforces
it both read it. When a task's `scope` reaches the paths a ban covers, lint
warns about each code span, fenced code line or scenario quote in the change's
task files and delta specs that holds the word, so a plan that would make an
executor write it is caught at lint, not when a task dies on the frozen test.
149 task 4 died `blocked` that way. The managed planner block tells planners
where the bans are listed.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, and lint.
`tests/banned-words-config.test.ts` proves the config key.
`tests/banned-word-lint.test.ts` proves the warning through `osq lint`.
`tests/own-banned-words.test.ts` and `tests/no-skipped-in-src.test.ts` prove
osq's own ban comes from `osq.config.ts` and holds. `tests/banned-words-blocks.test.ts`
proves the managed planner block and this repository's copies.

## Non-goals

- Blocking. The finding is a warning; see Background for why.
- Checking prose. A word outside a code span, fenced block or scenario quote
  stays legal, and so does `proposal.md`.
- Checking code. The project's own test still enforces the ban on the tree;
  lint only reads plans.
- Changing the living requirement "Pinned OpenSpec validator failure gating",
  whose scenario still states osq's ban with a grep.
- Showing `bannedWords` in the `osq.config.ts` that `osq init` writes.

## Surface

- Added: `bannedWords` (config key), a list of `{ word, paths }` entries, default `[]`.
- Added: lint warning `Banned word "<word>" in "<text>": bannedWords[<index>] bans it in <paths>; name it another way`.
- Changed: the managed `PLANNER.md` block gains one bullet under "Tasks" about `bannedWords` (document section).

## Decisions

- ADR 001: `bannedWords` is read from `osq.config.ts` through the existing jiti loader; nothing new loads config.
- ADR 004: unchanged; the warning runs inside osq's own lint, not the OpenSpec validator.
- ADR 005: unchanged; nothing here checks the validator range.
- ADR 010: unchanged; the validator does not read `bannedWords`.
- ADR 012: unchanged; nothing here touches the watch service.
- ADR 015: unchanged; no MCP tool changes.

## Assumptions

- A warning is enough: planners fix every lint finding before handing off, and an error would refuse a plan that removes a banned word or quotes the ban itself, which the archive shows happen.
- A word matches case-insensitively anywhere inside a token, the way `tests/no-skipped-in-src.test.ts` matches it, so a code span naming an identifier that contains the word is flagged too.
- A token holding `/` that the ban's paths do not cover reads as a path outside the ban and is ignored, so naming the ban's own test file does not warn.
- The human's checkout holds uncommitted edits to `osq.config.ts` (quote style, `queue.maxPlanningSessions`); task 3 edits that file, so `osq land 188` stops and asks to commit or stash them first.

## Contract

### Requirement: Banned words

A project SHALL list the words it bans from its code in `bannedWords`, each
with the path globs it covers, and lint SHALL warn when a plan whose task
`scope` reaches those paths holds a banned word in code.

#### Scenario: A plan that would write a banned word
- **WHEN** `bannedWords` bans `legacy` in `src/**` and a task scoping `src/a.ts` has `` `legacyMode` `` in its file
- **THEN** `osq lint` warns, naming the word and `bannedWords[0]`, and the change stays valid

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: adds "Banned words configuration" and
  "Banned words in the planner block".
- `specs/spec-lint-and-approve/spec.md`: adds "Banned word warning" and
  "Banned word warning text".

Four tasks, in order. Task 1 adds the config key. Task 2 adds the lint and
reads task 1's `config-banned-words.ts` without changing it. Task 3 sets osq's
own ban and makes the ban test read it. Task 4 adds the planner block bullet.
No file is shared between tasks.

## Background

**Measured on 2026-10-13** in a scratch worktree at 186 with a rough version of
all four tasks.

Run against all 186 archived change folders with osq's ban, the prototype
warned on six. Two are real: 149's plan as first approved (fenced
`ValidatorOutcome` code and `Validation:` output holding the word, the death
the brief names) and 082/115, whose status-inspection scenario made an
executor spell the word around the test in `show-run-lines.ts`. Four are not:
028 removed the word from `src/` and had to name it; 051 and 115 carry the
spec-lint-and-approve scenario that states the ban; 149 as finally archived
says "in place of" the word. An error would have refused all four, and the
next ban added will hit the first kind again, so the finding is a warning.

Before the path rule, eight more warnings came from code spans naming
`tests/no-skipped-in-src.test.ts`; ignoring path tokens outside the ban's
paths removes all of them.

**Line budget.** `src/core/foundation/config.ts` is at 248 of 250 lines.
Collapsing the `opencode` default onto one line makes room for the four lines
the key needs.

**Scenario helper.** Living cli-foundation and spec-lint-and-approve hold
duplicate scenario names, so `scenario('<capability>', ...)` throws for them.
The tests use plain `node:test` blocks named after the scenarios; neither
capability is in `traceability.capabilities`.

**This plan's own wording.** Tasks 1, 2 and 4 scope files under `src/`, so
once osq bans its word, their files and the delta specs name it only in prose.
The delta scenarios use `legacy` as the example word.
