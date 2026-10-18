# docs Specification

## Purpose
Gives a new developer, human or agent, one page per capability and one per
ADR, built from the living specs, the ADRs, the traceability links and the
archive, so the pages cannot drift from them.

## Requirements

### Requirement: Code ownership
<!-- source: src/docs/**, tests/docs-*.test.ts, tests/docs-support.ts -->
The docs capability SHALL own the capability and ADR page models, their
Markdown rendering, the `osq docs` command, the `docs` slice registration,
and their tests.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for the page models, the Markdown rendering, or `osq docs`
- **THEN** system maps `src/docs/**`, `tests/docs-*.test.ts` and `tests/docs-support.ts` to docs

### Requirement: Docs configuration
The `docs` slice SHALL register the config block `docs` with
`recentChanges`, the most archived changes a capability page lists, default
5. A missing block SHALL resolve to the default. A `recentChanges` that is not
a positive integer SHALL fail loading with `docs.recentChanges must be a
positive integer`.

#### Scenario: Docs config values
- **WHEN** `osq.config.ts` sets the `docs` block below
- **THEN** the loaded config is as below:

| `docs` block | Loaded |
|---|---|
| unset | `{ recentChanges: 5 }` |
| `{ recentChanges: 2 }` | `{ recentChanges: 2 }` |
| `{ recentChanges: 0 }` | fails with `docs.recentChanges must be a positive integer` |

### Requirement: Capability page model
`buildCapabilityPages(projectRoot, config)` SHALL return one page per living
capability, in name order, each with:

- `name`, `group` (the living sidecar's group, or null) and `purpose` (the
  living spec's Purpose text, trimmed);
- `requirements`, in the living spec's order, each with `name`, `scenarios`
  (its scenario names in order) and `shall`: the first sentence of its text
  that holds `SHALL`, or its first sentence when none does, read from the text
  before its first scenario with HTML comments removed and whitespace
  collapsed, where a sentence ends at `.`, `!` or `?` followed by whitespace
  or the end of the text;
- `decisions`: every accepted ADR whose `applies_to` is `all` or names the
  capability, in number order, each with `number`, `title`, `rule` and
  `appliesToAll`;
- `ownership`: the globs of its Code ownership `source` comment, in order;
- `codeMap`: null unless the capability is opted in to traceability, else one
  entry per scenario in spec order with `requirement`, `scenario`,
  `functions` (each function the system graph's `serves` edges tie to the
  scenario, as `file`, `line` and `name`, sorted by file then line) and
  `tests` (each test file its `proves` edges tie to the scenario, sorted);
- `recentChanges`: the archived changes whose delta writes the capability,
  by change number, newest first, at most `docs.recentChanges`, each with
  `id`, `folder`, `archivedOn` (the UTC day of its `archived` event, or null)
  and `goal`, the first sentence of its Goal, or empty.

It SHALL read the specs with the existing spec parser, the ADRs with
`readDecisions`, the code map from `getSystemGraph`, and the changes with
`listArchivedChanges`, and SHALL write nothing.

#### Scenario: Pages of the docs fixture
- **WHEN** the pages are built for the docs fixture: the `fixture/trace/pricing` project with traceability on for `pricing`, `pricing` in group `billing` owning `src/pricing/**` and `tests/pricing-*.test.ts`, an ungrouped `invoices` capability, ADR 001 `Money in Integer Cents` accepted for `pricing`, ADR 002 `Log Every Amount` accepted for `all`, ADR 003 `Yearly Invoice Numbers` superseded by ADR 004, ADR 004 `Gapless Invoice Numbers` accepted for `invoices`, and archived changes 001 to 007 writing `pricing` and 008 writing `invoices`, change `<n>` archived on 2026-10-0`<n>` with the Goal `Change <n> goal. More text.`
- **THEN** the pages hold the values below:

| Page | Field | Value |
|---|---|---|
| `invoices` | `group` | null |
| `invoices` | first requirement's `shall` | `The system SHALL number invoices without gaps.` |
| `invoices` | `decisions` numbers | `002`, `004` |
| `invoices` | `codeMap` | null |
| `invoices` | `recentChanges` ids | `008` |
| `pricing` | `group` | `billing` |
| `pricing` | requirement names | `Volume pricing`, `Percentage codes`, `Code ownership` |
| `pricing` | first requirement's `shall` | `The engine SHALL price every unit in a quote at the tier its quantity falls in.` |
| `pricing` | `decisions` numbers | `001`, `002` |
| `pricing` | `ownership` | `src/pricing/**`, `tests/pricing-*.test.ts` |
| `pricing` | code map entry for `Volume discount tiers` | function `quote` at `src/pricing/quote.ts` line 33, test `tests/pricing-quote.test.ts` |
| `pricing` | `recentChanges` ids | `007`, `006`, `005`, `004`, `003` |
| `pricing` | first recent change | `archivedOn` `2026-10-07`, `goal` `Change 7 goal.` |

#### Scenario: Recent change limit
- **WHEN** the pages are built for the docs fixture with `docs.recentChanges` 2
- **THEN** the `pricing` page lists changes `007` and `006` only

### Requirement: ADR page model
`buildAdrPages(projectRoot, config)` SHALL return one page per ADR
`readDecisions` reads, in number order, each with `number`, `title`,
`status`, `date`, `path`, `rule`, `appliesTo` and `supersededBy` as
`readDecisions` reads them; `capabilities`, every living capability name in
order when `appliesTo` is `all`, the capabilities its `governs` holds when it
lists some, group members included, and empty otherwise; and `body`, the
file's text after its frontmatter with its first `# ` heading line removed,
trimmed.

#### Scenario: ADR pages of the docs fixture
- **WHEN** the ADR pages are built for the docs fixture
- **THEN** they hold the values below:

| ADR | Field | Value |
|---|---|---|
| `001` | `title` | `Money in Integer Cents` |
| `001` | `capabilities` | `pricing` |
| `001` | `body` starts with | `Date: 2026-09-20` |
| `002` | `capabilities` | `invoices`, `pricing` |
| `003` | `status` | `superseded` |
| `003` | `supersededBy` | `004` |

#### Scenario: ADR page of a group ADR
- **WHEN** living `pricing` and `invoices` have sidecar group `sales` and an accepted ADR applies to `[group:sales]`
- **THEN** its page has `appliesTo` `["group:sales"]` and `capabilities` `invoices`, `pricing`

### Requirement: Docs site model
`buildDocsSite(projectRoot, config)` SHALL return `{ version: 1, groups,
capabilities, adrs }`, where `capabilities` is `buildCapabilityPages` and
`adrs` is `buildAdrPages`. `groups` SHALL hold one entry per group name, each
`{ name, capabilities }` with its capability names in order, groups sorted by
name, and the capabilities with no group last under the name `ungrouped`.
Building it twice from the same tree SHALL give identical `serializeWebJson`
output.

#### Scenario: Groups of the docs fixture
- **WHEN** the site is built for the docs fixture
- **THEN** `groups` is `billing` holding `pricing`, then `ungrouped` holding `invoices`, and a second build serializes to the same string

### Requirement: Docs command
`osq docs [--out <dir>]` SHALL write the docs site as Markdown under `--out`,
default `docs/osq`, resolved against the project root: `index.md`,
`capabilities/<name>.md` per capability and `adrs/<number>.md` per ADR. It
SHALL remove every other `.md` file directly in `capabilities/` and `adrs/`
there, write nothing outside `--out`, and print `wrote <n> pages to <dir>`,
counting the index. The same tree SHALL give byte-identical files. The `docs`
slice SHALL register the command in the `Inspection` help group and load its
code through `import()`.

- `index.md` SHALL start `# Capabilities`, list each group as `## <group>`
  with one line `- [<name>](capabilities/<name>.md): <purpose>` per
  capability, then `# Decisions` with one line
  `- [ADR <number>: <title>](adrs/<number>.md) (<status>)` per ADR.
- A capability page SHALL start `# <name>`, then `Group: <group>` (or
  `ungrouped`), its purpose, and the sections `## Requirements` (a `### <name>`
  per requirement with its `shall` sentence and one `- Scenario: <name>` line
  per scenario), `## Decisions` (one line
  `- [ADR <number>: <title>](../adrs/<number>.md): <rule>` per decision, or
  `None`), `## Code ownership` (one `` - `<glob>` `` line per glob), `## Code
  map` only when `codeMap` is not null (a `### <requirement>: <scenario>` per
  entry with one `` - `<file>:<line>` <name> `` line per function and one
  `` - test `<file>` `` line per test), and `## Recent changes` (one line
  `- <id> <archivedOn or undated>: <goal>` per change, or `None`).
- An ADR page SHALL start `# ADR <number>: <title>`, then `Status: <status>`,
  with `, superseded by [ADR <n>](<n>.md)` when superseded, then `Applies to:`
  followed by `all` or the capability links
  `[<name>](../capabilities/<name>.md)` joined with `, ` (or `none`), then
  `Rule: <rule>` when the rule is not empty, then its body.

#### Scenario: Docs written from the fixture
- **WHEN** `osq docs --out site` runs in the docs fixture, where `site/capabilities/old.md` and `site/notes.txt` already exist
- **THEN** it prints `wrote 7 pages to site`, writes `site/index.md`, `site/capabilities/invoices.md`, `site/capabilities/pricing.md` and `site/adrs/001.md` to `site/adrs/004.md`, removes `site/capabilities/old.md`, keeps `site/notes.txt`, and a second run leaves every file byte-identical

#### Scenario: Page lines from the fixture
- **WHEN** `osq docs --out site` has run in the docs fixture
- **THEN** the files hold the lines below:

| File | Line |
|---|---|
| `site/index.md` | `- [pricing](capabilities/pricing.md): Prices quotes by volume tier and percentage code, in integer cents.` |
| `site/index.md` | `- [ADR 003: Yearly Invoice Numbers](adrs/003.md) (superseded)` |
| `site/capabilities/pricing.md` | `- [ADR 001: Money in Integer Cents](../adrs/001.md): Every amount is an integer number of cents, and a quote rounds once, half up.` |
| `site/capabilities/pricing.md` | `` - `src/pricing/quote.ts:33` quote `` |
| `site/capabilities/pricing.md` | `- 007 2026-10-07: Change 7 goal.` |
| `site/capabilities/invoices.md` | `Group: ungrouped` |
| `site/adrs/003.md` | `Status: superseded, superseded by [ADR 004](004.md)` |
| `site/adrs/002.md` | `Applies to: all` |
