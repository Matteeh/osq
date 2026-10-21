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
gives under `DEFAULT_CONFIG`, each trimmed and joined by an empty line, with
no newline at the end:

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

#### Scenario: Prompt sections
- **WHEN** `PlanFeature::at(1792584000000)` runs `plan` with the args `--next` on a root whose `openspec/queue.md` holds `## [a] A\n\nDepends on: nothing\n\nA.\n`, written with `\n` escapes, and which holds the row's files
- **THEN** the new folder's `plan-prompt.md` is the row's text, written with `\n` escapes, where `<brief>` is the new `brief.md` trimmed and `<specs>` is the third section's heading, empty line and sentence with no line after them:

| Files | Prompt |
|---|---|
| none | `# Planning a change for osq\n\n# Change: 001 - A\nChange ID: 001\nChange Folder: 001-a\n\n<specs>\n\n## Brief\n\n<brief>` |
| `PLANNER.md` holding `\n  Plan well.\n\n`, and folders `openspec/specs/zeta/` and `openspec/specs/eta/` and the file `openspec/specs/readme.md` | `Plan well.\n\n# Change: 001 - A\nChange ID: 001\nChange Folder: 001-a\n\n<specs>\n\n- openspec/specs/eta/spec.md\n- openspec/specs/zeta/spec.md\n\n## Brief\n\n<brief>` |
| `decisions/001-x.md` holding `---\nstatus: proposed\napplies_to: all\nrule: R.\n---\n# 1. X\n` | `# Planning a change for osq\n\n# Change: 001 - A\nChange ID: 001\nChange Folder: 001-a\n\n<specs>\n\n## Brief\n\n<brief>` |
| `decisions/007-x.md` holding `---\nstatus: accepted\napplies_to: [beta]\nrule: R.\n---\n# 7. X\n` | `# Planning a change for osq\n\n# Change: 001 - A\nChange ID: 001\nChange Folder: 001-a\n\n<specs>\n\n## Architecture Decisions\n\nRead in full every ADR that applies to all, and every ADR that applies to a capability this change writes. Name each governing capability ADR in the proposal's ## Decisions section.\n\n- ADR 007: X. Applies to: beta. Rule: R. Path: decisions/007-x.md\n\n## Brief\n\n<brief>` |

### Requirement: TypeScript plan parity
The files `plan` writes into the new change folder and its output SHALL be
the ones TypeScript writes and prints for the same repository on the same
UTC date, byte for byte, where TypeScript's are the folder
`createQueueChange` writes under `DEFAULT_CONFIG` with no planner model,
without its `.run/` folder, its `plan-prompt.md` holding
`buildBaseOpeningPrompt`'s prompt, and the handoff `formatPlanHandoff`
gives with the next step `readNextStep` reads for the new folder.

#### Scenario: Golden change folder
- **WHEN** `PlanFeature::at(1792584000000)` runs `plan` with the args `--next` on a fresh scratch copy of `tests/fixtures/plan-repo`, whose queue holds the items `alpha`, landed, `beta`, which depends on and fixes `alpha`, and `gamma`, which depends on `beta`, and which holds a rejected change `004-old-idea`, a `PLANNER.md`, two living specs and accepted, proposed and ignored decision files
- **THEN** the root's `openspec/changes/` holds the new folder `005-beta`, which holds exactly the files of `tests/fixtures/plan-created/005-beta`, which TypeScript wrote for the same fixture, each equal byte for byte, and the output equals `tests/fixtures/plan-created/handoff.txt` with each `<root>` replaced by the scratch copy's path shown with `display()`
