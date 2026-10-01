---
queue_item: docs-digest
queue_hash: sha256:f195d6c910e46ce2c110275664f14028e9d4811550dbbc6aa1005bd99fb2b17d
planner: null
date: 2026-10-01
---

### Goal

A human can ask osq what happened since a date, or what a handful of changes did, and get an answer in a minute of reading instead of an hour in git history. Every line in the digest comes from a file in an archive, so the digest can't say anything the record doesn't. No model is involved.

### Context

As of 2026-09-28:

- Each archive holds the change folder: the proposal with its `## Goal` section, `tasks.md`, the deltas per capability, and `.run/` with the approval hash, done and dead markers, `results/` and `events/`.
- `src/core/spec/delta.ts` parses deltas into requirements and their scenarios, under ADDED, MODIFIED, REMOVED and RENAMED.
- `src/core/foundation/decisions.ts` reads ADR frontmatter: status, scope and the one-line rule.
- osq records every attempt, failure and cost in the events. Recheck which events carry cost and elapsed time.
- `readLandedAt` in `src/core/web/web-data-lifecycle.ts` reads when a change archived, and change 104 made a landed change count once. On `main`, each land commit carries an `Osq-Change` trailer and the landing date.
- The `started` event has carried `harness`, `model` and `osqVersion` since change 084. Older archives lack them.
- `osq report` and `src/core/report/` exist.
- The dashboard's land view and its "landed since last look" list are meant to read this digest's JSON later, in the roadmap's second milestone.
- Source: the Notion page "Docs Digest" under DOCS FEAT. Its companions, docs-onboarding and docs-narration, aren't queued yet.

### Requirements

#### Selection

- `osq digest --since <date>`, optionally with `--until <date>`, selects the changes archived in that range, inclusive.
- `osq digest <id>...` selects changes by id. The two forms can't be combined.
- An id with no archive is an error that names it. A range with no changes produces an empty digest that says so, and exits zero.

#### What each change contributes

- its id, title and archive date
- its `## Goal` section, verbatim
- per capability, the requirements it added, modified, removed or renamed, by name
- the ADRs its proposal names, with their one-line rules
- its tasks: how many, how many attempts in total, dead attempts with their reasons, and halts that needed a human
- its elapsed time, its cost, and the models it used

#### The period

- A digest for a date range starts with totals: changes, requirements added, modified and removed, the capabilities touched most, ADRs dated inside the range, halts, time and cost.

#### Output

- Markdown by default, JSON with `--json`. The JSON gives every change, requirement and ADR a stable id, and its schema carries a version.
- `--out <file>` writes to a file. Otherwise the digest goes to stdout.
- `--no-cost` leaves out cost and models, for readers outside the team.
- The digest never includes tool summaries, verify output, the bodies of `results/`, event contents beyond the fields above, or file paths. A digest gets forwarded, and those belong in the repository.
- The same archives and arguments produce byte-identical output. Changes are ordered by archive date, then by id.

### Surface

- CLI: `osq digest`.
- The versioned JSON schema of a digest.

### Non-goals

- Prose written by a model. That's docs-narration.
- Present-state docs for onboarding. That's docs-onboarding.
- Changes that haven't archived.
- Reading git history.

### Verify

`pnpm verify`, plus tests:

- a date range selects exactly the archives dated inside it, including both ends
- selection by id returns those changes in date order, and an unknown id fails naming it
- every field above appears for a fixture archive, and a change with a dead task shows its reason
- a delta with ADDED, MODIFIED, REMOVED and RENAMED requirements lists each under the right heading
- `--no-cost` output contains no cost and no model
- no output contains an absolute path, a tool summary or verify output
- two runs give byte-identical Markdown and JSON
- an empty range says so and exits zero

### Notes for planning

- Put the archive reader in its own module. docs-onboarding reuses it for a capability's recent changes.
- Reuse `delta.ts` and the ADR reader rather than parsing again.
- Older archives may lack fields. Show what exists and mark the rest as not recorded, rather than failing.
- osq's own archive is the first real input.
