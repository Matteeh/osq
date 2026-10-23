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
- read the pause, after-land and autopilot stop records and the queue
  titles only through rust-storage `read_usage_pause`,
  `read_after_land_failure`, `read_autopilot_stop` and `read_queue_titles`,
  with the home taken from the `HOME` environment variable;
- otherwise return `Output::text` holding the inbox text followed by one
  newline. The inbox text is `Inbox empty.` when all three groups are
  empty. Otherwise it is the lines `Needs you`, that group's item lines,
  `Running`, that group's item lines, `Landed since last look` and that
  group's item lines, joined by newlines, where a group with no items has
  the one line `  (none)`.

The feature writes nothing. The item lines are those of "Needs-you items",
"Running items", "Paused items", "Landed items", "Validator failing item",
"Archived items", "After-land failed item" and "Autopilot stopped item",
in the order "Needs-you order" gives. Ids compare by the number they lead
with, then by bytes.

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

### Requirement: Needs-you items
The Needs you group SHALL hold, as TypeScript's `projectNeedsYou`,
`applySteeringItems` and `formatInboxText` do under `DEFAULT_CONFIG`, the
items of each active change whose snapshot has `proposal`, in listing
order, placed with the group's other items as "Needs-you order" says. A
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
item for each task of an active change whose folded status is `Running`,
whose markers hold a `lock`, and whose lock's pid is above 0 and names a
live process, which is when `/proc/<pid>` exists, together with the items
of "Paused items", sorted stably by change id and then by task id, both
compared as ids compare. The item's elapsed seconds are
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

## ADDED Requirements

### Requirement: Paused items
The Running group SHALL also hold, as TypeScript's `projectPaused` does,
one paused item for each approved active change whose
`read_usage_pause` record has an `until` whose `timestamp_ms` is later than
`now_ms` and a `task` that equals one of the change's task ids, unless a
running item of "Running items" already names that change and task. Its id,
title and task title are those of "Running items", and its line is
`  <id>: <title> — task <n>: <task title> — paused until <day> <time> UTC — osq show <id>`,
where `<day>` is the `until` timestamp's first ten characters and `<time>`
its five characters after the `T`.

#### Scenario: Paused tasks
- **WHEN** `InboxFeature::at(1761134400000)`, the time `2026-10-22T12:00:00.000Z`, runs `inbox` on a scratch project with no `osq.toml` whose active changes, each with a `proposal.md` holding the row's title and one task `tasks/1.md` titled `When it runs` unless the row says otherwise, are the rows below, where `paused.md` gives the row's `.run/paused.md` frontmatter lines, each with the body `usage limit reached`
- **THEN** its output text is exactly the lines below, each followed by a newline:

| Folder | Title | Approved | Tasks | `paused.md` |
|---|---|---|---|---|
| `001-wait` | `Wait` | yes | `1` titled `When one waits`, `2` titled `When two waits` | `task: "2"`, `until: "2026-10-22T12:30:00.000Z"`, `source: wait` |
| `002-live` | `Live` | yes | `1` titled `When live runs`, whose event file's one event is `started` and whose `.run/running/1.pid` holds the test's own pid and `startedAt` 1761134400000 | `task: "1"`, `until: "2026-10-22T13:00:00.000Z"`, `source: wait` |
| `003-passed` | `Passed` | yes | one | `task: "1"`, `until: "2026-10-22T11:59:59.999Z"`, `source: wait` |
| `004-unapproved` | `Unapproved` | no | one | `task: "1"`, `until: "2026-10-22T13:00:00.000Z"`, `source: wait` |
| `005-notask` | `No task` | yes | one | `task: "9"`, `until: "2026-10-22T13:00:00.000Z"`, `source: wait` |
| `006-number` | `Number` | yes | one | `task: 1`, `until: "2026-10-22T13:00:00.000Z"`, `source: wait` |
| `007-source` | `Source` | yes | one | `task: "1"`, `until: "2026-10-22T13:00:00.000Z"`, `source: later` |
| `008-harness` | `Harness` | yes | one | `task: "1"`, `until: "2026-10-23T00:05:00.000Z"`, `source: harness` |

| Line |
|---|
| `Needs you` |
| `  004: Unapproved — osq approve 004` |
| `Running` |
| `  001: Wait — task 2: When two waits — paused until 2026-10-22 12:30 UTC — osq show 001` |
| `  002: Live — task 1: When live runs — 0s — osq show 002` |
| `  008: Harness — task 1: When it runs — paused until 2026-10-23 00:05 UTC — osq show 008` |
| `Landed since last look` |
| `  (none)` |

### Requirement: After-land failed item
The Needs you group SHALL also hold, as TypeScript's `afterLandFailedItem`
does, one after-land-failed item when `read_after_land_failure` of the
project root and the `HOME` folder gives a record, and none when `HOME` is
unset. Its id is the digits the record's `change` leads with, or the whole
`change` when it leads with no digit. Its title is the title of the project
root's archived change whose folder is the record's `change`, or the
record's `change` when there is no such change or its title is empty. Its
line is `  <id>: <title> — after-land command failed — osq land <id>`.

#### Scenario: Failed after-land commands
- **WHEN** `InboxFeature::new()` runs `inbox` on a scratch project with no `osq.toml` whose one change is the archived `030-shipped`, titled `Shipped`, with no `archived` event, and whose `after-land.json` under the real home's `watch_state_dir` of that project holds the row's text, removed when the test ends
- **THEN** its output text is `Needs you`, the row's line, `Running`, `  (none)`, `Landed since last look` and `  (none)`, each followed by a newline, or `Inbox empty.` and a newline when the row has no line:

| `after-land.json` | Needs-you line |
|---|---|
| `{"change":"030-shipped","command":"pnpm build","exitCode":1,"failedAt":"2026-10-22T10:00:00.000Z"}` | `  030: Shipped — after-land command failed — osq land 030` |
| `{"change":"031-gone","command":"pnpm build","exitCode":2,"failedAt":"2026-10-22T10:00:00.000Z"}` | `  031: 031-gone — after-land command failed — osq land 031` |
| `{"change":"plain","command":"pnpm build","exitCode":1,"failedAt":"2026-10-22T10:00:00.000Z"}` | `  plain: plain — after-land command failed — osq land plain` |
| `{"change":"030-shipped","command":"pnpm build","exitCode":"1","failedAt":"2026-10-22T10:00:00.000Z"}` | none |
| `not json` | none |
| no file | none |

### Requirement: Autopilot stopped item
The Needs you group SHALL also hold, as TypeScript's `autopilotStoppedItem`
does, one autopilot-stopped item when `read_autopilot_stop` gives a record.
Its id is the record's `change`, or its `item` when `change` is `None`.
With a `change`, its title is the title of the first listed change, in the
order "Inbox trees" lists every location, whose folder matches the
`change`, or the `change` when none matches or that title is empty. A
folder matches when it equals the trimmed `change` or its padded form, or
starts with either followed by `-`, where the padded form is the number the
trimmed `change` leads with written with at least three digits, or the
trimmed `change` when it leads with no digit. Without a `change`, its title
is the title `read_queue_titles` gives for the slug `item`, or the `item`
when it gives none. Its line is
`  <id>: <title> — autopilot stopped: <reason><detail> — <command>`, where
`<command>` is the record's `command` and `<detail>` is empty without a
detail, and otherwise `: ` followed by the detail with every run of
whitespace read as one space.

#### Scenario: Autopilot stops
- **WHEN** `InboxFeature::new()` runs `inbox` on a scratch project with no `osq.toml` whose one change is the archived `040-stopped`, titled `Stopped`, with no `archived` event, whose `openspec/queue.md` is `# q\n\n## [next-item] The next item\n\nDepends on: nothing\n\n### Goal\n\nX.\n` unless the row says otherwise, and whose `openspec/.run/autopilot-stop.md` is `---`, the row's frontmatter lines, `at: 2026-10-22T10:00:00.000Z`, `---` and the row's body
- **THEN** its output text is `Needs you`, the row's line, `Running`, `  (none)`, `Landed since last look` and `  (none)`, each followed by a newline, or `Inbox empty.` and a newline when the row has no line:

| Frontmatter | Body | Needs-you line |
|---|---|---|
| `reason: halted`, `item: stopped-item`, `change: "040"`, `command: osq retry 040 1` | `task 1 died:\n  verify_red\n` | `  040: Stopped — autopilot stopped: halted: task 1 died: verify_red — osq retry 040 1` |
| `reason: land_stopped`, `item: gone-item`, `change: "041"`, `command: osq land 041` | empty | `  041: 041 — autopilot stopped: land_stopped — osq land 041` |
| `reason: halted`, `item: stopped-item`, `change: "40"`, `command: osq retry 040 1` | empty | `  40: Stopped — autopilot stopped: halted — osq retry 040 1` |
| `reason: plan_refused`, `item: next-item`, `command: osq queue approve` | empty | `  next-item: The next item — autopilot stopped: plan_refused — osq queue approve` |
| `reason: queue_unreadable`, `item: next-item`, `command: osq queue approve`, with `## [Bad Slug] Broken\n\nDepends on: nothing\n\nY.\n` appended to the queue | `bad slug\n` | `  next-item: next-item — autopilot stopped: queue_unreadable: bad slug — osq queue approve` |
| `reason: not_approved`, `item: other-item`, `command: osq queue approve` | empty | `  other-item: other-item — autopilot stopped: not_approved — osq queue approve` |
| `reason: bogus`, `item: next-item`, `command: osq queue approve` | empty | none |

### Requirement: Needs-you order
The Needs you group SHALL list, as TypeScript's `readInbox` does, the
items of "Needs-you items", then those of "Archived items", then the item
of "After-land failed item", then that of "Validator failing item", then
that of "Autopilot stopped item", sorted stably by id.

#### Scenario: Items of one change in TypeScript's order
- **WHEN** `InboxFeature::new()` runs `inbox` on a scratch project with no `osq.toml` holding the unapproved active change `049-draft`, titled `Draft`, and the archived change `050-all`, titled `All`, whose change stream's one event is `validator_ran` at `2026-10-22T09:00:00.000Z` with the outcome `failed` and the output `boom`, with `{"change":"050-all","command":"pnpm build","exitCode":1,"failedAt":"2026-10-22T10:00:00.000Z"}` as its `after-land.json` under the real home's `watch_state_dir` of that project, removed when the test ends, and an `openspec/.run/autopilot-stop.md` with `reason: land_stopped`, `item: all-item`, `change: "050"`, `command: osq land 050`, `at: 2026-10-22T10:00:00.000Z` and an empty body
- **THEN** its output text is exactly these lines, each followed by a newline:

| Line |
|---|
| `Needs you` |
| `  049: Draft — osq approve 049` |
| `  050: All — after-land command failed — osq land 050` |
| `  050: All — validator failed 1× in a row: boom — osq show 050` |
| `  050: All — autopilot stopped: land_stopped — osq land 050` |
| `Running` |
| `  (none)` |
| `Landed since last look` |
| `  (none)` |
