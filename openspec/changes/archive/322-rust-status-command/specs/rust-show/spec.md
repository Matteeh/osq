## MODIFIED Requirements

### Requirement: Show command
`osq-feature-show` SHALL expose one public item, `ShowFeature`, a unit
struct that implements core's `Feature`. Its `name()` is `show`. Its
`commands()` are three `Command`s, in this order: `show`, with the summary
`show detailed change information, tasks, and event timeline` and the usage
`<id>`; then `spec`, with the summary
`list living capabilities and their requirements, or print one requirement`
and the usage `[capability] [requirement]`; then `status`, with the summary
`show status overview of change folders and tasks` and the usage `` (empty
text). `run` refuses every other command with
`FeatureError::unknown_command` naming the invocation's command. The crate
depends on no other feature crate.

#### Scenario: Show feature commands
- **WHEN** a test asks `ShowFeature` for its name and commands, and runs it with the command `inbox` and no arguments on a scratch project root
- **THEN** its name is `show`, it lists exactly the `show` command, then the `spec` command, then the `status` command with those summaries and usages, and the run returns `FeatureError::unknown_command` displaying as `unknown command: inbox`

## ADDED Requirements

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
