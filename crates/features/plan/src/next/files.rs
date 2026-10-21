//! The texts a new queue change folder holds.

use crate::queue::QueueItem;

/// The proposal template TypeScript's `FALLBACK_PROPOSAL_MD` holds.
pub(super) const PROPOSAL: &str = r#"---
title: Change title
depends_on: []
verify: node -e "process.exit(0)"
features:
  reads: []
---
## Goal

What problem this change solves and why.

## Verify

`node -e "process.exit(0)"`

Replace this planning sentinel, here and in the frontmatter, with the command
that verifies the completed change's final tree, and say what it proves.

## Non-goals

- What this change deliberately does not do.

## Surface

<!-- User-facing names this change adds, changes, or removes: commands, flags,
config keys, frontmatter fields, document sections, dead reasons, and event
types. Replace None with one line per name, such as
"- Added: `osq init --refresh-schema` (flag)". -->
None

## Decisions

<!-- One line per accepted ADR that governs a capability this change writes,
saying what it means here, such as "ADR 009: the adapter is the only module
that imports dockerode." Start a line "Departs from ADR <n>:" to record a
departure and its reason. -->
None

## Assumptions

<!-- One line per assumption the plan rests on that the human should check
before approving, such as "Every caller passes an absolute path." -->
None

## Contract

### Requirement: <requirement name>

The system SHALL <observable behavior>.

#### Scenario: <scenario name>
- **WHEN** <condition>
- **THEN** <outcome>

## Human steps

None

## Delta

Delta specs live beside the proposal as `specs/<capability>/spec.md`. Each holds
the exact text the capability spec will contain after the change, under
`## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`,
or `## RENAMED Requirements`; a modified requirement repeats its full text. List
each delta here in one line and name any file two tasks share.

A delta that introduces a new capability also declares the files it owns in a
`### Requirement: Code ownership` block. Its `<!-- source: ... -->` comment lists
the owned path globs, comma-separated, and its scenario restates them:

```markdown
### Requirement: Code ownership
<!-- source: src/core/example.ts, src/cli/example.ts -->
The <capability> capability SHALL own <subsystems>.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for <capability>
- **THEN** system maps `src/core/example.ts` and `src/cli/example.ts` to <capability>
```
"#;

/// The tasks template TypeScript's `FALLBACK_TASKS_MD` holds.
pub(super) const TASKS_MD: &str =
    "# Tasks\n\n## 1. Section title\n\n- [ ] 1. When initial condition, expected outcome\n";

/// The first task TypeScript's `FALLBACK_TASK_1_MD` holds.
pub(super) const TASK_1_MD: &str = r#"---
title: When initial condition, expected outcome
verify: node -e "process.exit(0)"
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] Acceptance criterion 1
"#;

/// Seeds the proposal with the item's title, dependency ids and fix ids.
///
/// Implements: rust-plan/change-folder-files
pub(super) fn proposal(item: &QueueItem, dependencies: &[String], fixes: &[String]) -> String {
    let depends_on = format!("depends_on: [{}]", quoted(dependencies));
    let mut text = PROPOSAL.replace("title: Change title", &format!("title: {}", item.title));
    text = text.replace("depends_on: []", &depends_on);
    if !fixes.is_empty() {
        text = text.replace(
            &depends_on,
            &format!("{depends_on}\nfixes: [{}]", quoted(fixes)),
        );
    }
    text
}

/// Writes ids as double-quoted text joined by commas.
///
/// Implements: rust-plan/change-folder-files
fn quoted(ids: &[String]) -> String {
    ids.iter()
        .map(|id| format!("\"{id}\""))
        .collect::<Vec<_>>()
        .join(", ")
}

/// Builds the new brief with the item's queue metadata, date and body.
///
/// Implements: rust-plan/change-folder-files
pub(super) fn brief(item: &QueueItem, date: &str) -> String {
    format!(
        "---\nqueue_item: {}\nqueue_hash: {}\nplanner: null\ndate: {date}\n---\n\n{}\n",
        item.slug, item.hash, item.body
    )
}
