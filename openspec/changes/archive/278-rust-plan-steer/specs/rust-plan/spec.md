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
the usage `--next [--replan] | <id>`.

#### Scenario: Plan feature commands
- **WHEN** a test reads the name and commands of `PlanFeature::new()`
- **THEN** the name is `plan`, and the commands are, in order:

| Name | Summary | Usage |
|---|---|---|
| `queue` | `print the read-only brief queue projection` | `` (empty text) |
| `plan` | `prepare a change and hand off its opening prompt to your planning tool` | `--next [--replan] \| <id>` |

### Requirement: Plan arguments
A `plan` invocation SHALL take either `--next`, and optionally `--replan`,
each once and in either order, or exactly one change id: one argument that
does not start with `--`. For any other arguments, `PlanFeature::run` SHALL
return
`FeatureError::usage("plan", "expected --next [--replan] or one change id")`
before it reads any file. Every other failure of `plan` SHALL be
`FeatureError::failed` with the command `plan` and the message the other
plan requirements name.

#### Scenario: Plan argument errors
- **WHEN** a test runs `plan` with the row's args and a root that holds no `openspec/` folder
- **THEN** it gives a `Usage` error displayed `usage of plan: expected --next [--replan] or one change id`:

| Args |
|---|
| (none) |
| `--replan` |
| `--next`, `--next` |
| `--next`, `--replan`, `--replan` |
| `--next`, `x` |
| `a`, `b` |
| `--steer` |

## ADDED Requirements

### Requirement: Steering lookup
`plan <id>` SHALL find the first active change, in rust-storage
`list_changes` order, whose folder name matches the id as TypeScript's
`matchesFolder` does, and read it with rust-storage `read_change`. Its
steering triggers are those TypeScript's `deriveSteering` gives, in its
order: none unless `.run/approved` exists; then the change trigger of
`.run/regressed/change.md`, `conflict` for `sync_conflict`,
`requirement_changed` for `requirement_changed` and `regression` for
`verify_red`, `verify_path_missing` or `sync_verify_red`; then each task
file's trigger in task order, `regression` for a regressed marker unless
its reason is `scope_regression` and `verification_passed` is `true`, else,
for a task with no done marker, `blocked` for a dead marker whose reason is
`blocked` or `entry_missing` and `stuck` for one whose `stuck` is `true`.

When no active change matches, or the change has no trigger, `plan` SHALL
fail with
`No active change matching "<id>" needs steering; Rust osq plan <id> steers a change only.`
and write nothing. When `read_change` fails, `plan` SHALL fail with
`Cannot read <folder>: <error>` and write nothing.

#### Scenario: Nothing to steer
- **WHEN** `plan` runs with the row's id on a copy of `crates/features/plan/tests/fixtures/steer-project/`
- **THEN** it gives a `Failed` error for the command `plan` with the row's message, and every file in the copy is unchanged:

| Id | Message |
|---|---|
| `8` | `No active change matching "8" needs steering; Rust osq plan 8 steers a change only.` |
| `009-unapproved` | `No active change matching "009-unapproved" needs steering; Rust osq plan 009-unapproved steers a change only.` |
| `99` | `No active change matching "99" needs steering; Rust osq plan 99 steers a change only.` |

### Requirement: Steering prompt
`plan <id>` on a change with triggers SHALL write the change folder's
`plan-prompt.md` as TypeScript's `planCommand` writes it with vcs off: the
"Plan prompt" sections for the change, with no landed dependencies, the
change's own `brief.md`, and the proposal's `title`, or the id as given
when the proposal has none; then an empty line and the steering section
TypeScript's `buildSteeringSection` gives, with no newline at the end. The
section's lines are:

- `## Steering`, an empty line, and
  `osq halted this change and asks you to revise its plan.`;
- per trigger, an empty line,
  `### <target> <trigger> (<reason>)`, `<target>` being `change` or
  `task <n>`, then `Evidence: <marker path>`, an empty line, and the
  marker's frontmatter body, trimmed, between two lines of three
  backticks. The marker is `.run/regressed/<target>.md` for a change or a
  regression and `.run/dead/<n>.md` otherwise, its path the change folder
  joined with it;
- an empty line, then
  `The change runs in <root>; read its code there. Edit only <change folder>.`;
- when a trigger is `conflict`, `requirement_changed`, or a `regression`
  with the reason `sync_verify_red`:
  `Approval restarts osq/<folder> from main, and every task runs again.`
  when one is `conflict`, else
  `Approval merges main into osq/<folder> without running verify; add a task that makes the merged tree pass.`;
- `Every task runs again after the restart. Revise any task the conflict shows is wrong.`
  when a trigger is `conflict`, else
  `Done tasks stay done: <ids>. Add a task for new work instead of rewriting a done one.`,
  `<ids>` being the task ids with a done marker and no regressed marker,
  joined by `, `, or `none`;
- ``Run `osq lint <id>` and fix every finding. A human runs `osq approve <id>`, and the run continues from the first task that is not done.``,
  `<id>` being the folder's leading digits.

With vcs off no requirement text follows a `requirement_changed` trigger,
since TypeScript reads it from the default branch.

#### Scenario: Steering equals TypeScript's
- **WHEN** `plan` runs with the row's id on a new copy of `crates/features/plan/tests/fixtures/steer-project/`, a copy of `openspec/changes/278-rust-plan-steer/fixture/steer-project/`
- **THEN** the output equals `<golden>.out.txt` and the change folder's `plan-prompt.md` equals `<golden>.prompt.txt` in `crates/features/plan/tests/fixtures/steer-golden/`, a copy of `openspec/changes/278-rust-plan-steer/golden/`, with the copy's root written `<root>`, and no other file in the copy changes:

| Id | Golden |
|---|---|
| `1` | `blocked-001` |
| `002` | `stuck-002` |
| `003-regression` | `regression-003` |
| `4` | `conflict-004` |
| `5` | `requirement-005` |
| `6` | `sync-red-006` |
| `7` | `many-007` |
| `10` | `untitled-010` |

### Requirement: Steering handoff
After writing `plan-prompt.md`, `plan <id>` SHALL return the "Plan
handoff" text for the change folder with the next step
`dead (needs steering) — osq plan <id>`, `<id>` being the folder's leading
digits.

#### Scenario: Steering handoff with the slash command
- **WHEN** `plan` runs with the id `1` on a new copy of `crates/features/plan/tests/fixtures/steer-project/` that also holds the file `.claude/commands/osq-plan.md`
- **THEN** the output is `blocked-001.out.txt` in `crates/features/plan/tests/fixtures/steer-golden/`, with the copy's root written `<root>`, followed by an empty line, `In Claude Code, /osq-plan 001 does the same.` and a newline
