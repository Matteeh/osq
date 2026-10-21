# rust-plan Specification

## Purpose
The plan feature: a planner writes a change folder. It holds the feature's logic, its command, its route and its loop hooks, as ADR 022 says.

## Requirements

### Requirement: Code ownership
<!-- source: crates/features/plan/** -->
The rust-plan capability SHALL own the `osq-feature-plan` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Plan crate ownership
- **WHEN** file ownership is resolved for the plan feature
- **THEN** system maps `crates/features/plan/**` to rust-plan

### Requirement: Plan feature
`osq-feature-plan` SHALL expose one public item, the struct `PlanFeature`,
which implements rust-core's `Feature`, holds no storage connection, as ADR
028 says, and derives `Clone`, `Copy`, `Debug`, `Default`, `PartialEq` and
`Eq`. `PlanFeature::new()`, which equals `PlanFeature::default()`, reads the
system clock at each run, and `PlanFeature::at(now_ms)` uses `now_ms`, in
epoch milliseconds, as the current time of every run. Its `name` SHALL be
`plan`, and its `commands` SHALL be exactly two, in this order: `queue`, with
the summary `print the read-only brief queue projection` and an empty usage,
and `plan`, with the summary
`prepare a change and hand off its opening prompt to your planning tool` and
the usage `--next [--replan]`.

#### Scenario: Plan feature commands
- **WHEN** a test reads the name and commands of `PlanFeature::new()`
- **THEN** the name is `plan`, and the commands are, in order:

| Name | Summary | Usage |
|---|---|---|
| `queue` | `print the read-only brief queue projection` | `` (empty text) |
| `plan` | `prepare a change and hand off its opening prompt to your planning tool` | `--next [--replan]` |

### Requirement: Queue arguments
`PlanFeature::run` SHALL return `FeatureError::unknown_command` with the
invocation's command for any command but `queue` and `plan`, and
`FeatureError::usage("queue", "expected no arguments, got <n>")` for a
`queue` invocation with `n` arguments when `n` is at least one. Every other
failure of `queue` SHALL be `FeatureError::failed` with the command `queue`
and the message the other queue requirements name.

#### Scenario: Queue argument errors
- **WHEN** a test runs the invocation in the row with a root that holds no `openspec/` folder
- **THEN** it gives the row's error:

| Invocation | Error |
|---|---|
| `queue` with args `x` | `Usage` error displayed `usage of queue: expected no arguments, got 1` |
| `queue` with args `x`, `y` | `Usage` error displayed `usage of queue: expected no arguments, got 2` |
| `planx` with no args | `UnknownCommand` error displayed `unknown command: planx` |

### Requirement: Queue items
`queue` SHALL read `<root>/openspec/queue.md` and split it into items as
TypeScript's `parseQueue` in `src/core/status/queue-parser.ts` does:

- An item's raw text starts at each line that begins with `##`, then any
  spaces or tabs, then `[`, and runs to the start of the next such line or
  the end of the file. Text before the first item belongs to no item.
- The item's first line, without a trailing `\r`, is its heading:
  `##`, one or more spaces or tabs, `[`, the slug text holding no `]`, `\r`
  or `\n`, `]`, one or more spaces or tabs, and the title, which starts with
  a non-whitespace character and holds no `\r`, U+2028 or U+2029 before
  its trailing spaces, tabs and `\r`, which are not part of the title. The slug is the bracket text trimmed and matches
  `^[a-z0-9]+(?:-[a-z0-9]+)*$`; the title is trimmed and not empty.
- The first line after the heading that is not blank, without a trailing
  `\r`, is the dependency line, `Depends on:` followed by its value with
  surrounding spaces, tabs and `\r` dropped. The value `nothing` means no
  dependencies; any other value is a comma-separated list of slugs, each
  trimmed.
- The first line after the dependency line that is not blank is the fixes
  line when, without a trailing `\r`, it starts `Fixes:`; its value is
  read as the dependency value is, and has no `nothing` form.
- Every dependency and fix matches the slug pattern, appears once in its
  line, and names an earlier item, never the item itself.
- The brief body is the raw text after the fixes line, or after the
  dependency line when there is none, trimmed. It is not empty and holds no
  line that starts, after leading whitespace, with `Depends on:` or
  `Fixes:`.

The item's dependencies and fixes keep the order of their lines.

#### Scenario: Items of a queue
- **WHEN** `queue` runs on a root whose `openspec/queue.md` holds the row's text, written here with `\n` and `\r` escapes, and which has no `openspec/changes/` folder
- **THEN** it gives an `Output` whose text is the row's text:

| Queue | Output |
|---|---|
| `# Queue\n\nNothing yet.\n` | `Queue:\n  (no items)` |
| `# Queue\n\nPeople text.\n\n## [a] First item  \r\n\r\nDepends on: nothing\r\n\r\nA brief.\r\n\r\n### [x] Not an item\r\n\r\n##\t[b-2]\tSecond item\n\nDepends on: a\nFixes: a\n\nB brief.\n` | `Queue:\n  a: First item [unplanned] rejections: 0\n  b-2: Second item [unplanned] rejections: 0 unmet: a, a` |
| `## [a] First item\n\nDepends on: nothing\n\nA brief.\n` | `Queue:\n  a: First item [unplanned] rejections: 0` |

#### Scenario: This repository's queue
- **WHEN** a corpus test runs `queue` with this repository's root
- **THEN** it gives an `Output` whose text starts with `Queue:` and holds one line after it for each line of `openspec/queue.md` that starts with `## [`

### Requirement: Queue refusals
When `<root>/openspec/queue.md` does not exist, `queue` SHALL fail with the
message `Queue file not found: <path>`, and when `parseQueue` would refuse
its text, `queue` SHALL fail with `<path>: <detail>`, where `<path>` is the
root joined with `openspec/queue.md` and `<detail>` is the text `parseQueue`
gives. Text quoted in a detail is written as a JSON string literal: in
double quotes, with `"` and `\` escaped by a backslash, `\n`, `\r`, `\t`,
backspace and form feed as their two-character escapes, and every other
character below U+0020 as `\u` and four lowercase hexadecimal digits. The
first refusal in file order wins, and within an item the checks run in the
order of the table below.

#### Scenario: Refused queues
- **WHEN** `queue` runs on a root whose `openspec/queue.md` holds the row's text, written here with `\n` escapes, or on a root with no `openspec/queue.md` for the first row
- **THEN** it gives a `Failed` error for the command `queue` whose message is `<path>: ` and the row's detail, or, for the first row, `Queue file not found: <path>`, with `<path>` the root joined with `openspec/queue.md`:

| Queue | Detail |
|---|---|
| no file | (none) |
| `## [a]\n\nDepends on: nothing\n\nA.\n` | `malformed queue item heading "## [a]"` |
| `##[a] A\n\nDepends on: nothing\n\nA.\n` | `malformed queue item heading "##[a] A"` |
| `## [a b] A\n\nDepends on: nothing\n\nA.\n` | `invalid queue item slug "a b"` |
| `## [Bad_Slug] A\n\nDepends on: nothing\n\nA.\n` | `invalid queue item slug "Bad_Slug"` |
| `## [a] A\n\nDepends on: nothing\n\nA.\n\n## [a] A\n\nDepends on: nothing\n\nA.\n` | `duplicate queue item slug "a"` |
| `## [a] A\n\n` | `queue item "a" is missing its Depends on: line` |
| `## [a] A\n\nNeeds: nothing\n\nA.\n` | `queue item "a" has a malformed dependency line` |
| `## [a] A\n\nDepends on:\n\nA.\n` | `queue item "a" has an empty dependency line` |
| `## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: A\n\nB.\n` | `queue item "b" has an invalid dependency "A"` |
| `## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: a, a\n\nB.\n` | `queue item "b" repeats dependency "a"` |
| `## [a] A\n\nDepends on: b\n\nA.\n\n## [b] B\n\nDepends on: nothing\n\nB.\n` | `queue item "a" dependency "b" must reference an earlier item` |
| `## [a] A\n\nDepends on: a\n\nA.\n` | `queue item "a" dependency "a" must reference an earlier item` |
| `## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: nothing\nFixes:\n\nB.\n` | `queue item "b" has an empty fixes line` |
| `## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: nothing\nFixes: A\n\nB.\n` | `queue item "b" has an invalid fix "A"` |
| `## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: nothing\nFixes: a, a\n\nB.\n` | `queue item "b" repeats fix "a"` |
| `## [a] A\n\nDepends on: nothing\nFixes: a\n\nA.\n` | `queue item "a" fix "a" must reference an earlier item` |
| `## [a] A\n\nDepends on: nothing\n\n` | `queue item "a" has an empty brief body` |
| `## [a] A\n\nDepends on: nothing\n\nA.\nDepends on: nothing\n` | `queue item "a" has more than one Depends on: line` |
| `## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: nothing\nFixes: a\n\nB.\nFixes: a\n` | `queue item "b" has more than one Fixes: line` |
| `## [a\t"b] A\n\nDepends on: nothing\n\nA.\n` | `invalid queue item slug "a\t\"b"` |
| `## [a] A\rB\n\nDepends on: nothing\n\nA.\n` | `malformed queue item heading "## [a] A\rB"` |

### Requirement: Queue text
The text `queue` returns SHALL be the line `Queue:`, then one line per item
in queue order, or the one line `  (no items)` when there is none, joined by
newlines with no newline at the end. An item's line SHALL be two spaces,
`<slug>: <title> [<state>]`, then ` change: <id>` when the item has a
change, ` rejections: <count>`, then ` unmet: ` and its unmet slugs joined
by `, ` when it has any, then ` changed since planned` when the item is
flagged. An item's unmet slugs are its dependencies, then its fixes, in
their order and with repeats kept, leaving out each slug whose item is
`landed`.

#### Scenario: Lines of unplanned items
- **WHEN** `queue` runs on a root whose `openspec/queue.md` holds `## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: a\nFixes: a\n\nB.\n\n## [c] C\n\nDepends on: b, a\n\nC.\n`, written with `\n` escapes, and no `openspec/changes/` folder
- **THEN** the text is `Queue:`, `  a: A [unplanned] rejections: 0`, `  b: B [unplanned] rejections: 0 unmet: a, a` and `  c: C [unplanned] rejections: 0 unmet: b, a`, joined by newlines with no newline at the end

### Requirement: Queue item hash
Each item SHALL have the hash `sha256:` followed by the 64 lowercase
hexadecimal digits of the SHA-256 of its raw text's UTF-8 bytes, as
`parseQueue` computes it: from the start of its heading line up to the
start of the next item's heading line or the end of the file, blank lines
and `\r` included.

#### Scenario: Changed since planned
- **WHEN** `queue` runs on a root whose `openspec/queue.md` holds `## [a] First item\n\nDepends on: nothing\n\nA brief.\n`, written with `\n` escapes, and whose one change folder, the active `openspec/changes/001-a/`, holds no `.run/` folder, a `proposal.md` whose frontmatter is `title: P` and a `brief.md` whose frontmatter is `queue_item: a` and the row's `queue_hash` line
- **THEN** the text is `Queue:` and the row's line, joined by a newline:

| queue_hash line | Line |
|---|---|
| `queue_hash: sha256:c35d97849fbe6b40784be4564395126955b5465cb25c063c92e0a37cd2609dcb` | `  a: First item [planned] change: 001 rejections: 0` |
| `queue_hash: sha256:C35D97849FBE6B40784BE4564395126955B5465CB25C063C92E0A37CD2609DCB` | `  a: First item [planned] change: 001 rejections: 0 changed since planned` |
| `queue_hash: 7` | `  a: First item [planned] change: 001 rejections: 0 changed since planned` |
| none | `  a: First item [planned] change: 001 rejections: 0 changed since planned` |

### Requirement: Queue associations
A change folder SHALL belong to a queue item when its `brief.md`
frontmatter, read through rust-storage `frontmatter_string`, has a string
`queue_item` whose trimmed value is the item's slug. `queue` SHALL take the
change folders from rust-storage `list_changes(root)`, in its order. A
folder without a `brief.md`, with one that cannot be read, or whose
`queue_item` is missing, not a string or names no item of the queue belongs
to no item. For each item, its folders are grouped by location. When an item
has more than one archived folder, `queue` SHALL fail with
`Ambiguous queue association for "<slug>": multiple archived changes (<folders>)`,
and otherwise, when it has more than one active folder, with the same
message naming `active` changes, where `<folders>` are the folder names in
listing order joined by `, `.

#### Scenario: Ambiguous associations
- **WHEN** `queue` runs on a root whose `openspec/queue.md` holds `## [a] First item\n\nDepends on: nothing\n\nA brief.\n`, written with `\n` escapes, and the row's change folders, each with a `brief.md` whose frontmatter is `queue_item: a`
- **THEN** it gives a `Failed` error for the command `queue` with the row's message:

| Folders | Message |
|---|---|
| archived `001-a` and `002-a`, active `003-a` and `004-a` | `Ambiguous queue association for "a": multiple archived changes (001-a, 002-a)` |
| active `001-a` and `002-a` | `Ambiguous queue association for "a": multiple active changes (001-a, 002-a)` |

### Requirement: Queue states
Each item SHALL get a state, a change and a rejection count, as
TypeScript's `readQueueState` in `src/core/status/queue-state.ts` gives them
under `DEFAULT_CONFIG`:

- With one archived folder, the item is `landed`, and its change is that
  folder. Rust reads no `osq.toml` yet, so, as TypeScript does without
  `vcs.enabled`, an archived item is never `archived`.
- Otherwise, with one active folder that holds a `proposal.md` or a
  `spec.md` file and that rust-storage `read_change` reads, the item's
  change is that folder, and its state follows the snapshot's
  `status`: `Regressed` and `Dead` give `dead`, `Running` gives `running`,
  `Unapproved` gives `planned`, and every other status gives `approved`.
- Otherwise, with any rejected folder, the item is `rejected`, and its
  change is the last rejected folder in listing order. An active folder
  with neither file, or one that `read_change` refuses, counts as no active
  folder, as one TypeScript's `deriveSpecState` cannot read does.
- Otherwise the item is `unplanned` and has no change.

A change's id is the leading digits of its folder name, or the whole folder
name when it has none. The rejection count is the number of the item's
rejected folders, whatever its state. The item is flagged changed since
planned when it has a change whose brief has no string `queue_hash` equal
to the item's hash.

#### Scenario: States of single items
- **WHEN** `queue` runs on a root built under `CARGO_TARGET_TMPDIR` whose `openspec/queue.md` holds `## [a] First item\n\nDepends on: nothing\n\nA brief.\n`, written with `\n` escapes, and the row's change folders, where each folder's `brief.md` frontmatter is `queue_item: a` and `queue_hash: sha256:c35d97849fbe6b40784be4564395126955b5465cb25c063c92e0a37cd2609dcb` unless the row says otherwise, and each active folder holds `tasks/1.md` and a `proposal.md` whose frontmatter is `title: P` unless the row says otherwise
- **THEN** the text is `Queue:` and the row's line, joined by a newline:

| Folders | Line |
|---|---|
| active `001-a` with `.run/approved` holding `sha256:0001`, `.run/events/1.jsonl` holding one `started` event and `.run/running/1.pid` | `  a: First item [running] change: 001 rejections: 0` |
| active `001-a` with `.run/approved` and `.run/events/change.jsonl` holding a `regressed` event for the task `change` | `  a: First item [dead] change: 001 rejections: 0` |
| active `002-a` whose `.run/events/1.jsonl` holds the line `not json`, and rejected `001-a` | `  a: First item [rejected] change: 001 rejections: 1` |
| active `002-a` whose `.run/events/1.jsonl` holds the line `not json` | `  a: First item [unplanned] rejections: 0` |
| archived `001-a`, active `002-a` and rejected `003-a` whose brief has no `queue_hash` | `  a: First item [landed] change: 001 rejections: 1` |
| rejected `001-a` whose brief has no `queue_hash`, and rejected `002-a` | `  a: First item [rejected] change: 002 rejections: 2` |
| active `x-a`, unapproved | `  a: First item [planned] change: x-a rejections: 0` |
| active `001-a`, unapproved, whose brief's `queue_item` is `"  a  "` | `  a: First item [planned] change: 001 rejections: 0` |
| active `001-a` whose brief's `queue_item` is `7` | `  a: First item [unplanned] rejections: 0` |
| active `001-a` with no `brief.md` | `  a: First item [unplanned] rejections: 0` |
| active `001-a` with no `proposal.md` | `  a: First item [unplanned] rejections: 0` |

### Requirement: TypeScript queue parity
The text `queue` returns SHALL be the text TypeScript's
`formatQueue(await projectQueue(root, DEFAULT_CONFIG))` returns for the same
repository, byte for byte, whenever that repository holds no
`.run/running/` lock and no queue approval.

#### Scenario: Golden queue output
- **WHEN** `queue` runs on a fresh scratch copy of `tests/fixtures/golden`, whose queue holds the items `alpha` to `zeta` and whose change folders cover a landed, planned, approved, dead and rejected item, a brief whose hash is older than its item, a brief for an item no longer queued and a change with no brief
- **THEN** it gives an `Output` whose text followed by one newline equals `tests/fixtures/queue.txt`, which TypeScript printed for the same fixture, byte for byte

### Requirement: Plan arguments
A `plan` invocation SHALL take `--next`, and optionally `--replan`, each
once and in either order. For any other arguments, `PlanFeature::run` SHALL
return `FeatureError::usage("plan", "expected --next [--replan]")` before it
reads any file. Every other failure of `plan` SHALL be
`FeatureError::failed` with the command `plan` and the message the other
plan requirements name.

#### Scenario: Plan argument errors
- **WHEN** a test runs `plan` with the row's args and a root that holds no `openspec/` folder
- **THEN** it gives a `Usage` error displayed `usage of plan: expected --next [--replan]`:

| Args |
|---|
| (none) |
| `--replan` |
| `--next`, `--next` |
| `--next`, `--replan`, `--replan` |
| `next` |
| `--next`, `x` |

### Requirement: Next queue item
`plan` SHALL choose the queue item as TypeScript's `prepareQueuePlan` in
`src/core/status/queue-planning.ts` does under `DEFAULT_CONFIG` without its
budget gate, in this order, writing nothing when it refuses:

1. Every active change folder whose `brief.md` has a string `queue_item`
   that is not empty once trimmed, whatever item it names, and that holds a
   `proposal.md` or a `spec.md` file and that rust-storage `read_change`
   reads, gives its failures: the change target `change` with the reason
   `regressed` when the snapshot's `change_regressed` is present, then, per
   task, the reason `regressed` when the task's regressed marker is present,
   or else, when the task is not done and its dead marker is present, that
   marker's reason, or `dead` when the reason is empty. With any failure,
   `plan` SHALL fail with `Queue planning is blocked by active failures:`
   and one line per failure, joined by newlines:
   `  - <id> <target> (<reason>): osq retry <id> <target>`. Failures are in
   order of their change id, comparing ids that are all digits by value
   before any other id by text, then of their target, task numbers by value
   before `change`.
2. The queue is read and its items given states and unmet slugs as `queue`
   does, with every refusal "Queue refusals" and "Queue associations" name,
   under the command `plan`.
3. The chosen item is the first whose state is `unplanned` or `rejected`
   and that has no unmet slug. With none, `plan` SHALL fail with
   `No queue item is eligible to plan.` and a newline, followed by one line
   per item joined by newlines, `  - <slug>: <state>`, then
   ` (waiting on <unmet slugs joined by ", ">)` when it has unmet slugs.
4. A chosen item that is `rejected` without `--replan` SHALL fail with
   `Queue item "<slug>" has <rejections> rejected attempt(s) and no active plan. Re-run with --replan to create a new attempt.`

#### Scenario: Refused next items
- **WHEN** `plan` runs with the args `--next` on a root whose `openspec/queue.md` holds `## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: a\n\nB.\n`, written with `\n` escapes, unless the row says otherwise, and the row's change folders, where each folder's `brief.md` frontmatter is `queue_item: a` unless the row says otherwise and each active folder holds `tasks/1.md` and a `proposal.md` whose frontmatter is `title: P`
- **THEN** it gives a `Failed` error for the command `plan` with the row's message, written with `\n` escapes, where `<path>` is the root joined with `openspec/queue.md`, and the root holds no new change folder:

| Queue and folders | Message |
|---|---|
| no `openspec/queue.md`, no folders | `Queue file not found: <path>` |
| no `openspec/queue.md`, active `003-a` with `.run/regressed/change.md` | `Queue planning is blocked by active failures:\n  - 003 change (regressed): osq retry 003 change` |
| active `010-a` with `tasks/2.md`, `.run/dead/2.md` whose frontmatter is `reason: verify_red` and `.run/regressed/1.md`, and active `9-old` whose brief's `queue_item` is `old`, with `.run/dead/1.md` whose frontmatter has no `reason` | `Queue planning is blocked by active failures:\n  - 9 1 (dead): osq retry 9 1\n  - 010 1 (regressed): osq retry 010 1\n  - 010 2 (verify_red): osq retry 010 2` |
| queue `## [a]\n` | `<path>: malformed queue item heading "## [a]"` |
| archived `001-a` and `002-a` | `Ambiguous queue association for "a": multiple archived changes (001-a, 002-a)` |
| active `001-a`, unapproved | `No queue item is eligible to plan.\n  - a: planned\n  - b: unplanned (waiting on a)` |
| queue `# Queue\n`, no folders | `No queue item is eligible to plan.\n` |
| rejected `001-a` | `Queue item "a" has 1 rejected attempt(s) and no active plan. Re-run with --replan to create a new attempt.` |

#### Scenario: Chosen next items
- **WHEN** `plan` runs with the row's args on a root whose `openspec/queue.md` holds `## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: a\n\nB.\n`, written with `\n` escapes, and the row's change folders, each with a `brief.md` whose frontmatter is `queue_item: a`
- **THEN** it gives an `Output`, and the root's `openspec/changes/` holds the row's new folder, whose `brief.md` frontmatter has the row's `queue_item`:

| Args | Folders | New folder | queue_item |
|---|---|---|---|
| `--next` | none | `001-a` | `a` |
| `--next` | archived `001-a` | `002-b` | `b` |
| `--next`, `--replan` | rejected `001-a` | `002-a` | `a` |
| `--replan`, `--next` | rejected `003-a` | `004-a` | `a` |

### Requirement: Next change number
The new change folder SHALL be named `<number>-<slug>`, with the chosen
item's slug, under `<root>/openspec/changes/`. Its number SHALL be one more
than the highest value of the leading digits of any entry name, file or
folder, directly in `openspec/changes/`, `openspec/changes/archive/` or
`openspec/changes/rejected/`, or 1 when there is none, written in decimal
and padded with leading zeros to three digits, as TypeScript's
`nextChangeNumber` gives it for the checkout's folders. The change id is
that number's text.

When `load_config(<root>)` gives `vcs.enabled` true, the highest value SHALL
also count, as TypeScript's `knownChangeFolders` does, the leading digits of
every folder `list_tree_changes` lists for `change_trees` of the root, the
worktrees `worktree_list` gives and the folders under `stacked_root` of
`vcs.root()`, or of the root when git gives none, with the `HOME` variable as
the home, and of every branch `list_branches("osq/")` gives, after `osq/`.
Each git command runs through a `GitVcs` on the root carrying the config's
`timeouts`. A config or git error SHALL fail `plan` with its display and
create no folder. With `vcs.enabled` false, `plan` reads no git.

#### Scenario: Next change numbers
- **WHEN** `plan` runs with the args `--next` on a root whose `openspec/queue.md` holds `## [a] A\n\nDepends on: nothing\n\nA.\n`, written with `\n` escapes, and the row's entries, none of which holds a `brief.md`
- **THEN** the root's `openspec/changes/` holds the row's new folder:

| Entries | New folder |
|---|---|
| no `openspec/changes/` folder | `001-a` |
| active `007-x`, archived `012-y` and rejected `030-z` folders | `031-a` |
| active `x-y` folder | `001-a` |
| active `0999-x` folder | `1000-a` |
| file `openspec/changes/041-notes.md` | `042-a` |

#### Scenario: Next change number across worktrees
- **WHEN** `plan` runs with the args `--next` on a scratch git repository whose `osq.toml` sets `vcs.enabled = true` and `vcs.worktreeRoot` to a scratch folder, whose checkout holds active `007-x` and whose `openspec/queue.md` holds item `a`, with a real worktree on branch `osq/012-y` holding `openspec/changes/012-y/.run/approved`, and a branch `osq/020-z` with no worktree
- **THEN** the checkout's `openspec/changes/` holds the new folder `021-a`

#### Scenario: Next change number with vcs off
- **WHEN** the same repository's `osq.toml` sets `vcs.enabled = false`
- **THEN** the new folder is `008-a`

### Requirement: Change folder files
`plan` SHALL write these files into the new change folder, as TypeScript's
`createQueueChange` in `src/cli/plan-queue.ts` does under
`DEFAULT_CONFIG` with no planner model:

- `proposal.md`: the text of TypeScript's `FALLBACK_PROPOSAL_MD` in
  `src/core/foundation/new.ts`, which `templates/proposal.md` equals, with
  its line `title: Change title` replaced by `title: <item title>` and its
  line `depends_on: []` replaced by `depends_on: [<ids>]`, where `<ids>`
  are the change ids of the item's dependencies' archived folders, in the
  item's order, each in double quotes, joined by `, `. When the item has
  fixes, the line `fixes: [<ids>]`, built the same way from its fixes,
  follows the `depends_on` line.
- `tasks.md`: `# Tasks\n\n## 1. Section title\n\n- [ ] 1. When initial condition, expected outcome\n`.
- `tasks/1.md`: the text of TypeScript's `FALLBACK_TASK_1_MD` in
  `src/core/foundation/new.ts`.
- `brief.md`: `---`, `queue_item: <slug>`, `queue_hash: <item hash>`,
  `planner: null` and `date: <date>` lines, then `---`, an empty line, the
  item's brief body and one newline, where `<date>` is the current time's
  UTC date as `YYYY-MM-DD`.

It SHALL write no `.run/` folder.

#### Scenario: Seeded proposal lines
- **WHEN** `plan` runs with the args `--next` on a root whose `openspec/queue.md` holds the row's queue, written with `\n` escapes, and the row's archived folders, each with a `brief.md` whose frontmatter is `queue_item` and the row's slug
- **THEN** the new folder's `proposal.md` lines 2 to 5 are the row's lines, joined by newlines:

| Queue | Archived folders | Lines |
|---|---|---|
| `## [a] A\n\nDepends on: nothing\n\nA.\n` | none | `title: A`, `depends_on: []`, `verify: node -e "process.exit(0)"`, `features:` |
| `## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: a\n\nB.\n` | `001-a` for `a` | `title: B`, `depends_on: ["001"]`, `verify: node -e "process.exit(0)"`, `features:` |
| `## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: nothing\nFixes: a\n\nB.\n` | `001-a` for `a` | `title: B`, `depends_on: []`, `fixes: ["001"]`, `verify: node -e "process.exit(0)"` |
| `## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: nothing\n\nB.\n\n## [c] C\n\nDepends on: a, b\nFixes: b\n\nC.\n` | `003-a` for `a`, `001-b` for `b` | `title: C`, `depends_on: ["003", "001"]`, `fixes: ["001"]`, `verify: node -e "process.exit(0)"` |

#### Scenario: Brief dates
- **WHEN** `PlanFeature::at` with the row's time runs `plan` with the args `--next` on a root whose `openspec/queue.md` holds `## [a] A\n\nDepends on: nothing\n\nA.\n`, written with `\n` escapes
- **THEN** the new folder's `brief.md` is `---\nqueue_item: a\nqueue_hash: <hash>\nplanner: null\ndate: <date>\n---\n\nA.\n`, where `<hash>` is `sha256:9056fb796a9a448d47d3fcb403b7de7740061122ebec1824e7d739b4535dd8d5` and `<date>` is the row's date:

| Time | Date |
|---|---|
| `0` | `1970-01-01` |
| `946684799999` | `1999-12-31` |
| `951782400000` | `2000-02-29` |
| `951868799999` | `2000-02-29` |
| `1709251199999` | `2024-02-29` |
| `1792584000000` | `2026-10-21` |
| `4107542399999` | `2100-02-28` |
| `4107542400000` | `2100-03-01` |

#### Scenario: Brief date from the system clock
- **WHEN** a test reads the epoch milliseconds of the system clock before and after `PlanFeature::new()` runs `plan` with the args `--next` on a root whose `openspec/queue.md` holds `## [a] A\n\nDepends on: nothing\n\nA.\n`, and builds the brief `PlanFeature::at` gives for each of the two times on roots of its own
- **THEN** the new folder's `brief.md` equals one of those two briefs

### Requirement: Plan handoff
After writing the change folder, `plan` SHALL return as its output the
handoff TypeScript's `formatPlanHandoff` in
`src/core/foundation/plan-handoff.ts` gives for a new queue change:
`<folder path>: ask your planning tool to plan change <folder> — next: unplanned — osq plan <id>`,
an empty line, `Paste this into a new agent session to plan it:`, an empty
line, `You are the planner for osq change <folder>.` and
`Read <folder path>/plan-prompt.md and follow it exactly; it is your complete prompt.`,
each line followed by a newline. When `<root>/.claude/commands/osq-plan.md`
is a file, an empty line and `In Claude Code, /osq-plan <id> does the same.`
and a newline follow. `<folder path>` is the root joined with
`openspec/changes/<folder>`, shown with `display()`, and
`<folder path>/plan-prompt.md` is that path joined with `plan-prompt.md`.

#### Scenario: Handoff text
- **WHEN** `plan` runs with the args `--next` on a root whose `openspec/queue.md` holds `## [a] A\n\nDepends on: nothing\n\nA.\n`, written with `\n` escapes, and which holds the row's files
- **THEN** the output is the row's text, written with `\n` escapes, where `<p>` is the root joined with `openspec/changes/001-a` shown with `display()`:

| Files | Output |
|---|---|
| none | `<p>: ask your planning tool to plan change 001-a — next: unplanned — osq plan 001\n\nPaste this into a new agent session to plan it:\n\nYou are the planner for osq change 001-a.\nRead <p>/plan-prompt.md and follow it exactly; it is your complete prompt.\n` |
| `.claude/commands/osq-plan.md` | `<p>: ask your planning tool to plan change 001-a — next: unplanned — osq plan 001\n\nPaste this into a new agent session to plan it:\n\nYou are the planner for osq change 001-a.\nRead <p>/plan-prompt.md and follow it exactly; it is your complete prompt.\n\nIn Claude Code, /osq-plan 001 does the same.\n` |
| `.claude/commands/osq-plan.md/` as a folder | `<p>: ask your planning tool to plan change 001-a — next: unplanned — osq plan 001\n\nPaste this into a new agent session to plan it:\n\nYou are the planner for osq change 001-a.\nRead <p>/plan-prompt.md and follow it exactly; it is your complete prompt.\n` |

### Requirement: Plan prompt
`plan` SHALL write `plan-prompt.md` into the new change folder: the
sections TypeScript's `buildBaseOpeningPrompt` in `src/cli/plan-queue.ts`
gives under `DEFAULT_CONFIG`, each trimmed and joined by an empty line,
then the sections TypeScript's `buildOpeningPrompt` in `src/cli/plan.ts`
appends after them with no steering section, with no newline at the end:

1. The text of `<root>/PLANNER.md`, or `# Planning a change for osq` when it
   cannot be read.
2. The lines `# Change: <id> - <title>`, `Change ID: <id>` and
   `Change Folder: <folder>`, then, when the item has dependencies,
   `Landed dependencies:` and one line `- openspec/changes/archive/<folder>`
   per dependency's archived folder, in the item's order, joined by
   newlines. `<title>` is the new `proposal.md`'s `title` as rust-storage
   `frontmatter_string` reads it, or empty text when it gives none.
3. `## Capability Specs`, an empty line,
   ``All living specs. Read the requirements this change writes or whose code it uses, not whole specs: `osq spec <capability>` lists them and `osq spec <capability> <requirement>` prints one.``,
   an empty line, and one line `- openspec/specs/<name>/spec.md` per folder
   directly in `<root>/openspec/specs/`, sorted by name.
4. Only when rust-specs `read_decisions` with the folders `decisions` and
   `openspec` gives an ADR whose status is `accepted`:
   `## Architecture Decisions`, an empty line,
   `Read in full every ADR that applies to all, and every ADR that applies to a capability this change writes. Name each governing capability ADR in the proposal's ## Decisions section.`,
   an empty line, and one line per accepted ADR in the order
   `read_decisions` gives,
   `- ADR <number>: <title>. Applies to: <scope>. Rule: <rule> Path: <path>`,
   where `<scope>` is `all` for an ADR that applies to all, and otherwise
   its `applies_to` names as written, joined by `, `, or empty text when it
   has none.
5. `## Brief`, an empty line and the new `brief.md`.
6. `## This repository's record`, an empty line and the body "Repository
   record section" gives.
7. Only when "History hints section" gives a body: `## What history says`,
   an empty line and that body.
8. Only when "Disclosures section" gives a body:
   `## Recent executor disclosures`, an empty line and that body.
9. Only when "Manual edits section" gives a body: `## Manual edits`, an
   empty line and that body.

Sections 6 to 9 are written as their bodies give them, not trimmed. Their
bodies read `read_history` of the root, the archived snapshots among them,
`read_manual_edits` of the root and `task_outcomes` over those snapshots
with the ownership rust-specs `read_capability_ownership` reads from
`<root>/openspec/specs`. When `read_history` fails, `plan` SHALL fail with
`Cannot read the archive: <error>` and write no change folder.

#### Scenario: Prompt sections
- **WHEN** `PlanFeature::at(1792584000000)` runs `plan` with the args `--next` on a root whose `openspec/queue.md` holds `## [a] A\n\nDepends on: nothing\n\nA.\n`, written with `\n` escapes, and which holds the row's files
- **THEN** the new folder's `plan-prompt.md` is the row's text, written with `\n` escapes, where `<brief>` is the new `brief.md` trimmed, `<specs>` is the third section's heading, empty line and sentence with no line after them, and `<record>` is `## This repository's record\n\nThis repository's measured record is too small (fewer than 5 tasks).`:

| Files | Prompt |
|---|---|
| none | `# Planning a change for osq\n\n# Change: 001 - A\nChange ID: 001\nChange Folder: 001-a\n\n<specs>\n\n## Brief\n\n<brief>\n\n<record>` |
| `PLANNER.md` holding `\n  Plan well.\n\n`, and folders `openspec/specs/zeta/` and `openspec/specs/eta/` and the file `openspec/specs/readme.md` | `Plan well.\n\n# Change: 001 - A\nChange ID: 001\nChange Folder: 001-a\n\n<specs>\n\n- openspec/specs/eta/spec.md\n- openspec/specs/zeta/spec.md\n\n## Brief\n\n<brief>\n\n<record>` |
| `decisions/001-x.md` holding `---\nstatus: proposed\napplies_to: all\nrule: R.\n---\n# 1. X\n` | `# Planning a change for osq\n\n# Change: 001 - A\nChange ID: 001\nChange Folder: 001-a\n\n<specs>\n\n## Brief\n\n<brief>\n\n<record>` |
| `decisions/007-x.md` holding `---\nstatus: accepted\napplies_to: [beta]\nrule: R.\n---\n# 7. X\n` | `# Planning a change for osq\n\n# Change: 001 - A\nChange ID: 001\nChange Folder: 001-a\n\n<specs>\n\n## Architecture Decisions\n\nRead in full every ADR that applies to all, and every ADR that applies to a capability this change writes. Name each governing capability ADR in the proposal's ## Decisions section.\n\n- ADR 007: X. Applies to: beta. Rule: R. Path: decisions/007-x.md\n\n## Brief\n\n<brief>\n\n<record>` |

#### Scenario: Archive that cannot be read
- **WHEN** `plan --next` runs on a root whose queue holds one item and whose archived change `001-x` holds a task stream `.run/events/1.jsonl` with the line `not json`
- **THEN** it fails with a message that starts `Cannot read the archive: `, and `openspec/changes/` holds no new folder

### Requirement: TypeScript plan parity
The files `plan` writes into the new change folder and its output SHALL be
the ones TypeScript writes and prints for the same repository on the same
UTC date, byte for byte, where TypeScript's are the folder
`createQueueChange` writes under `DEFAULT_CONFIG` with no planner model,
without its `.run/` folder, its `plan-prompt.md` holding
`buildOpeningPrompt`'s prompt with no steering section, and the handoff
`formatPlanHandoff` gives with the next step `readNextStep` reads for the
new folder.

#### Scenario: Golden change folder
- **WHEN** `PlanFeature::at(1792584000000)` runs `plan` with the args `--next` on a fresh scratch copy of `tests/fixtures/plan-repo`, whose queue holds the items `alpha`, landed, `beta`, which depends on and fixes `alpha`, and `gamma`, which depends on `beta`, and which holds a rejected change `004-old-idea`, a `PLANNER.md`, two living specs and accepted, proposed and ignored decision files
- **THEN** the root's `openspec/changes/` holds the new folder `005-beta`, which holds exactly the files of `tests/fixtures/plan-created/005-beta`, which TypeScript wrote for the same fixture, each equal byte for byte, and the output equals `tests/fixtures/plan-created/handoff.txt` with each `<root>` replaced by the scratch copy's path shown with `display()`

### Requirement: Repository record section
The body of the prompt's `## This repository's record` section SHALL be
the one TypeScript's `formatRepositoryRecordBody(getRepositoryRecord(root))`
in `src/core/report/report.ts` gives.

- The window is the 20 archived snapshots with the highest leading
  number, ties by folder name, folders with no leading number after the
  numbered ones by name.
- A measured task is a task of a window snapshot, in window order and
  then task order, whose outcome has `start_scope_files`. Its scope files
  are the number of `scope_hash_paths` when it has them, else
  `start_scope_files`; its acceptance lines are the task plan's
  `acceptance` count; its generation is legacy without
  `start_scope_resolver`, resolver 2 when it is 2, and neither otherwise.
- With fewer than 5 measured tasks the body is
  `This repository's measured record is too small (fewer than 5 tasks).`
- Otherwise it is these lines joined by `\n`:
  - `First-attempt passes: <passed>/<measured>`, counting the measured
    tasks whose `first_attempt_passed` is true.
  - `Largest first-attempt pass: <folder>/<task> "<title>" (scope files: <n>, acceptance lines: <n>)<label>`
    for the passing task with the most scope files, then the most
    acceptance lines, then the lower change leading number and the lower
    task number, among the resolver 2 measured tasks when there is one,
    else among the legacy ones; `<label>` is ` [resolver 2 scope]` or
    ` [legacy scope]` by the generation used. With no such task the line
    is `Largest first-attempt pass: unavailable`.
  - `Median task duration: <duration>`, the median of the measured tasks'
    `measured_ms` in seconds, the mean of the middle two for an even
    count, rounded to two decimals half up, then shown as TypeScript's
    `formatDuration` shows it: `0s` at zero, whole seconds rounded half
    up, `<s>s` under a minute, else `<m>m <s>s`, or `<m>m` when the
    seconds are 0. Without any `measured_ms` it is
    `Median task duration: unavailable`.
  - `Dead outcomes:`, then one line `- <folder>, <task title>, <reason>`
    per dead event of a window snapshot's task streams, in window order,
    task order and line order, the first 10, `<reason>` trimmed or
    `unknown` when blank; or the one line `  (none)` without any.

#### Scenario: Repository record bodies
- **WHEN** `plan --next` runs on a root holding the row's archived changes, built under `CARGO_TARGET_TMPDIR`
- **THEN** the record section's body is the row's:

| Archive | Body |
|---|---|
| none | `This repository's measured record is too small (fewer than 5 tasks).` |
| 4 measured tasks, all passing | `This repository's measured record is too small (fewer than 5 tasks).` |
| 5 measured legacy tasks, none passing, none with an `end` measure, no dead event | `First-attempt passes: 0/5\nLargest first-attempt pass: unavailable\nMedian task duration: unavailable\nDead outcomes:\n  (none)` |
| 5 measured tasks of `001-a` titled `T<n>`, tasks 1 and 2 passing legacy tasks with 9 scope files, task 2 with more acceptance lines, task 3 a passing resolver 2 task with 1 scope file and 2 acceptance lines, measured 30, 90 and 600 seconds, and task 4 dead with reason `verify_red` | `First-attempt passes: 3/5\nLargest first-attempt pass: 001-a/3 "T3" (scope files: 1, acceptance lines: 2) [resolver 2 scope]\nMedian task duration: 1m 30s\nDead outcomes:\n- 001-a, T4, verify_red` |
| 5 measured passing legacy tasks of `001-a`, all with 2 scope files and one acceptance line, measured 1, 2, 3 and 4 seconds | `First-attempt passes: 5/5\nLargest first-attempt pass: 001-a/1 "T1" (scope files: 2, acceptance lines: 1) [legacy scope]\nMedian task duration: 3s\nDead outcomes:\n  (none)` |
| 21 archived changes `001-a` to `021-a`, each one measured task that died with `timeout`, plus 12 dead events in `021-a` | `First-attempt passes: 0/20` first, and exactly 10 dead lines, all of `021-a` |

### Requirement: History hints section
The body of the prompt's `## What history says` section SHALL be the one
TypeScript's `formatHistoryHints` in `src/core/report/history-hints.ts`
gives under `DEFAULT_PLANNING_HISTORY` (`minimumTasks` 30, `recentTasks`
100, `maxCharacters` 1500), over the `task_outcomes` rows whose `attempts`
is at least 1.

- With fewer than 30 such rows there is no body and no section.
- The window is the 100 newest rows: the higher change leading number
  first, numbered changes before the others, which go by change name from
  the last; then the higher task number, and tasks that are not numbers by
  task text.
- The lines are, in this order, each present only when one of its groups
  holds a row, the groups with rows written `<label> <passed>/<rows>` and
  joined by `, `, `<passed>` counting rows whose `first_attempt` is 1:
  `Counts from the last <window rows> archived tasks that ran, from the osq query table task_outcomes. They describe this project's history; nothing enforces them.`
  (always present), `First attempt by scope files: ` with `1-2`, `3-4`,
  `5-8` and `over 8` by `scope_files`, a row without one in none;
  `First attempt by verify kind: ` with `one`, `several`, `suite` and
  `other`; `First attempt by tests.modify: ` with `true` (1) and `false`;
  `First attempt by shared scope: ` with `shared` (1) and `not shared`;
  `First attempt by position: ` with `first task` (1) and `later task`;
  and `Most common last dead reasons: ` with at most three non-empty
  `dead_reason` values as `<reason> <rows>`, most rows first and then by
  name, or `none` without any (always present).
- Lines are kept in order while their length, counted in UTF-16 code
  units as JavaScript counts it, with one `\n` between kept lines, stays
  within 1500; the body is the kept lines joined by `\n`, and none when
  even the first line does not fit.

#### Scenario: History hint bodies
- **WHEN** `plan --next` runs on a root whose archive gives the row's `task_outcomes` rows that ran, built under `CARGO_TARGET_TMPDIR`
- **THEN** the history section is the row's:

| Rows that ran | History section |
|---|---|
| 29 | none |
| 30, every row in change `001-a` with 3 scope files, verify `node --test a.test.ts`, no tests.modify, unshared scope, all passing and no dead reason | `Counts from the last 30 archived tasks that ran, from the osq query table task_outcomes. They describe this project's history; nothing enforces them.\nFirst attempt by scope files: 3-4 30/30\nFirst attempt by verify kind: one 30/30\nFirst attempt by tests.modify: false 30/30\nFirst attempt by shared scope: not shared 30/30\nFirst attempt by position: first task 1/1, later task 29/29\nMost common last dead reasons: none` |
| 101 tasks in changes `001-a` to `101-a`, one each, where `001-a`'s task alone has 9 scope files | the counts line names `the last 100`, and the scope line holds no `over 8` group |
| 30 tasks whose dead reasons are `timeout` 2, `blocked` 2, `verify_red` 2 and `crashed` 1 | the last line is `Most common last dead reasons: blocked 2, timeout 2, verify_red 2` |

### Requirement: Disclosures section
The body of the prompt's `## Recent executor disclosures` section SHALL be
the one TypeScript's `formatRecentDisclosures` in
`src/core/report/recent-disclosures.ts` gives under
`DEFAULT_PLANNING_DISCLOSURES` (`recentChanges` 3, `maxCharacters` 4000).

- The changes are the 3 archived snapshots the record's window puts
  first. Each disclosure of each, in their order, gives one entry per
  non-empty section, in the order `deviated`, `missing_context` and
  `outside_scope`, shown as `deviated`, `missing context` and
  `outside scope`:
  `<folder> task <task>, <shown name>:\n` and the section's lines, split
  on `\n` or `\r\n`, each prefixed `> ` and joined by `\n`.
- Without any entry there is no body and no section.
- Entries are kept while their total length, in UTF-16 code units and not
  counting separators, stays within 4000. The first entry that does not
  fit is cut to the larger of what is left and 11, and nothing follows
  it: when it is longer than that limit, its first `limit - 11` code
  units with trailing `\n` removed, then `[truncated]`, or `[truncated]`
  alone when nothing is left before it.
- The body is
  `Executor claims from result files, not verified facts. Check them against the code before relying on them.`,
  an empty line, and the kept entries joined by an empty line.

#### Scenario: Disclosure bodies
- **WHEN** `plan --next` runs on a root holding the row's archived changes and result files, built under `CARGO_TARGET_TMPDIR`
- **THEN** the disclosures section is the row's, where `<claim>` is the claim sentence above:

| Archive | Disclosures section |
|---|---|
| `001-a` with `.run/results/1.md` holding only `## Changed` | none |
| `001-a` with `.run/results/2.md` holding `## Deviated\n\nUsed a map.\nSecond line.\n\n## Outside scope\n\nA bug.\n` | `<claim>\n\n001-a task 2, deviated:\n> Used a map.\n> Second line.\n\n001-a task 2, outside scope:\n> A bug.` |
| `001-a` to `004-a`, each with `.run/results/1.md` holding `## Missing context\n\nNo <folder>.\n` | `<claim>\n\n004-a task 1, missing context:\n> No 004-a.\n\n003-a task 1, missing context:\n> No 003-a.\n\n002-a task 1, missing context:\n> No 002-a.` |
| `001-a` with `.run/results/1.md` holding a `## Deviated` section of 5000 `x` | `<claim>\n\n001-a task 1, deviated:\n> ` then `x` up to 3989 code units in all, then `[truncated]` |

### Requirement: Manual edits section
The body of the prompt's `## Manual edits` section SHALL be the one
TypeScript's `formatManualEditsSection` in
`src/core/report/manual-edits-section.ts` gives.

- A record's open capabilities are those of its `capabilities` for which
  no archived snapshot has a delta of that capability and an archive time
  later than the record's `kept_at`: both compared as `timestamp_ms` reads
  them when both read, else as text, and a snapshot without an archive
  time is never later.
- Each record with an open capability, in `read_manual_edits` order,
  gives the line
  `- <kept_at> <open capabilities joined by ", ">: <first line of the comment> (<paths joined by ", ">)`.
- Without any line there is no body and no section. The body is
  `Edits a human kept with osq manual after the last change that wrote these capabilities. When this change writes one of them, bring its spec in line with the edit.`,
  `\n` and the lines joined by `\n`.

#### Scenario: Manual edit bodies
- **WHEN** `plan --next` runs on a root holding the archived change `001-a` with a delta for `alpha`, archived at `2026-10-02T00:00:00.000Z`, and the row's records in `openspec/manual/`
- **THEN** the manual edits section is the row's, where `<intro>` is the intro sentence above:

| Records | Manual edits section |
|---|---|
| none | none |
| kept `2026-10-01T00:00:00.000Z`, capabilities `alpha` | none |
| kept `2026-10-03T00:00:00.000Z`, capabilities `alpha` and `beta`, paths `src/a.rs` and `src/b.rs`, comment `Fixed it.\n\nMore.` | `<intro>\n- 2026-10-03T00:00:00.000Z alpha, beta: Fixed it. (src/a.rs, src/b.rs)` |
| kept `2026-10-01T00:00:00.000Z`, capabilities `alpha` and `beta`, paths `src/a.rs`, comment `Kept.` | `<intro>\n- 2026-10-01T00:00:00.000Z beta: Kept. (src/a.rs)` |
| kept `2026-10-03T00:00:00.000Z`, no capabilities | none |

### Requirement: TypeScript prompt sections parity
The sections `plan` writes after `## Brief` SHALL be the ones TypeScript's
`buildOpeningPrompt` appends after its base prompt for the same
repository under `DEFAULT_CONFIG`, byte for byte.

#### Scenario: Golden history sections
- **WHEN** `PlanFeature::at(1792584000000)` runs `plan` with the args `--next` on a fresh scratch copy of `tests/fixtures/sections/plan-history`, which holds seven archived changes with 37 tasks, their event streams and result files, and three manual edit records
- **THEN** the new folder's `plan-prompt.md`, from `\n\n## This repository's record` on and without that leading empty line, equals `tests/fixtures/sections/plan-history.md`, which TypeScript printed for the same fixture

#### Scenario: Golden archive sections
- **WHEN** the corpus test `tests/prompt_sections_corpus.rs`, ignored by default, builds a scratch root under `CARGO_TARGET_TMPDIR` that holds this repository's archived change folders numbered 001 to 251 and its `openspec/manual/` records kept before `2026-10-21T16:00:00.000Z`, each file hard-linked or else copied, and a queue with one item, and runs `plan --next` on it
- **THEN** the new folder's `plan-prompt.md`, from `\n\n## This repository's record` on and without that leading empty line, equals `tests/fixtures/sections/archive.md`, which TypeScript printed for this repository's archive on 2026-10-21
