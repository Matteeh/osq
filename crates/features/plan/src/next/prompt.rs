//! Building the `plan-prompt.md` written into a new change folder.

use osq_kernel_specs::{Adr, AppliesTo};

/// The first section's fallback when `PLANNER.md` cannot be read.
const PLANNER_FALLBACK: &str = "# Planning a change for osq";

/// The `## Capability Specs` section's fixed sentence.
const SPECS_SENTENCE: &str = "All living specs. Read the requirements this change writes or whose code it uses, not whole specs: `osq spec <capability>` lists them and `osq spec <capability> <requirement>` prints one.";

/// The `## Architecture Decisions` section's fixed sentence.
const DECISIONS_SENTENCE: &str = "Read in full every ADR that applies to all, and every ADR that applies to a capability this change writes. Name each governing capability ADR in the proposal's ## Decisions section.";

/// The plain values the new change's prompt is built from.
pub(super) struct Prompt<'a> {
    /// The `PLANNER.md` text, or none when it cannot be read.
    pub(super) planner: Option<&'a str>,
    /// The change id.
    pub(super) id: &'a str,
    /// The proposal's title, or none when it holds no string title.
    pub(super) title: Option<&'a str>,
    /// The change folder's name.
    pub(super) folder: &'a str,
    /// The archived folder paths of the item's dependencies, in order.
    pub(super) dependencies: &'a [String],
    /// The living capability folder names, sorted.
    pub(super) capabilities: &'a [String],
    /// Every ADR `read_decisions` read, in its order.
    pub(super) decisions: &'a [Adr],
    /// The new `brief.md`.
    pub(super) brief: &'a str,
}

/// Builds the prompt from its plain values: trimmed sections joined by an empty line.
///
/// Implements: rust-plan/plan-prompt
pub(super) fn build(input: &Prompt<'_>) -> String {
    let mut sections = vec![
        planner(input.planner),
        change(input),
        specs(input.capabilities),
    ];
    if let Some(decisions) = decisions(input.decisions) {
        sections.push(decisions);
    }
    sections.push(format!("## Brief\n\n{}", input.brief.trim()));
    sections.join("\n\n")
}

/// The first section: `PLANNER.md` trimmed, or the fallback when it is absent.
///
/// Implements: rust-plan/plan-prompt
fn planner(text: Option<&str>) -> String {
    text.unwrap_or(PLANNER_FALLBACK).trim().to_owned()
}

/// The second section: the change's identity and its landed dependencies.
///
/// Implements: rust-plan/plan-prompt
fn change(input: &Prompt<'_>) -> String {
    let title = input.title.unwrap_or_default();
    let mut lines = vec![
        format!("# Change: {} - {title}", input.id),
        format!("Change ID: {}", input.id),
        format!("Change Folder: {}", input.folder),
    ];
    if !input.dependencies.is_empty() {
        let paths = input
            .dependencies
            .iter()
            .map(|path| format!("- {path}"))
            .collect::<Vec<_>>()
            .join("\n");
        lines.push(format!("Landed dependencies:\n{paths}"));
    }
    lines.join("\n")
}

/// The third section: every living capability spec path, or the sentence alone.
///
/// Implements: rust-plan/plan-prompt
fn specs(capabilities: &[String]) -> String {
    let paths = capabilities
        .iter()
        .map(|name| format!("- openspec/specs/{name}/spec.md"))
        .collect::<Vec<_>>()
        .join("\n");
    if paths.is_empty() {
        format!("## Capability Specs\n\n{SPECS_SENTENCE}")
    } else {
        format!("## Capability Specs\n\n{SPECS_SENTENCE}\n\n{paths}")
    }
}

/// The optional fourth section: one line per accepted ADR, or none without one.
///
/// Implements: rust-plan/plan-prompt
fn decisions(adrs: &[Adr]) -> Option<String> {
    let lines = adrs
        .iter()
        .filter(|adr| adr.status == "accepted")
        .map(decision)
        .collect::<Vec<_>>()
        .join("\n");
    if lines.is_empty() {
        None
    } else {
        Some(format!(
            "## Architecture Decisions\n\n{DECISIONS_SENTENCE}\n\n{lines}"
        ))
    }
}

/// One accepted ADR's prompt line.
///
/// Implements: rust-plan/plan-prompt
fn decision(adr: &Adr) -> String {
    format!(
        "- ADR {}: {}. Applies to: {}. Rule: {} Path: {}",
        adr.number,
        adr.title,
        scope(adr.applies_to.as_ref()),
        adr.rule,
        adr.path
    )
}

/// An ADR's scope: `all`, its `applies_to` names as written, or empty text.
///
/// Implements: rust-plan/plan-prompt
fn scope(applies_to: Option<&AppliesTo>) -> String {
    match applies_to {
        Some(AppliesTo::All) => "all".to_owned(),
        Some(AppliesTo::Capabilities(names)) => names.join(", "),
        None => String::new(),
    }
}
