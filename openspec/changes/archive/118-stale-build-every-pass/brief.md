---
queue_item: stale-build-every-pass
queue_hash: sha256:a30f192232021169348ab6539ad1db60de0fe80f4b6ec1a808e0fad246b23d5a
planner: null
date: 2026-09-29
---

### Goal

osq never keeps running a compiled build that is older than its own source. The watcher checks before every spawn and archive, not only when it starts. `osq land` checks before it lands, and after landing a change to osq's own source it tells the human to rebuild and restart the watcher.

### Context

As of 2026-09-29:

- `checkStaleBuild` in `src/watcher/build.ts` compares the newest mtime under the osq package root's `src/` with the newest under `dist/`. When `src/` is newer, it prints `osq build is stale: src/ is newer than dist/. Run 'npm run build' or pass --allow-stale.` and exits 1. It skips an installed package (no `src/`) and a run from TypeScript source.
- `runWatcher` in `src/watcher/loop.ts` calls it once, at start, unless `--allow-stale` or `--dev` is set. `osq land` never calls it.
- `resolveBuildInfo` caches the commit it reads at start. The banner and each done marker's `build_stamp` show that commit, even after later lands.
- Three incidents, each recorded in the Notion page "Why 112 failed to land":
  - 110 to 112 ran on a watcher started before 109 landed, so archive verified before applying deltas, and 113 was the first change to meet the new order.
  - `osq land 112` ran on a `dist/` from before 109.
  - On 2026-09-29, after `osq land 116`, the running watcher still used a `dist/` built before 116. 115 needed 116's smaller executor prompt, and it looped on `spawn E2BIG` until the human ran `pnpm build` and restarted the watcher. The banner said `8d4a454`, one commit behind main, and nothing flagged it.

### Requirements

- Before each spawn and each archive, the watcher runs the same stale check it runs at start, with the same skips and the same `--allow-stale` and `--dev` escapes.
- A stale check during a run starts nothing new. It lets a running task finish and record its outcome, then prints the stale line and exits 1. It writes no marker for any change.
- `osq land` runs the stale check before it touches git, and refuses with the stale line when stale. `osq land --allow-stale` skips it.
- After a successful land whose commit changes files under the running osq package's own `src/`, `osq land` prints one line: `osq's own source changed; run the build and restart the watcher`.
- In a consumer project, where the land commit changes nothing under the running osq package's `src/`, `osq land` prints nothing new.

### Non-goals

- Rebuilding automatically, or restarting the watcher itself.
- Changing what the banner or `build_stamp` report.
- Checking an installed osq package against its registry version.

### Notes for planning

- `checkStaleBuild` calls `process.exit`. The watcher may keep that, since the watcher-and-harness capability owns its exits. `osq land` is a command and must throw a `CommandError` with the same message, per change 111.
- The mtime walk over `src/` and `dist/` runs on every pass. Measure its cost on this repository before deciding whether to cache the newest `dist/` mtime at start and walk only `src/`.
- `tests/watcher-stale-preflight.test.ts` covers the start check. Add new tests rather than changing it unless a pinned line moves.
- "The running osq package's own `src/`" is the package root `build.ts` already resolves. Compare real paths, as `resolveBuildInfo` does, so a linked global `osq` counts as the same package.
