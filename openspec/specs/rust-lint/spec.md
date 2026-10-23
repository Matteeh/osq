# rust-lint Specification

## Purpose
The lint feature checks a change folder with the specs kernel's validation and the linter kernel's gates and prints the findings, as TypeScript's `osq lint` does. It holds the feature's logic and its command, as ADR 022 says.

## Requirements

### Requirement: Code ownership
<!-- source: crates/features/lint/** -->
The rust-lint capability SHALL own the `osq-feature-lint` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Lint crate ownership
- **WHEN** file ownership is resolved for the lint feature
- **THEN** system maps `crates/features/lint/**` to rust-lint

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

### Requirement: Lint arguments
`LintFeature::run` SHALL return `FeatureError::unknown_command` with the
invocation's command for any command but `lint`, and
`FeatureError::usage("lint", "expected one change id, got <n>")` for a
`lint` invocation with `n` arguments when `n` is not 1, before it reads
any file. Every other failure of `lint` SHALL be `FeatureError::failed`
with the command `lint` and the message the other lint requirements name.

#### Scenario: Lint argument errors
- **WHEN** a test runs the invocation in the row with a root that holds no `openspec/` folder
- **THEN** it gives the row's error:

| Invocation | Error |
|---|---|
| `lint` with no args | `Usage` error displayed `usage of lint: expected one change id, got 0` |
| `lint` with args `1`, `2` | `Usage` error displayed `usage of lint: expected one change id, got 2` |
| `approve` with args `1` | `UnknownCommand` error displayed `unknown command: approve` |

### Requirement: Lint lookup
`lint` SHALL find its change among the active entries rust-storage's
`list_changes` gives for the root, in that order, as TypeScript's
`findSpecFolder` matches a folder name: the query is trimmed, and a folder
matches when its name equals the trimmed query or starts with it followed
by `-`, or does so for the query's leading digits, when it has any, written
as a number with at least three digits. The first match is the change.
With no match, `lint` fails with `Spec "<query>" not found in <changes>`,
`<changes>` being the root joined with `openspec/changes` and written by
`Path::display`, and reads no spec.

#### Scenario: Lint finds no change
- **WHEN** `lint` runs with the row's query on the lint fixture project, `crates/features/lint/tests/fixtures/lint-project/`
- **THEN** it gives a `Failed` error for the command `lint` with the message `Spec "<query>" not found in <changes>`, where `<query>` is the row's query as given:

| Query |
|---|
| `9` |
| `0` |
| `clean` |
| `x1` |

### Requirement: Lint findings
After the lookup, `lint` SHALL load the config with rust-config
`load_config(root)`, then check the change it found, at
`<root>/openspec/changes/<folder>`, in this order:

1. the proposal rules "Lint proposal rules" names;
2. the task rules "Lint task rules" names, with the entry rule "Lint entry
   paths" names in the place that requirement gives it;
3. the banned word rule "Lint banned words" names;
4. rust-specs `validate_change` with the change folder and the root joined
   with `openspec/specs`, and, only when that gives no finding,
   `validate_merged_change` with the same folders;
5. rust-linter `change_link_gates` with the root, `decisions`,
   `openspec`, the group `rust` and the change `openspec/changes/<folder>`.

A finding is an error or a warning. Spec findings, merge refusals and link
gate findings are errors. Each finding is written as one line, in the
order the checks give them: `<folder>: <file>:<line>: <message>` for a
`SpecFinding`, `<folder>: <file>: <refusal>` for a
`MergeChangeError::Merge`, the `MergeError`'s display being the refusal,
`<folder>: ` followed by the `Finding`'s display for a link gate finding,
and, as TypeScript's `formatFinding` writes one, `<folder>: <severity>
<file>: <message>` for a proposal, task, entry or banned word finding,
with ` (<section>)` before the colon when the finding names a section,
the severity being `error` or `warning`. A file the specs kernel names
under the root is written relative to the root.

With no error, `lint` SHALL return the output made of each warning's line
followed by a newline, in order, then `<folder>: valid` and a newline.
With an error, it SHALL fail with a message whose first line is
`<folder>: 1 finding`, or `<folder>: <n> findings` for any other count,
`<n>` counting every finding, errors and warnings, followed by a newline
and each finding's line, joined by newlines. `lint` writes no file.

#### Scenario: Lint fixture changes
- **WHEN** `lint` runs with the row's query on the lint fixture project, `crates/features/lint/tests/fixtures/lint-project/`, a copy of `openspec/changes/275-rust-lint-command/fixture/lint-project/` in which each change's `proposal.md` declares `verify: cargo test -p delta` and a `## Surface` section and each change holds a `tasks/1.md`, as `openspec/changes/306-rust-lint-task-rules/fixture/lint-project/` gives them
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

### Requirement: Lint proposal rules
`lint` SHALL check the change's `proposal.md` with TypeScript's proposal
rules, as `lintChangeFolder` in `src/core/spec/linter.ts` runs them, and
every proposal finding names the file
`openspec/changes/<folder>/proposal.md`. When `proposal.md` does not
exist, the only proposal finding is an error with the message
`proposal.md (or legacy spec.md) not found in change folder`. When it
cannot be read as UTF-8, these rules give no finding. When rust-specs
`parse_frontmatter` refuses it, the only proposal finding is an error with
the message `proposal.md frontmatter is not valid YAML at line <line>:
<message>`, `<line>` and `<message>` being the `SyntaxError`'s. Otherwise
they read its frontmatter and body, in this order.

A section of the body is present when a line is `##`, whitespace, the
section's name and optional whitespace, as TypeScript's
`readSurfaceSection` matches it; its text runs from there to the next line
break followed by `##`, a character that is not `#` and whitespace, or to
the end. A section is blank when its text holds only whitespace once every
`<!--` through the next `-->` is removed.

1. Verify: when the frontmatter's `verify`, as rust-specs
   `parse_proposal` reads it, is empty, an error with the message
   `proposal.md must declare a verify command in frontmatter`.
2. Surface: when the `Surface` section is missing or blank, an error with
   the section `Surface` and the message `proposal.md needs a ## Surface
   section: list the commands, flags, config keys, frontmatter fields,
   document sections, dead reasons, and event types this change adds,
   changes, or removes, or write None`.
3. Assumptions: when the `Assumptions` section is present and blank, an
   error with the section `Assumptions` and the message `proposal.md's ##
   Assumptions section is empty: write None or one line per assumption`.
   A missing section gives no finding.
4. Decisions, only when rust-specs `read_decisions(root, "decisions",
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
5. Change verify: when `verify` is not empty, the command's analysis that
   "Lint verify commands" gives, with the label `proposal.md`: a
   placeholder gives its placeholder error; otherwise, unless the command
   chains, a missing script gives its missing script error, and an
   unresolved command gives its unresolved warning.

#### Scenario: Proposal rule findings
- **WHEN** `lint` runs with the query `1` on a new scratch copy of the lint fixture project with the row's files written over it. `<prop>` is `openspec/changes/001-clean/proposal.md` and `<goal>` is `---\nverify: cargo test -p delta\n---\n## Goal\n\nSum a list.\n\n## Surface\n\nNone\n\n`. `<d009>` is `decisions/009-delta.md` holding `---\nstatus: accepted\napplies_to: [delta]\nrule: Delta only.\n---\n# 009. Delta\n`. `<keep>` is `decisions/001-keep.md` holding `---\nstatus: accepted\napplies_to: all\nrule: Keep it.\n---\n# 001. Keep\n`, and `<rules>` is `<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it. ADR 001\n<!-- OSQ:RULES:END -->\n`. `<p>` is `001-clean: error openspec/changes/001-clean/proposal.md`
- **THEN** it returns the row's output, or gives a `Failed` error for the command `lint` with the row's message, written with `\n` escapes:

| Files | Result |
|---|---|
| `<prop>` `<goal>## Assumptions\n\nNone\n` | output `001-clean: valid\n` |
| `<prop>` `<goal>## Assumptions\n\n<!-- one line each -->\n\n## Delta\n\nx\n` | message `001-clean: 1 finding\n<p> (Assumptions): proposal.md's ## Assumptions section is empty: write None or one line per assumption` |
| `<prop>` `---\ntitle: [\n---\n## Goal\n\nSum a list.\n\n## Assumptions\n\n` | message `001-clean: 1 finding\n<p>: proposal.md frontmatter is not valid YAML at line 3: while parsing a node, did not find expected node content at byte 8 line 2 column 1` |
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

#### Scenario: Proposal verify and Surface findings
- **WHEN** `lint` runs with the query `1` on a new scratch copy of the lint fixture project with the row's files written over it. `<prop v>` is `openspec/changes/001-clean/proposal.md` holding `---\nverify: v\n---\n## Goal\n\nSum a list.\n\n## Surface\n\nNone\n` with the row's `v`. `<pkg>` is `package.json` holding `{"scripts":{"test":"node t.js"}}`. `<p>` is `001-clean: error openspec/changes/001-clean/proposal.md`. `<ph>` is `node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree`
- **THEN** it returns the row's output, or gives a `Failed` error for the command `lint` with the row's message, written with `\n` escapes:

| Files | Result |
|---|---|
| `openspec/changes/001-clean/proposal.md` `## Goal\n\nSum a list.\n` | message `001-clean: 2 findings\n<p>: proposal.md must declare a verify command in frontmatter\n<p> (Surface): proposal.md needs a ## Surface section: list the commands, flags, config keys, frontmatter fields, document sections, dead reasons, and event types this change adds, changes, or removes, or write None` |
| `openspec/changes/001-clean/proposal.md` `---\nverify: cargo test -p delta\n---\n## Goal\n\n## Surface\n\n<!-- later -->\n` | message `001-clean: 1 finding\n<p> (Surface): proposal.md needs a ## Surface section: list the commands, flags, config keys, frontmatter fields, document sections, dead reasons, and event types this change adds, changes, or removes, or write None` |
| `<prop node -e "process.exit(0)">` written with single quotes around the expression | message `001-clean: 1 finding\n<p>: proposal.md verify is the template placeholder <ph>` |
| `<prop node --eval 'process.exit(0);'>` | message `001-clean: 1 finding\n<p>: proposal.md verify is the template placeholder <ph>` |
| `<pkg>`, `<prop pnpm run lint>` | message `001-clean: 1 finding\n<p>: proposal.md verify references package script "lint" that is not defined in the root package.json` |
| `<pkg>`, `<prop pnpm test>` | output `001-clean: valid\n` |
| `<prop make check>` | output `001-clean: warning openspec/changes/001-clean/proposal.md: proposal.md verify names neither an existing repository path nor a package script: "make check"\n001-clean: valid\n` |
| `<prop sh crates/delta/src/lib.rs>` | output `001-clean: valid\n` |
| `<prop make check && make test>` | output `001-clean: valid\n` |

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
- **WHEN** `lint` runs with the query `1` on a new scratch copy of the lint fixture project with the row's files written over it. `<ban>` is `osq.toml` holding `[[bannedWords]]\nword = "legacy"\npaths = ["crates/**"]\n`. `<task s b>` is `openspec/changes/001-clean/tasks/1.md` holding `---\ntitle: When x, y\nverify: cargo test\nscope:\n  - s\n---\n## Acceptance\n\n- [ ] b\n` with the row's `s` and `b`, a `'` in `b` standing for a backtick. `<w>` is `001-clean: warning openspec/changes/001-clean/tasks/1.md: Banned word "legacy" in`, `<in>` is `bannedWords[0] bans it in crates/**; name it another way`, and `<e>` is `001-clean: error openspec/changes/001-clean/proposal.md`
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
| `<ban>`, `openspec/changes/001-clean/proposal.md` `## Goal\n\nSum a list.\n\n## Assumptions\n\n`, `<task crates/delta/src/lib.rs Set 'legacyMode' to false.>` | message `001-clean: 4 findings\n<e>: proposal.md must declare a verify command in frontmatter\n<e> (Surface): proposal.md needs a ## Surface section: list the commands, flags, config keys, frontmatter fields, document sections, dead reasons, and event types this change adds, changes, or removes, or write None\n<e> (Assumptions): proposal.md's ## Assumptions section is empty: write None or one line per assumption\n<w> "legacyMode": <in>` |

#### Scenario: Fenced code and scenario quotes
- **WHEN** `lint` runs with the query `1` on a new scratch copy of the lint fixture project whose `osq.toml` holds `[[bannedWords]]\nword = "legacy"\npaths = ["crates/**"]\n`, whose `openspec/changes/001-clean/tasks/1.md` holds `---\ntitle: When x, y\nverify: cargo test\nscope:\n  - crates/**\n---\n## Acceptance\n\n- [ ] Add the mode.\n\n```rust\nlet mode = "legacy";\n```\n`, and whose `openspec/changes/001-clean/specs/delta/spec.md` holds `## ADDED Requirements\n\n### Requirement: Sums lists\nThe system SHALL sum a list.\n\n#### Scenario: Sum of three\n- **WHEN** one, two and three are summed\n- **THEN** the sum is six and it prints "legacy mode"\n`
- **THEN** it returns the output `001-clean: warning openspec/changes/001-clean/tasks/1.md: Banned word "legacy" in "let mode = \"legacy\";": bannedWords[0] bans it in crates/**; name it another way\n001-clean: warning openspec/changes/001-clean/specs/delta/spec.md: Banned word "legacy" in "legacy mode": bannedWords[0] bans it in crates/**; name it another way\n001-clean: valid\n`, `\"` standing for one `"`

### Requirement: Lint verify commands
`lint` SHALL analyse a verify command as TypeScript's
`analyzeVerifyCommand`, `tokenizeVerifyCommand`, `listNamedPaths` and
`missingNamedPaths` do, without running it. The command's tokens split it
at whitespace outside quotes; a `'` or `"` opens a quote that the same
character closes, the quote characters are dropped, and a quote makes a
token even when empty.

1. A placeholder is exactly the tokens `node`, `-e` or `--eval`, and an
   expression equal to `process.exit(0)` once trimmed, its trailing `;`
   characters dropped and its whitespace removed.
2. Otherwise, when the first token is `pnpm`, `npm`, `yarn` or `bun`, the
   second is not missing and does not start with `-`, the script is the
   third token when the second is `run` or `run-script` and the third is
   neither missing nor starts with `-`, no script when it is, no script
   when the second is one of the package manager subcommands
   TypeScript's `PACKAGE_MANAGER_SUBCOMMANDS` lists, and the second token
   otherwise. A script the root `package.json`'s `scripts` object does not
   name is missing; a `package.json` that is missing or does not parse
   names none.
3. Otherwise, the command starts with a verify runner when the project's
   languages include Rust and its first token is `cargo` and its second
   one of `test`, `nextest`, `build`, `check`, `clippy`, `fmt` and `run`.
   The project's paths are the paths of the files rust-vcs `line_endings`
   lists, when rust-vcs `root()` gives the project root itself, then each
   of `package.json`, `Cargo.toml`, `pyproject.toml` and `go.mod` that is a
   file at the root. The languages include Rust when a path's last part is
   `Cargo.toml`.
4. Otherwise, the command is unresolved unless a token names an existing
   file or folder under the root: a token that is not empty, does not
   start with `-` or `/`, holds no `=` and no `<scheme>://` prefix, and,
   for the first token, holds a `/` or `\`.

A command chains when it holds `&&`, `;` or `|`. Its named paths are the
tokens that pass the rule of item 4 and hold a `/` or `\`, in order. A
named path is missing when, holding `*` or `?`, rust-loop `scope_files`
gives no existing file for it, and otherwise when nothing exists at it
under the root; each missing path is listed once, in first-seen order.

The placeholder error is `<label> verify is the template placeholder node
-e "process.exit(0)"; replace it with a real command that verifies the
completed change's final tree`. The missing script error is `<label>
verify references package script "<script>" that is not defined in the
root package.json`. The unresolved warning is `<label> verify names
neither an existing repository path nor a package script: "<command>"`.

#### Scenario: Verify command analysis
- **WHEN** `lint` runs with the query `1` on a new scratch copy of the lint fixture project, whose root holds `Cargo.toml` and is not a git repository's top folder, with `package.json` holding `{"scripts":{"test":"node t.js"}}` and `openspec/changes/001-clean/tasks/1.md` holding `---\ntitle: T\nverify: c\nscope:\n  - crates/delta/src/lib.rs\n---\n- [ ] a\n` with the row's command `c` written over it. `<t>` is `001-clean: error openspec/changes/001-clean/tasks/1.md: Task in 1.md`, `<w>` is `001-clean: warning openspec/changes/001-clean/tasks/1.md: Task in 1.md`, `<un>` is `<w> verify names neither an existing repository path nor a package script:` and `<nc>` is `<w> verify names`
- **THEN** it returns the row's output, or gives a `Failed` error for the command `lint` with the row's message, written with `\n` escapes:

| Command | Result |
|---|---|
| `node --eval 'process.exit( 0 );;'` | message `001-clean: 1 finding\n<t> verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree` |
| `npm test` | output `001-clean: valid\n` |
| `pnpm install` | output `<un> "pnpm install"\n001-clean: valid\n` |
| `pnpm --filter x test` | output `<un> "pnpm --filter x test"\n001-clean: valid\n` |
| `cargo publish` | output `<un> "cargo publish"\n001-clean: valid\n` |
| `sh crates/delta/src/lib.rs` | output `001-clean: valid\n` |
| `sh "crates/delta/src/new file.rs" KEY=a/b https://x.io/y -o/z` | output `<un> "sh "crates/delta/src/new file.rs" KEY=a/b https://x.io/y -o/z"\n<nc> crates/delta/src/new file.rs, which no task in the change can create\n001-clean: valid\n` |
| `scripts/run.sh crates/delta/**/*.rs crates/none/*.rs` | output `<un> "scripts/run.sh crates/delta/**/*.rs crates/none/*.rs"\n<nc> scripts/run.sh, which no task in the change can create\n<nc> crates/none/*.rs, which no task in the change can create\n001-clean: valid\n` |

### Requirement: Lint task rules
`lint` SHALL check the change's task files with TypeScript's task rules,
as `lintChangeFolder` runs them, after the proposal rules. When the
change has no `tasks` folder, an error with the file
`openspec/changes/<folder>/tasks` and the message `tasks directory not
found in change folder`; when it holds no file whose name ends in `.md`,
an error with that file and the message `No task files found under
tasks/`.

Each task file, in byte order of its name, gives these findings, each
an error with the task file's path from the root and no section, in this
order:

1. When rust-specs `parse_frontmatter` refuses it: `Task in <name>
   frontmatter is not valid YAML at line <line>: <message>`, the
   `SyntaxError`'s line and message.
2. For each line, split at `\n`, holding two or more matches of `-` or
   `*`, optional whitespace, `[`, a space, `x` or `X`, and `]`: `Task in
   <name> contains fused acceptance lines on line <n>`, `<n>` counted
   from 1.
3. A task whose frontmatter does not parse gives no other finding and
   takes no part in the rules after this list.
4. When `tests.modify`, under `tests` or as the flat key, is present and
   not a boolean: `Task in <name> tests.modify must be a boolean (got
   <value>)`, the value written as JSON with no spaces.
5. The task's existing paths are those rust-loop `scope_files` gives for
   its `scope` that are regular files under the root. When `tests.modify`
   is not true and existing paths are gated test paths: `Task in <name>
   scope touches existing test files (<paths>) without tests.modify:
   true`, the gated paths sorted and joined by `, `. A path is gated when
   it is `tests` or under `tests/`, or is or is under a test folder:
   `tests` and `benches` inside the folder of each project path whose
   last part is `Cargo.toml`, the project paths being those "Lint verify
   commands" names.
6. When `verify` is empty: `Task in <name> verify command is empty`.
   Otherwise, for a placeholder, the placeholder error with the label
   `Task in <name>`; for a command that chains, `Task in <name> verify
   chains commands ("<command>"); <advice>`, the advice being `move the
   chain into a package script and name that script, for example pnpm run
   <script>` when the root holds `package.json` and `move the chain into
   a script file in the repository and name that file, for example
   scripts/verify.sh` otherwise; for a missing script, the missing script
   error with the label `Task in <name>`.
7. When the task's acceptance lines number more than
   `limits.maxAcceptanceLines`: `Task in <name> acceptance lines (<n>)
   exceeds limit <limit>`.
8. When its `scope` lists more than `limits.maxScopeFiles` entries: `Task
   in <name> scope specifies <n> patterns, exceeding limit <limit>`.
9. For each `scope` entry, then each `entry` entry, trimmed, that holds
   `{`, then characters with at least one `,` and no brace, then `}`:
   `Task in <name> <label> "<entry>" holds a brace group, which osq scope
   globs do not expand; they support only *, **, ? and a trailing /. Use a
   folder glob such as dir/** or one entry per file`, `<label>` being
   `scope entry` or `entry`.

Then come the findings of "Lint entry paths", then these warnings, with
the tasks whose frontmatter parses ordered by their leading digits as
"Lint banned words" orders task files, and no section:

1. For each task whose existing paths hold one under `src/harness/` and
   none that is or is under `tests/fixtures/events`, on the task file:
   `Task in <name> resolves src/harness/ scope but no file under
   tests/fixtures/events/`.
2. For each pair of tasks, in order, and each existing path both hold, in
   byte order, on that path: `Tasks <a> and <b> share resolved scope file
   <path>`, `<a>` and `<b>` being the tasks' numbers, their names without
   `.md`.
3. For each task, in order, whose verify is unresolved and does not chain,
   on the task file, the unresolved warning with the label `Task in
   <name>`, unless it names paths and each missing one is covered by the
   task's scope or an earlier task's. A scope covers a named path holding
   `*` or `?` when one of its entries equals it once each is trimmed, `\`
   is turned into `/` and leading `./` is dropped, and any other named
   path when core `scope_covers_path` holds.
4. For each task, in order, and each missing named path of its verify that
   no earlier task's scope covers, on the task file: when the task's own
   scope covers it and its `verify_starts` is `green` or `any`, `Task in
   <name> declares verify_starts: <start> but its verify names <path>,
   which the task creates`; when its own scope does not cover it, `Task
   in <name> verify names <path>, which no task in the change can
   create`.

#### Scenario: Task rule findings
- **WHEN** `lint` runs with the query `1` on a new scratch copy of the lint fixture project with the row's files written over it. `<task f>` is `openspec/changes/001-clean/tasks/1.md` holding `---\ntitle: When x, y\n` then the row's frontmatter lines `f`, then `---\n## Acceptance\n\n- [ ] Sum.\n`, a `/` in `f` standing for a line break. `<v>` is `verify: cargo test -p delta` and `<s x>` is `scope:/  - x`. `<t>` is `001-clean: error openspec/changes/001-clean/tasks/1.md` and `<w>` is `001-clean: warning openspec/changes/001-clean/tasks/1.md`
- **THEN** it returns the row's output, or gives a `Failed` error for the command `lint` with the row's message, written with `\n` escapes:

| Files | Result |
|---|---|
| `openspec/changes/001-clean/tasks/1.md` `---\ntitle: T\nverify: [\n---\n- [ ] a - [ ] b\n` | message `001-clean: 2 findings\n<t>: Task in 1.md frontmatter is not valid YAML at line 4: while parsing a node, did not find expected node content at byte 18 line 3 column 1\n<t>: Task in 1.md contains fused acceptance lines on line 5` |
| `<task <v>/<s crates/delta/src/lib.rs>/tests:/  modify: "yes">` | message `001-clean: 1 finding\n<t>: Task in 1.md tests.modify must be a boolean (got "yes")` |
| `<task <v>/<s crates/delta/src/lib.rs>/tests.modify: 1>` | message `001-clean: 1 finding\n<t>: Task in 1.md tests.modify must be a boolean (got 1)` |
| `tests/old.rs` `fn old() {}\n`, `benches/b.rs` `fn b() {}\n`, `<task <v>/<s tests/**>/  - benches/b.rs>` | message `001-clean: 1 finding\n<t>: Task in 1.md scope touches existing test files (benches/b.rs, tests/old.rs) without tests.modify: true` |
| `tests/old.rs` `fn old() {}\n`, `<task <v>/<s tests/**>/tests:/  modify: true>` | output `001-clean: valid\n` |
| `<task <s crates/delta/src/lib.rs>>` | message `001-clean: 1 finding\n<t>: Task in 1.md verify command is empty` |
| `<task verify: node -e 'process.exit(0)'/<s crates/delta/src/lib.rs>>` | message `001-clean: 1 finding\n<t>: Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree` |
| `<task verify: cargo test && cargo clippy/<s crates/delta/src/lib.rs>>` | message `001-clean: 1 finding\n<t>: Task in 1.md verify chains commands ("cargo test && cargo clippy"); move the chain into a script file in the repository and name that file, for example scripts/verify.sh` |
| `package.json` `{"scripts":{"test":"node t.js"}}`, `<task verify: cargo test; cargo clippy/<s crates/delta/src/lib.rs>>` | message `001-clean: 1 finding\n<t>: Task in 1.md verify chains commands ("cargo test; cargo clippy"); move the chain into a package script and name that script, for example pnpm run <script>` |
| `package.json` `{"scripts":{"test":"node t.js"}}`, `<task verify: pnpm run lint/<s crates/delta/src/lib.rs>>` | message `001-clean: 1 finding\n<t>: Task in 1.md verify references package script "lint" that is not defined in the root package.json` |
| `osq.toml` `[limits]\nmaxAcceptanceLines = 1\nmaxScopeFiles = 1\n`, `openspec/changes/001-clean/tasks/1.md` `---\ntitle: T\nverify: cargo test -p delta\nscope:\n  - crates/delta/src/lib.rs\n  - crates/delta/Cargo.toml\n---\n- [ ] a\n- [ ] b\n` | message `001-clean: 2 findings\n<t>: Task in 1.md acceptance lines (2) exceeds limit 1\n<t>: Task in 1.md scope specifies 2 patterns, exceeding limit 1` |
| `<task <v>/<s crates/delta/src/{a,b}.rs>/  - crates/**/entry:/  - crates/{x,y}/lib.rs>` | message `001-clean: 2 findings\n<t>: Task in 1.md scope entry "crates/delta/src/{a,b}.rs" holds a brace group, which osq scope globs do not expand; they support only *, **, ? and a trailing /. Use a folder glob such as dir/** or one entry per file\n<t>: Task in 1.md entry "crates/{x,y}/lib.rs" holds a brace group, which osq scope globs do not expand; they support only *, **, ? and a trailing /. Use a folder glob such as dir/** or one entry per file` |
| `src/harness/x.ts` `x\n`, `<task <v>/<s src/harness/x.ts>>` | output `<w>: Task in 1.md resolves src/harness/ scope but no file under tests/fixtures/events/\n001-clean: valid\n` |
| `openspec/changes/001-clean/tasks/2.md` `---\ntitle: T\nverify: cargo test -p delta\nscope:\n  - crates/delta/**\n---\n- [ ] a\n` | output `001-clean: warning crates/delta/src/lib.rs: Tasks 1 and 2 share resolved scope file crates/delta/src/lib.rs\n001-clean: valid\n` |
| `<task verify: make check/<s crates/delta/src/lib.rs>>` | output `<w>: Task in 1.md verify names neither an existing repository path nor a package script: "make check"\n001-clean: valid\n` |
| `<task verify: sh scripts/new.sh/<s scripts/new.sh>>` | output `001-clean: valid\n` |
| `<task verify: sh scripts/new.sh/verify_starts: green/<s scripts/new.sh>>` | output `<w>: Task in 1.md declares verify_starts: green but its verify names scripts/new.sh, which the task creates\n001-clean: valid\n` |
| `<task verify: sh scripts/new.sh/<s crates/delta/src/lib.rs>>` | output `<w>: Task in 1.md verify names neither an existing repository path nor a package script: "sh scripts/new.sh"\n<w>: Task in 1.md verify names scripts/new.sh, which no task in the change can create\n001-clean: valid\n` |
| `<task <v>/<s scripts/new.sh>>`, `openspec/changes/001-clean/tasks/2.md` `---\ntitle: T\nverify: sh scripts/new.sh\nscope:\n  - crates/delta/src/lib.rs\n---\n- [ ] a\n` | output `001-clean: valid\n` |

#### Scenario: Change with no task files
- **WHEN** `lint` runs with the query `6` on a new scratch copy of the lint fixture project to which `openspec/changes/006-no-tasks/` is added holding the row's files, `<prop>` being the fixture's `openspec/changes/001-clean/proposal.md` and `<delta>` the fixture's `openspec/changes/001-clean/specs/delta/spec.md`
- **THEN** it gives a `Failed` error for the command `lint` with the row's message, written with `\n` escapes:

| Files | Message |
|---|---|
| `proposal.md` `<prop>`, `specs/delta/spec.md` `<delta>` | `006-no-tasks: 2 findings\n006-no-tasks: error openspec/changes/006-no-tasks/tasks: tasks directory not found in change folder\n006-no-tasks: error openspec/changes/006-no-tasks/tasks: No task files found under tasks/` |
| `proposal.md` `<prop>`, `specs/delta/spec.md` `<delta>`, `tasks/notes.txt` `x\n` | `006-no-tasks: 1 finding\n006-no-tasks: error openspec/changes/006-no-tasks/tasks: No task files found under tasks/` |

### Requirement: Lint entry paths
`lint` SHALL report each task `entry` the change cannot provide, as
TypeScript's `missingEntryFindings` does, right after the per-task
findings of "Lint task rules". Tasks are read in the order of that
requirement's warnings, skipping a task whose frontmatter does not parse.
Git is on when `vcs.enabled` is true and rust-vcs `root()` gives the
project root itself; the tree is then the default branch, rust-vcs
`default_branch` with `vcs.defaultBranch` or `main` as the fallback, and
otherwise the project.

An entry is provided, checked in this order, when:

1. it names a path inside the change folder, either starting with
   `openspec/changes/<folder>/` or resolving from the root into the
   folder, and the rest exists there: a pattern, holding `*` or `?` or
   ending in `/`, when rust-loop `scope_files` gives an existing file for
   it inside the folder, and otherwise a file or folder at it;
2. core `scope_covers_path` holds for the task's scope or an earlier
   task's;
3. it is in the tree: a pattern when rust-loop `scope_files` gives an
   existing file for it under the root, and otherwise, with git on, when
   rust-vcs `path_exists` holds for it on the default branch, and with
   git off, when a file or folder exists at it under the root;
4. another change of the project covers it with one task's scope, the
   change being approved or archived as TypeScript's
   `readDependencyState` reads it: with git on, not landed, its
   `osq/<folder>` branch holding `.run/approved` in its active or archive
   folder, or, with no such branch, its checkout or stacked folder holding
   `.run/approved`; with git off, its active or archive folder in the
   checkout holding `.run/approved`.

Each entry not provided gives an error on the task file, with no section,
and the message `Task <n> entry names <entry>, which is not in <tree> and
no task up to this one creates`, `<tree>` being the default branch's name
with git on and `the project` otherwise.

#### Scenario: Entry path findings
- **WHEN** `lint` runs with the query `1` on a new scratch copy of the lint fixture project with the row's files written over it. `<task e>` is `openspec/changes/001-clean/tasks/1.md` holding `---\ntitle: T\nverify: cargo test -p delta\nscope:\n  - crates/delta/src/lib.rs\nentry:\n  - e\n---\n- [ ] a\n` with the row's `e`. `<other>` is `openspec/changes/007-other/tasks/1.md` holding `---\ntitle: T\nverify: cargo test -p delta\nscope:\n  - crates/delta/src/made.rs\n---\n- [ ] a\n`. `<t>` is `001-clean: error openspec/changes/001-clean/tasks/1.md: Task 1 entry names`
- **THEN** it returns the row's output, or gives a `Failed` error for the command `lint` with the row's message, written with `\n` escapes:

| Files | Result |
|---|---|
| `<task crates/delta/src/lib.rs>` | output `001-clean: valid\n` |
| `<task crates/delta/src/gone.rs>` | message `001-clean: 1 finding\n<t> crates/delta/src/gone.rs, which is not in the project and no task up to this one creates` |
| `<task crates/delta/src>` | output `001-clean: valid\n` |
| `<task crates/**/*.rs>` | output `001-clean: valid\n` |
| `<task crates/**/*.py>` | message `001-clean: 1 finding\n<t> crates/**/*.py, which is not in the project and no task up to this one creates` |
| `<task openspec/changes/001-clean/specs/delta/spec.md>` | output `001-clean: valid\n` |
| `<task openspec/changes/001-clean/notes.md>` | message `001-clean: 1 finding\n<t> openspec/changes/001-clean/notes.md, which is not in the project and no task up to this one creates` |
| `<other>`, `openspec/changes/007-other/.run/approved` `x\n`, `<task crates/delta/src/made.rs>` | output `001-clean: valid\n` |
| `<other>`, `<task crates/delta/src/made.rs>` | message `001-clean: 1 finding\n<t> crates/delta/src/made.rs, which is not in the project and no task up to this one creates` |
| `openspec/changes/001-clean/tasks/1.md` `---\ntitle: T\nverify: cargo test -p delta\nscope:\n  - crates/delta/src/made.rs\n---\n- [ ] a\n`, `openspec/changes/001-clean/tasks/2.md` `---\ntitle: T\nverify: cargo test -p delta\nscope:\n  - crates/delta/Cargo.toml\nentry:\n  - crates/delta/src/made.rs\n---\n- [ ] a\n` | output `001-clean: valid\n` |

#### Scenario: Entry paths with git on
- **WHEN** `lint` runs with the query `1` in a new scratch git repository holding a copy of the lint fixture project with every file committed on `main`, an `osq.toml` holding `[vcs]\nenabled = true\nauthor = "osq <osq@example.com>"\n` committed with it, then the row's files written over the working tree and left uncommitted. `<task e>` is `openspec/changes/001-clean/tasks/1.md` holding `---\ntitle: T\nverify: cargo test -p delta\nscope:\n  - crates/delta/src/lib.rs\nentry:\n  - e\n---\n- [ ] a\n`
- **THEN** it returns the row's output, or gives a `Failed` error for the command `lint` with the row's message, written with `\n` escapes:

| Files | Result |
|---|---|
| `<task crates/delta/Cargo.toml>` | output `001-clean: valid\n` |
| `crates/delta/src/local.rs` `x\n`, `<task crates/delta/src/local.rs>` | message `001-clean: 1 finding\n001-clean: error openspec/changes/001-clean/tasks/1.md: Task 1 entry names crates/delta/src/local.rs, which is not in main and no task up to this one creates` |
