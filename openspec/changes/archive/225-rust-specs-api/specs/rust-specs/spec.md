# Spec Delta: rust-specs

## ADDED Requirements

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
| `document` | `ChecklistItem`, `Frontmatter`, `Proposal`, `Sidecar`, `SidecarError`, `SyntaxError`, `TaskFile`, `VerifyStarts`, `parse_frontmatter`, `parse_proposal`, `parse_sidecar`, `parse_task_file`, `parse_task_list` |
| `markdown` | `Delta`, `LivingSpec`, `Outcome`, `Rename`, `RenameSide`, `Requirement`, `Scenario`, `UnpairedRename`, `code_ownership`, `js_trim`, `normalize_requirement_name`, `parse_delta`, `parse_living_spec`, `parse_requirement`, `parse_scenario`, `section` |
| `merge` | `MergeChangeError`, `MergeError`, `MergedSpec`, `merge_change`, `merge_delta`, `merge_living_spec` |
| `owners` | `CapabilityOwnership`, `owner_capabilities`, `read_capability_ownership`, `scope_covers_path` |
| `read` | `SpecsError`, `read_delta`, `read_living_spec`, `read_proposal`, `read_sidecar`, `read_task_file`, `read_task_list` |
| `validate` | `FindingCode`, `SpecFinding`, `check_delta_targets`, `validate_change`, `validate_delta`, `validate_living_spec`, `validate_living_specs`, `validate_merged_change` |

#### Scenario: Specs kernel public functions are tagged
- **WHEN** each `pub fn` under `crates/kernel/specs/src` is read, methods included
- **THEN** the doc comment directly above it holds a line `Implements: rust-specs/<requirement>`, and the four methods name these requirements:

| Method | Implements |
|---|---|
| `FindingCode::as_str` | `rust-specs/validation-findings` |
| `FindingCode::fix` | `rust-specs/validation-findings` |
| `MergeError::capability` | `rust-specs/merge-refusals` |
| `MergeError::requirement` | `rust-specs/merge-refusals` |
