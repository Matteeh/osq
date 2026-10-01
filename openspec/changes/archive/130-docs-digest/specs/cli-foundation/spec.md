# Spec Delta: cli-foundation

## MODIFIED Requirements

### Requirement: Architecture decision records
osq SHALL read ADRs from the markdown files directly under `paths.decisions`,
leaving out `README.md`, through one module, `src/core/foundation/decisions.ts`,
that every other part of osq uses. A file whose YAML frontmatter has a `status`
key SHALL be an ADR. Any other markdown file SHALL be ignored and listed as
ignored. An ADR's number SHALL be the leading digits of its file name, as
written, such as `007`, and ADR numbers SHALL compare by numeric value, so
`ADR 7` names `007`. Its title SHALL be its first `# ` heading without a
leading `<number>.`. Its date SHALL be the first `YYYY-MM-DD` on the first
body line that starts with `Date:`, or null when no such line or date exists.
Frontmatter SHALL carry `status`, one of `proposed`,
`accepted`, or `superseded`; `applies_to`, either `all` or a list of
capability names; `rule`, one sentence saying what a spec must do; and, on a
superseded ADR, `superseded_by`, the number of its replacement. Only accepted
ADRs SHALL take effect. An accepted ADR SHALL govern a change when it applies
to `all` or names a capability the change writes. A missing decisions folder
SHALL read as no ADRs.

#### Scenario: Frontmatter ADR
- **WHEN** `decisions/007-ui-framework.md` has frontmatter `status: accepted`, `applies_to: all`, `rule: UI components use React.` and the heading `# 007. UI framework`
- **THEN** osq reads ADR `007` titled `UI framework`, applying to all, with that rule

#### Scenario: Plain markdown ADR
- **WHEN** a file under the decisions folder has no frontmatter
- **THEN** it is listed as ignored and takes no effect

#### Scenario: ADR date
- **WHEN** an ADR's body has the line `Date: 2026-09-18. Revised: 2026-09-26.` under its heading
- **THEN** osq reads its date as `2026-09-18`

#### Scenario: ADR without a date
- **WHEN** an ADR's body has no line starting with `Date:`, or that line holds no `YYYY-MM-DD`
- **THEN** its date reads as null and the ADR is otherwise read as before
