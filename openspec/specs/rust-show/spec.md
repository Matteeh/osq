# rust-show Specification

## Purpose
The show feature prints one change's details as TypeScript's `osq show` does. It holds the feature's logic and its command, as ADR 022 says.

## Requirements

### Requirement: Code ownership
<!-- source: crates/features/show/** -->
The rust-show capability SHALL own the `osq-feature-show` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Show crate ownership
- **WHEN** file ownership is resolved for the show feature
- **THEN** system maps `crates/features/show/**` to rust-show

### Requirement: Show command
`osq-feature-show` SHALL expose one public item, `ShowFeature`, a unit
struct that implements core's `Feature`. Its `name()` is `show`. Its
`commands()` are three `Command`s, in this order: `show`, with the summary
`show detailed change information, tasks, and event timeline` and the usage
`[--json] <id>`; then `spec`, with the summary
`list living capabilities and their requirements, or print one requirement`
and the usage `[capability] [requirement]`; then `status`, with the summary
`show status overview of change folders and tasks` and the usage `` (empty
text). `run` refuses every other command with
`FeatureError::unknown_command` naming the invocation's command. The crate
depends on no other feature crate.

#### Scenario: Show feature commands
- **WHEN** a test asks `ShowFeature` for its name and commands, and runs it with the command `inbox` and no arguments on a scratch project root
- **THEN** its name is `show`, it lists exactly the `show` command, then the `spec` command, then the `status` command with those summaries and usages, and the run returns `FeatureError::unknown_command` displaying as `unknown command: inbox`

### Requirement: Show arguments
Before it reads any file, `show` SHALL take every argument `--json`, in any
position and any number of times, as the request for JSON output, and
exactly one other argument as the change id. With no other argument or more
than one, it fails with `FeatureError::usage("show", "expected <id>")`. An
id that is empty after trimming fails with `FeatureError::usage("show",
"specify a spec ID to show (e.g. osq show 001)")`, TypeScript's text after
its `Error: ` prefix.

#### Scenario: Show argument errors
- **WHEN** a test runs `show` with the row's arguments on a root that holds no `openspec/` folder
- **THEN** it gives the row's `Usage` error, displayed as the row's text:

| Arguments | Text |
|---|---|
| none | `usage of show: expected <id>` |
| `1`, `2` | `usage of show: expected <id>` |
| two spaces | `usage of show: specify a spec ID to show (e.g. osq show 001)` |

#### Scenario: Show JSON arguments
- **WHEN** a test runs `show` with the row's arguments, on a root that holds no `openspec/` folder for an error row and on a scratch copy of `tests/fixtures/show-project` for the output row
- **THEN** it gives the row's result:

| Arguments | Result |
|---|---|
| `--json` | `Usage` error displayed `usage of show: expected <id>` |
| `1`, `--json`, `2` | `Usage` error displayed `usage of show: expected <id>` |
| `--json`, two spaces | `Usage` error displayed `usage of show: specify a spec ID to show (e.g. osq show 001)` |
| `--json`, `approved`, `--json` | output text equal to `tests/fixtures/json-golden/approved-002.json` once the copy's path is replaced by `<base>/checkout` |

### Requirement: Show lookup
`show` SHALL find the change as TypeScript's `resolveSpecFolder` does,
except for how an id names a folder.
With `vcs.enabled` and git on, as "Show git state" says, the listing is
the storage kernel's `list_tree_changes` over `change_trees` of the root,
every `worktree_list` entry as a tree candidate, and the folders under
`stacked_root` of the vcs config, the repository root and `HOME`, as the
inbox reads them; otherwise it is `list_changes` of the root. A trimmed id
holding `/` that names a directory, absolute or under the root, is that
folder, archived or rejected by its parent folder. Any other id is the
first change in the listing's order whose folder the id names when
rust-core `parse_change_id` reads it with `slug` true, as rust-core
"Change ids" says. When `parse_change_id` refuses the id, `show` SHALL
fail with `FeatureError::failed("show", ..)` and the `ChangeIdError`'s
display in place of the not-found text of "Show lookup errors".

#### Scenario: Show lookup forms
- **WHEN** a test runs `show` with each argument of "Show text equals TypeScript's" on a scratch copy of the fixture
- **THEN** the output's first line is the golden's first line

#### Scenario: Show lookup edge forms
- **WHEN** a test runs `show` with the row's argument on a scratch root whose one active change folder is the row's folder, holding only a `proposal.md` of `---\ntitle: Edge\n---\n## Goal\n\nGoal.\n`
- **THEN** the output's first line is the row's line, or it gives the `Failed` error for the command `show` with the row's message:

| Argument | Folder | Result |
|---|---|---|
| `0002` | `0002` | line `Spec: 0002 (0002)` |
| `02` | `02-x` | line `Spec: 02-x (02)` |
| `2` | `002-x` | line `Spec: 002-x (002)` |
| `x` | `002-x` | line `Spec: 002-x (002)` |
| `x-alpha` | `x-alpha` | line `Spec: x-alpha (x-alpha)` |
| `alpha` | `x-alpha` | message `Spec "alpha" not found in specs or archive` |
| `002-x-y` | `002-x` | message `Spec "002-x-y" not found in specs or archive` |
| `-2` | `0-2-x` | message `"-2" is not a change id; give the change's number, such as 7 or 007, its full folder name, or that name without its number` |
| `2]` | `002-x` | message `"2]" is not a change id; give the change's number, such as 7 or 007, its full folder name, or that name without its number` |

### Requirement: Show lookup errors
When nothing matches, `show` SHALL fail with `FeatureError::failed("show",
..)` and the text `Spec "<id>" not found in specs or archive`, `<id>` as
given. A found folder without `proposal.md` fails with the text `Neither
proposal.md nor spec.md found in <folder>`, `<folder>` the root joined with
the folder's path. These are TypeScript's texts after its `Show error: `
prefix.

#### Scenario: Show errors equal TypeScript's
- **WHEN** a test runs `show` with the row's argument on a scratch copy of `tests/fixtures/show-project`
- **THEN** it gives the `Failed` error whose message equals the row's golden in `tests/fixtures/golden/` with its `Show error: ` prefix and final newline removed and `<root>` replaced by the scratch root:

| Argument | Golden |
|---|---|
| `999` | `unknown-999.err.txt` |
| `012` | `no-proposal-012.err.txt` |

### Requirement: Show text
`show` SHALL return `Output::text` holding TypeScript's `formatShowText`
for the found change and one newline, as `osq show <id>` prints it with
vcs off. Event data values print as JavaScript's `String()` prints them,
keys in file order. The goldens in `tests/fixtures/golden/` are
TypeScript's output for `tests/fixtures/show-project`, printed by
`print-goldens.mjs.txt` beside them, which also writes the
`.run/running/1.pid` marker of `003-running` that git does not keep.

#### Scenario: Show text equals TypeScript's
- **WHEN** a test runs `show` with the row's argument on a scratch copy of `tests/fixtures/show-project`
- **THEN** the output text equals the row's golden in `tests/fixtures/golden/`, byte for byte:

| Argument | Golden |
|---|---|
| `1` | `active-001.txt` |
| `approved` | `approved-002.txt` |
| `003` | `running-003.txt` |
| `004-dead` | `dead-004.txt` |
| `5` | `steering-005.txt` |
| `006` | `blocked-006.txt` |
| `007` | `unplanned-007.txt` |
| `10` | `archived-010.txt` |
| `openspec/changes/archive/010-archived` | `archived-010.txt` |
| `011` | `rejected-011.txt` |

#### Scenario: Show outline
- **WHEN** a test runs `show` with each argument of "Show text equals TypeScript's" on a scratch copy of the fixture
- **THEN** the output's outline equals its golden's outline, and for the arguments `5` and `006` the whole output equals the golden. The outline of a text is its lines before the line `Planning Sessions:`, without the `Verification:` and `Validation:` blocks (each heading line and the lines after it that start with a space) and without the run lines: lines that start, after their indent, with `Pre-spawn verify:`, `Retries:`, `Stuck:`, `Focused runs:`, `Mutation:`, `Survived:`, `Dependencies added:`, `Instructions changed after approval:` or `Disclosures:`

#### Scenario: Show run history
- **WHEN** a test runs `show` with each argument of "Show text equals TypeScript's" on a scratch copy of the fixture
- **THEN** the output's `Tasks:` and `Event Timeline:` sections equal its golden's, and for the arguments `approved`, `003` and `004-dead` the whole output equals the golden. A section is its heading line and the lines after it that start with a space

#### Scenario: Show approval digest
- **WHEN** a test runs `show` with each argument of "Show text equals TypeScript's" on a scratch copy of the fixture
- **THEN** the output's `Planning Sessions:` section (its heading line and the lines after it that start with a space) equals its golden's; for the arguments `1` and `007` the digest without its flag lines equals the golden's; and for the argument `011` the whole output equals the golden. The digest is the text from its line that starts with `Change: ` to the end, and its flag lines are the lines that start with `Flag: `

#### Scenario: Show digest flags
- **WHEN** a test runs `show` with the arguments `1` and `007` on a scratch copy of the fixture
- **THEN** each whole output equals its golden

#### Scenario: Show archived change
- **WHEN** a test runs `show` with the arguments `10` and `openspec/changes/archive/010-archived` on a scratch copy of the fixture
- **THEN** each whole output equals `archived-010.txt`

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

### Requirement: Show dependency readiness
A dependency of an approved active change SHALL count as met, as
TypeScript's `isDependencyDone` says, when rust-core `parse_change_id`
reads it with `slug` false into an id that names an archived change folder,
or an active change folder whose every task file has a done marker, as
rust-core "Change ids" says. A dependency `parse_change_id` refuses is
never met. A rejected change, a missing one and an active one
without task files never count as met, and an unmet dependency makes the
change `blocked`.

#### Scenario: Dependency readiness from folders
- **WHEN** a test runs `show 1` on a scratch root built as "Status and next step from markers" says, for the row
- **THEN** the output's `Status:` line, `Next:` line and first task line, trimmed, are the row's:

| Row | Status | Next | Task line |
|---|---|---|---|
| depends 002 missing | `Status: [blocked]` | `Next: blocked (waiting for 002) — osq show 002` | `[ ] 1. When a runs, it works [pending]` |
| depends 2 archived | `Status: [pending]` | `Next: running — osq show 001` | `[ ] 1. When a runs, it works [pending]` |
| depends 002 rejected | `Status: [blocked]` | `Next: blocked (waiting for 002) — osq show 002` | `[ ] 1. When a runs, it works [pending]` |
| depends 002 active unfinished | `Status: [blocked]` | `Next: blocked (waiting for 002) — osq show 002` | `[ ] 1. When a runs, it works [pending]` |
| depends 002 active done | `Status: [pending]` | `Next: running — osq show 001` | `[ ] 1. When a runs, it works [pending]` |
| depends 002 active no tasks | `Status: [blocked]` | `Next: blocked (waiting for 002) — osq show 002` | `[ ] 1. When a runs, it works [pending]` |

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

### Requirement: Spec command
`spec` SHALL print what TypeScript's `specCommand` prints through
`lookupRequirement`, reading the living specs under `<root>/openspec/specs`
with the specs kernel. An empty argument counts as a missing one, as
TypeScript's check does.

- The capabilities are the names of the folders directly under
  `openspec/specs` that hold an entry named `spec.md`, file or not, sorted by byte order; a missing
  `openspec/specs` gives none.
- With no capability, `spec` prints each capability on its own line.
- With a capability that is not one of them, `spec` fails with
  `No living capability "<capability>". Capabilities: <capabilities joined by ", ">`
  and reads no path built from the argument.
- With a capability and no requirement, `spec` reads its `spec.md` with the
  specs kernel's `read_living_spec` and prints each requirement's `name` on
  its own line.
- With a requirement too, `spec` prints the `raw` block, then a newline, of
  the first requirement whose `name` equals the argument after the specs
  kernel's `normalize_requirement_name`. With none, `spec` fails with
  `<capability> has no requirement "<requirement>". osq spec <capability> lists them.`,
  naming the requirement as given.

A failure is `FeatureError::failed("spec", <message>)`, so the CLI writes
`spec failed: <message>` and a newline to stderr and exits 1. A `spec.md`
that cannot be read fails with the `SpecsError`'s display as the message.

#### Scenario: Spec equals TypeScript's
- **WHEN** a test runs `spec` with each row's arguments of `crates/features/show/tests/fixtures/spec-golden/spec.json`, on `crates/features/show/tests/fixtures/spec-project/` for the root `project` and on a new empty folder for the root `empty`
- **THEN** a row with code 0 gives output text equal to its `stdout`, and a row with code 1 gives a `Failed` error for the command `spec` that displays as `spec failed: ` and its `stderr` without the final newline:

| Row | Arguments | Result |
|---|---|---|
| `capabilities` | none | `alpha`, `beta` |
| `capabilities-blank-argument` | empty | `alpha`, `beta` |
| `alpha-requirements` | `alpha` | `First rule`, `Closed name`, `Last rule` |
| `alpha-requirements-blank-argument` | `alpha`, empty | `First rule`, `Closed name`, `Last rule` |
| `beta-no-requirements` | `beta` | no output |
| `first-rule` | `alpha`, `First rule` | the `First rule` block |
| `closed-name-padded` | `alpha`, `  Closed name  ` | the `Closed name ##` block |
| `closed-name-hashes` | `alpha`, `Closed name ##` | the `Closed name ##` block |
| `last-rule` | `alpha`, `Last rule` | the `Last rule` block without its trailing blanks |
| `unknown-capability` | `gamma` | `No living capability "gamma". Capabilities: alpha, beta` |
| `folder-without-spec` | `notes` | `No living capability "notes". Capabilities: alpha, beta` |
| `path-like-capability` | `../alpha` | `No living capability "../alpha". Capabilities: alpha, beta` |
| `unknown-requirement` | `alpha`, `first rule` | `alpha has no requirement "first rule". osq spec alpha lists them.` |
| `fenced-header` | `alpha`, `Fenced header` | `alpha has no requirement "Fenced header". osq spec alpha lists them.` |
| `empty-root-capabilities` | none | no output |
| `empty-root-unknown` | `alpha` | `No living capability "alpha". Capabilities: ` |

#### Scenario: Spec read failure
- **WHEN** a test runs `spec` with the argument `alpha` on a new folder whose `openspec/specs/alpha/spec.md` is a folder
- **THEN** it gives a `Failed` error for the command `spec` whose display starts with `spec failed: ` and the path of that `spec.md`

### Requirement: Spec arguments
Before it reads any file, `spec` SHALL take at most two arguments. With more,
it fails with
`FeatureError::usage("spec", "expected [capability] [requirement]")`;
TypeScript's command parser refuses them with its own text.

#### Scenario: Spec argument errors
- **WHEN** a test runs `spec` with the arguments `a`, `b` and `c` on a root that holds no `openspec/` folder
- **THEN** it gives a `Usage` error that displays as `usage of spec: expected [capability] [requirement]`

### Requirement: Status command
`status` SHALL refuse any argument with
`FeatureError::usage("status", "takes no arguments")` before it reads any
file. It reads the root's `osq.toml` and decides whether git is on as "Show
git state" says, failing as it says. It reads the watch state, the
after-land failure and the autopilot stop only through rust-storage
`read_watch_state`, `read_after_land_failure` and `read_autopilot_stop`,
and the failing validator run only through `validator_failing`, with the
home taken from the `HOME` environment variable; without `HOME` there is no
watch state, so the watcher line reads not running, and no after-land
failure. It returns `Output::text` holding the status text followed by one
newline.

#### Scenario: Status argument error
- **WHEN** a test runs `status` with the argument `1` on a root that holds no `openspec/` folder
- **THEN** it gives the `Usage` error displayed as `usage of status: takes no arguments`

### Requirement: Status text equals TypeScript's
The status text SHALL equal what TypeScript's `statusCommand` prints for the
same files, as `formatStatusOverview` and `formatWatcherLine` give it:

- `Active specs:`, then for each active change in every tree, in listing
  order, the line `<folder>: <title> [<status>] (approved|unapproved)`, for a
  change in a worktree its `  worktree: <path>` line, the running warning
  when a task runs, and its last sync lines, then `  next: <next step>` as
  "Show status and next step" gives it, then one line per task as `show`
  prints it, or `  (no tasks)`; a change folder with neither `proposal.md`
  nor `spec.md` is left out, and no change gives `  (none)`.
- A blank line, `Archived specs: <n>` counting the archived changes in every
  tree, and, with git on, `Not landed:` and one line
  `  <id>: <title> — osq land <id>` for each archived change whose next step
  is `archived (not landed)`, in numeric order.
- A blank line, `Rejected specs:` and one line per rejected change,
  `<folder>: <title> [rejected] (reason: <reason>, at: <timestamp>)`, each
  missing value read as `unavailable`, or `  (none)`.
- A blank line, then the watcher line; `Log: <path>` when `watch.log`
  exists; `After-land command failed for <id>: <command> — osq land <id>`
  for an after-land failure;
  `Validator <outcome> <runs>× in a row, last on <id>: <error> — osq show <id>`
  for a failing validator run; and
  `Autopilot stopped at <item>[ (change <change>)]: <reason> — <command>` for
  an autopilot stop.

The watcher line is `Watcher: running in the background, osq v<version>
(<commit>), pid <service pid>` with a service and a watcher record,
`Watcher: restarting in the background, pid <service pid>` with only a
service record, `Watcher: running in a terminal, osq v<version> (<commit>),
pid <watcher pid>` with only a watcher record, each followed by
`, waiting: <waiting>` when the watcher record has a waiting reason, and
`Watcher: not running — osq watch --background` with neither.

#### Scenario: Status text equals TypeScript's
- **WHEN** a test runs `status` on the row's scratch root, built as `golden/print-status-goldens.mjs.txt` in the crate's test fixtures builds the row's case, with `HOME` set to a fresh empty folder holding the row's watch records
- **THEN** its output equals the row's golden file in the crate's test fixtures, after `<state>` is replaced by the root's watch state folder, `<pid>` by the pid the row's live records name, and `<root>` by the scratch root:

| Case | Golden |
|---|---|
| a copy of `show-project` with 003-running's running marker | `status-project.txt` |
| an empty folder | `status-empty.txt` |
| the copy with a live terminal watcher record | `status-watch-terminal.txt` |
| the copy with live service and background watcher records, a waiting reason, and `watch.log` | `status-watch-background.txt` |
| the copy with only a live service record | `status-watch-restarting.txt` |
| the copy with a terminal watcher record naming a dead pid | `status-watch-dead.txt` |
| the copy with an after-land failure, a failing validator run on 010-archived and an autopilot stop | `status-pending.txt` |
| the copy under git with 002-approved running in worktree `<root>-wt` after a sync and a sync stop, and 010-archived in worktree `<root>-wt2`, not landed | `status-git.txt` |

### Requirement: Show JSON
With `--json`, `show` SHALL return `Output::text` holding TypeScript's
`formatShowJson` for the found change and one newline, as `osq show <id>
--json` prints it: JavaScript's `JSON.stringify` of the change details with
two-space indentation. Every value is the one the text view derives for the
same change; nothing is read twice in a different way.

The document's members are, in this order, each optional member left out
when absent: `id`, `folderName`, `folderPath` (the found folder's path),
`isArchived`, `location`, `title`, `status`, `approvedHash`, `dependsOn`,
`features` (`reads`, `writes`), `goal`, `contract`, `nonGoals`, `delta`,
`tasks`, `planningSessions`, `recertifications`, `timeline`; then, for an
active or archived change, `next` (`state`, `command`, `detail`) and
`afterLanding` when the after-landing steps are not empty; then, for an
archived change, `validation` when its change stream holds a
`validator_ran` event, `land`, and `verification` when its events hold a
check or verification row; and last `digest`, the approval digest of a
change without an approval seal and `null` for every other change.

- A task is `taskNumber`, `fileName`, `title`, `status`, `verify`, `scope`, `entry`, `skills`, `acceptance`, then each of `deadReason`, `deadDiagnostic`, `regressedReason`, `regressedDiagnostic` and `resultContent` that is set, then `events`.
- An event is `taskNumber`, `type`, `timestamp`, then `data` when the line holds object or array data.
- A planning session is `sessionId`, `startTime`, `harness`, `model`, `agent` when set, `exitCode`, `wallSeconds`.
- A recertification is `taskNumber`, `timestamp`, `outcome`, `differingPaths`, `attribution` (each `path`, `attribution`), `verify`, `exitCode`, `timedOut`.
- `validation` is the data of the latest `validator_ran` event of the change stream by timestamp, as the file holds it.
- `land` is `folderName`, `landed`, `defaultBranch`, `mainCommits`, `gates` (each `kind`, `task`, `command`, `outcome`, `exitCode`, `durationSeconds`, `timestamp`, `findings`), `diff` (`files`, `added`, `removed`), `capabilities` (each `name`, `added`, `modified`, `removed`, `renamed`, a rename being `from`, `to`), `disclosures` (each `task`, `deviated`, `outsideScope`), `halt` (`reason`, `message`), `lastSync` (`timestamp`, `defaultBranch`, `commits`) and `lastSyncStop` (`timestamp`, `reason`, `message`). With git off, `landed`, `defaultBranch` and `mainCommits` are `null`.
- `verification` is `checks` (each `time`, `command`, `exitCode`) and `outcomes` (each `time`, `outcome`, `note`).
- `digest` is `change`, `goal`, `tasks` (each `number`, `title`, `scopeFiles`, `testsModify`, `existingTests`), `capabilities` (each `name`, `added`, `modified`, `removed`, `creates`), `decisions` (each `number`, `rule`), `humanSteps`, `beforeApproval` and `flags` (each `id`, `label`, `excerpt`), a flag's `id` being one of `shared_file`, `sensitive_path`, `verify_without_test`, `removed_requirement`, `unknown_capability`, `verify_starts_conflict`, `adr_departure` and `adr_check_modified`.

Strings are escaped as `JSON.stringify` escapes them. A number prints as
JavaScript prints the same 64-bit float: `1.0` in a file prints `1`. Event
data and `validation` keep the file's keys in JavaScript's own-property
order: keys that are canonical array indexes first, ascending, then the
others in file order, a repeated key keeping its first place and its last
value. A task's `scenarios` and the `runsAfter` member are never printed,
as the text view prints neither.

The goldens in `tests/fixtures/json-golden/` are TypeScript's output,
printed by `print-json-goldens.mjs.txt` beside them, with the scratch base
folder's path replaced by `<base>`. Each case's base folder holds
`checkout`, a copy of `tests/fixtures/show-project` with `003-running`'s
`.run/running/1.pid` marker written, `home`, its HOME, and for a worktree
setup `worktree`. A test replaces its own base folder's path, as given and
with symlinks resolved, by `<base>` in the output before it compares. Git
setups match "Show land lines": `landed` commits every file on `main`;
`no branch` commits every file but `openspec/changes/archive/010-archived`
on `main` and leaves that folder untracked; `worktree <folder>, <m> moves`
commits every file but `<folder>` on `main`, adds the worktree on a new
branch `osq/<folder name>`, copies the folder there, adds the line `export
const more = 2;` to that worktree's `src/alpha.ts`, commits both on the
branch, then commits on `main` `<m>` times, the `<k>`th time adding the line
`export const move<k> = <k>;` to `src/beta.ts`; `sync stopped` runs no git
and appends the `synced` and `sync_stopped` events "Show land lines" names.
A row with `vcs.enabled` writes `osq.toml` with `[vcs]` holding `enabled =
true` and `author = "osq <osq@example.com>"` before the first commit, where
the script writes the same two keys in `osq.config.ts`.

#### Scenario: Show JSON of a change that is not archived
- **WHEN** a test runs `show` with the row's argument and `--json` on the `checkout` of a fresh base folder, with no git
- **THEN** the output text, with the base folder's path replaced by `<base>`, equals the row's golden in `tests/fixtures/json-golden/`, byte for byte:

| Argument | Golden |
|---|---|
| `1` | `active-001.json` |
| `approved` | `approved-002.json` |
| `003` | `running-003.json` |
| `004-dead` | `dead-004.json` |
| `5` | `steering-005.json` |
| `006` | `blocked-006.json` |
| `007` | `unplanned-007.json` |
| `011` | `rejected-011.json` |

#### Scenario: Show JSON head of an archived change
- **WHEN** a test runs `show` with the argument `10`, and then `openspec/changes/archive/010-archived`, and `--json` on the `checkout` of a fresh base folder, with no git
- **THEN** the head of each output, with the base folder's path replaced by `<base>`, equals the head of `archived-010.json`, where the head of a text is its text before its first line that starts with `  "validation": `, `  "land": `, `  "verification": ` or `  "digest": `

#### Scenario: Show JSON of an archived change
- **WHEN** a test builds the row's setup in a fresh base folder, with `vcs.enabled` when the row says yes, and runs `show` with the row's argument and `--json` on its `checkout`
- **THEN** the output text, with the base folder's path replaced by `<base>`, equals the row's golden in `tests/fixtures/json-golden/`, byte for byte:

| Setup | vcs.enabled | Argument | Golden |
|---|---|---|---|
| none | no | `10` | `archived-010.json` |
| none | no | `openspec/changes/archive/010-archived` | `archived-path-010.json` |
| landed | no | `10` | `land-landed-010.json` |
| no branch | yes | `10` | `land-no-branch-vcs-010.json` |
| worktree `openspec/changes/archive/010-archived`, 0 moves | yes | `10` | `land-unmoved-010.json` |
| worktree `openspec/changes/archive/010-archived`, 2 moves | yes | `10` | `land-two-commits-010.json` |
| sync stopped | no | `10` | `land-sync-stopped-010.json` |

#### Scenario: Show JSON of a worktree change
- **WHEN** a test builds the setup worktree `openspec/changes/002-approved`, 1 moves, in a fresh base folder with `vcs.enabled`, and runs `show 2 --json` on its `checkout`
- **THEN** the output text, with the base folder's path replaced by `<base>`, equals `worktree-002.json`, byte for byte, whose `folderPath` is `<base>/worktree/openspec/changes/002-approved`
