## MODIFIED Requirements

### Requirement: Approve feature
`osq-feature-approve` SHALL expose one public item, the unit struct
`ApproveFeature`, which implements rust-core's `Feature`, holds no storage
connection (ADR 028), and derives `Clone`, `Copy`, `Debug` and `Default`.
Its `name` SHALL be `approve`, and its `commands` SHALL be `approve` and then
`reject`, with the summaries and usages "Approve feature commands" gives.

#### Scenario: Approve feature commands
- **WHEN** a test reads `ApproveFeature`'s name and commands
- **THEN** the name is `approve`, and the commands are, in order, one with the name `approve`, the summary `lint, hash, and approve change folders` and the usage `<id>`, and one with the name `reject`, the summary `move an eligible active change intact into rejected history` and the usage `<id> --reason <text>`

### Requirement: Approve arguments
`ApproveFeature::run` SHALL return `FeatureError::unknown_command` with the
invocation's command for any command but `approve` and `reject`, and
`FeatureError::usage("approve", "expected one change id, got <n>")` for an
`approve` invocation with `n` arguments when `n` is not 1, before it reads
any file. Every other failure of `approve` SHALL be `FeatureError::failed`
with the command `approve` and the message the other approve requirements
name.

#### Scenario: Approve argument errors
- **WHEN** a test runs the invocation in the row with a root that holds no `openspec/` folder
- **THEN** it gives the row's error:

| Invocation | Error |
|---|---|
| `approve` with no args | `Usage` error displayed `usage of approve: expected one change id, got 0` |
| `approve` with args `1`, `2` | `Usage` error displayed `usage of approve: expected one change id, got 2` |
| `queue` with args `1` | `UnknownCommand` error displayed `unknown command: queue` |

## ADDED Requirements

### Requirement: Reject arguments
Before it reads any file, `reject` SHALL read its arguments left to right:
`--reason` takes the next argument as the reason, and any other argument is
the change id. Without exactly one id and exactly one `--reason` with a
value, it fails with `FeatureError::usage("reject", "expected <id> --reason
<text>")`. A reason that is empty after trimming fails with
`FeatureError::usage("reject", "a non-empty rejection reason is required")`.

#### Scenario: Reject argument errors
- **WHEN** a test runs `reject` with the row's arguments on a root that holds no `openspec/` folder
- **THEN** it gives the row's `Usage` error, displayed as the row's text:

| Arguments | Text |
|---|---|
| none | `usage of reject: expected <id> --reason <text>` |
| `1` | `usage of reject: expected <id> --reason <text>` |
| `1`, `--reason` | `usage of reject: expected <id> --reason <text>` |
| `--reason`, `why` | `usage of reject: expected <id> --reason <text>` |
| `1`, `2`, `--reason`, `why` | `usage of reject: expected <id> --reason <text>` |
| `1`, `--reason`, `a`, `--reason`, `b` | `usage of reject: expected <id> --reason <text>` |
| `1`, `--reason`, `   ` | `usage of reject: a non-empty rejection reason is required` |

### Requirement: Reject refusals
`reject` SHALL find the change as "Approve lookup" does, then refuse, in
this order and writing nothing, with `FeatureError::failed("reject", ..)`
and TypeScript's `rejectSpec` texts: no match, a folder already under
`openspec/changes/rejected/`, any `.run/running/*.pid` file, and an approved
change that has not failed. Approved means `.run/approved` holds text that
is not blank. Failed means the "Reject eligibility" rule holds.

#### Scenario: Reject outcomes
- **WHEN** `reject` runs with the arguments `1`, `--reason`, `why` on a root whose one active change folder `001-a` holds `proposal.md`, `tasks/1.md` and `tasks/2.md` and the row's other files, every marker holding the text `x`
- **THEN** it gives the row's `Failed` message, displayed after `reject failed: `, and leaves every file in place, or, where the row says rejected, it moves the folder to `openspec/changes/rejected/001-a`:

| Other files | Result |
|---|---|
| none | rejected |
| `.run/approved` holding `sha` | `Change 001-a is approved and healthy; only a failed change may be rejected.` |
| `.run/approved` holding two spaces | rejected |
| `.run/approved` holding `sha`, `.run/dead/1.md` | rejected |
| `.run/approved` holding `sha`, `.run/dead/1.md`, `.run/done/1` | `Change 001-a is approved and healthy; only a failed change may be rejected.` |
| `.run/approved` holding `sha`, `.run/regressed/change.md` | rejected |
| `.run/approved` holding `sha`, `.run/regressed/2.md`, `.run/done/2` | rejected |
| `.run/approved` holding `sha`, `.run/dead/9.md` | `Change 001-a is approved and healthy; only a failed change may be rejected.` |
| `.run/running/1.pid`, `.run/dead/1.md` | `Change 001-a has a running task; rejection is refused.` |
| `.run/approved` holding `sha`, `.run/running/zz.pid`, `.run/regressed/change.md` | `Change 001-a has a running task; rejection is refused.` |
| the folder `openspec/changes/rejected/001-a` | `Cannot reject 001-a: destination "openspec/changes/rejected/001-a" already exists.` |

#### Scenario: Reject with no match
- **WHEN** `reject` runs with the arguments `7`, `--reason`, `why` on the "Reject outcomes" root with no other files
- **THEN** it fails with `Spec "7" not found in <changes>`, where `<changes>` is the root joined with `openspec/changes`, and writes nothing

### Requirement: Reject eligibility
An approved change SHALL count as failed, as TypeScript's `deriveSpecState`
gives `dead` or `regressed`, when `.run/regressed/change.md` exists, or when
some task file `tasks/<n>.md` has `.run/regressed/<n>.md`, or has
`.run/dead/<n>.md` and no `.run/done/<n>`. `reject` reads these marker files
directly, never the event streams, and ignores markers whose task has no
task file.

#### Scenario: Eligibility from markers
- **WHEN** `reject` runs on the "Reject outcomes" rows whose `.run/approved` holds `sha`
- **THEN** it rejects exactly the rows whose markers name `change` or a task with a task file and no done marker for its dead marker, as the table gives

### Requirement: Rejection record
`reject` SHALL create `openspec/changes/rejected/`, rename the folder into
it, write `.run/rejected.md` as `---\nreason: <r>\ntimestamp: <t>\n---\n`,
and append `{"type":"rejected","timestamp":<t>,"data":{"reason":<r>}}` and
`\n` to `.run/events/change.jsonl`. `<r>` is the trimmed reason and `<t>`
the UTC time as `YYYY-MM-DDTHH:MM:SS.mmmZ`, each as a JSON string. It prints
`Rejected <id> (<folder>)`, `  Reason: <reason>` and `  Destination: <path>`.

#### Scenario: Rejection files
- **WHEN** `reject` runs with the arguments `--reason`, `  why "x"  `, `1` on the "Reject outcomes" root with no other files, and the test reads the clock before and after
- **THEN** `openspec/changes/001-a` is gone, `openspec/changes/rejected/001-a` holds `proposal.md` and both task files with their bytes, its `.run/rejected.md` is `---\nreason: "why \"x\""\ntimestamp: "<t>"\n---\n`, its `.run/events/change.jsonl` is the one line `{"type":"rejected","timestamp":"<t>","data":{"reason":"why \"x\""}}` and `\n`, and the output is `Rejected 001 (001-a)\n  Reason: why "x"\n  Destination: <root>/openspec/changes/rejected/001-a\n`, where `<t>` is one UTC time between the two clock readings, written to the millisecond
