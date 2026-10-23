---
queue_item: rust-show
queue_hash: sha256:80dee4f20fe78c9774bf8082ff1e14e65fb9b437c76a6ced36b8df9b89ff1789
planner: null
date: 2026-10-22
---

### Goal

`osq show <id>` is the command a human runs most after the inbox, and Rust lacks it. The show feature should print one change's details with TypeScript's text.

### Context

As of 2026-10-22:

- TypeScript builds the text in `getSpecDetails` and `formatShowText` in `src/core/status/show.ts`, called from `src/cli/show.ts`.
- The storage kernel's `read_change` gives the snapshot; 270 gives the inbox the tree listing with vcs on.
- `rust-feature-scaffolds` gives an empty `osq-feature-show` crate.

### Requirements

- `osq show <id>` in Rust prints the same text as TypeScript for active, approved, running, dead, archived and rejected changes of a fixture, with vcs off.
- Unknown or missing ids give TypeScript's error text.
- Goldens are printed by TypeScript's built `dist` from the fixture and committed in the change folder.

### Non-goals

- `--json`, and the worktree and landed lines that need vcs on.
