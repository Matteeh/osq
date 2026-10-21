# Spec Delta: rust-inbox

## ADDED Requirements

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
- read every change under `<root>/openspec/changes/` with the storage
  kernel's `list_changes` and `read_change`, and refuse a change that
  `read_change` refuses with `FeatureError::failed("inbox", <the storage
  error's text>)`;
- otherwise return `Output::text` holding the inbox text followed by one
  newline. The inbox text is `Inbox empty.` when all three groups are
  empty. Otherwise it is the lines `Needs you`, that group's item lines,
  `Running`, that group's item lines, `Landed since last look` and that
  group's item lines, joined by newlines, where a group with no items has
  the one line `  (none)`.

The feature reads only the project root's change folders and writes
nothing. The item lines are those of "Needs-you items", "Running items",
"Landed items" and "Validator failing item". Ids compare by the number
they lead with, then by bytes.

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

### Requirement: Needs-you items
The Needs you group SHALL hold, as TypeScript's `projectNeedsYou`,
`applySteeringItems` and `formatInboxText` do under `DEFAULT_CONFIG`, the
items of each active change whose snapshot has `proposal`, in listing
order, followed by "Validator failing item", sorted stably by id. A
change's id is its snapshot id, or its folder name when that is empty; its
title is its snapshot title, or empty text. A task's title is its
`TaskFile` title, or `<id>.md` when that is empty.

A change contributes, in this order:

1. When it is not approved: a planning item when its verify, trimmed, is
   empty or the placeholder, with the command `osq plan <id>` when its
   snapshot has `brief`, else `osq lint <id>`; otherwise an approval item
   with the command `osq approve <id>`, which asks for the steps first when
   its snapshot's `before_approval` is not `None`. The placeholder is a
   verify that splits into exactly three words, `node`, then `-e` or
   `--eval`, then a word that reads `process.exit(0)` once its whitespace is
   removed and its trailing `;` characters are dropped. Words split on
   whitespace, and a single or double quote groups text up to the same
   quote and is removed.
2. When its folded change record has regressed: a change-regressed item
   with the command `osq retry <id> change`.
3. For each task, in task id order, whose folded status is `Dead` or
   `Regressed`: a task-dead or task-regressed item with the command
   `osq retry <id> <n>`.

An approved change has steering triggers, in this order: from its
`change_regressed` marker, `conflict` for the reason `sync_conflict`,
`requirement_changed` for `requirement_changed`, and `regression` for
`verify_red`, `verify_path_missing` or `sync_verify_red`; then for each
task in task id order, `regression` with the regressed marker's reason when
the task has one, unless that reason is `scope_regression` and the marker's
`verification_passed` is true; else nothing when the task's `done` marker
exists; else, from its dead marker, `blocked` for the reason `blocked` or
`entry_missing`, or `stuck` when the marker's `stuck` is true. Each trigger
carries the marker's reason. When a change has a trigger, only the item its
first trigger targets stays, the change-regressed item for the change's
trigger and the task-dead or task-regressed item of the task otherwise, and
the change's other items are dropped. The item that stays gets the command
`osq plan <id>` and that trigger. A `blocked` trigger on a task also
carries a need: for `entry_missing`, `missing entry files ` followed by the
dead marker's entries joined by `, `, or `(not stated)` when there are no
entries; otherwise the task's `blocked` section, or `(not stated)` when it
has none. Every run of whitespace in a need reads as one space.

Each item is one line, with `<head>` for `  <id>: <title>`:

| Item | Line |
|---|---|
| planning | `<head> — unplanned — <command>` |
| approval | `<head> — <command>` |
| approval with steps first | `<head> — do the steps before approval first — <command>` |
| change-regressed | `<head> — change regressed — <command>` |
| task-dead or task-regressed | `<head> — task <n>: <task title> — <command>` |
| change-regressed with a trigger | `<head> — needs steering: <trigger> (<reason>) — <command>` |
| task item with a trigger | `<head> — task <n>: <task title> — needs steering: <trigger> (<reason>) — <command>` |
| task item with a trigger and a need | `<head> — task <n>: <task title> — needs steering: <trigger> (<reason>): <need> — <command>` |

#### Scenario: Needs you of the active fixture
- **WHEN** `InboxFeature::new()` runs `inbox` on the crate fixture `tests/fixtures/needs-you/`, a copy of the golden fixture without its `archive/` folder
- **THEN** its output text is exactly these lines, each followed by a newline:

| Line |
|---|
| `Needs you` |
| `  001: Unplanned with a brief — unplanned — osq plan 001` |
| `  002: Unplanned without a brief — unplanned — osq lint 002` |
| `  003: Ready plan — osq approve 003` |
| `  004: Steps first — do the steps before approval first — osq approve 004` |
| `  005: Plain halts — change regressed — osq retry 005 change` |
| `  005: Plain halts — task 2: When two runs, it crashes — osq retry 005 2` |
| `  006: Blocked task — task 1: When the key is missing, the task blocks — needs steering: blocked (blocked): The task needs the API key from the human. — osq plan 006` |
| `  007: Missing entry files — task 1: When the entry is read, it exists — needs steering: blocked (entry_missing): missing entry files src/missing.rs, lib/gone.rs — osq plan 007` |
| `  008: Stuck task — task 1: When it runs, it times out — needs steering: stuck (timeout) — osq plan 008` |
| `  009: Change regression to steer — needs steering: regression (verify_red) — osq plan 009` |
| `  010: Passing scope regression — task 1: When its files change, it recertifies — osq retry 010 1` |
| `Running` |
| `  (none)` |
| `Landed since last look` |
| `  (none)` |

#### Scenario: Placeholder verifies
- **WHEN** `InboxFeature::new()` runs `inbox` on a scratch project whose one active change `001-plan` holds `brief.md` and a `proposal.md` with the title `Plan` and the row's verify
- **THEN** its one needs-you line is the row's line:

| Verify | Line |
|---|---|
| `node -e "process.exit(0)"` | `  001: Plan — unplanned — osq plan 001` |
| `node --eval 'process.exit( 0 );;'` | `  001: Plan — unplanned — osq plan 001` |
| `node -e "process.exit(1)"` | `  001: Plan — osq approve 001` |
| `node -p "process.exit(0)"` | `  001: Plan — osq approve 001` |
| `node -e "process.exit(0)" extra` | `  001: Plan — osq approve 001` |

#### Scenario: Blocked task without a stated need
- **WHEN** `InboxFeature::new()` runs `inbox` on a scratch project whose one active change `001-ask`, titled `Ask`, is approved and has one task `1`, titled `When asked, it blocks`, whose event file ends with a `dead` event with the reason `blocked`, whose dead marker has the reason `blocked`, and which has no result file
- **THEN** its one needs-you line is `  001: Ask — task 1: When asked, it blocks — needs steering: blocked (blocked): (not stated) — osq plan 001`

### Requirement: Running items
The Running group SHALL hold, as TypeScript's `projectRunning` does, one
item for each task of an active change, in listing order and then task id
order, whose folded status is `Running`, whose markers hold a `lock`, and
whose lock's pid is above 0 and names a live process, which is when
`/proc/<pid>` exists. The item's elapsed seconds are
`(now_ms - started_at_ms) / 1000`, rounded to the nearest whole number, and
0 when that is below 0. Its duration text is `0s` for 0 seconds, `<s>s`
below 60 seconds, and otherwise `<m>m <s>s` for `m` whole minutes and `s`
seconds left, or `<m>m` when `s` is 0. Its line is
`  <id>: <title> — task <n>: <task title> — <duration> — osq show <id>`.

#### Scenario: Running tasks
- **WHEN** `InboxFeature::at(1760000100000)` runs `inbox` on a scratch project whose one active change `001-run`, titled `Run`, is approved and has the tasks below, each with an event file whose last event is `started`, except task `4`, whose last event is `done`, and each with a lock file `.run/running/<n>.pid` holding the row's pid and `startedAt`, where the test's own pid is `std::process::id()` and `4194305` is above Linux's largest pid
- **THEN** its Running group holds exactly the lines below that have one, in task order:

| Task | Title | pid | startedAt | Line |
|---|---|---|---|---|
| `1` | `When one runs` | the test's own | 1760000025000 | `  001: Run — task 1: When one runs — 1m 15s — osq show 001` |
| `2` | `When two runs` | the test's own | 1760000099600 | `  001: Run — task 2: When two runs — 0s — osq show 001` |
| `3` | `When three runs` | 4194305 | 1760000000000 | none |
| `4` | `When four is done` | the test's own | 1760000000000 | none |
| `5` | `When five runs` | the test's own | 1760000200000 | `  001: Run — task 5: When five runs — 0s — osq show 001` |
| `6` | `When six runs` | the test's own | 1759999980000 | `  001: Run — task 6: When six runs — 2m — osq show 001` |
| `7` | `When seven runs` | the test's own | 1760000090500 | `  001: Run — task 7: When seven runs — 10s — osq show 001` |

### Requirement: Landed items
The Landed since last look group SHALL hold, as TypeScript's
`collectLandedItems` does without a last-look cursor, one item for each
archived change whose snapshot has an archive time, sorted by that time,
newest first, then by id, and at most the first ten. Its title is its
snapshot title, or its folder name when that is empty. Its line is
`  <id>: <title> — archived <archive time><disclosed> — osq show <id>`,
where `<disclosed>` is empty unless at least one of its disclosures holds a
deviation, missing context or an outside-scope section, and then is
` — disclosed: ` followed by, joined by `, ` and in this order, each of
`deviated <count>`, `missing context <count>` and `outside scope <count>`
whose count of tasks holding that section is above 0.

#### Scenario: Newest ten landed changes
- **WHEN** `InboxFeature::new()` runs `inbox` on a scratch project with twelve archived changes `101-a` to `112-l`, each with a `proposal.md` titled with its folder's letter in upper case, such as `A`, and a `change.jsonl` whose one event is `archived` at `2026-10-<day>T10:00:00.000Z`, where the day is the folder number minus 100 written with two digits, except that `112-l` has no archived event and `111-k` is archived at the same time as `110-j`
- **THEN** its Landed since last look group is exactly these lines:

| Line |
|---|
| `  110: J — archived 2026-10-10T10:00:00.000Z — osq show 110` |
| `  111: K — archived 2026-10-10T10:00:00.000Z — osq show 111` |
| `  109: I — archived 2026-10-09T10:00:00.000Z — osq show 109` |
| `  108: H — archived 2026-10-08T10:00:00.000Z — osq show 108` |
| `  107: G — archived 2026-10-07T10:00:00.000Z — osq show 107` |
| `  106: F — archived 2026-10-06T10:00:00.000Z — osq show 106` |
| `  105: E — archived 2026-10-05T10:00:00.000Z — osq show 105` |
| `  104: D — archived 2026-10-04T10:00:00.000Z — osq show 104` |
| `  103: C — archived 2026-10-03T10:00:00.000Z — osq show 103` |
| `  102: B — archived 2026-10-02T10:00:00.000Z — osq show 102` |

### Requirement: Validator failing item
The Needs you group SHALL also hold, as TypeScript's
`readValidatorFailing` and `validatorFailingItem` do, at most one
validator-failing item. Its runs are every `validator_ran` event of the
archived changes' change streams whose outcome is not `not_run`, taken in
listing order and stream order and then sorted stably by timestamp, a
timestamp that does not read as one counting as 0. When the last run's
outcome is `failed`, `timed_out` or `unreadable`, the item names that run's
change, its outcome, the number of runs from the end in a row whose outcome
is one of those three, and its error: the first line of its output that is
not blank, trimmed, or the outcome when there is none. Otherwise there is
no item. Its id and title are those of "Landed items", its command is
`osq show <id>`, and its line is
`<head> — validator <outcome> <runs>× in a row: <error> — <command>`.

#### Scenario: Validator runs
- **WHEN** `InboxFeature::new()` runs `inbox` on a scratch project whose only changes are the archived changes `201-v`, titled `V`, and `202-w`, titled `W`, whose change streams hold the row's `validator_ran` events, given as outcome, timestamp and output
- **THEN** its output text is `Needs you`, the row's line, `Running`, `  (none)`, `Landed since last look` and `  (none)`, each followed by a newline, or `Inbox empty.` and a newline when the row has no line:

| `201-v` runs | `202-w` runs | Needs-you line |
|---|---|---|
| `failed` at `2026-10-01T10:00:00.000Z` with `boom` | none | `  201: V — validator failed 1× in a row: boom — osq show 201` |
| `failed` at `2026-10-03T10:00:00.000Z` with no output | `unreadable` at `2026-10-02T10:00:00.000Z` with `x` | `  201: V — validator failed 2× in a row: failed — osq show 201` |
| `timed_out` at `2026-10-01T10:00:00.000Z` with `slow` | `validated` at `2026-10-02T10:00:00.000Z` | none |
| `validated` at `2026-10-01T10:00:00.000Z` | `failed` at `2026-10-02T10:00:00.000Z` with the output `\n  late  \nmore` as a JSON string, then `not_run` at `2026-10-03T10:00:00.000Z` with the reason `no_scenarios` | `  202: W — validator failed 1× in a row: late — osq show 202` |
| none | none | none |

### Requirement: TypeScript inbox parity
The inbox text SHALL equal the text TypeScript prints for the same
repository with `DEFAULT_CONFIG`, an empty home folder and no running
process. The crate holds the golden fixture `tests/golden/repo/` and
`tests/golden/inbox.txt`, which TypeScript's
`formatInboxText(await readInbox(root, { config: DEFAULT_CONFIG, home }))`
printed once for it, followed by one newline. Neither is edited by hand.

#### Scenario: Golden inbox matches TypeScript
- **WHEN** `InboxFeature::new()` runs `inbox` on `tests/golden/repo/`
- **THEN** its output text equals the bytes of `tests/golden/inbox.txt`, and a mismatch names the first line that differs with both values
