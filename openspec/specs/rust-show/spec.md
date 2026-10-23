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
`commands()` are two `Command`s, in this order: `show`, with the summary
`show detailed change information, tasks, and event timeline` and the usage
`<id>`; then `spec`, with the summary
`list living capabilities and their requirements, or print one requirement`
and the usage `[capability] [requirement]`. `run` refuses every other command with
`FeatureError::unknown_command` naming the invocation's command. The crate
depends on no other feature crate.

#### Scenario: Show feature commands
- **WHEN** a test asks `ShowFeature` for its name and commands, and runs it with the command `inbox` and no arguments on a scratch project root
- **THEN** its name is `show`, it lists exactly the `show` command and then the `spec` command with those summaries and usages, and the run returns `FeatureError::unknown_command` displaying as `unknown command: inbox`

### Requirement: Show arguments
Before it reads any file, `show` SHALL take exactly one argument as the
change id. With no argument or more than one, it fails with
`FeatureError::usage("show", "expected <id>")`. An id that is empty after
trimming fails with `FeatureError::usage("show", "specify a spec ID to show
(e.g. osq show 001)")`, TypeScript's text after its `Error: ` prefix.

#### Scenario: Show argument errors
- **WHEN** a test runs `show` with the row's arguments on a root that holds no `openspec/` folder
- **THEN** it gives the row's `Usage` error, displayed as the row's text:

| Arguments | Text |
|---|---|
| none | `usage of show: expected <id>` |
| `1`, `2` | `usage of show: expected <id>` |
| two spaces | `usage of show: specify a spec ID to show (e.g. osq show 001)` |

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
TypeScript's `isDependencyDone` says, when its number padded to three
digits names an archived change, or an active change whose every task file
has a done marker. A rejected change, a missing one and an active one
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
