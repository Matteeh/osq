## ADDED Requirements

### Requirement: Retry context
`read_retry_context(folder: &Path, task: &str) -> RetryContext` in
`osq-kernel-storage` SHALL read, as TypeScript's `readRetryContext` does,
the lines of `<folder>/.run/events/<task>.jsonl` in file order, passing
over a blank line and one that is not a JSON object. `RetryContext` SHALL
be public, exported from the crate root, derive `Debug`, `Clone`,
`PartialEq` and `Eq`, and hold `attempt: u64`, `reason: Option<String>`
and `output: Option<String>`. Starting from attempt 1 with neither:

- a `retry` line takes its data's `attempt` when that is a whole number
  that fits `u64`, its `reason` when that is a non-empty string, and sets
  the output to the body of `.run/dead/<task>.<attempt - 1>.md`, after
  `markdown_body` and with ANSI escape codes removed, or to none when that
  file cannot be read;
- a `recertification` line whose data's `outcome` is `requeued` takes its
  `attempt` and `reason` the same way, and its `output` when that is a
  string;
- every other line changes nothing.

A missing event file gives attempt 1. At the end an empty reason or output
is `None`. An ANSI escape code is ESC `[`, any of `0-9`, `;` and `?`, any
characters from space to `/`, and one from `@` to `~`; or ESC `]`, any
characters but BEL, and BEL or ESC `\`.

#### Scenario: Retry contexts
- **WHEN** `read_retry_context` reads task `1` of a scratch change folder whose `.run/events/1.jsonl` holds the row's lines, each followed by a newline, and whose `.run/dead/` holds the row's markers, where `retry <n>` is a `retry` event with the data `{"target":"1","reason":"verify_red","attempt":<n>}`, `requeued {...}` is a `recertification` event whose data is `{"task":"1","outcome":"requeued","differingPaths":["src/a.rs"],"attribution":{},"command":"cargo test","exitCode":1,"timedOut":false,"recordedHash":"a","currentHash":"b"}` with the fields in braces added, `passed {...}` is the same with the outcome `passed`, and `<marker>` is `---\nreason: verify_red\n---\nerror: one\n`
- **THEN** it returns the row's context:

| Lines | Markers | Attempt | Reason | Output |
|---|---|---|---|---|
| no event file | none | 1 | none | none |
| `retry 2` | `1.1.md` holding `<marker>` | 2 | `verify_red` | `error: one\n` |
| `retry 2` | none | 2 | `verify_red` | none |
| `retry 2` | `1.1.md` holding `---\nreason: verify_red\n---\n` ESC `[31merror` ESC `[0m: red\n` ESC `]8;;http://x` BEL `link` ESC `]8;;` BEL `\n` | 2 | `verify_red` | `error: red\nlink\n` |
| `requeued {"attempt":3,"reason":"scope_regression","output":"fail\n"}` | none | 3 | `scope_regression` | `fail\n` |
| `passed {"attempt":5,"reason":"scope_regression","output":"fail\n"}` | none | 1 | none | none |
| `retry 2`, `requeued {"attempt":3,"output":"x"}` | `1.1.md` holding `<marker>` | 3 | `verify_red` | `x` |
| `requeued {"attempt":2,"reason":"scope_regression","output":"fail"}`, `retry 3` | none | 3 | `verify_red` | none |
| `retry 2`, `requeued {"attempt":3,"reason":"scope_regression"}` | `1.1.md` holding `<marker>` | 3 | `scope_regression` | `error: one\n` |
| an empty line, `not json`, `[1]`, three spaces, `retry 2` | `1.1.md` holding `no frontmatter\n` | 2 | `verify_red` | `no frontmatter\n` |
| a `retry` event with the data `{"target":"1","reason":"verify_red","attempt":2.5}` | `1.0.md` holding `---\nreason: verify_red\n---\nzero\n` | 1 | `verify_red` | `zero\n` |
| a `retry` event with the data `{"target":"1","reason":"","attempt":2}` | none | 2 | none | none |
| `requeued {"attempt":2,"output":""}` | none | 2 | none | none |
| `requeued {"attempt":2,"output":"  \n"}` | none | 2 | none | `  \n` |
