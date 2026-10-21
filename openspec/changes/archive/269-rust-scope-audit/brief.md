---
queue_item: rust-scope-audit
queue_hash: sha256:94325b17dbcb224e7e0fccba269d6d116b7ed48a4d372c64ddab9a0d2477ef9c
planner: null
date: 2026-10-21
---

### Goal

The run feature must kill a task that writes outside its scope or changes a frozen test. That decision is pure, so it belongs in core, where the run feature and the scheduler can share it.

### Context

As of 2026-10-21:

- TypeScript decides in `scopeCoversPath` and `scopeCoversChangedPath` in `src/core/run/scope.ts`, with the lockfile rule from 235 (`lockfileFollowsManifest`) and the gated test rule from 201 (`tests.modify`).
- `scope_files` in the loop kernel resolves globs against the tree (237); core does no IO.

### Requirements

- A pure core function takes a task's scope patterns, its `tests.modify`, the result file path, the manifests in scope, the language test-path rules and the changed paths, and gives each disallowed path with its reason, matching TypeScript on the same inputs.
- Table tests cover a glob, a lockfile beside a scoped manifest, a frozen test, a new test and the result file.

### Non-goals

- Reading git status or the tree; the caller passes the changed paths.
