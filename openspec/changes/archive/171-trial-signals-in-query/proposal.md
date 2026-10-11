---
title: The validator and traceability trials record signals osq can measure
depends_on: []
verify: pnpm verify
features:
  reads: [traceability, watcher-and-harness, version-control]
---
## Goal

Two observe-only trials should be producing data, and neither is. The
validator (ADR 010) recorded `failed` at every archive from 150 to 170
because the installed Claude Code is too old for its model. Nothing told the
human, and `osq doctor` never checks the validator's harness. The
traceability trial (ADR 011) has recorded no change since 154. Its link
findings are printed at lint and then lost. Validator findings, focused runs
and mutation picks are kept only in event files. Both ADRs need a human to
label each finding true or false, and nothing stores those labels.

With this change, `osq doctor` checks the validator's harness the way it
checks the executor's. `osq status` and the inbox say when the validator's
latest runs failed, with the error, until a run succeeds. A clean
`osq lint <id>` records the change's traceability link findings. `osq query`
gains six tables for validator runs and findings, focused runs, mutation
picks, survivors and link findings, one row per item, from the archived
files. `osq label <id> <true|false>` stores a human's label in a committed
file per trial, and the query tables show it. On the ADRs' dates, the human
decides from `osq query`.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test (the new doctor, plan-ready,
query, inbox and label tests, plus the query and help tests that pin today's
table list and command groups), and lint, on the final tree.

## Non-goals

- Deciding either trial. The decisions stay with the human on the ADRs' dates.
- Changing what the validator judges, how traceability links, or when either runs.
- Making the archive wait on the validator. The failing line is a notice, not a gate.
- Raising osq's Claude Code minimum. The validator's model needs a newer Claude
  Code than osq's executor floor; the failing line shows that error.
- Labels from the dashboard or over MCP. `osq label` is local only.
- Rows for changes that are not archived.

## Surface

- Added: `osq label <id> <true|false>` (command, Inspection group, local only)
- Added: `openspec/trials/validator.json` and `openspec/trials/traceability.json` (committed label files)
- Added: `osq query` tables `validator_runs`, `validator_findings`, `focused_runs`, `mutation_picks`, `mutation_survivors`, `link_findings`
- Added: `validator-harness` and `validator-<check>` lines in `osq doctor`, such as `validator-harness-version`
- Added: `validator-failing` inbox kind with `validatorFailing: { outcome, runs, error }` (needs-you item)
- Added: `Validator <outcome> <runs>× in a row, last on <id>: <error> — osq show <id>` line in `osq status`
- Added: `validator failing` label on the dashboard's needs-you group
- Added: `traceability` key in `plan_ready` record data (`.run/plan.jsonl`)

## Decisions

- ADR 001: no change to config loading.
- ADR 004: the OpenSpec `validator` doctor check keeps its name and behavior; the new checks are named `validator-harness` and `validator-<check>`.
- ADR 005: unchanged; no OpenSpec version check moves.
- ADR 008: the label files and archived change files are the only sources; the six tables are built per call like the others, and the SQLite index stores no label.
- ADR 010: the validator runs and records exactly as before; doctor, the failing line and the tables only read what it recorded, and the archive never waits on them.
- ADR 012: the watch service is not touched.
- ADR 013: the dashboard only gains a label for the new inbox kind; no write path changes.
- ADR 015: `osq mcp` gains no tool; labelling is a human's call.

## Assumptions

- One failed run is enough to raise the failing line. A higher threshold would need a config key, and with one validator run per archive, a single failure already costs the trial a data point.
- Link findings come from the last `plan_ready` record, which the last clean `osq lint <id>` wrote, not from `osq approve`'s own lint pass. Both lint the same folder hash. Changes archived before 171 have no recorded link findings, so ADR 011's link signal starts with changes linted after 171 lands.
- Item ids are positions in archived, append-only files, so an id never changes once its change is archived.
- `osq label` writes only the label file in the checkout, and the human commits it, as with `openspec/queue.md`.
- New files sit beside their capability's existing files in `src/core/report`, `src/core/status` and `src/cli`, because no capability has moved into a slice yet (ADR 016).
- The doctor check reuses the catalog's version floor, which is 2.1.278 for Claude Code. That passes the installed 2.1.278 even though the validator's model needs a newer Claude Code, so the human step below fixes today's failures.

## Contract

The cli-foundation, spec-lint-and-approve, metrics-and-reporting,
status-inspection and web-inspection deltas below are the contract.

## Human steps

### Before approval

- Run `claude update`. `claude --version` prints 2.1.278, and every validator run since 150 failed with `unrecognized_model` for `claude-opus-5-5`. Without the update, 171's own archive records one more failed run.

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: ADDED "Validator harness doctor checks".
- `specs/spec-lint-and-approve/spec.md`: ADDED "Traceability findings in plan ready records".
- `specs/metrics-and-reporting/spec.md`: ADDED "Trial query tables", "Trial labels", "Label command".
- `specs/status-inspection/spec.md`: ADDED "Validator failing in status and inbox"; MODIFIED "Stable inbox object".
- `specs/web-inspection/spec.md`: MODIFIED "Inbox kind labels".

`src/core/report/query-tables.ts` is shared: task 3 adds the six tables, and
task 5 then adds the label pass to its build. Task 4 reads
`src/core/report/validator-runs.ts`, which task 3 owns, without editing it.
Every other file belongs to one task.
