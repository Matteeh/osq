## MODIFIED Requirements

### Requirement: Lint command
`osq-feature-lint` SHALL expose one public item, `LintFeature`, a unit
struct that implements core's `Feature` and derives `Clone`, `Copy`,
`Debug` and `Default`. Its `name()` is `lint`, and its `commands()` is one
command with the name `lint`, the summary `validate a change's delta specs
and the Rust link gates` and the usage `<id>`. The crate depends on
`osq-core`, `osq-kernel-config`, `osq-kernel-specs`, `osq-kernel-linter`
and `osq-kernel-storage`, and on no feature crate.

#### Scenario: Lint feature commands
- **WHEN** a test reads `LintFeature`'s name and commands
- **THEN** the name is `lint`, and the commands are exactly one, with the name `lint`, the summary `validate a change's delta specs and the Rust link gates` and the usage `<id>`

### Requirement: Lint findings
After the lookup, `lint` SHALL load the config with rust-config
`load_config(root)`, then check the change it found, at
`<root>/openspec/changes/<folder>`, in this order:

1. the proposal rules "Lint proposal rules" names;
2. the banned word rule "Lint banned words" names;
3. rust-specs `validate_change` with the change folder and the root joined
   with `openspec/specs`, and, only when that gives no finding,
   `validate_merged_change` with the same folders;
4. rust-linter `change_link_gates` with the root, `decisions`,
   `openspec`, the group `rust` and the change `openspec/changes/<folder>`.

A finding is an error or a warning. Spec findings, merge refusals and link
gate findings are errors. Each finding is written as one line, in the
order the checks give them: `<folder>: <file>:<line>: <message>` for a
`SpecFinding`, `<folder>: <file>: <refusal>` for a
`MergeChangeError::Merge`, the `MergeError`'s display being the refusal,
`<folder>: ` followed by the `Finding`'s display for a link gate finding,
and, as TypeScript's `formatFinding` writes one, `<folder>: <severity>
<file>: <message>` for a proposal rule or banned word finding, with
` (<section>)` before the colon when the finding names a section, the
severity being `error` or `warning`. A file the specs kernel names under
the root is written relative to the root.

With no error, `lint` SHALL return the output made of each warning's line
followed by a newline, in order, then `<folder>: valid` and a newline.
With an error, it SHALL fail with a message whose first line is
`<folder>: 1 finding`, or `<folder>: <n> findings` for any other count,
`<n>` counting every finding, errors and warnings, followed by a newline
and each finding's line, joined by newlines. `lint` writes no file.

#### Scenario: Lint fixture changes
- **WHEN** `lint` runs with the row's query on the lint fixture project, `crates/features/lint/tests/fixtures/lint-project/`, a copy of `openspec/changes/275-rust-lint-command/fixture/lint-project/`
- **THEN** it returns the row's output, or gives a `Failed` error for the command `lint` with the row's message, written with `\n` escapes, and the fixture's files are unchanged:

| Query | Result |
|---|---|
| `1` | output `001-clean: valid\n` |
| `002` | message ``002-bad-delta: 2 findings\n002-bad-delta: openspec/changes/002-bad-delta/specs/delta/spec.md:12: the delta names `Ghost`, which the living spec has no requirement for\n002-bad-delta: openspec/changes/002-bad-delta/specs/delta/spec.md:21: the delta names `Phantom`, which the living spec has no requirement for`` |
| `003-dangling-tag` | message `003-dangling-tag: 1 finding\n003-dangling-tag: crates/delta/src/lib.rs:12: Implements: tag names requirement:delta/sums-lists, which does not exist` |
| `4` | message `004-merge-conflict: 1 finding\n004-merge-conflict: openspec/changes/004-merge-conflict/specs/delta/spec.md: delta ADDED failed for header "### Requirement: Adds numbers" - already exists` |
| `005-no-delta` | message `005-no-delta: 2 findings\n005-no-delta: openspec/changes/005-no-delta/proposal.md:1: the change holds no delta spec\n005-no-delta: crates/delta/src/lib.rs:12: Implements: tag names requirement:delta/sums-lists, which does not exist` |

### Requirement: Lint errors
When a check cannot run, `lint` SHALL fail with the display of the error
the check gives and no finding line: a `ConfigError` from `load_config`,
a `SpecsError` from `validate_change`, a `MergeChangeError::Read` from
`validate_merged_change`, or a `GraphError` from `change_link_gates`.

#### Scenario: Lint check errors
- **WHEN** `lint` runs with the query `1` on a scratch root whose one active change folder `001-a` holds `proposal.md` and the row's files
- **THEN** it gives a `Failed` error for the command `lint` whose message starts with the row's text, `<root>` being the scratch root written by `Path::display`:

| Files | Message starts with |
|---|---|
| `specs/alpha/spec.md` holding the bytes `0xff 0xfe` | `<root>/openspec/changes/001-a/specs/alpha/spec.md: ` |
| `specs/alpha/spec.md` holding `## ADDED Requirements\n\n### Requirement: Alpha runs\nThe system SHALL run alpha.\n\n#### Scenario: Alpha runs\n- **WHEN** alpha starts\n- **THEN** alpha runs\n`, with the root's `Cargo.toml` holding `[package]\nname = "one"\n` | `<root>/Cargo.toml: ` |

#### Scenario: Lint config error
- **WHEN** `lint` runs with the query `1` on a scratch copy of the lint fixture project whose `osq.toml` holds `bogus = 1\n`
- **THEN** it gives a `Failed` error for the command `lint` with the message `bogus is not an osq.toml key`

## ADDED Requirements

### Requirement: Lint proposal rules
`lint` SHALL check the change's `proposal.md` with TypeScript's proposal
rules for its `## Assumptions` and `## Decisions` sections and the
`AGENTS.md` project rules block. When `proposal.md` cannot be read as
UTF-8 or rust-specs `parse_frontmatter` refuses it, these rules give no
finding. Otherwise they read its body, and every proposal finding names
the file `openspec/changes/<folder>/proposal.md`. A section of the body is
present when a line is `##`, whitespace, the section's name and optional
whitespace, as TypeScript's `readSurfaceSection` matches it; its text runs
from there to the next line break followed by `##`, a character that is
not `#` and whitespace, or to the end. A section is blank when its text
holds only whitespace once every `<!--` through the next `-->` is removed.

1. Assumptions: when the `Assumptions` section is present and blank, an
   error with the section `Assumptions` and the message `proposal.md's ##
   Assumptions section is empty: write None or one line per assumption`.
   A missing section gives no finding.
2. Decisions, only when rust-specs `read_decisions(root, "decisions",
   "openspec")` gives at least one ADR whose status is `accepted`, as
   TypeScript's `collectDecisionsFindings` checks it:
   1. The errors of rust-specs `project_rules_errors` for those
      records, the text of `AGENTS.md`, read as the empty text when it
      cannot be read, with invalid UTF-8 replaced, and
      `limits.maxProjectRules`, each with the file `AGENTS.md` and no
      section.
   2. When the `Decisions` section is missing or blank, an error with the
      section `Decisions` and the message `proposal.md needs a ##
      Decisions section: name each accepted ADR that governs a capability
      this change writes, or write None`, and no other Decisions finding.
   3. The written capabilities are the names of the folders directly
      under the change's `specs/` that hold a `spec.md`, in byte order.
      The section names an ADR number for each `ADR`, after a character
      that is not a letter, digit or `_` or at the start, then
      whitespace and digits, distinct numbers in first-seen order. Two
      numbers are the same when they are equal once their leading zeros
      are dropped. For each accepted ADR, in ADR order, whose `governs`
      lists a written capability and whose number the section does not
      name, an error with the section `Decisions` and the message
      `proposal.md ## Decisions does not name ADR <number>, which applies
      to <capability>`, `<number>` as the ADR's record gives it and
      `<capability>` the first written capability it lists.
   4. For each number the section names that is no accepted ADR's
      number, in order, a warning with the section `Decisions` and the
      message `proposal.md ## Decisions names ADR <n>, which does not
      exist or is not accepted`, `<n>` as the section writes it first.

#### Scenario: Proposal rule findings
- **WHEN** `lint` runs with the query `1` on a new scratch copy of the lint fixture project with the row's files written over it. `<prop>` is `openspec/changes/001-clean/proposal.md` and `<goal>` is `## Goal\n\nSum a list.\n\n`. `<d009>` is `decisions/009-delta.md` holding `---\nstatus: accepted\napplies_to: [delta]\nrule: Delta only.\n---\n# 009. Delta\n`. `<keep>` is `decisions/001-keep.md` holding `---\nstatus: accepted\napplies_to: all\nrule: Keep it.\n---\n# 001. Keep\n`, and `<rules>` is `<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it. ADR 001\n<!-- OSQ:RULES:END -->\n`. `<p>` is `001-clean: error openspec/changes/001-clean/proposal.md`
- **THEN** it returns the row's output, or gives a `Failed` error for the command `lint` with the row's message, written with `\n` escapes:

| Files | Result |
|---|---|
| `<prop>` `<goal>## Assumptions\n\nNone\n` | output `001-clean: valid\n` |
| `<prop>` `<goal>## Assumptions\n\n<!-- one line each -->\n\n## Delta\n\nx\n` | message `001-clean: 1 finding\n<p> (Assumptions): proposal.md's ## Assumptions section is empty: write None or one line per assumption` |
| `<prop>` `---\ntitle: [\n---\n<goal>## Assumptions\n\n` | output `001-clean: valid\n` |
| `<d009>` | message `001-clean: 1 finding\n<p> (Decisions): proposal.md needs a ## Decisions section: name each accepted ADR that governs a capability this change writes, or write None` |
| `<d009>`, `<prop>` `<goal>## Decisions\n\nNone\n` | message `001-clean: 1 finding\n<p> (Decisions): proposal.md ## Decisions does not name ADR 009, which applies to delta` |
| `<d009>`, `<prop>` `<goal>## Decisions\n\n- ADR 9: delta stays small.\n` | output `001-clean: valid\n` |
| `<d009>`, `<prop>` `<goal>## Decisions\n\n- Departs from ADR 009: reasons.\n- ADR 042 and ADR 42 are planned.\n` | output `001-clean: warning openspec/changes/001-clean/proposal.md (Decisions): proposal.md ## Decisions names ADR 042, which does not exist or is not accepted\n001-clean: valid\n` |
| `decisions/010-rust.md` `---\nstatus: accepted\napplies_to: [group:rust]\nrule: Rust only.\n---\n# 010. Rust\n`, `<prop>` `<goal>## Decisions\n\nNone\n` | message `001-clean: 1 finding\n<p> (Decisions): proposal.md ## Decisions does not name ADR 010, which applies to delta` |
| `decisions/009-delta.md` `---\nstatus: proposed\napplies_to: [delta]\n---\n# 009. Delta\n` | output `001-clean: valid\n` |
| `<keep>`, `<prop>` `<goal>## Decisions\n\nNone\n` | message ``001-clean: 1 finding\n001-clean: error AGENTS.md: AGENTS.md is missing its project rules block; run `osq init` `` |
| `<keep>`, `AGENTS.md` `<rules>`, `<prop>` `<goal>## Decisions\n\nNone\n` | output `001-clean: valid\n` |
| `<keep>`, `AGENTS.md` `<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it now. ADR 001\n<!-- OSQ:RULES:END -->\n`, `<prop>` `<goal>## Decisions\n\nNone\n` | message ``001-clean: 1 finding\n001-clean: error AGENTS.md: AGENTS.md project rules block is out of date; run `osq init` `` |
| `<d009>`, `AGENTS.md` `<rules>`, `<prop>` `<goal>## Decisions\n\n- ADR 009: small.\n` | message ``001-clean: 1 finding\n001-clean: error AGENTS.md: AGENTS.md has an unexpected project rules block; run `osq init` `` |
| `<keep>`, `decisions/002-also.md` `---\nstatus: accepted\napplies_to: all\nrule: Also.\n---\n# 002. Also\n`, `AGENTS.md` `<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it. ADR 001\n- Also. ADR 002\n<!-- OSQ:RULES:END -->\n`, `osq.toml` `[limits]\nmaxProjectRules = 1\n`, `<prop>` `<goal>## Decisions\n\nNone\n` | message `001-clean: 1 finding\n001-clean: error AGENTS.md: AGENTS.md holds 2 project rules, more than limits.maxProjectRules (1)` |
| `<keep>`, `AGENTS.md` `<rules>`, `<prop>` `<goal>## Assumptions\n\n\n## Decisions\n\n<!-- later -->\n` | message `001-clean: 2 findings\n<p> (Assumptions): proposal.md's ## Assumptions section is empty: write None or one line per assumption\n<p> (Decisions): proposal.md needs a ## Decisions section: name each accepted ADR that governs a capability this change writes, or write None` |

### Requirement: Lint banned words
`lint` SHALL warn about banned words as TypeScript's
`collectBannedWordFindings` does, only when `proposal.md` reads and its
frontmatter parses as "Lint proposal rules" says. With an empty
`bannedWords` there is no finding. Each entry has its index in
`bannedWords`.

The task files are the files directly under the change's `tasks/` whose
names end in `.md`, ordered by their leading digits as numbers when both
names have some and they differ, else by name. A task file that cannot be
read as UTF-8 or that rust-specs `parse_task_file` refuses is not checked.
A task file is checked against the entries where one of the entry's paths
and one of the task's `scope` entries cover each other: core
`scope_covers_path(scope, path)` holds for an entry path, or
`scope_covers_path(paths, scope_entry)` holds for a scope entry. A task
file with no such entry is not checked. Once any task file is checked,
each folder directly under the change's `specs/`, in byte order, has its
`spec.md` checked against every entry, unless it cannot be read as UTF-8.

The texts of a file, split into lines at `\n` with a trailing `\r`
dropped, are: in a fenced block, each line's trimmed text when it is not
empty; outside one, each `` `...` `` span's inner text, a span being a
backtick, one or more characters that are not backticks and a backtick,
and, under a `#### Scenario:` heading, each non-empty `"..."` text. A line
whose text after leading whitespace starts with three backticks or three
tildes opens or closes a fenced block and has no text. A line that starts
with one to six `#` and whitespace is a heading with no text; it starts a
scenario when it starts with exactly four `#`, whitespace and `Scenario:`,
and ends one otherwise. The texts are ordered by where they start in the
file, and a text equal to an earlier one is dropped.

A text holds an entry's word when a token of it, split at whitespace,
contains the word ignoring case, unless the token holds `/` and core
`scope_covers_path(paths, token)` does not hold for the entry's paths. For
each text, in order, and each entry it is checked against, in index order,
a text that holds the entry's word gives one warning, with the file's
path from the root with `/` and no section, and the message `Banned word
"<word>" in "<text>": bannedWords[<index>] bans it in <paths>; name it
another way`, `<paths>` being the entry's paths joined by `, `.

#### Scenario: Banned word warnings
- **WHEN** `lint` runs with the query `1` on a new scratch copy of the lint fixture project with the row's files written over it. `<ban>` is `osq.toml` holding `[[bannedWords]]\nword = "legacy"\npaths = ["crates/**"]\n`. `<task s b>` is `openspec/changes/001-clean/tasks/1.md` holding `---\ntitle: When x, y\nverify: cargo test\nscope:\n  - s\n---\n## Acceptance\n\n- [ ] b\n` with the row's `s` and `b`, a `'` in `b` standing for a backtick. `<w>` is `001-clean: warning openspec/changes/001-clean/tasks/1.md: Banned word "legacy" in`, `<in>` is `bannedWords[0] bans it in crates/**; name it another way`
- **THEN** it returns the row's output, or gives a `Failed` error for the command `lint` with the row's message, written with `\n` escapes:

| Files | Result |
|---|---|
| `<ban>`, `<task crates/delta/src/lib.rs Set 'legacyMode' to false.>` | output `<w> "legacyMode": <in>\n001-clean: valid\n` |
| `<ban>`, `<task crates/delta/src/lib.rs Print 'Mode: LEGACY (old)'.>` | output `<w> "Mode: LEGACY (old)": <in>\n001-clean: valid\n` |
| `<ban>`, `<task crates/delta/src/lib.rs Run 'tests/legacy-free.rs'.>` | output `001-clean: valid\n` |
| `<ban>`, `<task crates/delta/src/lib.rs Remove 'crates/delta/src/legacy.rs'.>` | output `<w> "crates/delta/src/legacy.rs": <in>\n001-clean: valid\n` |
| `<ban>`, `<task crates/delta/src/lib.rs Drop the legacy flag.>` | output `001-clean: valid\n` |
| `<ban>`, `<task tests/a.rs Set 'legacyMode' to false.>` | output `001-clean: valid\n` |
| `osq.toml` `[[bannedWords]]\nword = "legacy"\npaths = ["crates/delta/**"]\n`, `<task crates/** Set 'legacyMode' to false.>` | output `001-clean: warning openspec/changes/001-clean/tasks/1.md: Banned word "legacy" in "legacyMode": bannedWords[0] bans it in crates/delta/**; name it another way\n001-clean: valid\n` |
| `osq.toml` `[[bannedWords]]\nword = "legacy"\npaths = ["docs/**"]\n\n[[bannedWords]]\nword = "LEGACY"\npaths = ["crates/**", "src/**"]\n`, `<task crates/delta/src/lib.rs Set 'legacyMode' to false.>` | output `001-clean: warning openspec/changes/001-clean/tasks/1.md: Banned word "LEGACY" in "legacyMode": bannedWords[1] bans it in crates/**, src/**; name it another way\n001-clean: valid\n` |
| `<ban>`, `openspec/changes/001-clean/proposal.md` `## Goal\n\nSum a list.\n\n## Assumptions\n\n`, `<task crates/delta/src/lib.rs Set 'legacyMode' to false.>` | message `001-clean: 2 findings\n001-clean: error openspec/changes/001-clean/proposal.md (Assumptions): proposal.md's ## Assumptions section is empty: write None or one line per assumption\n<w> "legacyMode": <in>` |

#### Scenario: Fenced code and scenario quotes
- **WHEN** `lint` runs with the query `1` on a new scratch copy of the lint fixture project whose `osq.toml` holds `[[bannedWords]]\nword = "legacy"\npaths = ["crates/**"]\n`, whose `openspec/changes/001-clean/tasks/1.md` holds `---\ntitle: When x, y\nverify: cargo test\nscope:\n  - crates/**\n---\n## Acceptance\n\n- [ ] Add the mode.\n\n```rust\nlet mode = "legacy";\n```\n`, and whose `openspec/changes/001-clean/specs/delta/spec.md` holds `## ADDED Requirements\n\n### Requirement: Sums lists\nThe system SHALL sum a list.\n\n#### Scenario: Sum of three\n- **WHEN** one, two and three are summed\n- **THEN** the sum is six and it prints "legacy mode"\n`
- **THEN** it returns the output `001-clean: warning openspec/changes/001-clean/tasks/1.md: Banned word "legacy" in "let mode = \"legacy\";": bannedWords[0] bans it in crates/**; name it another way\n001-clean: warning openspec/changes/001-clean/specs/delta/spec.md: Banned word "legacy" in "legacy mode": bannedWords[0] bans it in crates/**; name it another way\n001-clean: valid\n`, `\"` standing for one `"`
