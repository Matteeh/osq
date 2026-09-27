## MODIFIED Requirements

### Requirement: Result file sections
<!-- source: src/core/report/result-sections.ts, tests/result-sections.test.ts, tests/result-none-sections.test.ts -->
One parser in `src/core/report/result-sections.ts` SHALL read a result file's
sections. A heading SHALL match regardless of case, `#` count, surrounding
spaces, and a trailing colon, so `## deviated:` is `## Deviated` and
`## Touched:` is the `Touched:` line. A section that is empty or says only
`None` SHALL be absent. A section says only `None` when it has exactly one
non-blank line and that line, with a leading list marker (`-`, `*`, `+`, or
a number and `.`) and every `*` and `_` set aside, is the word `None` in any
case, alone or followed straight away by `.`, `;`, `,`, or `:` and any text.
The real disclosure sections of a task SHALL be `## Deviated`,
`## Missing context`, and `## Outside scope`; the parser SHALL also read every
task result file of a change into per-task disclosures. The parser SHALL also
read `## Blocked` as `blocked`, under the same matching and absence rules.
`## Blocked` SHALL NOT count as a disclosure.

#### Scenario: Heading drift
- **WHEN** a result file holds `## deviated:` with text, `## Missing context` saying `None`, and `##  Outside Scope` with text
- **THEN** the task has a deviated and an outside-scope disclosure and no missing-context disclosure

#### Scenario: Blocked section
- **WHEN** a result file holds `## blocked:` with text, and another holds `## Blocked` saying `none.`
- **THEN** the first parses with that text as `blocked`, the second with `blocked` null, and neither counts as a disclosure

#### Scenario: Written as a bullet or in bold
- **WHEN** sections say `- None.`, `* **None**`, `1. None`, and `_None_.`
- **THEN** each is absent

#### Scenario: None with an explanation
- **WHEN** sections say `None; the task is complete.` and `None. All acceptance lines are satisfied.`
- **THEN** each is absent

#### Scenario: A sentence that starts with None
- **WHEN** `## Blocked` says `None of the fixtures exist; I need a seed script`
- **THEN** `blocked` holds that text

#### Scenario: More than one line
- **WHEN** `## Deviated` holds `None.` and, on the next line, `- Renamed the helper.`
- **THEN** the task has a deviated disclosure holding both lines
