## ADDED Requirements

### Requirement: Executor prompt
`executor_prompt(project_root: &Path, change: &Path, task: &str, prior:
&PriorAttempt) -> Result<String, SpecsError>` in `osq-feature-run` SHALL
return the prompt TypeScript's `buildExecutorPrompt` builds for task `task`
of the change folder `change` under `project_root`, with the default
config. It reads `tasks/<task>.md` with `read_task_file`, failing with its
error, and joins the lines by `\n` with no final newline, every path
relative to `project_root`.

#### Scenario: Executor prompts equal TypeScript's
- **WHEN** `executor_prompt` runs on a fresh copy of `crates/features/run/tests/fixtures/prompt-project/` as the project root, with the row's change folder under `openspec/changes/`, task and prior attempt, after writing `## Changed\n\n- Earlier attempt.\n\nTouched: none\n` to `.run/results/<task>.md` of the change folder when the row says so; the long output is the lines `line <i>: é verify failed` for `i` from 1 to 120, joined by `\n`
- **THEN** it returns exactly the text of the row's golden file in `crates/features/run/tests/fixtures/prompt-golden/`, which TypeScript's `buildExecutorPrompt` printed for the same inputs:

| Golden | Change | Task | Attempt | Reason | Output | Result file |
|---|---|---|---|---|---|---|
| `sample-1-first.txt` | `001-sample` | `1` | 1 | none | none | no |
| `sample-2-retry.txt` | `001-sample` | `2` | 3 | `verify_red` | the long output | yes |
| `sample-1-blank-output.txt` | `001-sample` | `1` | 2 | none | `  \n\t` | no |
| `bare-1-result.txt` | `002-bare` | `1` | 1 | none | none | yes |
| `bare-1-short-output.txt` | `002-bare` | `1` | 2 | `change_verify_red` | `error: one\nerror: two` | no |

#### Scenario: Missing task file
- **WHEN** `executor_prompt` runs on a fresh copy of the prompt fixture with the change `001-sample`, the task `9` and the default prior attempt
- **THEN** it returns the `SpecsError` that `read_task_file` gives for `openspec/changes/001-sample/tasks/9.md`

### Requirement: Prompt spec lists
The prompt SHALL list, as `deltaSpecPaths` and `livingSpecPaths` do, under
`Delta Specs:` each directory directly under `<change>/specs` as
`<change>/specs/<name>/spec.md`, and under `Living Capability Specs:` each
existing `openspec/specs/<name>/spec.md` for the trimmed, non-blank
`features.reads` names and the delta names, each once. Names are in byte
order. An empty list is left out with its blank line and heading. A
proposal `read_proposal` refuses gives no reads.

#### Scenario: Spec lists of the prompt fixture
- **WHEN** `executor_prompt` runs on the prompt fixture for task `1` of each row's change with the default prior attempt; `001-sample` reads `beta`, ` gamma ` and `beta`, writes the deltas `alpha` and `zeta` and holds the file `specs/notes.md`, and the living specs are `alpha`, `beta` and `omega`
- **THEN** the prompt lists the row's paths:

| Change | Delta Specs | Living Capability Specs |
|---|---|---|
| `001-sample` | `openspec/changes/001-sample/specs/alpha/spec.md`, `openspec/changes/001-sample/specs/zeta/spec.md` | `openspec/specs/alpha/spec.md`, `openspec/specs/beta/spec.md` |
| `002-bare` | none, the section left out | none, the section left out |

### Requirement: Prompt capability rules
The prompt SHALL give `Capability Rules:` after the seven executor steps,
as `extractCapabilityRules` does: one `- <capability>: <title> —
<statement>` line, or `- <capability>: <title>` for an empty statement,
per `### Requirement:` line of each delta `spec.md`, capabilities in byte
order and requirements in file order. A requirement whose living spec has
one of the same title and statement is left out, and with no line the
section is left out.

#### Scenario: Capability rules of the prompt fixture
- **WHEN** `executor_prompt` runs on the prompt fixture for task `1` of `001-sample` with the default prior attempt
- **THEN** its `Capability Rules:` section holds exactly these lines, in this order, `Shared rule` being left out since its statement equals the living one:

| Line |
|---|
| `- alpha: New rule — The alpha capability SHALL do the new thing across lines.` |
| `- alpha: Bare rule` |
| `- alpha: Changed rule — The alpha capability SHALL do the new thing instead.` |
| `- alpha: Old rule — **Reason**: New rule replaces it. **Migration**: Use New rule.` |
| `- zeta: Code ownership — The zeta capability SHALL own the \`zeta\` crate.` |

### Requirement: Prompt requirement statements
A requirement's statement SHALL be its text after the header line, up to
the next line starting `### ` or `##` and whitespace other than `#`, cut
before the first line starting `####`, with every HTML comment removed,
each run of JavaScript `\s` whitespace made one space, and the ends
trimmed. Its title is the header line's text after `Requirement:`,
trimmed. The living spec read is `openspec/specs/<capability>/spec.md`;
when it is missing, every rule of the capability is kept.

#### Scenario: Requirement statements
- **WHEN** the capability rules are built from a delta `spec.md` holding the row's requirement
- **THEN** the rule's statement is the row's:

| Requirement text after `### Requirement: New rule` | Statement |
|---|---|
| `\n<!-- source: a/** -->\nThe rule SHALL do\nthe thing   across\tlines.\n\n#### Scenario: S\n- x` | `The rule SHALL do the thing across lines.` |
| `\n#### Scenario: S\n- x` | empty |
| `\nFirst <!-- a\nb --> part.\n\n## REMOVED Requirements` | `First part.` |
| `\nOne\u{a0}two\u{feff}three` | `One two three` |

### Requirement: Prompt prior context
`PriorAttempt` SHALL hold `attempt: u32`, `reason` and `output`, both
`Option<String>`, by default attempt 1 with neither. As
`priorContextLines` does, the prompt gives a blank line, `Prior Context:`
and `- Prior Attempt: <n>` when the attempt is over 1, the reason is not
empty, the output is not blank or the task's result file exists; then
`- Prior Failure: <reason>`, `- Prior Failure Output:` with each output
line indented two spaces, and `- Prior Result: <path>`, each when it
applies.

#### Scenario: Prior context of the prompt fixture
- **WHEN** `executor_prompt` runs as the rows of "Executor prompts equal TypeScript's" say
- **THEN** the prompt's prior context is the row's:

| Golden | Prior context lines |
|---|---|
| `sample-1-first.txt` | none |
| `sample-1-blank-output.txt` | `Prior Context:`, `- Prior Attempt: 2` |
| `bare-1-result.txt` | `Prior Context:`, `- Prior Attempt: 1`, `- Prior Result: openspec/changes/002-bare/.run/results/1.md` |
| `bare-1-short-output.txt` | `Prior Context:`, `- Prior Attempt: 2`, `- Prior Failure: change_verify_red`, `- Prior Failure Output:`, `  error: one`, `  error: two` |

### Requirement: Prompt output bound
The prior failure output SHALL be bounded as TypeScript bounds it: an
output longer than 2000 UTF-16 code units keeps its first 2000 code units
followed by `…`, and a shorter one is kept whole.

#### Scenario: Output bounds
- **WHEN** the prompt's prior failure output is the row's text, given with attempt 2
- **THEN** the lines after `- Prior Failure Output:` hold the row's kept text:

| Output | Kept text |
|---|---|
| 2000 `a` characters | the 2000 characters |
| 2001 `a` characters | 2000 `a` characters and `…` |
| 1999 `a` characters and `é` | the whole output |
| 1999 `a` characters, `é` and `b` | 1999 `a` characters, `é` and `…` |
