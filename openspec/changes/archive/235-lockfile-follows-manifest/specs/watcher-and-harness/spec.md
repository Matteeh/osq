## ADDED Requirements

### Requirement: Lock file follows a manifest
For "Scope violation recording" and "Verified task commit", a task's scope
SHALL also cover a changed lock file when the same task changed a manifest
its scope covers and languages `lockfileFollowsManifest` says the lock file
follows that manifest. `scopeCoversChangedPath(scope, path, changedPaths)`
SHALL judge it without reading the disk: the scope covers the path, or the
path follows one of the changed paths the scope covers. The scope violation
check passes the files changed during the task, and the verified commit
passes the paths status lists.

#### Scenario: Dependency added to a crate
- **WHEN** an agent in an osq worktree whose task scope is `crates/a/**` adds a dependency to `crates/a/Cargo.toml` and changes the root `Cargo.lock`, and the task's verify passes
- **THEN** no `scope_violation` event is recorded, the task is done, its verified commit holds `crates/a/Cargo.toml` and `Cargo.lock`, and the worktree is clean outside `.run/`

#### Scenario: Lock file without its manifest
- **WHEN** an agent in an osq worktree whose task scope is `crates/a/**` changes the root `Cargo.lock` and no manifest
- **THEN** `runTask` returns `scope_violation` and its dead marker names `Cargo.lock`

#### Scenario: Package in a pnpm workspace
- **WHEN** an agent in an osq worktree whose task scope is `packages/ui/**` changes `packages/ui/package.json` and the root `pnpm-lock.yaml`, and the task's verify passes
- **THEN** no `scope_violation` event is recorded and the task's verified commit holds both files

### Requirement: Lock file outside the scope audit
A lock file that "Lock file follows a manifest" covers SHALL NOT join the
task's resolved scope, so the done marker's scope hash, the scope audit and
recertification never see it, and a later task that changes it makes no done
task stale.

#### Scenario: Two tasks change the lock file
- **WHEN** task 1 of a two-task change in an osq worktree has scope `crates/a/**` and task 2 has scope `crates/b/**`, and each adds a dependency to its crate's `Cargo.toml` and changes the root `Cargo.lock`
- **THEN** both tasks are done, no task is regressed or stale, and the change is archived
