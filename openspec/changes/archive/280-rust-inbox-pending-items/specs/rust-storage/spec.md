## ADDED Requirements

### Requirement: Usage pause record
`read_usage_pause(folder: &Path) -> Option<PauseRecord>` in
`osq-kernel-storage` SHALL read a change folder's `.run/paused.md` as
TypeScript's `readUsagePause` does. `PauseRecord` SHALL be public, exported
from the crate root, derive `Debug`, `Clone`, `PartialEq` and `Eq`, and
hold `task: String`, `until: String`, `source: String` and `error:
Option<String>`. It SHALL return `None` when the file is missing or cannot
be read, when its frontmatter does not parse, when `task` or `until` is
not a string, when `until` is not a timestamp `timestamp_ms` accepts, or
when `source` is not `harness` or `wait`. `error` is the body, trimmed,
and `None` when that is empty or `usage limit reached`.

#### Scenario: Pause records
- **WHEN** `read_usage_pause` reads a scratch change folder whose `.run/paused.md` is `---`, the row's frontmatter lines, `---` and the row's body
- **THEN** it returns the row's record:

| Frontmatter | Body | Record |
|---|---|---|
| `task: "2"`, `until: "2026-10-22T12:30:00.000Z"`, `source: wait` | `usage limit reached\n` | task `2`, until `2026-10-22T12:30:00.000Z`, source `wait`, no error |
| `task: "1"`, `until: 2026-10-23T00:05:00.000Z`, `source: harness` | `  rate limited  \n` | task `1`, until `2026-10-23T00:05:00.000Z`, source `harness`, error `rate limited` |
| `task: "1"`, `until: "2026-10-23T00:05:00.000Z"`, `source: wait` | `\n` | task `1`, until `2026-10-23T00:05:00.000Z`, source `wait`, no error |
| `task: 1`, `until: "2026-10-23T00:05:00.000Z"`, `source: wait` | `usage limit reached\n` | none |
| `task: "1"`, `source: wait` | `usage limit reached\n` | none |
| `task: "1"`, `until: soon`, `source: wait` | `usage limit reached\n` | none |
| `task: "1"`, `until: "2026-10-23T00:05:00.000Z"`, `source: later` | `usage limit reached\n` | none |
| `task: "1"`, `until: "2026-10-23T00:05:00.000Z"` | `usage limit reached\n` | none |
| `task: [` | `usage limit reached\n` | none |

#### Scenario: No pause file
- **WHEN** `read_usage_pause` reads a scratch change folder with no `.run/paused.md`
- **THEN** it returns `None`

### Requirement: Autopilot stop record
`read_autopilot_stop(project_root: &Path) -> Option<AutopilotStop>` in
`osq-kernel-storage` SHALL read `<project_root>/openspec/.run/autopilot-stop.md`
as TypeScript's `readAutopilotStop` does. `AutopilotStop` SHALL be public,
exported from the crate root, derive `Debug`, `Clone`, `PartialEq` and
`Eq`, and hold `reason: String`, `item: String`, `change: Option<String>`,
`command: String`, `at: String` and `detail: Option<String>`. It SHALL
return `None` when the file is missing or cannot be read, when its
frontmatter does not parse, when `reason` is not one of `queue_unreadable`,
`not_approved`, `changed_since_approval`, `rejected`, `plan_refused`,
`planner_not_ready`, `approve_refused`, `halted` and `land_stopped`, when
`item`, `command` or `at` is not a string, or when `change` is present and
not a string. `change` is `None` when the key is absent. `detail` is the
body with one trailing `\n` removed, and `None` when the body, trimmed, is
empty.

#### Scenario: Stop records
- **WHEN** `read_autopilot_stop` reads a scratch project whose `openspec/.run/autopilot-stop.md` is `---`, the row's frontmatter lines, `---` and the row's body, where the base lines are `reason: halted`, `item: stopped-item`, `change: "040"`, `command: osq retry 040 1` and `at: 2026-10-22T10:00:00.000Z`
- **THEN** it returns the row's record:

| Frontmatter | Body | Record |
|---|---|---|
| the base lines | `task 1 died:\n  verify_red\n` | reason `halted`, item `stopped-item`, change `040`, command `osq retry 040 1`, at `2026-10-22T10:00:00.000Z`, detail `task 1 died:\n  verify_red` |
| the base lines without `change` | empty | the first row's record with no change and no detail |
| the base lines | `\n\n` | the first row's record with no detail |
| the base lines | `line\n\n` | the first row's record with detail `line\n` |
| the base lines with `reason: bogus` | empty | none |
| the base lines with `change: 40` | empty | none |
| the base lines with `change: null` | empty | none |
| the base lines without `item` | empty | none |
| the base lines without `command` | empty | none |
| the base lines without `at` | empty | none |
| `reason: [` | empty | none |

#### Scenario: Every stop reason
- **WHEN** `read_autopilot_stop` reads the base lines of "Stop records" with each of `queue_unreadable`, `not_approved`, `changed_since_approval`, `rejected`, `plan_refused`, `planner_not_ready`, `approve_refused`, `halted` and `land_stopped` as the reason, and an empty body
- **THEN** it returns a record with that reason each time

#### Scenario: No stop file
- **WHEN** `read_autopilot_stop` reads a scratch project with no `openspec/.run/autopilot-stop.md`
- **THEN** it returns `None`

### Requirement: After-land failure record
`watch_state_dir(project_root: &Path, home: &Path) -> PathBuf` in
`osq-kernel-storage` SHALL return, as TypeScript's `watchStateDir` does,
`<home>/.osq/watch/<hash>`, where `<hash>` is the lowercase hex SHA-256 of
the project root's canonical path, or of its absolute path when it cannot
be canonicalized, as UTF-8 text.

`read_after_land_failure(project_root: &Path, home: &Path) ->
Option<AfterLandFailure>` SHALL read `after-land.json` in that folder as
TypeScript's `readAfterLandFailure` does. `AfterLandFailure` SHALL be
public, exported from the crate root, derive `Debug`, `Clone`, `PartialEq`
and `Eq`, and hold `change: String`, `command: String`, `exit_code: i64`
and `failed_at: String`. It SHALL return `None` when the file is missing or
cannot be read, when it does not parse as a JSON object, when `change`,
`command` or `failedAt` is not a string, or when `exitCode` is not a whole
number that fits `i64`.

#### Scenario: Watch state folder
- **WHEN** `watch_state_dir` is given the project root `/nonexistent/osq-project` and the home `/home/h`
- **THEN** it returns `/home/h/.osq/watch/84ade4b4937a142d12c5438d1dc81c2e2229362203630b653b27e43e8cc8fcde`

#### Scenario: Watch state folder through a symlink
- **WHEN** `watch_state_dir` is given a symlink to a scratch project folder, and then that folder itself, with the same home
- **THEN** both calls return the same path

#### Scenario: After-land records
- **WHEN** `read_after_land_failure` reads a scratch project and a scratch home whose `watch_state_dir` folder holds an `after-land.json` with the row's text
- **THEN** it returns the row's record:

| `after-land.json` | Record |
|---|---|
| `{"change":"030-shipped","command":"pnpm build","exitCode":1,"failedAt":"2026-10-22T10:00:00.000Z"}` | change `030-shipped`, command `pnpm build`, exit code 1, failed at `2026-10-22T10:00:00.000Z` |
| `{"change":"030-shipped","command":"pnpm build","exitCode":"1","failedAt":"2026-10-22T10:00:00.000Z"}` | none |
| `{"command":"pnpm build","exitCode":1,"failedAt":"2026-10-22T10:00:00.000Z"}` | none |
| `{"change":"030-shipped","command":5,"exitCode":1,"failedAt":"2026-10-22T10:00:00.000Z"}` | none |
| `{"change":"030-shipped","command":"pnpm build","exitCode":1}` | none |
| `[]` | none |
| `not json` | none |

#### Scenario: No after-land file
- **WHEN** `read_after_land_failure` reads a scratch project and a scratch home with no `after-land.json`
- **THEN** it returns `None`

### Requirement: Queue item titles
`read_queue_titles(project_root: &Path) -> Vec<QueueTitle>` in
`osq-kernel-storage` SHALL read `<project_root>/openspec/queue.md` as
TypeScript's `parseQueue` does, and return one `QueueTitle` per item in
file order. `QueueTitle` SHALL be public, exported from the crate root,
derive `Debug`, `Clone`, `PartialEq` and `Eq`, and hold `slug: String` and
`title: String`. It SHALL return no item when the file is missing or cannot
be read, and when `parseQueue` would throw on any item: a heading line that
starts with `##`, optional spaces or tabs and `[` but is not `## [<slug>]
<title>`, a slug that is not lowercase words of letters and digits joined
by `-`, a repeated slug, a first non-blank line after the heading that is
not `Depends on:` with a value, a dependency or fix that is not a slug,
repeats, or names the item itself or no earlier item, an empty `Fixes:`
line right after `Depends on:`, an empty body, or a body holding a second
`Depends on:` or `Fixes:` line. A title is trimmed, and a `\r` before a
line's `\n` is ignored.

#### Scenario: Queue titles
- **WHEN** `read_queue_titles` reads a scratch project whose `openspec/queue.md` holds the row's text, where `<ok a>` stands for `## [a] A\n\nDepends on: nothing\n\nBody.\n\n`
- **THEN** it returns the row's titles:

| `queue.md` | Titles |
|---|---|
| `# Queue\n\nPreamble.\n\n## [first] First item\n\nDepends on: nothing\n\nBody.\n\n## [second] Second item  \n\nDepends on: first\nFixes: first\n\nBody.\n\n` | `first` titled `First item`, then `second` titled `Second item` |
| `## [first] First\r\n\r\nDepends on: nothing\r\n\r\nBody.\r\n` | `first` titled `First` |
| `##[first] First\n\nDepends on: nothing\n\nBody.\n` | none |
| `## [Bad_Slug] Title\n\nDepends on: nothing\n\nBody.\n` | none |
| `## [first]   \n\nDepends on: nothing\n\nBody.\n` | none |
| `<ok a>## [a] Again\n\nDepends on: nothing\n\nBody.\n` | none |
| `## [first] First\n\nBody.\n` | none |
| `## [first] First\n\nDepends on:\n\nBody.\n` | none |
| `## [first] First\n\nDepends on: later\n\nBody.\n` | none |
| `## [first] First\n\nDepends on: first\n\nBody.\n` | none |
| `<ok a>## [b] B\n\nDepends on: a, a\n\nBody.\n` | none |
| `<ok a>## [b] B\n\nDepends on: A\n\nBody.\n` | none |
| `<ok a>## [b] B\n\nDepends on: nothing\nFixes:\n\nBody.\n` | none |
| `<ok a>## [b] B\n\nDepends on: nothing\nFixes: later\n\nBody.\n` | none |
| `<ok a>## [b] B\n\nDepends on: nothing\nFixes: a, a\n\nBody.\n` | none |
| `## [first] First\n\nDepends on: nothing\n\n` | none |
| `## [first] First\n\nDepends on: nothing\n\nBody.\n\nDepends on: nothing\n` | none |
| `<ok a>## [b] B\n\nDepends on: nothing\nFixes: a\n\nBody.\n  Fixes: a\n` | none |

#### Scenario: No queue file
- **WHEN** `read_queue_titles` reads a scratch project with no `openspec/queue.md`
- **THEN** it returns no item
