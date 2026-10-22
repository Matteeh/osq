## ADDED Requirements

### Requirement: Show git state
`show` SHALL read the root's `osq.toml` with the config kernel's
`load_config`, and fail with `FeatureError::failed("show", ..)` and the
config error's display when it refuses the file. Git is on, as TypeScript's
`selectVcs` decides, when the vcs kernel's `GitVcs` at the root, bounded by
the config's `timeouts`, gives a `root()` that names the root itself, both
paths with their symlinks resolved; a `root()` of none or an error means git
is off. With git on, every later git read that fails makes `show` fail with
`FeatureError::failed("show", ..)` and the `VcsError`'s display. The default
branch is the vcs kernel's `default_branch` with `vcs.defaultBranch`, or
`main` when unset, as its fallback.

#### Scenario: Show refuses a bad config
- **WHEN** a test runs `show 10` on a scratch copy of `tests/fixtures/show-project` whose `osq.toml` holds `[vcs]` with `enabled = "yes"`
- **THEN** it gives the `Failed` error for `show` whose message equals the display of the error `load_config` gives for that root

### Requirement: Show land lines
For an archived change, `show` SHALL print TypeScript's `landLines`
after the `Event Timeline:` section. With git off the headline stays
`Land: git is off`. With git on, the change is landed when the default
branch holds the path `openspec/changes/archive/<folder>`, and its branch
is `osq/<folder>` when `list_branches` gives that exact name. The headline
is then `Land: landed`; for a change that has not landed and has no branch,
`Land: not landed; branch osq/<folder> not found`; and otherwise, with `<n>`
the `count_commits(branch, default branch)`, `Land: not landed; <default
branch> has not moved since archive` when `<n>` is 0, or `Land: not landed;
<default branch> has <n> new commit since archive, so osq land will sync and
verify again`, with `commits` for every `<n>` but 1. When the branch exists,
the line `  Diff: <files> files, +<added> -<removed>` from
`diff_stat(default branch, branch, ["openspec"])` follows the gate lines,
and no line prints when `diff_stat` gives none. After the `Halted:` line,
whatever git says, the line `  Sync stopped: <reason>: <first line of
message>` prints for the last `sync_stopped` event of the change's
`.run/events/change.jsonl` that holds string `reason` and `message` data,
when it comes after the last `synced` event holding a string
`defaultBranch` and a number `commits`, or no such sync exists, as
TypeScript's `readLastSync` reads them.

The goldens `land-*.txt` in `tests/fixtures/golden/` are TypeScript's
`osq show 10` output for a scratch copy of `tests/fixtures/show-project`
with `003-running`'s `.run/running/1.pid` marker written, each built as
`print-land-goldens.mjs.txt` beside them says: `git init -b main` in the
root and commits by `osq <osq@example.com>`. Its `landed` setup commits
every file on `main`. Its `no branch` setup commits every file but
`openspec/changes/archive/010-archived` on `main` and leaves that folder
untracked. Its `worktree, <m> moves` setup commits every file but that
folder on `main`, adds a worktree outside the root on a new branch
`osq/010-archived`, copies the folder there, adds the line `export const
more = 2;` to that worktree's `src/alpha.ts` and commits both on the
branch, then commits on `main` `<m>` times, the `<k>`th time adding the
line `export const move<k> = <k>;` to `src/beta.ts`. Its `sync stopped`
setup runs no git and appends to the archived change's
`.run/events/change.jsonl` a `synced` event at `2026-10-06T08:00:00.000Z`
with `defaultBranch` `main` and `commits` 2, then a `sync_stopped` event at
`2026-10-06T09:00:00.000Z` with `reason` `conflict` and `message`
`src/alpha.ts conflicts`, a newline and `second line`. A row with
`vcs.enabled` writes `osq.toml` with `[vcs]` holding `enabled = true` and
`author = "osq <osq@example.com>"` before the first commit, where the
script writes the same two keys in `osq.config.ts`.

#### Scenario: Show land lines equal TypeScript's
- **WHEN** a test builds the row's setup on a scratch copy of `tests/fixtures/show-project`, with `vcs.enabled` when the row says yes, and runs `show 10` on its root
- **THEN** the output text equals the row's golden in `tests/fixtures/golden/`, byte for byte, and these are its `Next:` and `Land:` lines:

| Setup | vcs.enabled | Golden | Next line | Land line |
|---|---|---|---|---|
| landed | no | `land-landed-010.txt` | `Next: landed` | `Land: landed` |
| no branch | no | `land-no-branch-010.txt` | `Next: landed` | `Land: not landed; branch osq/010-archived not found` |
| no branch | yes | `land-no-branch-vcs-010.txt` | `Next: archived (not landed) — osq land 010` | `Land: not landed; branch osq/010-archived not found` |
| worktree, 0 moves | yes | `land-unmoved-010.txt` | `Next: archived (not landed) — osq land 010` | `Land: not landed; main has not moved since archive` |
| worktree, 1 moves | yes | `land-one-commit-010.txt` | `Next: archived (not landed) — osq land 010` | `Land: not landed; main has 1 new commit since archive, so osq land will sync and verify again` |
| worktree, 2 moves | yes | `land-two-commits-010.txt` | `Next: archived (not landed) — osq land 010` | `Land: not landed; main has 2 new commits since archive, so osq land will sync and verify again` |
| sync stopped | no | `land-sync-stopped-010.txt` | `Next: landed` | `Land: git is off` |

The three worktree rows print `  Diff: 1 files, +1 -0`, and the sync stopped row prints `  Sync stopped: conflict: src/alpha.ts conflicts`.

## MODIFIED Requirements

### Requirement: Show lookup
`show` SHALL find the change as TypeScript's `resolveSpecFolder` does.
With `vcs.enabled` and git on, as "Show git state" says, the listing is
the storage kernel's `list_tree_changes` over `change_trees` of the root,
every `worktree_list` entry as a tree candidate, and the folders under
`stacked_root` of the vcs config, the repository root and `HOME`, as the
inbox reads them; otherwise it is `list_changes` of the root. A trimmed id
holding `/` that names a directory, absolute or under the root, is that
folder, archived or rejected by its parent folder. Any other id is the
first change in the listing's order whose folder name equals the trimmed
id or its number padded to three digits, starts with either and `-`, or
ends with `-` and the trimmed id.

#### Scenario: Show lookup forms
- **WHEN** a test runs `show` with each argument of "Show text equals TypeScript's" on a scratch copy of the fixture
- **THEN** the output's first line is the golden's first line

### Requirement: Show status and next step
`show` SHALL print the `Status:` line, the `Next:` line and each task's
status as TypeScript does. An archived change is `done` and `landed`, or
`dead (needs steering) — osq plan <id>` when its markers hold a steering
trigger; without one, with `vcs.enabled` and git on, an archived change
the default branch does not hold, as "Show land lines" decides landed, is
`archived (not landed) — osq land <id>`. A rejected change prints no
`Next:` line. An active change follows `readActiveNextStep` without the
planner, auto-steer and pause records: `unplanned`, `ready for approval`,
`dead (needs steering)`, `dead` with a retry command, `blocked`, then
`running`.

#### Scenario: Status and next step from markers
- **WHEN** a test runs `show 1` on a scratch root holding only the files `golden/print-status-table.mjs.txt` in the change folder writes for the row: `openspec/changes/001-a/proposal.md` titled `A works` with the row's frontmatter, its `tasks/1.md` titled `When a runs, it works`, and the row's other files, paths relative to the change folder
- **THEN** the output's `Status:` line, `Next:` line and first task line, trimmed, are the row's:

| Row | Status | Next | Task line |
|---|---|---|---|
| unapproved | `Status: [unapproved]` | `Next: ready for approval — osq approve 001` | `[ ] 1. When a runs, it works [pending]` |
| unapproved, no verify | `Status: [unapproved]` | `Next: unplanned — osq lint 001` | `[ ] 1. When a runs, it works [pending]` |
| unapproved, sentinel verify | `Status: [unapproved]` | `Next: unplanned — osq lint 001` | `[ ] 1. When a runs, it works [pending]` |
| unapproved, sentinel verify, brief | `Status: [unapproved]` | `Next: unplanned — osq plan 001` | `[ ] 1. When a runs, it works [pending]` |
| approved | `Status: [pending]` | `Next: running — osq show 001` | `[ ] 1. When a runs, it works [pending]` |
| approved, done 1 | `Status: [done]` | `Next: running — osq show 001` | `[x] 1. When a runs, it works [done]` |
| approved, running 1 | `Status: [running]` | `Next: running — osq show 001` | `[>] 1. When a runs, it works [running]` |
| dead verify_red | `Status: [dead]` | `Next: dead — osq retry 001 1` | `[!] 1. When a runs, it works [dead] (reason: verify_red)` |
| dead blocked | `Status: [dead]` | `Next: dead (needs steering) — osq plan 001` | `[!] 1. When a runs, it works [dead] (reason: blocked)` |
| dead entry_missing | `Status: [dead]` | `Next: dead (needs steering) — osq plan 001` | `[!] 1. When a runs, it works [dead] (reason: entry_missing)` |
| dead stuck | `Status: [dead]` | `Next: dead (needs steering) — osq plan 001` | `[!] 1. When a runs, it works [dead] (reason: crashed)` |
| dead blocked, done 1 | `Status: [dead]` | `Next: running — osq show 001` | `[!] 1. When a runs, it works [dead] (reason: blocked)` |
| regressed 1 scope_regression passed | `Status: [regressed]` | `Next: dead — osq retry 001 1` | `[ ] 1. When a runs, it works [regressed]` |
| regressed 1 scope_regression | `Status: [regressed]` | `Next: dead (needs steering) — osq plan 001` | `[ ] 1. When a runs, it works [regressed]` |
| regressed change sync_conflict | `Status: [done]` | `Next: dead (needs steering) — osq plan 001` | `[x] 1. When a runs, it works [done]` |
| regressed change requirement_changed | `Status: [done]` | `Next: dead (needs steering) — osq plan 001` | `[x] 1. When a runs, it works [done]` |
| regressed change verify_red | `Status: [done]` | `Next: dead (needs steering) — osq plan 001` | `[x] 1. When a runs, it works [done]` |
| regressed change verify_path_missing | `Status: [done]` | `Next: dead (needs steering) — osq plan 001` | `[x] 1. When a runs, it works [done]` |
| regressed change sync_verify_red | `Status: [done]` | `Next: dead (needs steering) — osq plan 001` | `[x] 1. When a runs, it works [done]` |
| regressed change other | `Status: [done]` | `Next: dead — osq retry 001 change` | `[x] 1. When a runs, it works [done]` |
