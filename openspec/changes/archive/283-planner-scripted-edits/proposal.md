---
title: The planner rule bans shell-written file contents, not scripted edits that lint checks
depends_on: []
verify: pnpm verify
features:
  reads:
    - spec-lint-and-approve
    - status-inspection
    - watcher-and-harness
---
## Goal

The planner rule "Write files with the file tool, never through a shell echo."
bans every scripted write. It came from 029, when task files written through a
shell echo held control characters and fused acceptance lines. 029 also made
`osq lint` and `osq approve` reject exactly that damage, so lint now guards the
result whatever wrote it. The rule adds friction without adding safety: 273's
planner narrowed the scopes of two task files with a script, broke the rule,
and lint passed on the text it meant.

The rule now bans writing file contents through a shell echo or heredoc, and
allows a script to make mechanical edits that `osq lint` checks.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, and lint.
`tests/planner-scripted-edits.test.ts` proves the managed block, `PLANNER.md`
and `templates/PLANNER.md` carry the new rule and no longer carry the old one.

## Non-goals

- Changing what `osq lint` checks.
- An osq command that edits scopes. A scope inspector that shows facts is an
  idea on Notion, not queued.

## Surface

- Changed: the file tool bullet under `### Either way` in the managed planner block, `PLANNER.md` and `templates/PLANNER.md` (document sections).

## Decisions

- ADR 001: unchanged; nothing here loads config.
- ADR 004: unchanged; nothing here runs the OpenSpec validator.
- ADR 005: unchanged; nothing here checks the validator range.
- ADR 010: unchanged; the validator role is untouched.
- ADR 012: unchanged; the watch service is untouched.
- ADR 015: unchanged; the MCP tools are untouched.
- ADR 018: unchanged; a steering planner still writes only its change folder and osq lints its plan.
- ADR 019: unchanged; a tapped planner still writes only its change folder and osq lints its plan.
- ADR 021: unchanged; autopilot is untouched.

## Assumptions

- The new bullet stays one line, like the bullet before it, so the tests that look for the exact sentence find it.
- The 2026-10-22 manual edit to cli-foundation raised `verifyTimeoutSeconds` in this repository's `osq.config.ts`; no cli-foundation requirement states that value, so this change brings no spec text in line with it.

## Contract

### Requirement: Planner file tool protocol instruction

The managed planner block SHALL ban writing file contents through a shell echo
or heredoc, and SHALL allow a script to make mechanical edits whose result
`osq lint` checks.

#### Scenario: Managed block includes file tool instruction
- **WHEN** `PLANNER.md` or `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** the text contains `Write file contents with the file tool, never through a shell echo or heredoc.` and `A script may make mechanical edits, such as one scope change across several task files;`

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: MODIFIED "Planner file tool protocol instruction", with its scenario's new text.

No file is shared between tasks; the change has one task.
