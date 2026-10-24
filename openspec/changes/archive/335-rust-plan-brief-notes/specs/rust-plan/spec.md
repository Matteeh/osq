## MODIFIED Requirements

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
the usage `--next [--replan] [--print] | <id> [--print] | <name> --brief <file> [--print]`.

#### Scenario: Plan feature commands
- **WHEN** a test reads the name and commands of `PlanFeature::new()`
- **THEN** the name is `plan`, and the commands are, in order:

| Name | Summary | Usage |
|---|---|---|
| `queue` | `print the read-only brief queue projection` | `` (empty text) |
| `plan` | `prepare a change and hand off its opening prompt to your planning tool` | `--next [--replan] [--print] \| <id> [--print] \| <name> --brief <file> [--print]` |

### Requirement: Plan arguments
A `plan` invocation SHALL read its arguments in order: `--next`, `--replan`,
and `--print` or its short form `-p`, take no value; `--brief` and `--notes`
take the argument after them as their value, whatever it is, `-` included;
every other argument that starts with `-` is refused; and every other
argument is the name. Each flag may be given once, `-p` and `--print`
counting as one flag, and there may be at most one name. For an argument
that is refused, a flag given twice, a flag with no value after it or a
second name, `PlanFeature::run` SHALL return
`FeatureError::usage("plan", "expected --next [--replan] [--print], <id> [--print] or <name> --brief <file> [--print]")`
before it reads any file.

Then, before it reads any file, `plan` SHALL refuse with
`FeatureError::usage` for the command `plan` and TypeScript's message
without its `Error: ` prefix, checking in this order, the name being
trimmed and an empty name counting as none:

1. `--notes` given: `` `--notes` is valid only with `--run` ``, since Rust
   `plan` takes no `--run`;
2. `--next` and a name: `` `plan --next` cannot be combined with a change name ``;
3. `--next` and `--brief`: `` `plan --next` cannot be combined with --brief ``;
4. `--replan` without `--next`: `` `--replan` is valid only with `plan --next` ``;
5. neither `--next` nor a name: `` Provide a change name or use `plan --next` ``.

`--next` plans the next queue item, a name with `--brief` plans from a
brief as "Plan from a brief" says, and a name without `--brief` is the id
"Steering lookup" names. Every other failure of `plan` SHALL be
`FeatureError::failed` with the command `plan` and the message the other
plan requirements name.

#### Scenario: Plan argument errors
- **WHEN** a test runs `plan` with the row's args and a root that holds no `openspec/` folder
- **THEN** it gives a `Usage` error displayed `usage of plan: expected --next [--replan] [--print], <id> [--print] or <name> --brief <file> [--print]`:

| Args |
|---|
| `--next`, `--next` |
| `--next`, `--replan`, `--replan` |
| `a`, `b` |
| `--steer` |
| `--next`, `-p`, `--print` |
| `x`, `--brief` |
| `x`, `--notes` |
| `x`, `--brief`, `a.md`, `--brief`, `b.md` |

#### Scenario: TypeScript argument refusals
- **WHEN** a test runs `plan` with the row's args and a root that holds no `openspec/` folder
- **THEN** it gives a `Usage` error for the command `plan` with the row's message, which TypeScript's `osq plan` gives after `Error: ` for the same args:

| Args | Message |
|---|---|
| `x`, `--notes`, `hi` | `` `--notes` is valid only with `--run` `` |
| `x`, `-p`, `--brief`, `b.md`, `--notes`, `hi` | `` `--notes` is valid only with `--run` `` |
| `x`, `--next` | `` `plan --next` cannot be combined with a change name `` |
| `--next`, `--brief`, `b.md` | `` `plan --next` cannot be combined with --brief `` |
| `--replan` | `` `--replan` is valid only with `plan --next` `` |
| `x`, `--replan` | `` `--replan` is valid only with `plan --next` `` |
| none | `` Provide a change name or use `plan --next` `` |
| `  ` | `` Provide a change name or use `plan --next` `` |
| `--print` | `` Provide a change name or use `plan --next` `` |

## ADDED Requirements

### Requirement: Plan print
With `--print`, `plan` SHALL do what it does without it, except that it
writes no `plan-prompt.md` and returns as its output the prompt it would
have written there, followed by one newline, in place of the handoff "Plan
handoff", "Steering handoff" or "Plan from a brief" names. It still writes
every other file of a new change folder.

#### Scenario: Printed next prompt
- **WHEN** `PlanFeature::at(1792584000000)` runs `plan` with the row's args on a fresh scratch copy of `tests/fixtures/plan-repo`
- **THEN** the output is the bytes of `tests/fixtures/plan-created/005-beta/plan-prompt.md` followed by `\n`, and the new folder `005-beta` holds exactly the files of `tests/fixtures/plan-created/005-beta` other than `plan-prompt.md`, each equal byte for byte:

| Args |
|---|
| `--next`, `--print` |
| `-p`, `--next` |

#### Scenario: Printed steering prompt
- **WHEN** `plan` runs with the args `001`, `--print` on a new copy of `crates/features/plan/tests/fixtures/steer-project/`
- **THEN** the output is `blocked-001.prompt.txt` in `crates/features/plan/tests/fixtures/steer-golden/`, with each `<root>` written as the copy's root shown with `display()`, followed by `\n`, and every file in the copy is unchanged

### Requirement: Plan from a brief
`plan <name> --brief <file>` SHALL plan a new change from a brief as
TypeScript's `osq plan <name> --brief <file>` in `src/cli/plan.ts` does
under `DEFAULT_CONFIG` with no planner model, in this order:

1. When an active change of the "Steering lookup" candidates matches the
   name, `plan` SHALL do what `plan <name>` without `--brief` does, and
   read no brief.
2. When an archived change of those candidates matches the name, `plan`
   SHALL fail with TypeScript's `refuseFinishedChange` message,
   `<folder> has <state>, so osq plan <name> has nothing to reopen. Start new work with an item in openspec/queue.md and osq plan --next, or with osq plan <name> --brief <file>.`,
   `<state>` being `landed` when `vcs.enabled` is on and the default branch
   rust-vcs `GitVcs::default_branch` gives holds
   `openspec/changes/archive/<folder>` by `GitVcs::path_exists`, and
   `archived` otherwise.
3. When the name is all ASCII digits and no change of `list_changes`,
   active, archived or rejected, matches it, `plan` SHALL fail with
   TypeScript's `refuseNumberName` message,
   `osq plan <name> names no change, and a number is not a name for a new change. Plan the next queue item with osq plan --next, or start a change with osq plan <name> --brief <file> and a descriptive name.`
4. The brief is read: all of the process's standard input for `-`, else
   the file at the root joined with `<file>`. When it cannot be read,
   `plan` SHALL fail with `Cannot read brief <file>: <error>`, `<file>` as
   given and `<error>` the IO error's display.
5. The slug is the name as TypeScript's `slugify` makes it: lowercased,
   each run of characters other than `a` to `z` and `0` to `9` replaced by
   one `-`, and leading and trailing `-` removed. An empty slug fails
   `plan` with `Spec name cannot be empty`.
6. The change number is the one "Next change number" gives, and the folder
   is `<number>-<slug>` in `<root>/openspec/changes`.

`plan` SHALL write into that folder the `proposal.md`, `tasks.md` and
`tasks/1.md` "Change folder files" names, with the proposal's title line
`title: <name>` and its `depends_on: []` line unchanged; the `brief.md`
"Brief file text" names; and, as "Plan prompt" says, `plan-prompt.md` with
no landed dependencies, its `<title>` being the proposal's `title` as
rust-storage `frontmatter_string` reads it, or the name when it gives
none, as TypeScript falls back to the name. It writes no `.run/` folder.
It SHALL return the "Plan handoff" text for the new folder, with the next
step `unplanned` and the change number as its id. The name in each of these
steps is trimmed.

#### Scenario: Golden brief change
- **WHEN** `PlanFeature::at(1792843200000)` runs `plan` with the row's args on a fresh scratch copy of `tests/fixtures/plan-repo` that also holds `brief-in.md`, a copy of `tests/fixtures/brief-created/brief-in.md`
- **THEN** the root's `openspec/changes/` holds the new folder `005-add-dark-mode`, which holds exactly the row's files of `tests/fixtures/brief-created/005-add-dark-mode`, which TypeScript wrote for the same fixture, each equal byte for byte, and the output equals the row's golden in `tests/fixtures/brief-created/` with each `<root>` replaced by the scratch copy's path shown with `display()`:

| Args | Files | Golden |
|---|---|---|
| `Add dark mode!`, `--brief`, `brief-in.md` | every file | `handoff.txt` |
| `Add dark mode!`, `--brief`, `brief-in.md`, `--print` | every file but `plan-prompt.md` | `print.txt` |

#### Scenario: Brief from standard input
- **WHEN** `PlanFeature::at(1792843200000)` runs `plan` with the args `Add dark mode!`, `--brief`, `-` in a process whose standard input holds the bytes of `tests/fixtures/brief-created/brief-in.md`, on a fresh scratch copy of `tests/fixtures/plan-repo`
- **THEN** the new folder `005-add-dark-mode` holds exactly the files of `tests/fixtures/brief-created/005-add-dark-mode`, each equal byte for byte, and the output equals `tests/fixtures/brief-created/handoff.txt` with each `<root>` replaced by the scratch copy's path

#### Scenario: Brief refusals
- **WHEN** `plan` runs with the row's args on a new scratch root that holds the row's files and `b.md` holding `Do it.\n`
- **THEN** it gives a `Failed` error for the command `plan` whose message is the row's, or starts with it when the row says so, and `openspec/changes/` holds no new folder:

| Args | Files | Message |
|---|---|---|
| `001`, `--brief`, `b.md` | `openspec/changes/archive/001-a/proposal.md` holding `---\ntitle: A\n---\n` | `001-a has archived, so osq plan 001 has nothing to reopen. Start new work with an item in openspec/queue.md and osq plan --next, or with osq plan <name> --brief <file>.` |
| `001`, `--brief`, `b.md` | the same, and `osq.toml` holding `[vcs]\nenabled = true\nauthor = "osq <osq@example.com>"\n`, all committed on `main` of a new git repository at the root | `001-a has landed, so osq plan 001 has nothing to reopen. Start new work with an item in openspec/queue.md and osq plan --next, or with osq plan <name> --brief <file>.` |
| `7`, `--brief`, `b.md` | none | `osq plan 7 names no change, and a number is not a name for a new change. Plan the next queue item with osq plan --next, or start a change with osq plan <name> --brief <file> and a descriptive name.` |
| `!!!`, `--brief`, `b.md` | none | `Spec name cannot be empty` |
| `x`, `--brief`, `nope.md` | none | starts with `Cannot read brief nope.md: ` |

#### Scenario: Brief name of an active change
- **WHEN** `plan` runs with the args `001`, `--brief`, `nope.md` on a new copy of `crates/features/plan/tests/fixtures/steer-project/`
- **THEN** the output is `blocked-001.out.txt` in `crates/features/plan/tests/fixtures/steer-golden/`, with the copy's root written `<root>`, as `plan` with the args `001` gives

#### Scenario: Brief change names
- **WHEN** `PlanFeature::at(1792843200000)` runs `plan` with the row's name, `--brief` and `b.md` on a new scratch root that holds only `b.md` holding `Do it.\n`
- **THEN** it creates the row's folder in `openspec/changes/`, whose `proposal.md` line 2 is the row's title line and whose `plan-prompt.md` holds the row's change line:

| Name | Folder | Title line | Change line |
|---|---|---|---|
| `  Fix the Login page ` | `001-fix-the-login-page` | `title: Fix the Login page` | `# Change: 001 - Fix the Login page` |
| `Fix: login` | `001-fix-login` | `title: Fix: login` | `# Change: 001 - Fix: login` |

### Requirement: Brief file text
The `brief.md` of a change planned from a brief SHALL be the text
TypeScript's `formatBriefContent` in `src/cli/plan-queue.ts` gives with no
planner model, no metadata and the current time's UTC date: the brief is
trimmed, and its frontmatter read with rust-specs `parse_frontmatter`, an
unreadable frontmatter counting as none, so that the whole trimmed brief
is the body. Then `brief.md` is `---`, one line `<key>: <value>` per
frontmatter key in its order, with `planner` given the value `null` and
`date` the date where the frontmatter has them, then `planner: null` and
`date: <date>` for those it lacks, in that order, then `---`, an empty
line, the body trimmed and one newline. A value is written as
TypeScript's `String` writes the value YAML gives: a string as it is, a
whole number in decimal, a decimal number in its shortest form, `true`,
`false` and `null`.

#### Scenario: Brief texts
- **WHEN** `PlanFeature::at(1792843200000)` runs `plan` with the args `x`, `--brief`, `b.md` on a new scratch root whose `b.md` holds the row's brief, written with `\n` escapes
- **THEN** the new folder's `brief.md` is the row's text, written with `\n` escapes, which TypeScript wrote for the same brief:

| Brief | brief.md |
|---|---|
| `Do the thing.\n` | `---\nplanner: null\ndate: 2026-10-24\n---\n\nDo the thing.\n` |
| `---\nn: 007\nok: yes\nt: true\nz: ~\nf: 1.50\n---\nB\n` | `---\nn: 7\nok: yes\nt: true\nz: null\nf: 1.5\nplanner: null\ndate: 2026-10-24\n---\n\nB\n` |
| `---\nplanner: me\ndate: 2020-01-01\nowner: x\n---\n\n  Body.  \n\n` | `---\nplanner: null\ndate: 2026-10-24\nowner: x\n---\n\nBody.\n` |
| `---\n: bad: [\n---\nB\n` | `---\nplanner: null\ndate: 2026-10-24\n---\n\n---\n: bad: [\n---\nB\n` |
