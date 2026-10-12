---
queue_item: gitattributes-scaffold
queue_hash: sha256:0e54f4e7daaa59d0d4970ef46edf977531d08d94e4a6bb0c7fb20f2946fa974e
planner: null
date: 2026-10-11
---

### Goal

A project osq initializes stores text files with LF in the index, so the CRLF that 174's `git-line-endings` warning reports never gets committed again, and `git add --renormalize .` has the attribute it needs to convert existing files.

### Context

As of 2026-10-11:

- `osq init` writes no `.gitattributes`. Only osq's own repository has one, written by hand (`* text=auto eol=lf`, then `*.md`, `*.ts` and `*.json` lines).
- Tested on 2026-10-11 with git: under `* text=auto` alone, a committed CRLF file does not show as modified, and `git add --renormalize .` converts it to LF. Lines in `.gitattributes` starting with `#` are comments, so `# OSQ:...` markers work there; the existing `<!-- OSQ:START -->` markers do not.
- `src/core/foundation/rules-block.ts` is the model: its own markers, a write function, and a check.
- A prototype measured: only `tests/function-budget.test.ts` broke, because `scaffoldProject` grew from 79 to 83 lines. README's "What it puts in your repo" block takes a new line without breaking `tests/architecture-first-docs.test.ts`, `pi-default-docs` or `harness-defaults-docs`.

### Requirements

- `osq init` keeps one block in `.gitattributes`: `# OSQ:GITATTRIBUTES:START`, `* text=auto`, `# OSQ:GITATTRIBUTES:END`. It creates the file if missing, puts the block at the top of an existing file (later lines win in git, so the project's own rules override it), replaces a stale block in place, and leaves a current one alone. It prints `updated  .gitattributes (line endings)` when it changed the file.
- With `vcs.enabled`, `osq doctor` adds a passing `gitattributes` warning naming `osq init` when the file or its current block is missing.
- osq's own `.gitattributes` gets the block, and README's file list gains the line.

### Non-goals

- `eol=lf` in the block. It would force LF working trees on every consumer, including Windows; that choice stays with the project.
- Running git to renormalize or commit anything.

### Notes for planning

- Keep `scaffoldProject` at or under 80 lines; move the managed-block writes into a helper.
- The doctor warning goes in `vcsWarnings` in `src/core/vcs/doctor-git.ts`, which 174 changes. Plan after 174 lands.
