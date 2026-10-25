## ADDED Requirements

### Requirement: Default-branch resolution
`sync_change_taking_default(request: &SyncRequest<'_>, paths: &[String]) -> Result<SyncOutcome, SyncStop>`
in `osq-kernel-sync` SHALL sync as "Sync change" says `sync_change` does,
except where the merge conflicts: before the sync decides whether the
conflicts stop it, it SHALL resolve each conflicted path that `paths`
lists to the default branch's version, writing the file in the worktree
with the text rust-vcs `show` gives for `request.default_branch` and that
path, or removing it when the default branch has none, and staging it with
`stage`. A resolved path SHALL no longer count as conflicted: the conflict
stop, its message and its `conflicts`, and every step after the merge see
only the other conflicted paths, in the merge's order. A listed path that
does not conflict SHALL be left as the merge left it. `sync_change` SHALL
behave as `sync_change_taking_default` with no paths. A stop SHALL undo
the resolution with the rest of the merge.

#### Scenario: Conflicts resolved to the default branch
- **WHEN** a test runs `sync_change_taking_default` with `SyncKind::Archived`, `SyncOptions { records: false, verify: true, tasks: None }` and the row's paths on the sync repository of "Sync outcomes", where `main`, after the branch, gains one commit as the row says, and where, before the branch is cut, `main` gains a commit adding `src/two.txt` with `one\n`, and the branch's commit also writes `src/two.txt` with `two\n` beside `src/one.txt` with `two\n`
- **THEN** the result is the row's and the worktree's HEAD is the row's, with no merge in progress:

| `main`'s commit | Paths | Result | Worktree HEAD |
|---|---|---|---|
| writes `src/one.txt` with `main\n` | `src/one.txt` | `Ok(SyncOutcome::Synced { commit })` | `commit`, a merge whose parents are the branch's commit and `main`'s tip, whose message is the sync message, and whose tree holds `src/one.txt` with `main\n` and `src/two.txt` with `two\n` |
| removes `src/one.txt` | `src/one.txt` | `Ok(SyncOutcome::Synced { commit })` | `commit`, a merge whose tree holds no `src/one.txt` |
| writes `src/one.txt` with `main\n` | `src/other.txt` | `Err(SyncStop { reason: SyncStopReason::SyncConflict, message: "001-alpha-orders: src/one.txt conflict with main; run osq plan 001, and approving the revised plan restarts osq/001-alpha-orders from main", conflicts: ["src/one.txt"] })` | the branch's commit |
| writes `src/one.txt` and `src/two.txt` with `main\n` | `src/one.txt` | `Err(SyncStop { reason: SyncStopReason::SyncConflict, message: "001-alpha-orders: src/two.txt conflict with main; run osq plan 001, and approving the revised plan restarts osq/001-alpha-orders from main", conflicts: ["src/two.txt"] })` | the branch's commit |
| writes `src/one.txt` and `src/two.txt` with `main\n` | `src/one.txt`, `src/two.txt` | `Ok(SyncOutcome::Synced { commit })` | `commit`, a merge whose tree holds `src/one.txt` and `src/two.txt`, each with `main\n` |
