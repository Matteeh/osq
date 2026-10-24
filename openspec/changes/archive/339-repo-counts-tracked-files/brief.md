---
queue_item: repo-counts-tracked-files
queue_hash: sha256:d6887597cae2b7a07ae87f3cac436387c8a734e3df7a2ce04a6d879b8965df5b
planner: null
date: 2026-10-24
---

### Goal

Before each task the watcher measures the repository's size (`repoFiles`, `repoLines`). It walks the whole worktree and reads every file to count its lines, skipping only a fixed list of folders that lacks `target/`. Each Rust worktree holds 13 to 20 GB of Cargo build output, so on 2026-10-24 three task starts kept the watcher at 100% CPU for minutes before any executor ran. Count what the repository is, the files git tracks, and read each file's content only once.

### Context

As of 2026-10-24:

- TypeScript: `gatherRepoCounts` in `src/watcher/measures.ts` walks the folder with `IGNORED_DIRS` from `src/core/spec/import-graph.ts` and reads every file whole, binary files included, before it drops those holding a NUL byte.
- `git ls-files` lists this repository's 12,702 tracked files in a few milliseconds, and `git ls-files -s` gives each one's blob hash without reading it. Reading all of them still takes about 4.5 seconds, mostly the archive.
- ADR 008: the SQLite read index is derived only from files, and deleting it changes nothing but speed. A blob hash names exact content, so a line count keyed by it never goes stale.
- ADR 017: language-specific rules sit behind the languages adapter, so the fix should not hard-code a Rust folder.
- Finished worktrees keep their build output: 309, 312, 314 and 315 still hold about 17 GB under `target/`. Rust `land` removes worktrees since 328; TypeScript `land` does not.

### Requirements

- `repoFiles` counts the files git tracks in the tree the task runs in, and `repoLines` their lines, counting text files only as today.
- Line counts are cached in the read index keyed by blob hash, so a task start reads only blobs the index has not seen. Deleting the index gives the same counts, only slower.
- A tree that is not a git repository falls back to today's walk.
- Tests cover a worktree with a large ignored build folder, a changed file, a deleted index and a folder with no git.

### Non-goals

- Removing finished worktrees in TypeScript `land`.
- Other measures, such as scope counts and import fan-in.
