---
title: A human keeps uncommitted edits as a manual change with one comment, and osq records them for the next planner
depends_on: []
verify: pnpm verify
features:
  reads: [status-inspection, watcher-and-harness]
---
## Goal

When `osq approve` or `osq land` stops on uncommitted edits in the human's
checkout, the human keeps them with one command and a comment:
`osq manual "<why>"`. osq commits them as a manual change, writes a record of
what they touched, and the stopped command can run again. `osq query` lists
the records, and the next plan prompt names the ones whose capabilities no
change has written since, so the planner can bring the specs in line. A
project that wants the old strictness sets `vcs.manualEdits: 'block'`.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, and lint.
`tests/manual-edits-config.test.ts` proves the config key,
`tests/vcs-manual-edits.test.ts` the command and its record,
`tests/manual-edits-refusals.test.ts` the approve and land advice,
`tests/query-manual-edits.test.ts` the query table, and
`tests/plan-manual-edits.test.ts` the plan prompt section.

## Non-goals

- Edits made during a run inside a change's worktree; today's halt and
  `osq retry` stay.
- Detecting commits made straight to the default branch without osq.
- Editing specs automatically, or queueing a follow-up item.
- A dashboard or phone button, and forwarding `osq manual` to a server.
- `osq sync`'s own worktree dirt check.

## Surface

- Added: `osq manual <comment> [paths...]` (command), in the Everyday help group.
- Added: `vcs.manualEdits` (config key), `'keep'` or `'block'`, unset means `keep`.
- Added: `openspec/manual/<stamp>.md` record files.
- Added: `manual_edits` query table.
- Added: `## Manual edits` plan prompt section.
- Changed: the `osq approve` dirty-scope refusal and the `osq land` uncommitted-files stop name `osq manual` unless `vcs.manualEdits` is `block`.

## Decisions

- ADR 001: `vcs.manualEdits` is read through the existing jiti config loader; nothing new loads config.
- ADR 004: unchanged; nothing here runs the OpenSpec validator.
- ADR 005: unchanged; nothing here checks the validator range.
- ADR 008: `manual_edits` is built from the record files on every `osq query` and stored nowhere.
- ADR 010: unchanged; the validator does not read manual edits.
- ADR 012: unchanged; the watch service is not involved.
- ADR 015: unchanged; no MCP tool changes.
- ADR 018: unchanged; the steering planner's prompt is not changed.
- ADR 019: unchanged; a tapped planner gets the same opening prompt, section included.

## Assumptions

- The plan prompt is written before the change has a delta or scope, so the section lists every record with an open capability and the planner judges relevance; a capability closes when any archived change whose delta wrote it archived after the record.
- Without named paths, untracked files are left out and listed, so stray drafts are never committed by accident; naming a path keeps it.
- Edits under `openspec/changes/` are never kept, because they belong to a change's own planning flow.
- Keeping an edit to a file the land also writes moves the default branch, so the next `osq land` merges it into the change's branch first; when both edited the same lines, that merge stops as a code conflict today, and `osq plan <id>` follows as usual.
- `osq manual` commits on the checkout's current branch with the human's git identity, which is a write the human runs (ADR 003).
- `osq manual` is in neither the forwarded nor the local-only set, so it runs on the local checkout even with `OSQ_SERVER` set, as `osq mcp` does.

## Contract

### Requirement: Keep manual edits

A human SHALL be able to keep uncommitted checkout edits as one commit with a
comment and a record, unless `vcs.manualEdits` is `block`.

#### Scenario: Keep a config edit
- **WHEN** the checkout has an edited tracked `osq.config.ts` and `osq manual "raise the verify timeout"` runs
- **THEN** HEAD is a commit `osq: manual raise the verify timeout` holding `osq.config.ts` and a record under `openspec/manual/` naming `cli-foundation`

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/version-control/spec.md`: adds "Manual edit keeping", "Manual edit commit" and "Manual edit record"; modifies "Land from the verified tree".
- `specs/cli-foundation/spec.md`: adds "Manual edits configuration" and "Manual command"; modifies "Grouped root help".
- `specs/spec-lint-and-approve/spec.md`: modifies "Approval refusals under version control".
- `specs/metrics-and-reporting/spec.md`: adds "Manual edits query table", "Manual edits in the plan prompt" and "Manual edits section text"; modifies "Recertification query table".

Five tasks, in order. Task 1 adds the config key. Task 2 adds the record
format, `keepManualEdits` and the command; tasks 3, 4 and 5 read its
`src/core/vcs/manual-edits.ts` and `src/core/vcs/manual-records.ts` without
changing them. No file is shared between tasks.

## Background

**Line budgets.** `src/core/foundation/config.ts` is at 249 of 250 lines, so
the key lives in the `vcs` block that `config-vcs.ts` resolves. `src/cli/plan.ts`
is at 248 and `src/core/vcs/land.ts` at 249; tasks 3 and 5 must keep them
within 250.

**Scenario helper.** None of the capabilities written here is in
`traceability.capabilities`, and several hold duplicate scenario names, so the
tests use plain `node:test` blocks named after the scenarios.

**Measured on 2026-10-15** in a scratch worktree at 218e43f9, with stubs for
the command, its help group, both new messages and the new table. Exactly
eight tests in seven files broke: `tests/help-groups.test.ts`,
`tests/approve-worktree.test.ts`, `tests/vcs-land-commit.test.ts`,
`tests/query-command.test.ts`, `tests/query-trial-tables.test.ts`,
`tests/query-recertifications.test.ts` and `tests/query-tables.test.ts`. Each
is in the scope of the task that changes what it pins, with `tests.modify: true`.
