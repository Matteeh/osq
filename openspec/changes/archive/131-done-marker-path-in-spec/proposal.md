---
title: The stale-build spec names the done marker the watcher really writes
depends_on: []
verify: pnpm verify
features:
  reads: []
---
## Goal

The living watcher-and-harness spec names a task's done marker as
`.run/done/<n>`, the path the watcher writes, everywhere it names one.

118 added the scenario "Source edited while a task runs" to "Stale build
preflight detection", and its THEN says `` `.run/done/1.md` exists``.
`writeDoneMarker` in `src/watcher/outcome.ts` writes `.run/done/<n>` with no
extension, and `tests/watcher-stale-every-pass.test.ts` already checks
`.run/done/1`. This change fixes the spec to match the code and the test.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, and lint. At archive it proves
the merged living spec still equals the replay of every archived delta,
through `tests/living-specs-delta-equivalence.test.ts`.

## Non-goals

- Renaming the done marker.
- Changing any code or test.

## Surface

None

## Decisions

- ADR 002: the corrected path reaches the living spec only when archive merges
  this delta, without a model.

## Contract

### Requirement: Done marker path in the stale-build spec

The living watcher-and-harness spec SHALL name a task's done marker by the path
`writeDoneMarker` writes, `.run/done/<n>`, with no extension.

#### Scenario: Source edited while a task runs
- **WHEN** this change archives
- **THEN** the scenario "Source edited while a task runs" in "Stale build preflight detection" says `` `.run/done/1` exists``, and the rest of the requirement is unchanged

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/watcher-and-harness/spec.md`: modifies "Stale build preflight
  detection". The text repeats the living requirement word for word and keeps
  all six scenarios; only `.run/done/1.md` becomes `.run/done/1`.

One task. It changes no file; its `verify` runs the test that already checks
the real path, so it starts green.
