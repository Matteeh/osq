# rust-specs Specification

## Purpose
The specs kernel of the Rust rewrite of osq: it reads the OpenSpec documents
osq uses, living specs, sidecars, delta specs, proposals, task files and
`tasks.md` checklists, into typed values with the rules TypeScript osq
parses them by. Validation and the delta merge build on these values (ADR
026). Nothing in it runs Node.

## Requirements

### Requirement: Code ownership
<!-- source: crates/kernel/specs/** -->
The rust-specs capability SHALL own the `osq-kernel-specs` crate: its
manifest, its source, its tests, their fixtures and goldens.

#### Scenario: Specs crate ownership
- **WHEN** file ownership is resolved for the Markdown parsers, the document parsers or the readers of the specs kernel
- **THEN** system maps `crates/kernel/specs/**` to rust-specs

### Requirement: JavaScript text rules
The specs kernel SHALL read text by the rules TypeScript osq's parsers get
from JavaScript. Whitespace is JavaScript's `\s`: every character
`char::is_whitespace` accepts except U+0085, plus U+FEFF. Trimming removes
that whitespace from both ends, as `String.prototype.trim` does. Before a
living spec or a delta spec is parsed, one leading U+FEFF is removed and
every `\r\n` and lone `\r` becomes `\n`. Proposals, task files and
`tasks.md` are not rewritten that way; their rules below say where a `\r`
counts.

#### Scenario: JavaScript trimming
- **WHEN** each text below is trimmed
- **THEN** the result is as given:

| Text | Trimmed |
|---|---|
| `  a b  ` | `a b` |
| `\u{feff}a\u{a0}` | `a` |
| `\u{85}a` | `\u{85}a` |
| `\t\r\na\n` | `a` |

### Requirement: Requirement names
`normalize_requirement_name(name)` SHALL remove a closing run of `#` that
follows one or more spaces or tabs at the end of the name, with any spaces
or tabs after it, then trim the name.

#### Scenario: Requirement name normalization
- **WHEN** each name below is normalized
- **THEN** the result is as given:

| Name | Normalized |
|---|---|
| `Code ownership` | `Code ownership` |
| `  Spaced name  ` | `Spaced name` |
| `Closed ##` | `Closed` |
| `Closed\t###  ` | `Closed` |
| `Hash#tag` | `Hash#tag` |
| `C# support ##` | `C# support` |
| `Trailing#` | `Trailing#` |

### Requirement: Requirement blocks
`parse_requirement(block)` SHALL read one requirement block, whose first line
is a requirement header: `###`, optional whitespace, `Requirement:` in any
case, optional whitespace, then the name, normalized as "Requirement names"
says. Every later line that starts with `####` and whitespace starts a
scenario, with no regard to code fences. The body is the lines between the
header and the first scenario, joined and trimmed. Each scenario runs to the
next scenario line or the end. `raw` is the whole block with its line
endings normalized as "JavaScript text rules" says and its trailing
whitespace removed.

#### Scenario: Requirement block parts
- **WHEN** each block below is parsed
- **THEN** its name, body and scenario names are as given:

| Block | Name | Body | Scenarios |
|---|---|---|---|
| `### Requirement: Alpha\nThe system SHALL a.\n\n#### Scenario: One\n- **WHEN** x\n- **THEN** y` | `Alpha` | `The system SHALL a.` | `One` |
| `###Requirement:Beta ##\nThe system SHALL b.` | `Beta` | `The system SHALL b.` | none |
| `### requirement: lower\r\nThe system SHALL c.\r\n#### Scenario: Two\r\n- **WHEN** p\r\n- **THEN** q\r\n` | `lower` | `The system SHALL c.` | `Two` |
| `### Requirement: Gamma\nThe system SHALL g.\n#### Notes\nfree text\n#### Scenario: Three\n- **WHEN** w\n- **THEN** t` | `Gamma` | `The system SHALL g.` | `Notes`, `Three` |
| `### Requirement: Empty` | `Empty` | empty | none |

#### Scenario: Requirement raw text
- **WHEN** the block `### requirement: lower\r\nThe system SHALL c.\r\n#### Scenario: Two\r\n- **WHEN** p\r\n- **THEN** q\r\n` is parsed
- **THEN** its `raw` is `### requirement: lower\nThe system SHALL c.\n#### Scenario: Two\n- **WHEN** p\n- **THEN** q`, and its scenario's `raw` is `#### Scenario: Two\n- **WHEN** p\n- **THEN** q`

### Requirement: Scenario blocks
`parse_scenario(block)` SHALL read one scenario block. Its name is the header
line without `####` and the whitespace after it, without a closing `#` run
as in "Requirement names", without a leading `Scenario:` in any case and the
whitespace after it, trimmed. A line `- ` or `-` and tabs or spaces, then
`**WHEN**`, adds its trimmed rest to `when`; the same with `**THEN**` adds to
`then` and to `outcomes`; the same with `**AND**` adds to `outcomes` only
when a THEN line came after the last WHEN line. The bullet markers are case
sensitive and only `-` starts one. An outcome's `rows` is the table directly
under its line, after any blank lines: a run of lines that, trimmed, start
and end with `|`. The first row names the columns, a following row whose
every cell is dashes with optional colons at either end is left out, and
each later row maps each column to its trimmed cell, or to empty text when
the row is short. `rows` is none when no table follows.

#### Scenario: Scenario bullets
- **WHEN** each block below is parsed
- **THEN** its name, `when` and `then` are as given:

| Block | Name | When | Then |
|---|---|---|---|
| `#### Scenario: Pass\n- **WHEN** a runs\n- **AND** before then\n- **THEN** b\n- **AND** c\n- **WHEN** d` | `Pass` | `a runs`, `d` | `b` |
| `####   Scenario:   Spaced  ##\n-  **WHEN**   lots   \n-\t**THEN**\tx` | `Spaced` | `lots` | `x` |
| `#### Free label\n* **WHEN** star\n- **THEN** dash` | `Free label` | none | `dash` |
| `#### scenario: lower\n- **WHEN** a\n- **then** b\n- **THEN** c` | `lower` | `a` | `c` |

#### Scenario: Scenario outcomes
- **WHEN** the block `#### Scenario: Pass\n- **WHEN** a runs\n- **AND** before then\n- **THEN** b\n- **AND** c\n- **WHEN** d` is parsed
- **THEN** its outcomes are `b` and `c`, each with no rows

#### Scenario: Outcome tables
- **WHEN** the block `#### Scenario: Table\n- **WHEN** a\n- **THEN** rows are:\n\n  | k | v |\n  |---|:-:|\n  | 1 | 2 |\n  | 3 |\n- **AND** none` is parsed
- **THEN** its outcomes are `rows are:` with the rows `{k: 1, v: 2}` and `{k: 3, v: empty}`, then `none` with no rows

#### Scenario: Table without an alignment row
- **WHEN** the block `#### Scenario: No sep\n- **THEN** rows:\n| a | b |\n| 1 | 2 |\ntext` is parsed
- **THEN** its one outcome is `rows:` with the one row `{a: 1, b: 2}`

### Requirement: Living specs
`parse_living_spec(text)` SHALL read a living spec after the line ending
rule of "JavaScript text rules". Lines inside a code fence never count as
headings: a fence opens on a line that, after leading whitespace, starts
with three or more backticks or tildes, and closes on a line that, trimmed,
is only the same character, at least as many times. The title is the
trimmed rest of the first line starting with `#` and a space or tab, or
empty. The purpose is the trimmed text between the first `## Purpose`
heading line, in any case with any whitespace, and the next line starting
with `##` and whitespace, or empty. The requirements are the requirement
blocks inside the first `## Requirements` heading's section, up to the next
line starting with `##` and whitespace. A block starts at a requirement
header and runs to the next requirement header or `##` heading outside a
fence; text before the first header is not a requirement. Each block reads
as "Requirement blocks" says. The spec's `code_ownership` is read as "Code
ownership sources" says.

#### Scenario: Living spec parts
- **WHEN** each text below is parsed as a living spec
- **THEN** its title, purpose and requirement names are as given:

| Text | Title | Purpose | Requirements |
|---|---|---|---|
| `# cap Specification\n\n## Purpose\nDoes things.\n\n## Requirements\n\n### Requirement: One\nThe system SHALL one.\n\n~~~md\n### Requirement: Fenced\n~~~\n\n### Requirement: Two\nThe system SHALL two.\n\n## Notes\n### Requirement: Outside\n` | `cap Specification` | `Does things.` | `One`, `Two` |
| `\u{feff}# T\r\n\r\n## purpose\r\n\r\n  Lower.  \r\n\r\n## Requirements\r\n### Requirement: R\r\nThe system SHALL r.\r\n` | `T` | `Lower.` | `R` |
| `# No purpose\n\n## Purpose\n\n## Requirements\n` | `No purpose` | empty | none |
| `no headings at all` | empty | empty | none |

#### Scenario: Fenced header stays in the body
- **WHEN** the first text of "Living spec parts" is parsed
- **THEN** requirement `One` has the body `The system SHALL one.\n\n~~~md\n### Requirement: Fenced\n~~~`

### Requirement: Code ownership sources
`code_ownership(text)` SHALL find the first line `### Requirement: Code
ownership`, with `\s+` after `###`, any whitespace around the name and any
case, and read the block after it up to the next line starting with `###`
or `##` followed by whitespace. When the block holds `<!-- source: ... -->`,
in any case, the result is that comment's text split at commas, each part
trimmed, empty parts left out. Otherwise it is every backtick-quoted token
in the block that, trimmed, holds `/`, `\` or `*`, once each, in order.
Without the header the result is empty.

#### Scenario: Code ownership source comment
- **WHEN** the text `### Requirement: Code ownership\n<!-- source: a/**, b.ts ,, -->\nThe x SHALL own them.` is read for code ownership
- **THEN** the globs are `a/**` and `b.ts`

#### Scenario: Code ownership quoted tokens
- **WHEN** the text ``### Requirement: Code ownership\nThe x SHALL own `src/a/**`, `name`, `src/a/**` and `c\d`.\n\n### Requirement: Next\n`not/this` `` is read for code ownership
- **THEN** the globs are `src/a/**` and `c\d`

#### Scenario: No code ownership header
- **WHEN** the text ``### Requirement: Other\n`src/x/**` `` is read for code ownership
- **THEN** there are no globs

### Requirement: Delta specs
`parse_delta(text)` SHALL read a delta spec after the line ending rule of
"JavaScript text rules", with the fence rule of "Living specs". Its title
is the first `#` line's trimmed text without a leading `Spec Delta`, optional
spaces or tabs, `:` and optional spaces or tabs, in any case. Its purpose is
read as a living spec's. Its sections are the `##` heading lines outside
fences, each running to the next; a section counts when its trimmed title,
lowercased, is `added requirements`, `modified requirements`, `removed
requirements` or `renamed requirements`, and sections with the same title
add up in document order. ADDED and MODIFIED hold requirement blocks, as in
"Living specs". REMOVED holds names: from each requirement header line, and
from each bullet `-`, `*` or `+` that holds an optionally backticked
requirement header. RENAMED pairs a `FROM:` line with the next `TO:` line,
each an optional bullet, the label, and an optionally backticked requirement
header. A `FROM:` while one is pending, or a pending one at the section's
end, is unpaired on the FROM side; a `TO:` with none pending is unpaired on
the TO side. Any other line starting with an optional bullet and `FROM:` or
`TO:`, in any case, is an invalid rename, kept trimmed.

#### Scenario: Delta spec operations
- **WHEN** the text ``# Spec Delta: cap\n\n## Purpose\nWhy.\n\n## ADDED Requirements\n### Requirement: New\nThe system SHALL new.\n\n## MODIFIED Requirements\n### Requirement: Changed\nThe system SHALL change.\n\n## REMOVED Requirements\n### Requirement: Gone\n- `### Requirement: Also gone`\n\n## RENAMED Requirements\n- FROM: `### Requirement: Old`\n- TO: `### Requirement: Fresh`\n- FROM: Old bare\n- TO: `### Requirement: Orphan`\n- FROM: `### Requirement: Dangling`\n\n## added requirements\n### Requirement: Second added\nThe system SHALL two.\n`` is parsed as a delta spec
- **THEN** its title is `cap`, its purpose `Why.`, it adds `New` and `Second added`, modifies `Changed`, removes `Gone` and `Also gone`, renames `Old` to `Fresh`, holds the invalid rename `- FROM: Old bare`, and holds the unpaired renames TO `Orphan` and FROM `Dangling`, in that order

#### Scenario: Delta titles
- **WHEN** each text below is parsed as a delta spec
- **THEN** its title is as given:

| Text | Title |
|---|---|
| `# Spec Delta: cap\n` | `cap` |
| `# spec delta :\tcap\n` | `cap` |
| `# cap\n` | `cap` |
| `## ADDED Requirements\n` | empty |

### Requirement: Markdown sections
`section(body, heading)` SHALL return the trimmed text of the first place in
the body, at any position, where `##`, whitespace, the heading in any case,
optional whitespace and a newline appear, up to the next newline followed by
`##` and whitespace, or the end of the body. Without a match it is empty.
This is TypeScript's case-insensitive pattern
`##\s+<heading>\s*\n([\s\S]*?)(?=(?:\n##\s+|$))`, where `$` is the end of
the text; hand-written, with no regex crate.

#### Scenario: Section text
- **WHEN** the section of each body below is read
- **THEN** it is as given:

| Body | Heading | Section |
|---|---|---|
| `## Goal\n\nShip it.\n\n## Verify\nx` | `Goal` | `Ship it.` |
| `## goal  \nLower case.` | `Goal` | `Lower case.` |
| `## Goal\n### Sub\ntext\n## Next` | `Goal` | `### Sub\ntext` |
| `Intro\n### Goal\nDeep.\n## Next` | `Goal` | `Deep.` |
| `## Goal\n## Verify\nx` | `Goal` | `## Verify\nx` |
| `## Goals\nNot it.\n` | `Goal` | empty |
| `## Non-goals\n- a\n- b\n` | `Non-goals` | `- a\n- b` |

### Requirement: Frontmatter
`parse_frontmatter(text)` SHALL split a document that starts with `---` and
a line break into its YAML frontmatter and its body: the frontmatter is the
text up to the first later line break followed by `---`, and the body is
what follows that `---` and one optional line break, where a line break is
`\n` or `\r\n`. A document that does not start that way has an empty
frontmatter and the whole text as its body. Empty YAML reads as an empty
mapping. YAML that does not parse is a syntax error naming the file line
the YAML error points at, where the opening `---` is line 1, so the YAML's
own line plus one; YAML that is not a mapping is a syntax error at line 2. This
departs from TypeScript, which reads such a document as having no
frontmatter, as ADR 026 asks for errors that name the file and line; no
archived document has one.

#### Scenario: Frontmatter syntax errors
- **WHEN** each document below is split
- **THEN** the result is as given:

| Document | Result |
|---|---|
| `---\ntitle: a\n---\nbody` | `title` is `a`, body `body` |
| `---\r\ntitle: a\r\n---\r\nbody` | `title` is `a`, body `body` |
| `---\n\n---\nbody` | empty mapping, body `body` |
| `no frontmatter` | empty mapping, body `no frontmatter` |
| `---\ntitle: a\nb: : :\n---\n` | syntax error at line 3 |
| `---\ntitle: a\nscope: [x\nverify: y\n---\n` | syntax error at line 4 |
| `---\n- a\n---\n` | syntax error at line 2 |

### Requirement: Frontmatter values
A frontmatter text field SHALL be the trimmed YAML string, and empty text
for any other value. A frontmatter list field SHALL be each item's text,
trimmed: a string as written, an integer in decimal, a boolean as `true` or
`false`; a value that is not a list reads as an empty list. A change id
list, `depends_on` and `fixes`, reads each item as a list item, then an
item whose text starts with a digit becomes the number its leading digits
form, without leading zeros, padded to three digits.

#### Scenario: Change id lists
- **WHEN** the proposal frontmatter `depends_on: ["214", 7, "abc", "12-x", " 9 ", "0042"]` is read
- **THEN** its change ids are `214`, `007`, `abc`, `012`, `009` and `042`

### Requirement: Proposals
`parse_proposal(text)` SHALL read a proposal's `title` and `verify` as text
fields, `depends_on` and `fixes` as change id lists, `features.reads` as a
list field, or an empty list when `features` is not a mapping, and from the
body the sections `Goal`, `Contract`, `Non-goals` and `Delta` as "Markdown
sections" reads them. `contract_tables` counts the matches of TypeScript's
pattern `\|[^\n]+\|\r?\n\|[-:\s|]+\|\r?\n(?:\|[^\n]+\|\r?\n?)+` in the
Contract text, each match starting after the last one ended.

#### Scenario: Proposal fields
- **WHEN** the proposal `---\ntitle: "  P  "\ndepends_on: ["214", 7]\nfixes: 3\nfeatures:\n  reads: [rust-core, " languages "]\nverify: " sh v.sh "\n---\n## Goal\nG.\n\n## Contract\n| a | b |\n|---|---|\n| 1 | 2 |\n\nx\n\n| c |\n|-|\n| 3 |\n\n## Non-goals\n- n\n\n## Delta\n- d\n` is parsed
- **THEN** its title is `P`, it depends on `214` and `007`, fixes nothing, reads `rust-core` and `languages`, its goal is `G.`, it has 2 contract tables, its non-goals are `- n`, its delta `- d` and its verify `sh v.sh`

#### Scenario: Proposal without fields
- **WHEN** each proposal below is parsed
- **THEN** its fields are as given:

| Proposal | Fields |
|---|---|
| `---\ntitle: 5\nfeatures: plain\n---\nno sections` | every text field empty, every list empty, 0 contract tables |
| `no frontmatter\n## Goal\nStill read.` | goal `Still read.`, every other field empty, 0 contract tables |

### Requirement: Task files
`parse_task_file(text)` SHALL read a task file's `title` and `verify` as
text fields and `scope`, `entry` and `skills` as list fields.
`tests_modify` is a nested `tests.modify` boolean when there is one, and
otherwise true exactly when a top-level key `tests.modify` is `true`.
`verify_starts` is `green` or `any` when the field says so, and `red`
otherwise. The acceptance lines come from the body's `Acceptance` section,
or the whole body when that section is empty: every line starting with `-`
or `*`, whitespace, `[` with a space, `x` or `X`, `]`, whitespace and text,
the text trimmed.

#### Scenario: Task file fields
- **WHEN** each task file below is parsed
- **THEN** its fields are as given:

| Task file | Fields |
|---|---|
| `---\ntitle: " When a, b "\nverify: cargo test\nverify_starts: green\ntests:\n  modify: true\nscope:\n  - a/**\n  - " b.rs "\n  - 5\nentry: [a/lib.rs]\nskills: []\n---\n## Acceptance\n\n- [ ] One.\n* [x] Two.\n- [X]   Three.  \n- [] not\n\n## Details\n- [ ] Not acceptance.\n` | title `When a, b`, verify `cargo test`, scope `a/**`, `b.rs` and `5`, entry `a/lib.rs`, no skills, tests modify, starts `green`, acceptance `One.`, `Two.` and `Three.` |
| `---\ntitle: T\ntests.modify: true\nverify_starts: purple\n---\nNo acceptance heading.\n- [ ] Body item.\n` | title `T`, tests modify, starts `red`, acceptance `Body item.` |
| `---\ntitle: T\ntests:\n  modify: "yes"\ntests.modify: true\n---\n` | title `T`, tests modify, starts `red`, no acceptance |
| `---\r\ntitle: CR\r\nscope: x\r\n---\r\n## Acceptance\r\n- [ ] Line.\r\n` | title `CR`, no scope, tests do not modify, starts `red`, acceptance `Line.` |

### Requirement: Task lists
`parse_task_list(text)` SHALL read a `tasks.md` checklist line by line,
splitting at `\n` or `\r\n`. A line starting with `##` and whitespace sets
the section to its trimmed rest. A line starting with `-` or `*`,
whitespace, `[` with a space, `x` or `X`, `]`, whitespace, an optional
number followed by `.` or `)` and whitespace, and a title, is an item: its
number or none, its title with trailing whitespace removed, whether it is
checked, its section or none, and its 1-based line.

#### Scenario: Checklist items
- **WHEN** the text `# Tasks\n\n## 1. First\n\n- [ ] 1. When a, b\n- [x] 2) Second  \n\n## Other\n* [X] Unnumbered\n- [ ]3. tight\n   - [ ] 4. indented\n` is parsed as a task list
- **THEN** its items are as given:

| Number | Title | Checked | Section | Line |
|---|---|---|---|---|
| 1 | `When a, b` | no | `1. First` | 5 |
| 2 | `Second` | yes | `1. First` | 6 |
| none | `Unnumbered` | yes | `Other` | 9 |

### Requirement: Sidecars
`parse_sidecar(text)` SHALL read an `osq.yml` sidecar into its trimmed
`group` and its optional trimmed `tags`, or into its problems, in this
order: `not a YAML mapping` alone when the YAML is empty or not a mapping;
otherwise `group must be a non-empty string` when `group` is not a string
that trims to text, `tags must be a list of non-empty strings` when `tags`
is present and not such a list, and `unknown key <key>` for each other key,
in document order. YAML that does not parse is a syntax error naming its
line, where TypeScript reports `not a YAML mapping`.

#### Scenario: Sidecar parsing
- **WHEN** each sidecar below is parsed
- **THEN** the result is as given:

| Sidecar | Result |
|---|---|
| `group: rust\n` | group `rust`, no tags |
| `group: " x "\ntags: [a, " b "]\n` | group `x`, tags `a` and `b` |
| `tags: []\ngroup: g\n` | group `g`, an empty tag list |
| `group: ""\ntags: [a, ""]\nextra: 1\nother: 2\n` | the problems `group must be a non-empty string`, `tags must be a list of non-empty strings`, `unknown key extra` and `unknown key other` |
| `- a\n` | the problem `not a YAML mapping` |
| empty | the problem `not a YAML mapping` |
| `group: [\n` | syntax error at line 2 |

### Requirement: File readers
`read_living_spec`, `read_delta`, `read_proposal`, `read_task_file`,
`read_task_list` and `read_sidecar` SHALL each read one file and parse it.
A file that cannot be read or is not UTF-8 is a read error naming its path;
a syntax error names the path and the line; a sidecar with problems is an
error naming the path and its problems.

#### Scenario: Reading errors
- **WHEN** each file below is read
- **THEN** the error is as given:

| File | Error |
|---|---|
| a task file that does not exist | a read error naming its path |
| a task file holding the bytes `0xff 0xfe` | a read error naming its path |
| a task file holding `---\ntitle: a\nb: : :\n---\n` | a syntax error naming its path and line 3 |
| a sidecar holding `group: ""\n` | a sidecar error naming its path and the problem `group must be a non-empty string` |

### Requirement: TypeScript parse parity
The specs kernel's parse SHALL equal TypeScript osq's on the documents of
this repository, compared with goldens printed once by TypeScript and
committed under `crates/kernel/specs/tests/golden/`. The tests never run
`node` or `osq`. Each golden is a JSON array, one entry per document: in
`deltas.json` `{path, delta}`, in `tasks.json` `{path, task}`, in
`proposals.json` `{path, proposal}`, in `task_lists.json` `{path, items}`,
and in `living.json` `{capability, spec, sidecar}`, the sidecar as `{group,
tags, problems}`. Each value carries the parse's fields under the Rust field
names, enums as their lowercase names except a rename side, `FROM` or `TO`,
and absent values as null. Every string inside a value that is longer than
64 UTF-16 code units is written as `fnv1a64:` and the 16 lowercase hex
digits of the 64-bit FNV-1a hash of its UTF-8 bytes; paths and capability
names are written as they are.

#### Scenario: Living fixtures match TypeScript
- **WHEN** the frozen copies of the living specs `rust-core`, `metrics-and-reporting` and `traceability` under `crates/kernel/specs/tests/fixtures/living/` and their sidecars are parsed
- **THEN** each digested parse equals its entry in `living.json`

#### Scenario: Archived documents match TypeScript
- **WHEN** every delta spec, task file, proposal and `tasks.md` of the archived changes numbered 001 to 214 in `openspec/changes/archive/` is parsed
- **THEN** each digested parse equals its golden entry, and every such document has exactly one entry

#### Scenario: Living specs read
- **WHEN** every living spec and sidecar under this repository's `openspec/specs/` is read
- **THEN** each reads without an error, with a non-empty title and purpose, at least one requirement, and a sidecar group

### Requirement: Scope globs
`scope_covers_path(scope, path)` SHALL tell whether a list of scope entries
covers one project-relative path, as TypeScript's `scopeCoversPath` does;
the specs kernel's function calls rust-core's `scope_covers_path`, the one
glob matcher. An entry and the path are both normalized first: trimmed, every
`\` turned into `/`, and any leading `./` runs removed. The path is covered
when it equals a normalized entry, or when a pattern entry matches it. An
entry is a pattern when it holds `*` or `?`, or ends with `/`. A pattern
ending with `/` gets `**` appended, any trailing `/` is then dropped, and
the pattern must match the whole path: `**/` matches zero or more whole
segments, any other `**` matches any text across segments, `*` matches any
text within one segment, `?` matches one character other than `/`, and
every other character, braces included, matches only itself. The function
never touches the disk.

#### Scenario: Scope glob cases
- **WHEN** `scope_covers_path` checks each scope and path below
- **THEN** it returns the given result:

| Scope | Path | Covered |
|---|---|---|
| `src/alpha/**` | `src/alpha/a.ts` | true |
| `src/alpha/**` | `src/alpha` | false |
| `src/alpha/**` | `src/alphabet/a.ts` | false |
| `src/*.ts` | `src/a.ts` | true |
| `src/*.ts` | `src/x/a.ts` | false |
| `src/*.ts` | `src/aXts` | false |
| `src/**/*.ts` | `src/a.ts` | true |
| `src/**/*.ts` | `src/x/y/a.ts` | true |
| `src/**.ts` | `src/x/a.ts` | true |
| `src/?.ts` | `src/a.ts` | true |
| `src/?.ts` | `src/ab.ts` | false |
| `src/?.ts` | `src//.ts` | false |
| `src/alpha/` | `src/alpha/deep/a.ts` | true |
| `src/alpha` | `src/alpha/a.ts` | false |
| `./src/a.ts` | `src/a.ts` | true |
| `src\a.ts` | `src/a.ts` | true |
| `src/a.ts` | `./src/a.ts` | true |
| `␠␠src/a.ts␠␠` | `src/a.ts` | true |
| `src/a.ts` | `src/a.tsx` | false |
| none | `src/a.ts` | false |
| `src/a.ts`, `src/b/**` | `src/b/c.ts` | true |
| `**` | `any/path.md` | true |

`␠` stands for one space.

### Requirement: Capability ownership
`read_capability_ownership(specs_dir)` SHALL return one `CapabilityOwnership
{ capability, globs }` per folder directly under `specs_dir` whose `spec.md`
has Code ownership globs, read with `code_ownership`, in folder name order by
bytes, as TypeScript's `readCapabilityOwnership` does. A folder without a
readable `spec.md`, a spec without globs, and a file directly under
`specs_dir` add nothing, and a missing `specs_dir` reads as no ownership.
`owner_capabilities(ownerships, path)` SHALL return the capability names
whose globs cover the path under "Scope globs", sorted by bytes.

#### Scenario: Ownership of the owners fixture
- **WHEN** `read_capability_ownership` reads `tests/fixtures/owners/specs/`
- **THEN** it returns, in this order:

| Capability | Globs |
|---|---|
| `alpha` | `src/alpha/**` |
| `beta` | `src/beta/**`, `src/shared.ts` |
| `gamma` | `src/shared.ts` |

#### Scenario: Missing specs folder
- **WHEN** `read_capability_ownership` reads a folder that does not exist
- **THEN** it returns no ownership

#### Scenario: Owners of a path
- **WHEN** `owner_capabilities` checks each path below against the ownership of the owners fixture
- **THEN** it returns the given capabilities:

| Path | Capabilities |
|---|---|
| `src/shared.ts` | `beta`, `gamma` |
| `src/alpha/a.ts` | `alpha` |
| `./src/beta/b.ts` | `beta` |
| `notes/z.md` | none |

### Requirement: Validation findings
Every finding the specs kernel's validation returns SHALL be a
`SpecFinding` with a `code`, the `file` it concerns, the 1-based `line` it
points at, the `requirement` name where one applies or none, a one-sentence
`message` that names the requirement or scenario where there is one, and a
`fix` for the human. Every finding blocks, so a finding has no severity. A
`FindingCode` serializes as its code, and its fix is the code's fixed text
below. Lines count from 1 in the text after the line ending rule of
"JavaScript text rules". A finding about a requirement or scenario points
at its header line, one about a REMOVED name or a rename at that entry's
line, one about a `##` heading at the heading, a duplicate or conflict at
the later of the two entries, and a finding about the whole file at line 1.
Each validation function returns its findings sorted by line, and findings
on one line in the order of the table below.

#### Scenario: Finding codes
- **WHEN** each finding code below is serialized and asked for its fix
- **THEN** the code and the fix are as given:

| Code | Fix |
|---|---|
| `missing-purpose` | Add a `## Purpose` section that says what the capability is for. |
| `missing-requirements` | Add a `## Requirements` section with at least one requirement. |
| `requirement-outside-section` | Move the requirement under `## Requirements`, or in a delta spec under an ADDED or MODIFIED section. |
| `delta-section-in-living-spec` | Move the requirements into `## Requirements` and remove the delta heading. |
| `duplicate-requirement` | Rename or remove one of the requirements, so each name is used once. |
| `requirement-without-shall` | State the requirement with SHALL or MUST outside code fences. |
| `requirement-without-scenario` | Add a `#### Scenario:` block with WHEN and THEN bullets. |
| `scenario-without-when` | Add a `- **WHEN**` bullet to the scenario. |
| `scenario-without-then` | Add a `- **THEN**` bullet to the scenario. |
| `duplicate-scenario` | Rename one of the scenarios, so each name is used once in the requirement. |
| `unknown-delta-section` | Use only `## Purpose` and the ADDED, MODIFIED, REMOVED and RENAMED Requirements sections. |
| `empty-delta-section` | Add requirements under the heading, or remove it. |
| `missing-delta-sections` | Add an ADDED, MODIFIED, REMOVED or RENAMED Requirements section. |
| `unpaired-rename` | Pair each `FROM:` line with a `TO:` line directly after it. |
| `invalid-rename` | Write each side as `- FROM:` or `- TO:` and a backticked requirement header. |
| `conflicting-delta` | Name the requirement in one operation only; after a rename, MODIFIED uses the new name. |
| `unknown-requirement` | Name a requirement the living spec has, or add a new one under ADDED. |
| `change-without-delta` | Add a delta spec at `specs/<capability>/spec.md`. |

### Requirement: Requirement validation
Each requirement of a living spec's Requirements section, and each ADDED or
MODIFIED requirement of a delta spec, SHALL be checked, as "Requirement
blocks" and "Scenario blocks" read it:

- `requirement-without-shall` when its body, without the lines the fence
  rule of "Living specs" puts inside a code fence and without the fence
  lines, holds neither `SHALL` nor `MUST` as a whole word: in that case,
  with no ASCII letter, digit or `_` directly before or after it;
- `requirement-without-scenario` when it has no scenario;
- `scenario-without-when` for each scenario with no WHEN bullet, and
  `scenario-without-then` for each with no THEN bullet;
- `duplicate-scenario` for each scenario whose name an earlier scenario of
  the same requirement has. The same name in two requirements is no
  finding.

Each of these findings carries the requirement's name.

#### Scenario: Requirement findings
- **WHEN** each living spec fixture below, under `crates/kernel/specs/tests/fixtures/validate/living/`, is validated as `validate_living_spec` says
- **THEN** its findings are as given, each with the requirement named:

| File | Findings |
|---|---|
| `requirement-without-shall.md` | `requirement-without-shall` at line 8 for `Quiet` |
| `requirement-without-scenario.md` | `requirement-without-scenario` at line 8 for `Bare` |
| `scenario-without-when.md` | `scenario-without-when` at line 15 for `Partial` |
| `scenario-without-then.md` | `scenario-without-then` at line 11 for `Partial` |
| `duplicate-scenario.md` | `duplicate-scenario` at line 15 for `Repeats` |

#### Scenario: Whole-word keywords
- **WHEN** a requirement whose body is each text below is checked
- **THEN** it gives `requirement-without-shall` or not, as given:

| Body | Finding |
|---|---|
| `The system SHALL pass.` | none |
| `It MUST pass.` | none |
| `(SHALL)` | none |
| `The system shall pass.` | `requirement-without-shall` |
| `MUSTARD and SHALLOW` | `requirement-without-shall` |
| `A_SHALL and MUST2` | `requirement-without-shall` |
| `~~~\nThe system SHALL pass.\n~~~` | `requirement-without-shall` |

### Requirement: Living spec validation
`validate_living_spec(file, text)` SHALL return the findings of one living
spec, each with `file` as given, where `text` reads as "Living specs" says
and headings count only outside code fences:

- `missing-purpose` when its purpose is empty;
- `missing-requirements` when it has no requirement;
- `requirement-outside-section` for each requirement header outside the
  first `## Requirements` section, with that requirement's name;
- `delta-section-in-living-spec` for each `##` heading whose trimmed title,
  lowercased, is `added requirements`, `modified requirements`, `removed
  requirements` or `renamed requirements`;
- `duplicate-requirement` for each requirement whose name an earlier
  requirement of the Requirements section has, with that name;
- the findings of "Requirement validation" for each requirement of the
  Requirements section.

`validate_living_specs(specs_dir)` SHALL validate the `spec.md` of each
folder directly under `specs_dir`, folders in byte order of their names,
with `file` the joined path written by `Path::display`. A folder without
a `spec.md` file adds nothing, a missing `specs_dir` gives no finding, and
a `spec.md` that cannot be read or is not UTF-8 is a read error naming its
path.

#### Scenario: Living spec findings
- **WHEN** each living spec fixture below, under `crates/kernel/specs/tests/fixtures/validate/living/`, is validated
- **THEN** its findings are as given:

| File | Findings |
|---|---|
| `valid.md` | none |
| `missing-purpose.md` | `missing-purpose` at line 1 |
| `missing-requirements.md` | `missing-requirements` at line 1 |
| `requirement-outside-section.md` | `requirement-outside-section` at line 17 for `Stray` |
| `delta-section-in-living-spec.md` | `delta-section-in-living-spec` at line 15 |
| `duplicate-requirement.md` | `duplicate-requirement` at line 15 for `Twice` |

#### Scenario: Living specs folder
- **WHEN** `validate_living_specs` reads each folder below
- **THEN** the result is as given:

| Folder | Result |
|---|---|
| `crates/kernel/specs/tests/fixtures/validate/targets/specs/` | no finding |
| a folder that does not exist | no finding |
| a folder whose `alpha/spec.md` holds the bytes `0xff 0xfe` | a read error naming that `spec.md` |

### Requirement: Delta spec validation
`validate_delta(file, text)` SHALL return the findings of one delta spec
that need no living spec, each with `file` as given, where `text` reads as
"Delta specs" says and headings and requirement headers count only outside
code fences:

- `unknown-delta-section` for each `##` heading whose trimmed title,
  lowercased, is neither one of the four delta section titles nor
  `purpose`;
- `empty-delta-section` for each delta section heading whose section holds
  no requirement header and no line "Delta specs" reads as a removed name
  or a FROM, TO or invalid rename line;
- `missing-delta-sections` when the text has no delta section heading;
- `requirement-outside-section` for each requirement header outside an
  ADDED, MODIFIED or REMOVED section, text before the first `##` heading
  included, with that requirement's name;
- `unpaired-rename` for each unpaired rename side, at its line, with its
  name;
- `invalid-rename` for each invalid rename line, at its line;
- `duplicate-requirement` for each name an earlier entry of the same kind
  has, the kinds being ADDED, MODIFIED, REMOVED, RENAMED FROM and RENAMED
  TO, sections of one title counted together;
- `conflicting-delta` for each pair of entries with the same name in ADDED
  and MODIFIED, ADDED and REMOVED, MODIFIED and REMOVED, a RENAMED FROM and
  MODIFIED, a RENAMED FROM and REMOVED, or a RENAMED TO and ADDED, at the
  later entry, with that name;
- the findings of "Requirement validation" for each ADDED and MODIFIED
  requirement.

#### Scenario: Delta spec findings
- **WHEN** each delta spec fixture below, under `crates/kernel/specs/tests/fixtures/validate/delta/`, is validated
- **THEN** its findings are as given:

| File | Findings |
|---|---|
| `valid.md` | none |
| `unknown-delta-section.md` | `unknown-delta-section` at line 12 |
| `empty-delta-section.md` | `empty-delta-section` at line 12 |
| `missing-delta-sections.md` | `missing-delta-sections` at line 1 |
| `unpaired-rename.md` | `unpaired-rename` at line 7 for `Orphan` |
| `invalid-rename.md` | `invalid-rename` at line 7 |
| `conflicting-delta.md` | `conflicting-delta` at line 14 for `Both` |
| `duplicate-requirement.md` | `duplicate-requirement` at line 14 for `Twice` |
| `requirement-outside-section.md` | `requirement-outside-section` at line 6 for `Stray` |
| `requirement-without-scenario.md` | `requirement-without-scenario` at line 5 for `Bare` |

### Requirement: Delta targets
`check_delta_targets(file, text, living)` SHALL return an
`unknown-requirement` finding, with `file` as given and the entry's name,
for each MODIFIED requirement, REMOVED name and RENAMED FROM name of the
delta spec `text` that `living`, a parsed living spec or none, has no
requirement for. A MODIFIED name that is the TO of one of the delta's
renames counts as known. With no living spec, no requirement is known.

`validate_change(change_dir, specs_dir)` SHALL validate each delta spec of
a change: the `spec.md` of each folder directly under `change_dir/specs`,
folders in byte order of their names, against the living spec at
`specs_dir/<folder>/spec.md`, or none when that is not a file. Each delta's
findings are those of `validate_delta` and `check_delta_targets`, sorted
together as "Validation findings" says, with `file` the delta's joined path
written by `Path::display`. A change with no delta spec gives one
`change-without-delta` finding for `change_dir/proposal.md` at line 1. A
delta or living spec that cannot be read or is not UTF-8 is a read error
naming its path.

#### Scenario: Change findings
- **WHEN** each change below, under `crates/kernel/specs/tests/fixtures/validate/targets/changes/`, is validated against `crates/kernel/specs/tests/fixtures/validate/targets/specs/`
- **THEN** its findings are as given, each file under the change folder:

| Change | Findings |
|---|---|
| `known` | none |
| `unknown` | `unknown-requirement` in `specs/alpha/spec.md` at line 5 for `Missing`, at line 14 for `Never there` and at line 18 for `Ghost`, then in `specs/beta/spec.md` at line 5 for `Kept` |
| `no-delta` | `change-without-delta` in `proposal.md` at line 1 |

#### Scenario: Unreadable delta
- **WHEN** a change whose `specs/alpha/spec.md` holds the bytes `0xff 0xfe` is validated
- **THEN** the result is a read error naming that `spec.md`

### Requirement: Validation corpus
The specs kernel's validation SHALL find nothing in this repository's
living specs and archived delta specs. The archived changes numbered 001
to 015, 018 and 019 predate delta specs and are the only archived changes
without one; the others numbered up to 216 each have at least one.

#### Scenario: Living specs validate
- **WHEN** `validate_living_specs` reads this repository's `openspec/specs/`
- **THEN** it gives no finding

#### Scenario: Archived deltas validate
- **WHEN** `validate_delta` checks every delta spec of the archived changes numbered 001 to 216 in `openspec/changes/archive/`
- **THEN** it gives no finding, and the changes in that range without a delta spec are exactly 001 to 015, 018 and 019

### Requirement: Delta merge
`merge_delta(base, capability, delta)` SHALL return the living spec text
that TypeScript's `mergeDelta` returns for the same base text, capability
and parsed delta, byte for byte, or the `MergeError` of "Merge refusals".
With no base, or a base that is only whitespace, it merges into
`# <capability> Specification`, a `## Purpose` line followed directly by
the delta's purpose or by `TBD - created by archiving change <capability>.
Update Purpose after archive.`, and an empty `## Requirements` section.
It splits the base at its first `## Requirements` heading outside code
fences into the text before it, the heading line, the text before the
first requirement header, the requirement blocks, and the text from the
next `##` heading on. It then applies the renames, the removals (only
when there is a base), the modifications and the additions, in that
order. A rename rewrites the block's first line to
`### Requirement: <to>`, a modification replaces the whole block, and an
ADDED block equal to an existing block after both are trimmed changes
nothing. The text is written back as the text before, the heading line,
the text before the first header when it is not blank, each surviving
block in its old place and each new block after them, joined by one
blank line, then the text after. Runs of blank lines outside fences
become one, and the text ends with one newline. A base with no
Requirements heading keeps all of its text as given, a leading BOM
included, followed by a new `## Requirements` heading.

`merge_living_spec(base, capability, delta)` SHALL return the same text,
or none when that text holds no requirement, as `mergeLivingSpec` does.
Neither function touches the disk.

#### Scenario: Merge cases
- **WHEN** each case folder below, under `crates/kernel/specs/tests/fixtures/merge/cases/`, is merged with the capability `cap`, its `base.md` as the base or none when the file is absent, and its `delta.md` parsed by `parse_delta`
- **THEN** `merge_delta` gives the text of the case's `merged.md`, and `merge_living_spec` gives the result as given:

| Case | `merge_living_spec` |
|---|---|
| `ops` | the text of `merged.md` |
| `new-purpose` | the text of `merged.md` |
| `new-no-purpose` | the text of `merged.md` |
| `new-removed-ignored` | the text of `merged.md` |
| `same-added` | the text of `merged.md` |
| `no-requirements-header` | the text of `merged.md` |
| `fence` | the text of `merged.md` |
| `emptied` | none |

### Requirement: Merge refusals
A delta that `merge_delta` cannot apply SHALL give a `MergeError`, whose
`capability()` is the capability merged and whose `requirement()` is the
requirement name the refusal names, or none for `InvalidRename`. Its
`Display` writes TypeScript's `DeltaMergeError` message for the same
refusal. The checks run in this order, and the first that fails is the
error:

- `InvalidRename { capability, line }`, for the delta's first invalid
  rename line: ``<capability> RENAMED failed - entry "<line>" is not in the expected form. Write each rename as "- FROM: `### Requirement: X`" followed by "- TO: `### Requirement: Y`".``
- `UnpairedRename { capability, side, requirement }`, for the first
  unpaired rename: ``<capability> RENAMED failed for header "### Requirement: <requirement>" - no matching <other side>``, where the other side is `TO` for an unpaired FROM and `FROM` for an unpaired TO.
- `DuplicateAdded { capability, requirement }`, for an ADDED name an
  earlier ADDED block has: ``<capability> ADDED failed for header "### Requirement: <requirement>" - duplicate requirement in ADDED``
- With no base, `ModifiedMissing` for the first MODIFIED name, then
  `RenameWithoutBase { capability, requirement }` for the first rename's
  FROM name: ``Cannot apply RENAMED: requirement "<requirement>" not found in base spec``
- For each rename, `RenameSourceMissing { capability, requirement }`
  when the spec has no FROM name: ``<capability> RENAMED failed for header "### Requirement: <requirement>" - source not found``,
  then `RenameTargetExists { capability, requirement }` when it already
  has the TO name: ``<capability> RENAMED failed for header "### Requirement: <requirement>" - target already exists``
- With a base, `RemovedMissing { capability, requirement }` for each
  REMOVED name the spec lacks: ``Cannot apply REMOVED: requirement "<requirement>" not found in base spec``
- For each MODIFIED block, `ModifiedMissing { capability, requirement }`
  when the spec lacks its name: ``Cannot apply MODIFIED: requirement "<requirement>" not found in base spec``,
  then `ScenariosDropped { capability, requirement, scenarios }` when the
  current block holds a scenario name more times than the new block, the
  missing names in the current block's order: ``<capability> MODIFIED failed for header "### Requirement: <requirement>" - current spec contains scenario(s) not present in the modified block: "<a>", "<b>". Refresh the change spec before archiving to avoid dropping scenarios.``
  A scenario name is read from each `####` line outside fences, without
  the `####`, a closing hash run and a leading `Scenario:` in any case.
- For each ADDED block, `AddedExists { capability, requirement }` when
  the spec has a different block of that name: ``<capability> ADDED failed for header "### Requirement: <requirement>" - already exists``,
  then `AddedNearMiss { capability, requirement }` when a name differs
  from it only in letter case and whitespace runs: ``<capability> ADDED failed for header "### Requirement: <requirement>" - a requirement differing only in case or spacing already exists``

`MergeError` derives `Debug`, `Clone`, `PartialEq`, `Eq` and
`serde::Serialize`, and implements `std::error::Error`.

#### Scenario: Refusal cases
- **WHEN** each case folder below, under `crates/kernel/specs/tests/fixtures/merge/cases/`, is merged as "Merge cases" says
- **THEN** `merge_delta` and `merge_living_spec` give the error as given, for the capability `cap`, and its `Display` equals the text of the case's `error.txt`:

| Case | Error | Requirement |
|---|---|---|
| `invalid-rename` | `InvalidRename` with the line `- FROM: A` | none |
| `unpaired-from` | `UnpairedRename`, side FROM | `A` |
| `unpaired-to` | `UnpairedRename`, side TO | `A2` |
| `duplicate-added` | `DuplicateAdded` | `N` |
| `modified-without-base` | `ModifiedMissing` | `A` |
| `rename-without-base` | `RenameWithoutBase` | `A` |
| `rename-source-missing` | `RenameSourceMissing` | `Z` |
| `rename-target-exists` | `RenameTargetExists` | `Two words` |
| `removed-missing` | `RemovedMissing` | `Z` |
| `modified-missing` | `ModifiedMissing` | `Z` |
| `scenarios-dropped` | `ScenariosDropped` with the scenarios `S1`, `S2` | `Two words` |
| `added-exists` | `AddedExists` | `A` |
| `added-near-miss` | `AddedNearMiss` | `two  Words` |

### Requirement: Change merge
`merge_change(change_dir, specs_dir)` SHALL merge each delta spec of a
change as TypeScript's `applyOpenSpecDeltas` does, and write nothing. It
reads the `spec.md` of each folder directly under `change_dir/specs`,
folders in byte order of their names, skipping a folder without a
`spec.md` file, and merges it with `merge_living_spec` into the living
spec at `specs_dir/<folder>/spec.md`, or none when that is not a file. It
returns one `MergedSpec { capability, delta, text }` per delta spec, in
that order: the folder name, the delta's joined path, and the merged text
or none for a capability the change empties. A change with no `specs`
folder gives none. A delta or living spec that cannot be read or is not
UTF-8 is `MergeChangeError::Read` holding the `SpecsError` read error
naming its path, and the first delta that cannot be applied is
`MergeChangeError::Merge { path, error }`, with the delta's path and the
`MergeError`.

#### Scenario: Change merges
- **WHEN** each change below, under `crates/kernel/specs/tests/fixtures/merge/validate/changes/`, is merged against `crates/kernel/specs/tests/fixtures/merge/validate/specs/`
- **THEN** the result is as given, and each text equals `merge_living_spec` of the same living spec and delta:

| Change | Result |
|---|---|
| `clean` | `alpha` with a text |
| `emptied` | `beta` with none |
| `fresh` | `gamma` with a text starting `# gamma Specification\n\n## Purpose\nGamma for the merged validation fixture.\n` |
| `refused` | a merge error naming `specs/alpha/spec.md` under the change, with `ModifiedMissing` for `alpha` and `Missing` |

#### Scenario: Change merge edges
- **WHEN** each change below, written under a temporary folder, is merged against `crates/kernel/specs/tests/fixtures/merge/validate/specs/`
- **THEN** the result is as given:

| Change | Result |
|---|---|
| a change with no `specs` folder | no merged spec |
| a change whose only delta folder `alpha` holds no `spec.md` | no merged spec |
| a change whose `specs/alpha/spec.md` holds the bytes `0xff 0xfe` | a read error naming that `spec.md` |

### Requirement: Merged spec validation
`validate_merged_change(change_dir, specs_dir)` SHALL validate the merged
result of a change, which replaces TypeScript's `merged-spec-check.ts`
and its Node `openspec` run. It runs `validate_living_spec` on each text
`merge_change` gives that is not none, and leaves out each finding the
living spec already has: one whose code and requirement equal those of a
finding `validate_living_spec` gives for the living spec at
`specs_dir/<capability>/spec.md`, two absent requirements counting as
equal. Each kept finding's `file` is the delta's path written by
`Path::display`, and its `line` is the line of the first requirement
header outside fences in the delta that names the finding's requirement,
or 1. Each delta's findings are sorted as "Validation findings" says,
deltas in `merge_change`'s order. It returns `merge_change`'s error when
there is one.

#### Scenario: Merged findings
- **WHEN** each change below, under `crates/kernel/specs/tests/fixtures/merge/validate/changes/`, is validated against `crates/kernel/specs/tests/fixtures/merge/validate/specs/`
- **THEN** its findings are as given, each file under the change folder:

| Change | Findings |
|---|---|
| `clean` | none |
| `added-flaw` | `requirement-without-scenario` in `specs/alpha/spec.md` at line 5 for `Bare` |
| `renamed` | `requirement-without-scenario` in `specs/alpha/spec.md` at line 1 for `Renamed` |
| `emptied` | none |
| `fresh` | none |
| `refused` | the merge error of "Change merges" |

### Requirement: Archive parity cases
The specs kernel's merge SHALL give, for each case of
`tests/fixtures/openspec-diff/`, the result TypeScript osq's archive
gives, compared with frozen copies under
`crates/kernel/specs/tests/fixtures/merge/openspec-diff/`. Each copy holds
the case's `case.json`, its `specs/` when it has one, the delta specs of
its changes under `changes/<change>/specs/`, and either `expected/`, the
living specs TypeScript's `applyOpenSpecDeltas` wrote, or `error.txt`,
the message of the `DeltaMergeError` it threw. The tests never run
`node`, `openspec` or `osq`.

#### Scenario: Differential cases
- **WHEN** each case below has its changes merged with `merge_change` in byte order of their folder names, starting from a copy of its `specs/` or from no living spec, and each merged text is written to that copy, or its folder removed when the text is none, before the next change
- **THEN** the result is as given:

| Case | Result |
|---|---|
| `added` | the copy equals `expected/`, file for file |
| `given-and` | the copy equals `expected/`, file for file |
| `modified` | the copy equals `expected/`, file for file |
| `new-capability` | the copy equals `expected/`, file for file |
| `removed` | the copy equals `expected/`, file for file |
| `renamed` | the copy equals `expected/`, file for file |
| `second-change` | the copy equals `expected/`, file for file |
| `bare-rename` | a merge error whose `Display` equals `error.txt` |
| `dropped-scenario` | a merge error whose `Display` equals `error.txt` |
| `duplicate-added` | a merge error whose `Display` equals `error.txt` |

### Requirement: Archive replay
Replaying this repository's archive with `merge_change` SHALL give its
living specs. The replay starts from no living spec and merges, in this
order: the archived change folders under `openspec/changes/archive/`
whose `.run/events/change.jsonl` holds no `archived` event with a string
`timestamp`, in byte order of their names; then the other archived
folders, by the `timestamp` of the last such event, then by name; then
each folder directly under `openspec/changes/` other than `archive` that
holds `.run/archive-specs.json`, in byte order of names, because archive
has applied its deltas for its change-level verify. Lines of the events
file that are not JSON objects are ignored. Every capability that has a
folder under `openspec/specs/` or a delta in a replayed change is
checked: one whose replay ends with none has no living `spec.md`, and
every other one's living `spec.md` equals its replay byte for byte. The
living specs of `cli-foundation`, `metrics-and-reporting`,
`spec-lint-and-approve`, `status-inspection`, `watcher-and-harness` and
`web-inspection` predate the merge's Purpose rule and keep one blank line
after `## Purpose`; each of them equals its replay only once the first
`## Purpose\n\n` is read as `## Purpose\n`, and differs before.

#### Scenario: Living specs replay
- **WHEN** the archive and the changes being archived in this repository are replayed
- **THEN** every checked capability matches its living spec, and the six capabilities named above are exactly those that need the Purpose blank line removed

### Requirement: OpenSpec validate parity
The specs kernel's validation SHALL give the same pass or fail as
`openspec validate --strict --json --no-interactive` on every item below,
except the fixed differences of "Validate differences". The OpenSpec CLI is
the one `OSQ_OPENSPEC_BIN` names, or `node_modules/.bin/openspec` under the
repository root when that variable is unset or empty, run with
`OPENSPEC_TELEMETRY=0` in a temporary project. An item passes in OpenSpec
when the command exits 0. A missing CLI fails the test, naming the path.

- Each living spec under `openspec/specs/`: OpenSpec validates a copy of
  the folder with `--specs`, one item per capability, and the Rust side
  passes when `validate_living_spec` gives no finding.
- Each archived change under `openspec/changes/archive/`, in the landing
  order of "Archive replay", against the living specs that replaying the
  changes before it gives: OpenSpec validates the change with
  `<name> --type change`, in a project holding that replay as
  `openspec/specs/` and the change's `proposal.md`, `tasks.md` and
  `specs/` under `openspec/changes/<name>/`. The Rust side passes when
  `validate_change` gives no finding and `validate_merged_change` gives no
  finding and no error, against the same replay. The replay then merges
  the change with `merge_change`.
- Each living spec fixture under
  `crates/kernel/specs/tests/fixtures/validate/living/`, as the only spec
  of a project, named after its file stem and validated with
  `<stem> --type spec`. The Rust side runs `validate_living_spec`.
- Each delta spec fixture under
  `crates/kernel/specs/tests/fixtures/validate/delta/`, as
  `specs/alpha/spec.md` of a change `parity` with no living spec. The Rust
  side runs `validate_delta`.
- Each change under
  `crates/kernel/specs/tests/fixtures/validate/targets/changes/`, with
  `targets/specs/` as the living specs. The Rust side runs
  `validate_change` and `validate_merged_change` as for an archived change.

A change written to a temporary project without a `proposal.md` gets one
holding `# Parity fixture\n`, because OpenSpec reads a change only through
its proposal. The test prints every item whose results differ, not only
the first. The validate and merge fixture tests are its fast
counterparts.

#### Scenario: Validate differences
- **WHEN** the items of "OpenSpec validate parity" are validated by both
- **THEN** every item gives the same result in both, except exactly these, each of which differs as given:

| Item | Rust | OpenSpec | Why |
|---|---|---|---|
| `fixtures/validate/living/valid.md` | pass | fail | OpenSpec warns that a Purpose under 50 characters is too brief, which ADR 026 does not port |
| `fixtures/validate/delta/empty-delta-section.md` | fail | pass | ADR 026 makes every delta section well formed |
| `fixtures/validate/delta/invalid-rename.md` | fail | pass | ADR 026 makes every delta section well formed |
| `fixtures/validate/delta/unknown-delta-section.md` | fail | pass | ADR 026 allows only the four delta sections |
| `fixtures/validate/targets/changes/unknown` | fail | pass | OpenSpec checks targets only at archive, and ADR 026 checks them at validate |

### Requirement: OpenSpec archive parity
The specs kernel's merge SHALL give the result `openspec archive` gives on
each case of `tests/fixtures/openspec-diff/`, as
`tests/openspec-differential.test.ts` checks for TypeScript. It uses the
OpenSpec CLI of "OpenSpec validate parity". For each case it builds two
temporary projects from the case: `templates/openspec/config.yaml` and
`templates/openspec/schemas/` under `openspec/`, the case's `specs/` as
`openspec/specs/` when it has one, and its `changes/` as
`openspec/changes/`. In one project OpenSpec runs `archive <change> --yes
--json`. In the other, `merge_change` merges each change in byte order of
names into `openspec/specs/`, writing each text or removing an emptied
capability's folder before the next. The case's `case.json` names what to
expect:

- `identical`: OpenSpec validates each change with `validate <change>
  --type change --strict --json --no-interactive` and archives each, both
  exiting 0, and the two `openspec/specs/` trees are equal, path for path
  and byte for byte.
- `both-refuse`: OpenSpec's archive of the first change exits non-zero
  with a `status` entry whose `code` is `archive_spec_update_failed`, the
  Rust merge gives a `MergeChangeError::Merge`, and both trees still equal
  the case's `specs/`.
- `osq-refuses`: the Rust merge gives a `MergeChangeError::Merge` whose
  `MergeError` message holds `### Requirement:`, OpenSpec's archive exits
  0, and no living spec it leaves holds `### Requirement: <name>` for any
  `TO:` name of the case's delta specs.

The archive parity cases are its fast counterpart.

#### Scenario: Archive cases match OpenSpec
- **WHEN** each case under `tests/fixtures/openspec-diff/` is archived by both
- **THEN** each case gives the result its `case.json` names, and the cases checked are exactly the folders there

### Requirement: Public API
The specs kernel SHALL expose its items only at its crate root. No module
of `crates/kernel/specs/src` is declared `pub mod`, and `src/lib.rs`
re-exports exactly the items in the table below, each used by another
crate or by the crate's own tests, or named in the signature of one that
is. Every public function and public method of the crate SHALL carry a doc
line `Implements: rust-specs/<requirement>`. A new public item is added by
a change that edits this table.

#### Scenario: Specs kernel exports from its root only
- **WHEN** the source files under `crates/kernel/specs/src` are read
- **THEN** no line declares `pub mod`, and the `pub use` items of `src/lib.rs` are exactly these, by module:

| Module | Items |
|---|---|
| `decisions` | `Adr`, `AppliesTo`, `DecisionCode`, `DecisionFinding`, `DecisionProblems`, `DecisionRecords`, `project_rules_errors`, `read_decisions`, `validate_decisions` |
| `document` | `ChecklistItem`, `Frontmatter`, `Proposal`, `Sidecar`, `SidecarError`, `SyntaxError`, `TaskFile`, `VerifyStarts`, `parse_frontmatter`, `parse_proposal`, `parse_sidecar`, `parse_task_file`, `parse_task_list` |
| `markdown` | `Delta`, `LivingSpec`, `Outcome`, `Rename`, `RenameSide`, `Requirement`, `Scenario`, `UnpairedRename`, `code_ownership`, `js_trim`, `normalize_requirement_name`, `parse_delta`, `parse_living_spec`, `parse_requirement`, `parse_scenario`, `section` |
| `merge` | `MergeChangeError`, `MergeError`, `MergedSpec`, `merge_change`, `merge_delta`, `merge_living_spec` |
| `owners` | `CapabilityOwnership`, `owner_capabilities`, `read_capability_ownership`, `scope_covers_path` |
| `read` | `SpecsError`, `read_delta`, `read_living_spec`, `read_proposal`, `read_sidecar`, `read_task_file`, `read_task_list` |
| `validate` | `FindingCode`, `SpecFinding`, `check_delta_targets`, `validate_change`, `validate_delta`, `validate_living_spec`, `validate_living_specs`, `validate_merged_change` |

#### Scenario: Specs kernel public functions are tagged
- **WHEN** each `pub fn` under `crates/kernel/specs/src` is read, methods included
- **THEN** the doc comment directly above it holds a line `Implements: rust-specs/<requirement>`, and the six methods name these requirements:

| Method | Implements |
|---|---|
| `DecisionCode::as_str` | `rust-specs/adr-validation` |
| `DecisionCode::fix` | `rust-specs/adr-validation` |
| `FindingCode::as_str` | `rust-specs/validation-findings` |
| `FindingCode::fix` | `rust-specs/validation-findings` |
| `MergeError::capability` | `rust-specs/merge-refusals` |
| `MergeError::requirement` | `rust-specs/merge-refusals` |

### Requirement: ADR records
`read_decisions(project_root, decisions, openspec)` SHALL read the files
directly under `<project_root>/<decisions>` into a `DecisionRecords` of
`adrs`, `ignored` and `groups`, as TypeScript's `readDecisions` does, where
`decisions` and `openspec` are the folders, relative to the project root,
that `paths.decisions` and `paths.openspecRoot` name. A file is an ADR when
its name ends in `.md` and is not `README.md`, the name starts with a digit,
it reads as UTF-8 text, its frontmatter parses with `parse_frontmatter`, and
the frontmatter has a `status` key, whatever its value. Every other `.md`
file except `README.md` is ignored and listed in `ignored` by its path.
Folders, `README.md` and files whose name does not end in `.md` are left out
of both lists. Each `Adr` carries its `path` as `<decisions>/<file name>`
with forward slashes. ADRs are sorted by the numeric value of their number,
then by path; ignored paths are sorted. A missing decisions folder reads as
no ADRs, no ignored files and no groups.

#### Scenario: Records of the decisions fixture
- **WHEN** `read_decisions` reads `tests/fixtures/decisions/` with the folders `decisions` and `openspec`
- **THEN** it returns these ADRs in this order, and the ignored paths `decisions/003-no-frontmatter.md` and `decisions/draft.md`:

| Path | Number | Title | Date | Status | Rule | Superseded by |
|---|---|---|---|---|---|---|
| `decisions/001-full.md` | `001` | `Full record` | `2026-01-02` | `accepted` | `Keep the full record.` | none |
| `decisions/002-superseded.md` | `002` | `Superseded record` | none | `superseded` | `Replaced by the full record.` | `1` |
| `decisions/2-short.md` | `2` | `Short` | none | `proposed` | empty | none |
| `decisions/04-malformed.md` | `04` | `Malformed lists` | none | `accepted` | empty | none |
| `decisions/005-bad-status.md` | `005` | `Bad status` | none | `5` | empty | none |
| `decisions/006-warnings.md` | `006` | `Warnings` | none | `proposed` | `Two\nlines` | none |
| `decisions/007-multiline.md` | `007` | `Multi-line rule` | none | `accepted` | `One\ntwo` | none |
| `decisions/008-long.md` | `008` | `Long rule` | none | `accepted` | `This rule runs on well past the sixty characters the test allows.` | none |
| `decisions/009-superseded-missing.md` | `009` | `Missing replacement` | none | `superseded` | `Superseded without a replacement.` | none |
| `decisions/010-superseded-unknown.md` | `010` | `Unknown replacement` | none | `superseded` | `Superseded by an ADR that does not exist.` | `099` |

#### Scenario: Missing decisions folder
- **WHEN** `read_decisions` reads a project root that has no decisions folder
- **THEN** it returns no ADRs, no ignored paths and no groups

### Requirement: ADR fields
Each `Adr` SHALL hold the fields of TypeScript's `Adr` under their Rust
names, plus `enforced_by`. `number` is the file name's leading digits as
written. `title` is the text of the first body line that is `#`, a space or
tab, and text, trimmed, with a leading run of digits, its `.` and the
whitespace after it removed. `date` is the first `YYYY-MM-DD` of ASCII
digits on the first body line that starts with `Date:`, and none when that
line holds none or there is no such line. `hash` is `sha256:` and the
lowercase hex SHA-256 of the file's bytes. `status` is the trimmed string,
an integer, real or boolean as its text, and empty for any other value.
`applies_to` is `AppliesTo::All` for exactly the string `all`, a
non-empty list of non-empty strings as `AppliesTo::Capabilities` of the
trimmed strings, and none otherwise. `rule` is the trimmed string, else
empty. `superseded_by` is a trimmed non-empty string or an integer as its
text, else none. `checks` and `denies`, when present, are lists of strings
that trim to text, each trimmed; a check path also has every `\` turned into
`/` and one leading `./` removed. `enforced_by`, which TypeScript does not
read, is a string that trims to text as a one-item list, or a list like
`denies`. A missing list field is empty. A present `checks`, `denies` or
`enforced_by` of any other shape reads as empty and adds its name to
`malformed`, in that order. `AppliesTo` serializes as the string `all` or as
the list of names.

#### Scenario: List fields of the decisions fixture
- **WHEN** `read_decisions` reads `tests/fixtures/decisions/`
- **THEN** these ADRs have these list fields, and every other ADR of the fixture has none of them and nothing malformed:

| Path | Applies to | Checks | Denies | Enforced by | Malformed |
|---|---|---|---|---|---|
| `decisions/001-full.md` | `alpha`, `group:core` | `tests/a.test.ts`, `tests/b.rs` | `left-pad` | `validator` | none |
| `decisions/002-superseded.md` | all | none | none | none | none |
| `decisions/2-short.md` | `alpha`, `alpha`, `group:core` | none | none | none | none |
| `decisions/04-malformed.md` | none | none | none | none | `checks`, `denies`, `enforced_by` |
| `decisions/006-warnings.md` | `ghost`, `group:nobody`, `beta`, `group:core` | none | none | none | none |

#### Scenario: Hash of an ADR
- **WHEN** `read_decisions` reads `tests/fixtures/decisions/`
- **THEN** the ADR `decisions/001-full.md` has the hash `sha256:7661094d657cbcecc6572e2c230a62c213ac34af1536cd58fb18af36c530bff5`

### Requirement: ADR groups
`read_decisions` SHALL read each capability's group into `groups`, as
TypeScript's `readCapabilityGroups` does: first every folder under
`<openspec>/specs` that holds both `osq.yml` and `spec.md`, in name order,
then, for a capability no living sidecar named, each
`specs/<capability>/osq.yml` of every folder under `<openspec>/changes`
whose name does not start with `_` or `.` and is not `archive` or
`rejected`, change folders and capabilities in name order. A sidecar that
`parse_sidecar` refuses gives no group. An ADR's `governs` SHALL be `all`
when `applies_to` is `all`, empty when it is none, and otherwise every
capability name it lists plus every capability whose group a
`group:<name>` entry names, without repeats, sorted.

#### Scenario: Groups of the decisions fixture
- **WHEN** `read_decisions` reads `tests/fixtures/decisions/`
- **THEN** its groups are exactly these, so the living `delta` with a refused sidecar, the living `gamma` without a `spec.md`, the archived `omega` and the `_draft` change's `zeta` give none, and the change `010-new` does not replace the living `beta`:

| Capability | Group |
|---|---|
| `alpha` | `core` |
| `beta` | `edge` |
| `gamma` | `core` |

#### Scenario: Governed capabilities of the decisions fixture
- **WHEN** `read_decisions` reads `tests/fixtures/decisions/`
- **THEN** these ADRs govern these capabilities:

| Path | Governs |
|---|---|
| `decisions/001-full.md` | `alpha`, `gamma` |
| `decisions/002-superseded.md` | all |
| `decisions/2-short.md` | `alpha`, `gamma` |
| `decisions/04-malformed.md` | none |
| `decisions/005-bad-status.md` | `ghost` |
| `decisions/006-warnings.md` | `alpha`, `beta`, `gamma`, `ghost` |
| `decisions/008-long.md` | `beta` |

### Requirement: ADR validation
`validate_decisions(records, living, max_rule_length)` SHALL return a
`DecisionProblems` of `errors` and `warnings`, each a list of
`DecisionFinding` with a `code`, the `file` it concerns as the record's
path, a `message` and the code's `fix`. A finding displays as
`<file>: <message>`, which is the text TypeScript's `validateDecisions`
reports. For each ADR in order: an error for each `malformed` field; an
error when the status is not `proposed`, `accepted` or `superseded`, after
which the ADR is not checked further; for an accepted ADR, an error when
`applies_to` is none, and one when the rule is empty, else holds a line
break, else is longer than `max_rule_length` UTF-16 code units; for a
superseded ADR, an error when `superseded_by` is none, else when it names no
ADR number of the records by numeric value; then a warning for each
capability name in `applies_to` that `living` does not hold, and for each
`group:<name>` entry whose group no capability in `living` has in `groups`.
After the ADRs, a warning for each ignored path. TypeScript, which does not
read `enforced_by`, reports the same findings without the one for a
malformed `enforced_by`.

#### Scenario: Decision finding codes
- **WHEN** each decision finding code below is serialized and asked for its fix
- **THEN** the code, its message and its fix are as given:

| Code | Message | Fix |
|---|---|---|
| `malformed-list` | `<field> must be a list of non-empty strings`, or for `enforced_by` `enforced_by must be a non-empty string or a list of non-empty strings` | Write the field as a list of non-empty strings, or remove it. |
| `invalid-status` | `status must be proposed, accepted, or superseded` | Set status to proposed, accepted or superseded. |
| `missing-applies-to` | `accepted ADR needs applies_to, either "all" or capabilities` | Set applies_to to `all` or to a list of capability names. |
| `missing-rule` | `accepted ADR needs a one-line rule` | Add a one-line rule that says what a spec must do. |
| `multiline-rule` | `rule must be one line` | Write the rule on one line. |
| `long-rule` | `rule is longer than limits.maxRuleLength (<max>)` | Shorten the rule to the limit and keep the full wording in the body. |
| `missing-superseded-by` | `superseded ADR needs superseded_by naming its replacement` | Set superseded_by to the number of the ADR that replaces this one. |
| `unknown-superseded-by` | `superseded_by <number> names no existing ADR` | Name an existing ADR's number in superseded_by. |
| `unknown-capability` | `applies_to capability "<name>" has no living spec` | Name a living capability, or add its spec first. |
| `unknown-group` | `applies_to group "<name>" has no living capability` | Name a group that a living capability's `osq.yml` sets. |
| `ignored-file` | `no osq frontmatter, ignored` | Give the file a numbered name and frontmatter with a status, or move it out of the decisions folder. |

#### Scenario: Validation of the decisions fixture
- **WHEN** `validate_decisions` checks the records `read_decisions` reads from `tests/fixtures/decisions/`, with the living capabilities `alpha` and `beta` and a maximum rule length of 60
- **THEN** it returns these findings in this order, displayed:

| Kind | Finding |
|---|---|
| error | `decisions/04-malformed.md: checks must be a list of non-empty strings` |
| error | `decisions/04-malformed.md: denies must be a list of non-empty strings` |
| error | `decisions/04-malformed.md: enforced_by must be a non-empty string or a list of non-empty strings` |
| error | `decisions/04-malformed.md: accepted ADR needs applies_to, either "all" or capabilities` |
| error | `decisions/04-malformed.md: accepted ADR needs a one-line rule` |
| error | `decisions/005-bad-status.md: status must be proposed, accepted, or superseded` |
| error | `decisions/007-multiline.md: rule must be one line` |
| error | `decisions/008-long.md: rule is longer than limits.maxRuleLength (60)` |
| error | `decisions/009-superseded-missing.md: superseded ADR needs superseded_by naming its replacement` |
| error | `decisions/010-superseded-unknown.md: superseded_by 099 names no existing ADR` |
| warning | `decisions/006-warnings.md: applies_to capability "ghost" has no living spec` |
| warning | `decisions/006-warnings.md: applies_to group "nobody" has no living capability` |
| warning | `decisions/003-no-frontmatter.md: no osq frontmatter, ignored` |
| warning | `decisions/draft.md: no osq frontmatter, ignored` |

#### Scenario: Live decisions validate
- **WHEN** `read_decisions` reads this repository and `validate_decisions` checks the records with the capability folders under `openspec/specs/` as living and a maximum rule length of 160
- **THEN** every `.md` file in `decisions/` other than `README.md` reads as an ADR, and there are no errors

### Requirement: ADR parse parity
`read_decisions` SHALL give TypeScript's `readDecisions` result on frozen
copies of this repository's ADRs, compared with a golden printed once by
TypeScript and committed as `tests/golden/decisions.json`. The test never
runs `node` or `osq`. `tests/fixtures/repo_decisions/` holds byte-for-byte
copies of the 26 ADRs and the `README.md` in `decisions/` on 2026-10-20,
and `openspec/specs/<capability>/` with a copy of each living capability's
`osq.yml` and a one-line `spec.md`. The golden is one JSON object of
`adrs`, `ignored` and `groups`, each ADR under the Rust field names with
none as null and `enforced_by` as an empty list, which TypeScript does not
read and no ADR sets.

#### Scenario: Frozen decisions match TypeScript
- **WHEN** `read_decisions` reads `tests/fixtures/repo_decisions/` with the folders `decisions` and `openspec`, and the result is serialized to JSON
- **THEN** it equals `tests/golden/decisions.json`: 26 ADRs, no ignored paths, and the group of each of the 14 capabilities

### Requirement: Project rules block
The specs kernel SHALL give `project_rules_errors(records:
&DecisionRecords, agents: &str, max_project_rules: u64) -> Vec<String>`,
the project rules errors TypeScript's `checkProjectRules` gives for the
ADRs in `records` and the text `agents` of `AGENTS.md`, in this order.

The system-wide ADRs are the ADRs whose status is `accepted` and whose
`governs` is `all`, in ADR order. With none there is no expected block.
Otherwise the expected block is `<!-- OSQ:RULES:START -->\n## Project
rules\n\n`, then one line `- <rule> ADR <number>` for each system-wide
ADR, joined by `\n`, then `\n<!-- OSQ:RULES:END -->`. The current block
runs from the first `<!-- OSQ:RULES:START -->` in `agents` through the
first `<!-- OSQ:RULES:END -->`, and there is none when either marker is
missing or the end comes before the start. When the current block differs
from the expected one, the first error is:

- `` AGENTS.md is missing its project rules block; run `osq init` `` when there is no current block.
- `` AGENTS.md has an unexpected project rules block; run `osq init` `` when there is no expected block.
- `` AGENTS.md project rules block is out of date; run `osq init` `` otherwise.

When the number of system-wide ADRs exceeds `max_project_rules`, the next
error is `AGENTS.md holds <count> project rules, more than
limits.maxProjectRules (<max>)`. The function reads no file.

#### Scenario: Project rules errors
- **WHEN** a test reads ADRs with `read_decisions(root, "decisions", "openspec")` from a new scratch root holding the row's files and calls `project_rules_errors` with them, the row's `AGENTS.md` text and the row's maximum. `<keep>` is `decisions/001-keep.md` holding `---\nstatus: accepted\napplies_to: all\nrule: Keep it.\n---\n# 001. Keep\n`, `<also>` is `decisions/002-also.md` holding `---\nstatus: accepted\napplies_to: all\nrule: Also.\n---\n# 002. Also\n`, and `<rules>` is `<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it. ADR 001\n<!-- OSQ:RULES:END -->\n`
- **THEN** it returns the row's errors, in order, separated here by ` | `:

| Files | AGENTS.md | Maximum | Errors |
|---|---|---|---|
| none | empty | 10 | none |
| none | `<rules>` | 10 | `` AGENTS.md has an unexpected project rules block; run `osq init` `` |
| `<keep>` | empty | 10 | `` AGENTS.md is missing its project rules block; run `osq init` `` |
| `<keep>` | `# Agents\n\n<rules>\nMore.\n` | 10 | none |
| `<keep>` | `<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it now. ADR 001\n<!-- OSQ:RULES:END -->\n` | 10 | `` AGENTS.md project rules block is out of date; run `osq init` `` |
| `<keep>` | `<!-- OSQ:RULES:END -->\n<!-- OSQ:RULES:START -->\n` | 10 | `` AGENTS.md is missing its project rules block; run `osq init` `` |
| `<keep>` | `<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it. ADR 001\n` | 10 | `` AGENTS.md is missing its project rules block; run `osq init` `` |
| `<keep>`, `<also>` | `<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it. ADR 001\n- Also. ADR 002\n<!-- OSQ:RULES:END -->\n` | 2 | none |
| `<keep>`, `<also>` | `<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it. ADR 001\n- Also. ADR 002\n<!-- OSQ:RULES:END -->\n` | 1 | `AGENTS.md holds 2 project rules, more than limits.maxProjectRules (1)` |
| `<keep>`, `<also>` | empty | 1 | `` AGENTS.md is missing its project rules block; run `osq init` `` \| `AGENTS.md holds 2 project rules, more than limits.maxProjectRules (1)` |
| `decisions/001-later.md` `---\nstatus: proposed\napplies_to: all\nrule: Later.\n---\n# 001. Later\n` | empty | 0 | none |
| `openspec/specs/alpha/spec.md` `x`, `decisions/001-alpha.md` `---\nstatus: accepted\napplies_to: [alpha]\nrule: Alpha only.\n---\n# 001. Alpha\n` | `<rules>` | 10 | `` AGENTS.md has an unexpected project rules block; run `osq init` `` |
