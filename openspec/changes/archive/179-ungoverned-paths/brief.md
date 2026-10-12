---
queue_item: ungoverned-paths
queue_hash: sha256:c9ea2e0b22b5a31cf82ffe0fa9dba4e0d6a8c8d8f25bce40a0663af6eb5559b4
planner: null
date: 2026-10-12
---

### Goal

osq governs every file in a project except the paths `osq.config.ts` lists as ungoverned, by default README, docs, license, `.gitignore` and env files. A human edits an ungoverned file directly on the default branch without a change, a task may edit one without a delta, and osq warns when a spec tries to own or pin one. Opting out keeps every new config file, lockfile or workflow governed until someone deliberately says otherwise.

### Context

As of 2026-10-11:

- A task with a file in scope that a capability's `Code ownership` `<!-- source: ... -->` globs own gets the lint warning `<path> is owned by <capability>, which has no delta in this change. Add a delta or move the file out of scope` from `writeWithoutDeltaFindings` in `src/core/spec/capability-impact.ts`. Nothing limits which paths a source may name.
- osq's own cli-foundation owns `README.md`, `AGENTS.md`, `PLANNER.md` and `.env.example`. Planning 177 (readme-software-factory), that warning led the planner to write README requirements and a README wording test, and the user called pinning README prose through osq overkill.
- 13 living-spec requirements say `README.md SHALL ...`, and 55 tests read `README.md`.

### Requirements

- A config key `ungoverned` lists path globs osq does not govern. The default is `README*`, `docs/**`, `LICENSE*`, `.gitignore` and `.env*`; a project's list in `osq.config.ts` replaces it, and `[]` governs everything. `osq init` scaffolds it commented, with the defaults. Every other path, `package.json`, lockfiles, CI workflows and config files included, stays governed.
- A file matching `ungoverned` never gets the write-without-delta warning.
- A `Code ownership` source glob that matches an ungoverned path gets a lint warning naming the capability and the glob.
- A requirement or scenario in a delta that names an ungoverned file, such as `README.md`, gets a lint warning saying ungoverned files are not pinned by specs.
- Every finding is a warning. None changes `valid`, lint's exit code, or approval.
- The managed `AGENTS.md` and `PLANNER.md` blocks and README say a human edits ungoverned files directly on the default branch, with no change, and planners never write requirements or tests that pin them.

### Non-goals

- Detecting tests that read ungoverned files.
- Changing osq's own ownership, specs or tests; that is `ungoverned-docs-cleanup`.
- Changing what an executor may write; a task's `scope` still decides, and a task may still edit an ungoverned file in scope.

### Notes for planning

- The user decided on 2026-10-11: opt out rather than opt in, `package.json` and critical config files stay governed, and "ungoverned" means both no delta needed and editable on the default branch without a change.
- Reuse the glob matching `ownerCapabilities` uses.
- `AGENTS.md` and `PLANNER.md` stay governed by default; they are agent instructions with managed blocks.
