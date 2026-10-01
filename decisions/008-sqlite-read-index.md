---
status: accepted
applies_to: [metrics-and-reporting]
rule: SQLite is only a derived read index of osq's files; deleting it changes nothing but speed, and no state lives only in it.
checks:
  - tests/report-index.test.ts
---
# 008. SQLite read index

Date: 2026-10-01

## Status

Accepted

## Context

`osq report` rereads the event streams of every archived change on each run. After 132 those streams are a small share of the report's work, but a warm run still spends time and memory parsing JSON it has already parsed. Measured on this repository at 132, `osq report` took about 2.7 s and peaked around 265 MB; a rough index prototype brought that to about 2.15 s and 175 MB with byte-identical `--json` output.

The files stay the only source of truth. The brief offered a git-ignored path in the project or `~/.osq/`. `node:sqlite` ships with Node 24, which `package.json` already requires, so it is no new dependency. The web-inspection spec requires every `osq serve` API request to recompute its document from files and retain no cache, so the index cannot serve the web path.

## Decision

`osq report` keeps a SQLite index of the event streams of archived changes in `.osq/index.sqlite` at the project root. It creates `.osq/` and writes `.osq/.gitignore` holding `*` when the folder is missing, so git ignores the index without a change to the project's own `.gitignore`. Only `osq report` uses it; every other reader, including `osq serve`, `status`, the inbox, and the plan prompt, still reads files.

One row per archived event stream holds its absolute path, size, modification time, and the parsed events as JSON, without the `output` logs the report already drops. A `meta` table carries a schema version so a later osq replaces the layout by rebuilding. The report uses a row only when the file's size and modification time match; otherwise it reads the file and updates the row. Deleting the index, finding it corrupt, locked, outdated, or running without `node:sqlite` only means reading files, and never changes the report's output or fails the command. A corrupt index or one with another schema version is replaced.

The module is loaded with a dynamic `import` of `node:sqlite`, so a runtime without it reads files as today. The index is an option of the report function, off by default, and only the `osq report` command turns it on.

## Consequences

- A warm `osq report` is faster and uses less memory, with byte-identical output.
- The index is purely derived: deleting it changes nothing but the next run's speed, and no state lives only in it.
- A new ignored `.osq/` folder with `index.sqlite` and `.gitignore` appears in projects where `osq report` runs.
- `agents-query-osq` can expose views over the stream rows with SQLite's `json_each`.
- The report gains a failure-tolerant code path, but it never changes the report.

## Rejected

- **`~/.osq/index/<sha256(realpath(root))>.sqlite`.** A full suite run left 146 index files in the real home, because many report tests call `reportCommand` without a `home`; in the project each test writes into its own temporary folder.
- **Using the index in `osq serve`.** The web-inspection requirement "Read-only HTTP transport" says every API request recomputes its document from files and retains no cache, and `tests/serve.test.ts` checks that a request writes nothing in the project. In the prototype that test failed when `/api/report` used the index.
