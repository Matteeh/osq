---
queue_item: agents-query-osq
queue_hash: sha256:1728995686b806c57952c99ac441e374fed903c62c6e76292d8eb561f52e5ad4
planner: null
date: 2026-10-01
---

### Goal

A planner or executor that needs a fact from osq's history, such as which tasks died of `scope_violation` in a capability, or what the last five changes to a requirement did, gets it from one osq command as a few rows instead of opening event files.

### Context

As of 2026-10-01:

- A planner today gets history from the plan prompt's "This repository's record" and "Recent executor disclosures", and otherwise opens files under `openspec/changes/archive/`. The archive holds 109 MB of event data.
- `sqlite-read-index` builds the index this command reads.
- The Notion page "SQLite read index" proposes access through osq rather than the raw database file: no `sqlite3` program needed, the layout stays free to change, and it fits ADR 006 (osq does the data work, AI the judgement).
- `PLANNER.md` and the executor protocol in `AGENTS.md` are managed blocks that `osq init` writes into consumer projects, and tests pin their text.

### Requirements

- `osq query "<select>"` runs one read-only SQL `SELECT` against a fixed set of documented views and prints the rows as a table, or as JSON with `--json`. Any statement that would write, and any table that isn't one of those views, is refused with a message that lists the views.
- The views cover changes, tasks and attempts with their outcomes and dead reasons, requirements touched per change, and executor disclosures. Their column names are documented in a living spec, and the index's base tables can change without changing them.
- The query builds or refreshes the index first, so its answer always matches the files.
- `PLANNER.md` and the executor protocol name `osq query` as the way to look up history, and say not to open event files for it.
- Output never holds verify logs, tool summaries, or absolute paths.

### Non-goals

- Network access to the index, or any server endpoint. The dashboard and the server (M3) can use the views later.
- Writing through `osq query`.
- Replacing the plan prompt's record sections.

### Verify

`pnpm verify`, plus tests:

- a select over each view returns the expected rows for a fixture archive
- an `INSERT`, `UPDATE`, `DELETE`, `ATTACH` or `PRAGMA`, and a select from a base table, are refused and exit non-zero
- `--json` and table output hold the same rows
- the managed blocks name `osq query`

### Notes for planning

- Check `node:sqlite`'s read-only open mode and authorizer support before relying on either for the refusal; a statement allowlist checked by osq is the fallback.
