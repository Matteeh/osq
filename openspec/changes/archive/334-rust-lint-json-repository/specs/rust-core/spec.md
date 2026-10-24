## MODIFIED Requirements

### Requirement: Feature constructors
`Command`, `Invocation`, `Output`, `FeatureError` and each `FeatureError`
variant SHALL be `#[non_exhaustive]`, so a field or variant added later
touches no feature crate. Code outside `osq-core` SHALL build them through
`Command::new(name, summary, usage)`, `Invocation::new(root, command, args)`,
`Output::text(text)`, `Output::with_code(text, code)`,
`FeatureError::unknown_command(name)`,
`FeatureError::usage(command, message)` and
`FeatureError::failed(command, message)`, and SHALL read their public fields.
`Output` holds the `text` to print and the `code: i32` the process exits
with: `Output::text` gives the code 0, and `Output::with_code` the code it
is given, for a command that prints its text on stdout and still fails,
as a JSON document of findings does.

#### Scenario: Constructors fill every field
- **WHEN** the constructor call in the row runs in a test outside `osq-core`
- **THEN** the value's public fields hold the row's values:

| Call | Fields |
|---|---|
| `Command::new("say", "Says words", "<words>...")` | `name` `say`, `summary` `Says words`, `usage` `<words>...` |
| `Invocation::new("/p", "say", ["a", "b"])` | `root` `/p`, `command` `say`, `args` `a`, `b` |
| `Output::text("a b")` | `text` `a b` |
| `FeatureError::unknown_command("nope")` | `UnknownCommand` with name `nope` |
| `FeatureError::usage("say", "needs words")` | `Usage` with `command` `say`, `message` `needs words` |
| `FeatureError::failed("fail", "it always fails")` | `Failed` with `command` `fail`, `message` `it always fails` |

#### Scenario: Output exit codes
- **WHEN** the `Output` constructor call in the row runs in a test outside `osq-core`
- **THEN** the output's `text` and `code` hold the row's values:

| Call | `text` | `code` |
|---|---|---|
| `Output::text("a b")` | `a b` | 0 |
| `Output::with_code("bad", 1)` | `bad` | 1 |
| `Output::with_code("odd", 3)` | `odd` | 3 |
