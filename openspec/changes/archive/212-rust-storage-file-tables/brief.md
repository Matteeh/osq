---
queue_item: rust-storage-file-tables
queue_hash: sha256:a78cf207d2b9ff022b3182a9fe0873242cde39391205453982fe5c6784552abc
planner: null
date: 2026-10-18
---

### Goal

The Rust read model holds the three `osq query` tables TypeScript builds from result files, task frontmatter and manual-edit records, with rows equal to TypeScript's, so only `requirements` is left for the specs kernel.

### Context

As of 2026-10-18:

- `disclosures(change, task, section, text)`, 691 rows, comes from the `## Deviated`, `## Missing context`, `## Outside scope`, `## Blocked` and `## Next` sections of `.run/results/<n>.md` (`src/core/report/result-sections.ts`).
- `task_outcomes(change, task, capability, scope_globs, scope_files, verify_kind, tests_modify, verify_starts, shares_scope, position, attempts, first_attempt, dead_reason, files_touched)`, 717 rows, comes from task frontmatter, events and `measures` (`query-task-outcomes.ts`).
- `manual_edits(kept_at, record, comment, paths, capabilities)`, 0 rows, comes from the records `osq manual` writes (`query-manual-edits.ts`).

### Requirements

- Storage builds the three tables with TypeScript's column names and types. Reading a result file's sections is a heading split, not a Markdown parser, and task frontmatter is read with the fields the table needs.
- A golden test compares their rows for archived changes 014 to 209 with rows from TypeScript's `osq query --json`, committed as fixtures, and `manual_edits` gets a fixture record with expected rows taken the same way.

### Non-goals

- `requirements`, which needs delta specs read by the specs kernel.
- Resolving scope globs anew; `scope_files` is read as TypeScript recorded it, if it is recorded, and the planner checks how TypeScript computes it.
