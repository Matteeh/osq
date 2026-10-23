## ADDED Requirements

### Requirement: Archive commit failure
When the "Archive commit" of a change in an osq worktree fails, the
watcher SHALL keep its `archive commit failed: <output>` warning and halt
the archived change through `haltWorktreeChange`, with reason
`commit_failed` and git's output as the detail, on the change as it now
sits in the worktree's archive directory. The archived folder then holds
`.run/regressed/change.md` with that reason and its
`.run/events/change.jsonl` ends with the `regressed` event, both
uncommitted beside the uncommitted move.

#### Scenario: Archive commit fails on a hook
- **WHEN** the last task of a change in a worktree passes and the archive commit fails on a `pre-commit` hook that prints `blocked by hook`
- **THEN** the archived folder's `.run/regressed/change.md` has reason `commit_failed` and holds `blocked by hook`, its `.run/events/change.jsonl` ends with a `regressed` event for task `change` with reason `commit_failed`, and the branch's newest commit is not `osq: <id> archived`

### Requirement: Archive commit catch-up
Each cycle, before it picks the next task, the watcher SHALL catch up on
every archived change in an osq worktree whose `.run/regressed/change.md`
has reason `commit_failed`, in numeric order, within the budget "Commit
failure catch-up" counts from its `.run/events/change.jsonl`: when the
count of `commit_failed` regressions since the last human retry is more
than `gates.commitRetries`, it SHALL leave the change alone. Otherwise it
SHALL clear the halt as `osq retry <id> change` does with
`{ automatic: true }`, then make the "Archive commit" for the archived
folder with the archived proposal's title, and log
`↻ archive of <id> committed after commit_failed`. When that commit fails,
it SHALL halt the archived change again as "Archive commit failure" says.
A change whose marker has another reason is left alone.

#### Scenario: Archive commit caught up
- **WHEN** an archive commit failed on a `pre-commit` hook, the hook is removed, and a watcher cycle runs
- **THEN** the branch's newest commit is `osq: <id> archived` with `archived to <archivePath>`, `git status` in the worktree is empty, the archived folder holds no `.run/regressed/change.md`, its `.run/regressed/change.1.md` holds `blocked by hook`, and its `.run/events/change.jsonl` ends with a `retry` event whose target is `change` and whose `automatic` is true

#### Scenario: Archive catch-up budget spent
- **WHEN** the `pre-commit` hook keeps rejecting, `gates.commitRetries` is 2, and five watcher cycles run after the first failed archive commit
- **THEN** the archived folder's `.run/events/change.jsonl` holds exactly three `regressed` events with reason `commit_failed`, and the branch's newest commit is unchanged

### Requirement: Retrying a failed archive commit
`osq retry <id> change` on an archived change in an osq worktree whose
`.run/regressed/change.md` has reason `commit_failed` SHALL clear the halt
as it clears a land stop, then commit the whole archive as "Archive
commit" does, with the archived proposal's title, instead of the
`osq: <id> land retry` commit. When that commit fails, it SHALL put the
archived folder's `.run/regressed/` files and `.run/events/change.jsonl`
back as they were before the retry, leave every other file as it is, and
throw `osq could not commit the archive: <git output>`. A human retry
grants the watcher a new catch-up budget.

#### Scenario: Retry commits a failed archive
- **WHEN** the archive catch-up budget is spent, the hook is removed, and a human runs `osq retry <id> change`
- **THEN** the branch's newest commit is `osq: <id> archived`, `git status` in the worktree is empty, and the archived folder holds no `.run/regressed/change.md`

#### Scenario: Retry while the hook still refuses
- **WHEN** the hook still rejects and a human runs `osq retry <id> change` on the archived change
- **THEN** it fails with a message that starts with `osq could not commit the archive: ` and holds `blocked by hook`, the archived folder's `.run/regressed/change.md` and `.run/events/change.jsonl` hold what they held before, and the archived folder is still in the worktree's archive directory
