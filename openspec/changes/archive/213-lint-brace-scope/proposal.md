---
title: osq lint rejects a task scope entry that uses brace syntax osq's scope matcher does not support
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - languages
    - status-inspection
    - watcher-and-harness
---
## Goal

osq's scope matcher, `globToRegExp` and `isPatternEntry` in
`src/core/run/scope.ts`, supports `*`, `**`, `?` and a trailing `/`. An entry
with none of them is an exact path. A brace group such as
`tests/golden/{a,b}.json` therefore reads as one file named with braces.
Lint accepts it as a file the task may create, and the task dies of
`scope_violation` when it writes the files it meant. That is how change 211's
task 3 died on 2026-10-18.

With this change, `osq lint` refuses a `scope` or `entry` entry holding a
brace group, at plan time, with a message that names the supported syntax
and the fix.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test and lint. That includes the
new `tests/lint-brace-scope.test.ts`, which lints a temporary project once
for each row of "Brace group cases", and the existing lint tests, which keep
passing because no fixture or test task lists a brace group.

## Non-goals

- Brace expansion in the scope matcher.
- Any change to how the git guard, the scope audit or the entry check resolve paths.
- Other task frontmatter lists. `skills` holds names, not paths, and `tests` holds only `modify`.

## Surface

- Added: the lint error `Task in <n>.md scope entry "<entry>" holds a brace group, ...` and its `entry` form.

## Decisions

- ADR 004: the OpenSpec validator invocation is untouched.
- ADR 005: the peer range rule is untouched.

## Assumptions

- No active change, fixture, template or test task lists a brace group in `scope` or `entry` today. A search on 2026-10-18 found brace groups only in task body text, which lint does not read as paths.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/spec-lint-and-approve/spec.md`: ADDED "Brace group refusal".
