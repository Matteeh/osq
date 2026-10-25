---
queue_item: rust-manual-command
queue_hash: sha256:cd1522b507bbdd905c3af50ad58eb0a4ff2ed7c0f73ddef57940dab771756555
planner: null
date: 2026-10-24
---

### Goal

`osq manual "<comment>" [paths...]` is how a human keeps a hand edit on the default branch with a record the planner sees. Rust has no `manual` command.

### Context

As of 2026-10-24:

- TypeScript: `src/cli/manual.ts`, `src/core/vcs/manual-edits.ts` and `manual-records.ts`; version-control "Manual edit keeping", "Manual edit commit" and "Manual edit record", cli-foundation "Manual command" and "Manual edits configuration".
- Rust storage reads manual edit records (`read_manual_edits`), and the plan prompt prints them.
- A new feature crate edits the root `Cargo.toml` and the CLI registry, which 326 also edits, so this waits for it.

### Requirements

- Rust `osq manual` writes the same commit, record and text as TypeScript, with its refusals, for all paths and for named paths.
- Tests use scratch repositories and compare with TypeScript's `dist`.

### Non-goals

- Manual edits inside a worktree, unless TypeScript supports them.
