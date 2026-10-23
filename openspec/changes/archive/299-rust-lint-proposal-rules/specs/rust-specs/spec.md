## ADDED Requirements

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

## MODIFIED Requirements

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
