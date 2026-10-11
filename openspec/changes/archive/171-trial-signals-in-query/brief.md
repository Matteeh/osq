---
queue_item: trial-signals-in-query
queue_hash: sha256:7042b68586e92b6e797ed9ccc0090f517498996d351fa4a17ad0ced0d2c283b7
planner: null
date: 2026-10-10
---

### Goal

The two observe-only trials produce data, osq notices when they don't, and their block-or-drop decisions can be made from `osq query` on the dates ADR 010 and ADR 011 set.

### Context

As of 2026-10-10:

- The validator (ADR 010, `src/watcher/validator.ts`) ran at every archive from 150 to 165 and recorded `failed` every time, with no findings. Each run's `.run/events/validator.jsonl` holds `API Error: 400 Claude Code 2.1.278 does not support this model; version 2.1.280 or newer is required`. The executor harness is checked by `osq doctor`'s `harness-version`, but the validator's harness is not, and nothing tells the human that every run fails.
- ADR 010 decides after 15 `validated` changes or on 2026-11-15, and drops the role if more than one run in five is `failed`, `timed_out` or `unreadable`. With today's record it would be dropped without ever having judged a change.
- ADR 011's traceability trial counts changes that print a traceability lint finding or record `focused_ran` or `mutation_ran`. No change since 154 has, so it has no data either. It decides after 8 trial changes or on 2026-12-15.
- `osq query` has six tables in `src/core/report/query-tables.ts`: `changes`, `requirements`, `tasks`, `dead_attempts`, `disclosures` and `notices`. Validator findings, focused runs and mutation picks are only in event files and in `osq report`'s sections (`report-validation.ts`, `report-mutation.ts`).
- Both ADRs say a human labels each finding true or false by reading the code. Nothing records the labels.

### Requirements

- `osq doctor` checks the validator's harness and version the way it checks the executor's, when the validator is on.
- When the validator's last few runs all failed the same way, the inbox and `osq status` say so once, with the error, until a run succeeds. The archive still never waits on it.
- `osq query` gains tables for validator runs and findings, and for focused runs and mutation picks, one row per item, from the archived files.
- A human can label a validator finding or a mutation survivor true or false with a command, stored in a committed file outside the archive, and the query tables show the label.
- `osq query` alone lists the new tables, as it does today.

### Non-goals

- Deciding either trial. The decisions stay with the human on the ADRs' dates.
- Changing what the validator judges or how traceability links.

### Notes for planning

- The archive must not be edited (ADR 003), so labels live elsewhere: one file per trial under `openspec/` or `decisions/` is a candidate. ADR 008 forbids keeping them only in the SQLite index.
- Check where a traceability lint finding at approval is recorded, if at all, before deciding its table.
- Run `claude update` before planning, so the trial can start producing data while this change is planned.
