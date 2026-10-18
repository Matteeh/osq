# Spec Delta: rust-specs

## Purpose
The specs kernel of the Rust rewrite of osq: it reads the OpenSpec documents
osq uses, living specs, sidecars, delta specs, proposals, task files and
`tasks.md` checklists, into typed values with the rules TypeScript osq
parses them by. Validation and the delta merge build on these values (ADR
026). Nothing in it runs Node.

## ADDED Requirements

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
