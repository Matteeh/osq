## MODIFIED Requirements

### Requirement: Inbox command
`osq-feature-inbox` SHALL expose one public item, `InboxFeature`, which
implements core's `Feature`. `InboxFeature::new()` reads the system clock
at each run, and `InboxFeature::at(now_ms)` uses the fixed time `now_ms`, in
milliseconds since the Unix epoch, for every run. Its `name()` is `inbox`
and its `commands()` is one `Command` with the name `inbox`, the summary
`List the changes that need you, what runs, and what landed` and the usage
`` (empty text).

`run(invocation)` SHALL:

- refuse a command other than `inbox` with `FeatureError::unknown_command`
  naming it;
- refuse any argument with `FeatureError::usage("inbox", "takes no arguments")`;
- read `<root>/osq.toml` with the config kernel's `load_config`, and refuse
  a config error with `FeatureError::failed("inbox", <its text>)`;
- read the changes as "Inbox trees" says, and refuse a change that
  `read_change` refuses with `FeatureError::failed("inbox", <the storage
  error's text>)`;
- otherwise return `Output::text` holding the inbox text followed by one
  newline. The inbox text is `Inbox empty.` when all three groups are
  empty. Otherwise it is the lines `Needs you`, that group's item lines,
  `Running`, that group's item lines, `Landed since last look` and that
  group's item lines, joined by newlines, where a group with no items has
  the one line `  (none)`.

The feature writes nothing. The item lines are those of "Needs-you items",
"Running items", "Landed items", "Validator failing item" and "Archived
items". Ids compare by the number they lead with, then by bytes.

#### Scenario: Inbox feature description
- **WHEN** `InboxFeature::new()` is asked for its name and commands
- **THEN** its name is `inbox`, and it lists exactly one command, with the name `inbox`, the summary `List the changes that need you, what runs, and what landed` and the usage `` (empty text)

#### Scenario: Inbox calls that are refused
- **WHEN** `InboxFeature::new()` runs each invocation below on a scratch project with no `openspec` folder
- **THEN** it returns the row's error, and the error displays as the row's text:

| Command | Arguments | Error | Text |
|---|---|---|---|
| `inbox` | `--json` | usage | `usage of inbox: takes no arguments` |
| `status` | none | unknown command | `unknown command: status` |

#### Scenario: Empty project
- **WHEN** `InboxFeature::new()` runs `inbox` with no arguments on a scratch project with no `openspec` folder
- **THEN** its output text is `Inbox empty.` followed by one newline

#### Scenario: Change folder that does not read
- **WHEN** `InboxFeature::new()` runs `inbox` on a scratch project whose one active change `001-bad` holds `proposal.md`, `tasks/1.md` and a `.run/events/1.jsonl` whose only line is `not json`
- **THEN** it returns `FeatureError::failed` for the command `inbox`, whose text starts with `inbox failed: `

#### Scenario: Config that does not load
- **WHEN** `InboxFeature::new()` runs `inbox` on a scratch project whose `osq.toml` holds `[vcs]` and `enabled = "yes"`
- **THEN** it returns `FeatureError::failed` for the command `inbox`, whose text starts with `inbox failed: ` and names `vcs.enabled`

## ADDED Requirements

### Requirement: Inbox trees
With `vcs.enabled` and a git repository at the root, the inbox SHALL read
every tree's changes, as `list_tree_changes` gives them from `change_trees`
over git's worktrees and the stacked folders, and refuse a git error with
`FeatureError::failed("inbox", <its text>)`. Otherwise it reads the root
alone with `list_changes`. The Landed group reads only the root tree's
changes; every other group reads them all.

#### Scenario: Worktree changes with vcs on and off
- **WHEN** `InboxFeature::new()` runs `inbox` on the scratch repository of "Archived worktree changes", first with `osq.toml` holding `[vcs]`, `enabled = true`, `author = "osq <osq@example.com>"` and a `worktreeRoot` naming an empty scratch folder, then with no `osq.toml`
- **THEN** with vcs on, its Needs you group holds the five lines that scenario lists and its Landed since last look group is `  (none)`; with vcs off, its Needs you group is the one line `  001: Draft change — osq approve 001`, and both other groups are `  (none)`

### Requirement: Archived items
Each archived change from a worktree tree SHALL give at most one needs-you
item, as TypeScript's `readNotLanded` and `archivedSteeringItem` do, sorted
with the rest by id. With steering, its first trigger prints
`<head> — needs steering: <trigger> (<reason>) — osq plan <id>`. Without,
`<head> — archived, not landed — osq land <id>` prints when the default
branch lacks `openspec/changes/archive/<folder>` and `osq/<folder>` holds
its `.run/approved`. `<head>` is `  <id>: <title, else folder>`.

#### Scenario: Archived worktree changes
- **WHEN** `InboxFeature::new()` runs `inbox` with vcs on, as "Worktree changes with vcs on and off" says, on a scratch git repository on `main` whose commit holds the active change `001-draft` titled `Draft change`, unapproved, where every change has one task `tasks/1.md` titled `When run, it works`, and which has one worktree per row on the branch `osq/<folder>`, each holding the row's change and committed on its branch
- **THEN** its Needs you group holds, in this order, `  001: Draft change — osq approve 001` and then the row's lines:

| Folder | Worktree holds | Line |
|---|---|---|
| `002-wait` | approved archived change titled `Waiting change`, with an `archived` event | `  002: Waiting change — archived, not landed — osq land 002` |
| `003-steer` | approved archived change with no title and `.run/regressed/change.md` with `reason: sync_verify_red` | `  003: 003-steer — needs steering: regression (sync_verify_red) — osq plan 003` |
| `004-noapproved` | archived change with no `.run/approved` | none |
| `006-blocked` | approved archived change titled `Blocked archive` with `.run/dead/1.md` with `reason: blocked` | `  006: Blocked archive — needs steering: blocked (blocked) — osq plan 006` |
| `007-merged` | approved archived change titled `Merged change`, its branch merged into `main` | none |
| `008-active` | approved active change titled `Active change` with `.run/dead/1.md` with `reason: verify_red`, uncommitted | `  008: Active change — task 1: When run, it works — osq retry 008 1` |
