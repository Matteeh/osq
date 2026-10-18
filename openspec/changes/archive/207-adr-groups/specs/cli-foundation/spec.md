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
`accepted`, or `superseded`; `applies_to`, either `all` or a list whose
entries are capability names or `group:<name>`; `rule`, one sentence saying
what a spec must do; and, on a superseded ADR, `superseded_by`, the number of
its replacement. An entry `group:<name>` SHALL name every capability whose
sidecar group is `<name>`: each living capability's `osq.yml`, and each
`specs/<capability>/osq.yml` of an active change folder for a capability with
no living sidecar. An ADR's `appliesTo` SHALL keep the entries as written,
and its `governs` SHALL be `all`, or the capabilities its entries name,
sorted and without repeats. Only accepted ADRs SHALL take effect. An accepted
ADR SHALL govern a change when it applies to `all` or names a capability the
change writes. A missing decisions folder SHALL read as no ADRs.

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

#### Scenario: ADR applying to a group
- **WHEN** living `pricing` and `invoices` have sidecar group `sales`, living `ledger` has group `books`, an active change folder holds `specs/quotes/osq.yml` with group `sales`, and ADR 009 has `applies_to` as below
- **THEN** ADR 009's `appliesTo` and `governs` are as below:

| `applies_to` | `appliesTo` | `governs` |
|---|---|---|
| `[group:sales]` | `["group:sales"]` | `["invoices", "pricing", "quotes"]` |
| `[group:sales, ledger]` | `["group:sales", "ledger"]` | `["invoices", "ledger", "pricing", "quotes"]` |
| `[group:sales, pricing]` | `["group:sales", "pricing"]` | `["invoices", "pricing", "quotes"]` |
| `[group:empty]` | `["group:empty"]` | `[]` |
| `all` | `all` | `all` |

#### Scenario: Group ADR governs a change
- **WHEN** accepted ADR 009 applies to `[group:sales]` and a change writes `quotes`, whose sidecar in the change folder names `sales`
- **THEN** `governingAdrs` for that change's written capabilities lists ADR 009

### Requirement: Architecture decision validation
Validation SHALL report an error for an ADR whose `status` is not one of the
three values, an accepted ADR without a valid `applies_to`, an accepted ADR
whose `rule` is missing, spans more than one line, or is longer than
`limits.maxRuleLength` characters, and a superseded ADR whose `superseded_by`
is missing or names no existing ADR. It SHALL report a warning for each
ignored file, for each capability name in `applies_to` that has no living
spec, since the capability may not exist yet, and for each `group:<name>`
entry that no living capability's sidecar names, as
`<path>: applies_to group "<name>" has no living capability`.

#### Scenario: Rule too long
- **WHEN** an accepted ADR's rule is one character longer than `limits.maxRuleLength`
- **THEN** validation reports an error naming the ADR and the limit

#### Scenario: Future capability
- **WHEN** an accepted ADR applies to `ingress` and no living spec named `ingress` exists
- **THEN** validation reports a warning, not an error

#### Scenario: Group validation
- **WHEN** an accepted ADR `decisions/009-sales.md` applies to the group below, living `pricing` has sidecar group `sales`, and only an active change folder's sidecar names group `drafts`
- **THEN** validation reports the warnings below and no error:

| `applies_to` | Warnings |
|---|---|
| `[group:sales]` | none |
| `[group:drafts]` | `decisions/009-sales.md: applies_to group "drafts" has no living capability` |
| `[group:empty]` | `decisions/009-sales.md: applies_to group "empty" has no living capability` |
