## MODIFIED Requirements

### Requirement: Inbox command
`osq-feature-inbox` SHALL expose one public item, `InboxFeature`, which
implements core's `Feature`. `InboxFeature::new()` reads the system clock
at each run, and `InboxFeature::at(now_ms)` uses the fixed time `now_ms`, in
milliseconds since the Unix epoch, for every run. `with_home(home)` returns
the same feature with `home` as its home folder; without it, the home is
the `HOME` environment variable at each run, and with neither the inbox
reads and writes nothing under a home. Its `name()` is `inbox` and its
`commands()` is one `Command` with the name `inbox`, the summary
`List the changes that need you, what runs, and what landed` and the usage
`[--json]`.

`run(invocation)` SHALL:

- refuse a command other than `inbox` with `FeatureError::unknown_command`
  naming it;
- take every argument `--json`, in any position and any number of times, as
  the request for JSON output, and refuse any other argument with
  `FeatureError::usage("inbox", "takes no arguments")`;
- read `<root>/osq.toml` with the config kernel's `load_config`, and refuse
  a config error with `FeatureError::failed("inbox", <its text>)`;
- read the changes as "Inbox trees" says, and refuse a change that
  `read_change` refuses with `FeatureError::failed("inbox", <the storage
  error's text>)`;
- read the pause, after-land and autopilot stop records and the queue
  titles only through rust-storage `read_usage_pause`,
  `read_after_land_failure`, `read_autopilot_stop` and `read_queue_titles`,
  with its home;
- read the last-look cursor before the groups and write it after them, as
  "Last-look cursor" says;
- otherwise return `Output::text` holding, with `--json`, the inbox JSON of
  "Inbox JSON", and without it the inbox text, each followed by one
  newline. The inbox text is `Inbox empty.` when all three groups are
  empty. Otherwise it is the lines `Needs you`, that group's item lines,
  `Running`, that group's item lines, `Landed since last look` and that
  group's item lines, joined by newlines, where a group with no items has
  the one line `  (none)`.

The feature writes nothing but the cursor. The item lines are those of
"Needs-you items", "Running items", "Paused items", "Landed items",
"Validator failing item", "Archived items", "After-land failed item" and
"Autopilot stopped item", in the order "Needs-you order" gives. Ids compare
by the number they lead with, then by bytes. Every test in this crate gives
the feature an empty scratch home with `with_home`, so none reads or writes
the real home.

#### Scenario: Inbox feature description
- **WHEN** `InboxFeature::new()` is asked for its name and commands
- **THEN** its name is `inbox`, and it lists exactly one command, with the name `inbox`, the summary `List the changes that need you, what runs, and what landed` and the usage `[--json]`

#### Scenario: Inbox calls that are refused
- **WHEN** `InboxFeature::new()` runs each invocation below on a scratch project with no `openspec` folder
- **THEN** it returns the row's error, and the error displays as the row's text:

| Command | Arguments | Error | Text |
|---|---|---|---|
| `inbox` | `--yaml` | usage | `usage of inbox: takes no arguments` |
| `inbox` | `--json`, `extra` | usage | `usage of inbox: takes no arguments` |
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

### Requirement: Landed items
The Landed since last look group SHALL hold, as TypeScript's
`collectLandedItems` does, one item for each archived change whose snapshot
has an archive time. With a last-look cursor, as "Last-look cursor" reads
it, the group holds every such change archived strictly after the cursor;
without one, at most the first ten. Either way the items are sorted by
archive time, newest first, then by id. Its title is its snapshot title,
or its folder name when that is empty. Its line is
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

#### Scenario: Landed after the cursor
- **WHEN** `InboxFeature::new()` with an empty scratch home runs `inbox` on the scratch project of "Newest ten landed changes", once for each row's cursor file content
- **THEN** its Landed since last look group holds the row's lines, from the table of "Newest ten landed changes" with `  101: A — archived 2026-10-01T10:00:00.000Z — osq show 101` after its last line:

| Cursor file | Lines |
|---|---|
| `{"lastLook":"2026-10-08T10:00:00.000Z"}` | the `110`, `111` and `109` lines |
| `{"lastLook":"2026-09-01T00:00:00.000Z"}` | all eleven lines |
| `{"lastLook":"2026-10-11T00:00:00.000Z"}` | none, so the group is `  (none)` |
| `{"lastLook":"later"}` | the first ten lines |
| `not json` | the first ten lines |

## ADDED Requirements

### Requirement: Last-look cursor
The inbox SHALL read and advance the per-project last-look cursor as
TypeScript's `readLastLook` and `writeLastLook` do. The cursor file is
`<home>/.osq/last-look/<hash>.json`, where `<hash>` is the last path part of
rust-storage `watch_state_dir(root, home)`, the SHA-256 of the root's
canonical path. Before it reads the groups, the inbox reads the cursor as
the milliseconds of the file's string `lastLook`; a missing file, a file
that is not a JSON object, a `lastLook` that is not a string or a string
that is not a valid time is no cursor. After the groups are read and
before the output is returned, with or without `--json`, it writes the file,
creating its folders, as `{"lastLook":"<now>"}` and one newline, where
`<now>` is the run's time written as JavaScript's `toISOString()` writes
it, such as `2026-10-24T12:00:00.000Z`. A failed write fails the run with
`FeatureError::failed("inbox", <its text>)`. A refused run writes nothing.

#### Scenario: Cursor file after a run
- **WHEN** `InboxFeature::at(1792843200000)` with an empty scratch home runs `inbox` with no arguments on a scratch project with no `openspec` folder, then, with a second empty scratch home, with the argument `extra`, and then with no arguments and a home that is a regular file
- **THEN** the first run leaves the cursor file of the project root holding `{"lastLook":"2026-10-24T12:00:00.000Z"}` and one newline, the refused run leaves no cursor file in its home, and a third run whose home is a regular file returns `FeatureError::failed` for the command `inbox`

#### Scenario: Inbox cursor equals TypeScript's
- **WHEN** `InboxFeature::at(1792843200000)` runs `inbox` on a fresh copy of `tests/golden/repo/` with an empty scratch home holding the copy's cursor file with `{"lastLook":"2026-10-01T10:00:00.000Z"}` and one newline
- **THEN** its output text equals `tests/fixtures/json-golden/repo-cursor.txt`, byte for byte, whose Landed since last look group is only the `021` line

### Requirement: Inbox JSON
With `--json`, the inbox SHALL print TypeScript's
`JSON.stringify(inbox, null, 2)` of the same groups the text prints, as
`osq --json` prints it: an object of `needsYou`, `running` and `landed`,
each an array in the text's order, with two-space indentation and strings
escaped as `JSON.stringify` escapes them.

- A needs-you item is `kind`, `change` (`id`, `title`), `task` (`null`, or `number` and `title`), `command`, then each of these that the item has: `beforeApproval` (`true`, for an approval item with steps first), `stuck` (`fingerprint`, the dead marker's `fingerprint`, for a task that died stuck), `steering` (`trigger`, `reason`), `blocked` (`need`), `validatorFailing` (`outcome`, `runs`, `error`) and `autopilotStopped` (`reason`, `item`, `change`, `detail`, the last two `null` when absent).
- A `kind` is `planning`, `approval`, `task-dead`, `task-regressed`, `change-regressed`, `change-archived`, `after-land-failed`, `validator-failing` or `autopilot-stopped`; an archived change that needs steering is a `change-regressed` item.
- A blocked need in JSON is the stated text as read, its whitespace kept; only the text line collapses it.
- A running item is `change`, `task`, `pid`, `startedAt` (the lock's time written as `toISOString()` writes it), `elapsedSeconds` and `command`; a paused item is `change`, `task`, `pausedUntil` (the pause's `until` as written) and `command`.
- A landed item is `change`, `archivedAt`, `command`, then `disclosures` (`deviated`, `missingContext`, `outsideScope`, each a count) when one of the counts is above 0.

The goldens in `tests/fixtures/json-golden/` are TypeScript's output,
printed by `print-inbox-goldens.mjs.txt` beside them at the time
`2026-10-24T12:00:00.000Z`, with the running lock's pid replaced by
`<pid>`. Each case's base folder holds `checkout`, a copy of its fixture,
and `home`, an empty home folder. The `records` case copies
`tests/fixtures/json-records/` and builds, as the script's header says, a
git repository on `main` without `openspec/changes/archive/033-wait`, the
worktree `<base>/worktree` on the branch `osq/033-wait` that adds it, a
running lock for task 1 of `030-run` started 125 seconds before the time,
and an `after-land.json` for the change `035-gone`; its Rust test writes
`osq.toml` with `[vcs]` holding `enabled = true` and `author = "osq
<osq@example.com>"` before the first commit, and its own pid in the lock.

#### Scenario: Inbox JSON equals TypeScript's
- **WHEN** `InboxFeature::at(1792843200000)` with the case's empty scratch home runs `inbox` with the row's arguments on the case's `checkout`, built as "Inbox JSON" says
- **THEN** its output text, with its own pid replaced by `<pid>`, equals the row's golden, byte for byte, and after each `--json` run the copy's cursor file holds `{"lastLook":"2026-10-24T12:00:00.000Z"}` and one newline:

| Case | Arguments | Golden |
|---|---|---|
| repo | `--json` | `repo.json` |
| repo, cursor at `2026-10-01T10:00:00.000Z` | `--json` | `repo-cursor.json` |
| records | `--json` | `records.json` |
| records | none | `records.txt` |
