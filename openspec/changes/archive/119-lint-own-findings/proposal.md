---
title: osq lint prints the change's own findings and counts the rest
depends_on: []
verify: pnpm verify
features:
  reads:
    - status-inspection
---
## Goal

`osq lint 114` on 2026-09-29 printed 250 `repository:` warnings, nearly all
the OpenSpec validator's "Requirement text is very long" on living specs. The
change's own findings were 3 lines at the end. Planners run `osq lint`
several times per change, and every run puts all of those lines into their
context.

After this change, `osq lint <id>` prints the change's own findings and one
count line for the repository findings. `osq lint --repository` prints them
in full, as `osq lint` does today.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. A new test lints a change
next to a living spec with long requirements, and checks the count line, the
full list under `--repository`, the JSON document, and the exit code.

## Non-goals

- Changing which findings exist, or their severity.
- Shortening the living specs to clear the validator warning.
- Changing `--json`, which still carries every repository finding.

## Surface

- Added: `osq lint --repository` (flag)
- Changed: `osq lint` prints `repository: <n> findings about other changes and living specs; osq lint --repository lists them` in place of the repository findings

## Decisions

- ADR 001: unchanged; `osq lint` still loads `osq.config.ts` through `loadConfig`.
- ADR 004: unchanged; the validator runs with the same flags, and only the printing of its repository findings changes.
- ADR 005: unchanged; a validator outside the peer range still fails lint the same way.

## Background

**Where it prints.** `lintCommand` in `src/cli/lint.ts` prints each change's
findings through `printChangeFindings`, then deduplicates every change's
repository findings with `dedupeFindings` and prints them through
`printRepositoryFindings` in `src/core/spec/lint-output.ts`, under
`REPOSITORY_HEADER`. The count line counts the deduplicated findings, so it
matches the number of lines `--repository` prints.

**Measured fallout.** Only `tests/lint-output.test.ts` reads the repository
group from `osq lint`'s text output. Its test "prints one repository finding
once after two changes and never exits" expects the header and the finding
line, so it now passes `repository: true`. Its "prints no repository header"
test still passes, because no findings still print nothing. The other lint
tests read `result.repository` from the linter, which doesn't change. No
other code calls `lintCommand`. Found by searching the tests for the header
text, the `repository:` prefix, and `lintCommand` callers, not by a scratch
run.

## Contract

### Requirement: Repository findings counted
`osq lint` SHALL print one count line in place of the repository findings,
unless `--repository` is passed.

#### Scenario: Long living requirement
- **WHEN** `osq lint 001` runs next to a living spec with one long requirement
- **THEN** it prints `001: valid`, then `repository: 1 finding about other changes and living specs; osq lint --repository lists them`, and exits 0

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/spec-lint-and-approve/spec.md`: modifies "Repository lint output".
- `specs/cli-foundation/spec.md`: adds "Lint repository flag".

One task.
