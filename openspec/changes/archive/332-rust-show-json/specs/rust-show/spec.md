## MODIFIED Requirements

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

## ADDED Requirements

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
