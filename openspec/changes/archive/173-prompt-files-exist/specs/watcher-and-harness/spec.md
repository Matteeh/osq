# Spec Delta: watcher-and-harness

## ADDED Requirements

### Requirement: Entry path check before spawn
After the runner reads the approved task file and before the scope regression
guard, the lock, the baseline verify, and the spawn, it SHALL check every path
in the task's `entry` through `missingEntryPaths` in
`src/core/run/entry-paths.ts`, against the tree the task runs in: the
worktree with version control on, the project root otherwise. An entry SHALL
count as present when it names an existing file or directory there, when it is a pattern
`resolveScope` reads as one (holding `*` or `?`, or ending in `/`) and
`resolveScope` matches it to at least one file, or when `scopeCoversPath` says
the task's own `scope` covers it, because the task creates it.

When any entry is missing, the task SHALL die with reason `entry_missing`
without spawning the executor, writing a `started` event, or running any
verify. The dead marker SHALL carry `reason: entry_missing` in its frontmatter,
and its body SHALL be `The task's entry names files that do not exist:`, one
`- <path>` line per missing path, and `Revise the plan with osq plan <id>, then
approve it again.` One `dead` event SHALL record reason `entry_missing`.
`entry_missing` SHALL NOT be one of the reasons eligible for an automatic
retry, and the task is a steering trigger as status-inspection "Steering
triggers" says, so the watcher leaves the change alone until it is approved
again or retried.

#### Scenario: Entry names a removed file
- **WHEN** task 1 of an approved change in a worktree has `entry: [src/gone.ts]`, `src/gone.ts` does not exist in the worktree, and a watcher cycle runs with `gates.autoRetries` of 1
- **THEN** the executor never spawns, `.run/dead/1.md` has `reason: entry_missing` and lists `- src/gone.ts` and `osq plan <id>`, no `started` or `verify_ran` event is written for task 1, and later cycles spawn nothing for the change

#### Scenario: Entries that count as present
- **WHEN** a task's `entry` holds the path below and a watcher cycle runs
- **THEN** the task spawns or dies as below:

| Entry | Tree | Outcome |
|---|---|---|
| `src/a.ts` | `src/a.ts` exists | spawns |
| `src/lib/` | `src/lib/b.ts` exists | spawns |
| `src/*.ts` | `src/a.ts` exists | spawns |
| `src/new.ts` | missing, and the task's scope names `src/new.ts` | spawns |
| `src/*.rs` | no `.rs` file under `src/` | dies with `entry_missing` |

#### Scenario: Steered task runs
- **WHEN** a task died with `entry_missing`, a planner removes the path from its `entry` in the worktree, a human runs `osq approve <id>`, and a watcher cycle runs
- **THEN** the task spawns and the dead marker is kept as `.run/dead/1.1.md`
