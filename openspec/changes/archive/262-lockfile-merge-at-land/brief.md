---
queue_item: lockfile-merge-at-land
queue_hash: sha256:b24640ccff4b383fc89191fc0b5716227302bf5c1e97c711ac7af1de722d3d77
planner: null
date: 2026-10-21
---

### Goal

Two parallel changes that each add a crate dependency both change `Cargo.lock`, so the second to land stops on a merge conflict in a file no human wrote. osq should rebuild the lockfile at land, as it already rebuilds living specs, so planners stop scoping lockfiles and those changes can run side by side.

### Context

As of 2026-10-21:

- Since 235 a task whose scope holds a manifest may change that workspace's lockfile without scoping it (`lockfileFollowsManifest` in `src/kernel/languages/lockfiles.ts`). 235 left merging lockfile conflicts at land as a non-goal.
- Planners still scope `Cargo.lock` on every task that adds a dependency, which makes the scheduler treat those changes as overlapping, so they run one at a time (243 and 244, 2026-10-21).
- `osq land` already rebuilds living specs when both sides changed them; a code conflict still stops the land.
- The languages kernel knows each language's lockfiles (`presets.ts`); Rust's is `Cargo.lock`.

### Requirements

- When the merge of a newer default branch into a change conflicts only in lockfiles osq detects, land takes the default branch's lockfile and regenerates it with the language's own offline command, then continues; any other conflict stops as today.
- The regenerated lockfile is checked by the change-level verify run that sync already does.
- Tests merge two branches that each add a dependency to a fixture Cargo workspace, with no network.

### Non-goals

- Lockfiles of package managers osq does not detect today.
- Resolving conflicts in manifests themselves.
