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
`osq-feature-plan` SHALL expose one public item, the unit struct
`PlanFeature`, which implements rust-core's `Feature` and holds no storage
connection, as ADR 028 says. Its `name` SHALL be `plan`, and its `commands`
SHALL be exactly one `Command` named `queue`, with the summary
`print the read-only brief queue projection` and an empty usage.

#### Scenario: Plan feature commands
- **WHEN** a test reads `PlanFeature`'s name and commands
- **THEN** the name is `plan`, and the commands are one command with the name `queue`, the summary `print the read-only brief queue projection` and the usage `` (empty text)

### Requirement: Queue arguments
`PlanFeature::run` SHALL return `FeatureError::unknown_command` with the
invocation's command for any command but `queue`, and
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
| `plan` with no args | `UnknownCommand` error displayed `unknown command: plan` |

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
