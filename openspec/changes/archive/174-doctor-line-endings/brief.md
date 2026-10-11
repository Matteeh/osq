---
queue_item: doctor-line-endings
queue_hash: sha256:4c6d3eb51315063d90f47f39ae849077bb023e5779cc40d00999e7ac31f34b8f
planner: null
date: 2026-10-11
---

### Goal

A repository whose committed files have CRLF or mixed line endings gets a doctor warning before a fresh worktree trips over them.

### Context

As of 2026-10-10:

- On 2026-09-28, 108 halted with `worktree_dirty` before any task ran: `biome.json` and `fixture/AGENTS.md` had one CRLF line each since the first commit while `.gitattributes` said `eol=lf`, and a fresh worktree reported them modified. It was fixed on main with `git add --renormalize`.
- `checkGit` in `src/core/vcs/doctor-git.ts` adds `vcs-prepare`, `git-hooks` and `git-signing` warnings when `vcs.enabled` is on.
- `git ls-files --eol` prints each file's index line ending as `i/lf`, `i/crlf`, `i/mixed`, `i/none` or `i/-text`.

### Requirements

- With `vcs.enabled`, `osq doctor` warns when any tracked file's index line ending is `i/crlf` or `i/mixed`, naming up to a configured number of files and the count, and suggesting `git add --renormalize .`.
- No warning when every text file is `i/lf`, and nothing changes without `vcs.enabled`.
- The git read goes through the `Vcs` port and is bounded like every read.

### Non-goals

- Fixing the files. osq never rewrites them.

### Notes for planning

- Binary files report `i/-text`; leave them out.
