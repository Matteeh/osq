## ADDED Requirements

### Requirement: Land facts
`read_land_facts(folder: &Path) -> LandFacts` in `osq-kernel-storage` SHALL
read one change folder into the facts a land needs, as TypeScript's
`buildSquashMessage` in `src/core/run/squash-message.ts`, `readLandedAt`,
`listDeltaCapabilities` and `parseStackedOn` read them. It SHALL never
fail: a file that is missing or cannot be read counts as absent, and a line
it cannot use is passed over. `LandFacts` and `LandTask` SHALL be public,
exported from the crate root, and derive `Debug`, `Clone`, `PartialEq`,
`Eq` and `Default`. `LandFacts` SHALL hold:

- `goal: String`: `goal_section` of `markdown_body` of `proposal.md`, or
  the empty string when there is no `proposal.md` or no `## Goal` section.
- `tasks: Vec<LandTask>`: one per item rust-specs `parse_task_list` gives
  for `tasks.md`, in its order, and none without `tasks.md`.
- `base`, `approved` and `approver: Option<String>`: the trimmed text of
  `.run/base`, `.run/approved` and `.run/approver`, and `None` when the
  file is missing or its trimmed text is empty.
- `archived_at: Option<String>`: the `timestamp` of the last line of
  `.run/events/change.jsonl` that parses as a JSON object whose `type` is
  the string `archived` and whose `timestamp` is a string `timestamp_ms`
  accepts, and `None` without one.
- `capabilities: Vec<String>`: the names of the directories directly under
  `specs/`, sorted, and none without `specs/`.
- `stacked_on: Vec<String>`: for each line of `.run/stacked-on` that holds
  at least two words split on whitespace, its first word, in file order.

`LandTask` SHALL hold `number: u32`, the item's number or else its
1-based position in the list; `title: String`, the item's title; `manual:
bool`, true only when `.run/done/<number>` has frontmatter whose `manual`
key is the YAML boolean `true`; and `model` and `version:
Option<String>`, read from the last line of `.run/events/<number>.jsonl`
that parses as a JSON object whose `type` is the string `started` and
whose `data` is an object whose `harness`, `model` and `osqVersion` are
all strings: `model` is `<harness> <model>` and `version` is the
`osqVersion`, and both are `None` without such a line.

#### Scenario: Land facts of an archived change
- **WHEN** `read_land_facts` reads a copy of `tests/fixtures/land-change/001-alpha-orders`, which is `openspec/changes/256-rust-land-feature/fixture/001-alpha-orders` copied byte for byte
- **THEN** it gives these facts:

| Field | Value |
|---|---|
| `goal` | `Orders gain alpha.` |
| `tasks` | number 1, title `When one, two`, manual true, model `pi deepseek/flash`, version `0.3.0`; number 2, title `When three, four`, manual false, model `pi deepseek/flash`, version `0.3.1` |
| `base` | `abc123` |
| `approved` | `sha256:aaaa` |
| `approver` | `Mathias <m@example.invalid>` |
| `archived_at` | `2026-10-20T13:00:00.000Z` |
| `capabilities` | `orders` |
| `stacked_on` | none |

#### Scenario: Land facts pass over what they cannot use
- **WHEN** `read_land_facts` reads a folder holding only the row's files, written with `\n` escapes
- **THEN** it gives `LandFacts::default()` except for the row's facts:

| Files | Facts |
|---|---|
| none, and the folder does not exist | none |
| `proposal.md` holding `---\ntitle: A\n---\n## Verify\n\nx\n` | none |
| `proposal.md` holding `---\ntitle: A\n---\n## Goal\n\n  Ship it.  \n\n## Verify\n\nx\n` | `goal` `Ship it.` |
| `.run/base` holding `  \n` and `.run/approver` holding `\n` | none |
| `.run/approved` holding `  sha256:b  \n` | `approved` `sha256:b` |
| `tasks.md` holding `- [ ] Unnumbered\n- [x] 7. Seven\n` | `tasks` number 1, title `Unnumbered`; number 7, title `Seven`; each manual false, no model, no version |
| `tasks.md` holding `- [ ] 1. One\n` and `.run/done/1` holding `---\nmanual: "true"\n---\n` | `tasks` number 1, title `One`, manual false |
| `tasks.md` holding `- [ ] 1. One\n` and `.run/done/1` holding `manual: true\n` | `tasks` number 1, title `One`, manual false |
| `tasks.md` holding `- [ ] 1. One\n` and `.run/events/1.jsonl` holding `{"type":"started","data":{"harness":"pi","model":"m","osqVersion":"1"}}\n{"type":"started","data":{"harness":"pi","model":7,"osqVersion":"2"}}\nnot json\n` | `tasks` number 1, title `One`, manual false, model `pi m`, version `1` |
| `tasks.md` holding `- [ ] 1. One\n` and `.run/events/1.jsonl` holding `{"type":"finished","data":{"harness":"pi","model":"m","osqVersion":"1"}}\n["started"]\n` | `tasks` number 1, title `One`, manual false, no model, no version |
| `.run/events/change.jsonl` holding `{"type":"archived","timestamp":"2026-10-20T13:00:00.000Z"}\n{"type":"archived","timestamp":"yesterday"}\n{"type":"archived","timestamp":7}\nnot json\n` | `archived_at` `2026-10-20T13:00:00.000Z` |
| `.run/events/change.jsonl` holding `{"type":"archived","timestamp":"2026-10-20T13:00:00.000Z"}\n{"type":"archived","timestamp":"2026-10-21T08:00:00.000Z","data":{}}\n` | `archived_at` `2026-10-21T08:00:00.000Z` |
| `specs/b/spec.md`, `specs/a/spec.md` and `specs/notes.md` | `capabilities` `a`, `b` |
| `.run/stacked-on` holding `001-a sha256:x\nlonely\n\n002-b sha256:y overlap orders\n` | `stacked_on` `001-a`, `002-b` |
