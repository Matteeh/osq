## MODIFIED Requirements

### Requirement: Report feature
`osq-feature-report` SHALL expose one public item, the unit struct
`ReportFeature`, which implements rust-core's `Feature` and holds no storage
connection, as ADR 028 says. Its `name` SHALL be `report`, and its
`commands` SHALL be exactly two `Command`s, in this order: `report`, with
the summary `display delivery metrics and task completion report` and the
usage `[--json]`; then `query`, with the summary
`run one read-only SELECT over the osq history tables` and the usage
`[--json] [select]`.

#### Scenario: Report feature commands
- **WHEN** a test reads `ReportFeature`'s name and commands
- **THEN** the name is `report`, and the commands are, in order, one command with the name `report`, the summary `display delivery metrics and task completion report` and the usage `[--json]`, then one command with the name `query`, the summary `run one read-only SELECT over the osq history tables` and the usage `[--json] [select]`

### Requirement: Query arguments
`ReportFeature::run` SHALL return `FeatureError::unknown_command` for any
command but `report` and `query`. For `query`, an argument that is exactly
`--json` SHALL ask for JSON output, in any position and any number of
times; every other argument is a select. More than one select SHALL give
`FeatureError::usage("query", "expected at most one select, got <n> arguments")`.
Every other failure of `query` SHALL be `FeatureError::failed` with the
command `query` and the message the other query requirements name.

#### Scenario: Query argument errors
- **WHEN** a test runs the invocation in the row with `tests/fixtures/history` as the root
- **THEN** it gives the row's error and writes no file:

| Invocation | Error |
|---|---|
| `query` with args `a`, `b` | `Usage` error displayed `usage of query: expected at most one select, got 2 arguments` |
| `query` with args `--json`, `a`, `b` | `Usage` error displayed `usage of query: expected at most one select, got 2 arguments` |
| `summary` with no args | `UnknownCommand` error displayed `unknown command: summary` |

## ADDED Requirements

### Requirement: Report arguments
For `report`, an argument that is exactly `--json` SHALL ask for JSON
output, in any position and any number of times. Any other argument SHALL
give `FeatureError::usage("report", "expected [--json], got <argument>")`
for the first such argument, before `report` reads any file.

#### Scenario: Report argument errors
- **WHEN** a test runs `report` with the row's args on a scratch root holding an `osq.toml` whose `[vcs]` has `enabled = "yes"`
- **THEN** it gives the row's `Usage` error, not the config error, and writes no file:

| Args | Error |
|---|---|
| `--since`, `2026-10-01` | `usage of report: expected [--json], got --since` |
| `--json`, `x`, `y` | `usage of report: expected [--json], got x` |
| `--until=2026-10-01` | `usage of report: expected [--json], got --until=2026-10-01` |

### Requirement: Report changes
`report` SHALL read the root's `osq.toml` with the config kernel's
`load_config`, and fail with `FeatureError::failed("report", ..)` and the
config error's display when it refuses the file. When the config's
`vcs.enabled` is true and git is on, as rust-show "Show git state" decides
it with a `GitVcs` bounded by the config's `timeouts`, `report` SHALL count
the active and archived entries `list_tree_changes` gives for
`change_trees` over the root, its git worktrees and the folders directly
under the vcs kernel's `stacked_root` for the `HOME` folder, none when
`HOME` is unset or that folder cannot be read. A failing worktree listing
SHALL fail `report` with `FeatureError::failed("report", ..)` and the
`VcsError`'s display. Otherwise `report` SHALL count the active and
archived entries of `list_changes` for the root. Rejected changes never
count.

#### Scenario: Report refuses a bad config
- **WHEN** a test runs `report` on a scratch copy of `tests/fixtures/summary/thirds` holding an `osq.toml` whose `[vcs]` has `enabled = "yes"`
- **THEN** it gives the `Failed` error for `report` whose message equals the display of the error `load_config` gives for that root

#### Scenario: Report across worktrees
- **WHEN** a test runs `report` on a scratch git repository root whose `osq.toml` holds `[vcs]` with `enabled = true`, holding an active `001-a` with `proposal.md` and `tasks/1.md`, and an active `002-b` with no `.run/approved`, with `proposal.md` and `tasks/1.md` to `tasks/3.md`; and a git worktree outside the root on the branch `osq/002-b` holding `openspec/changes/002-b/` with `proposal.md`, `tasks/1.md`, `tasks/2.md`, `.run/approved` and `.run/done/1` holding `---\nscope_hash: sha256:1\n---\n`
- **THEN** the text's lines are `  Total specs: 2 (2 active, 0 archived)`, `  Total tasks: 3`, `  Done: 1`, `  Verified done: 1`, `  Pending: 2` and `  Completion rate: 33.33%`, every other count is 0, and the same root with `enabled = false` gives `  Total tasks: 4`, `  Done: 0` and `  Completion rate: 0%`

### Requirement: Report counts
`report` SHALL count as TypeScript's `buildMetricsReport` counts. The
`active` and `archived` spec counts are the number of active and archived
changes `report` counts, and `total` is their sum. Each task of each
counted change, as `read_now_facts` gives them, SHALL have one status, the
first that holds of: `regressed`; `done`; `dead`; `running`; `pending`.
Every task of a change whose `has_proposal` is false SHALL be `pending`.
`total` is the number of tasks. `done`, `dead`, `regressed` and `running`
count the tasks with that status. A done task is `manual` when its
`manual` is true and `verified` otherwise. A pending task is `unmarked` in
an archived change and `pending` in an active one. The completion rate
SHALL be JavaScript's `Math.round(done / total * 10000) / 100`, and 0
with no tasks.

#### Scenario: Status order
- **WHEN** a test runs `report` on a scratch root holding one active change `001-a` with the row's proposal, `tasks/1.md` to `tasks/5.md`, `.run/regressed/1.md`, `.run/done/1`, `.run/done/2`, `.run/dead/1.md`, `.run/dead/2.md`, `.run/dead/3.md`, and `.run/running/1.pid` to `.run/running/4.pid`, each marker holding `x\n`
- **THEN** the text's `Now:` lines give the row's counts, every other count 0:

| Proposal | Counts |
|---|---|
| `proposal.md` | total 5, done 1, verified 1, dead 1, regressed 1, running 1, pending 1, completion rate `20` |
| `spec.md` | total 5, done 1, verified 1, dead 1, regressed 1, running 1, pending 1, completion rate `20` |
| none | total 5, pending 5, completion rate `0` |

### Requirement: Report summary
`report` SHALL return the text TypeScript's `reportCommand` returns without
`--json`, from its first line through its `  Completion rate:` line, byte
for byte, with no newline at the end: `osq Delivery Metrics Report`, a
blank line, `Specs Summary:`,
`  Total specs: <total> (<active> active, <archived> archived)`, a blank
line, `Now:`, then `  Total tasks:`, `  Done:`, `  Verified done:`,
`  Manual done:`, `  Dead:`, `  Regressed:`, `  Running:`, `  Pending:`
and `  Unmarked:` each followed by a space and its count, and
`  Completion rate: <rate>%`. With `--json`, `report` SHALL return the
`completionRate`, `now` and `specs` members of TypeScript's
`report --json` object as `serializeSortedJson` writes them: keys in
sorted order, two-space indents, no newline at the end. The rate SHALL be
written as JavaScript writes a number: a whole number with no fraction,
such as `0` and `100`, and any other as its shortest decimal, such as
`31.25` and `66.67`.

#### Scenario: Report summary equals TypeScript's
- **WHEN** each row runs `report` on a fresh scratch copy of its project from `tests/fixtures/summary/`, or on a new empty scratch folder for `empty`, after writing the row's lock files into `openspec/changes/003-running/.run/running/` of the copy, once with no args and once with `--json`
- **THEN** the text equals `tests/fixtures/summary/golden/<case>.txt` and the JSON equals `tests/fixtures/summary/golden/<case>.json`, byte for byte, and the `report-project` case also gives that JSON for the args `--json`, `--json`:

| Case | Project | Lock files | Completion rate |
|---|---|---|---|
| `empty` | none | none | `0` |
| `report-project` | `report-project` | none | `31.25` |
| `report-project-running` | `report-project` | `7.pid` holding `not json\n`, `8.pid` holding `{"pid":1,"startedAt":1}\n` | `31.25` |
| `all-done` | `all-done` | none | `100` |
| `thirds` | `thirds` | none | `66.67` |
