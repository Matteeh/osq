//! The land view of an archived change.

mod gates;
mod read;

use crate::events::read;
use crate::facts::LandFacts;
use crate::model::Change;

/// The land-view lines, or none for a change that was not archived.
///
/// Implements: rust-show/show-land-lines
pub(super) fn lines(change: &Change, facts: Option<&LandFacts>) -> Vec<String> {
    if !change.archived {
        return Vec::new();
    }
    let events = read(change);
    let commands = read::commands(change);
    let gates = gates::build(
        &events.timeline,
        &commands.verify,
        commands.check.as_deref(),
    );
    let mut lines = vec![String::new(), headline(facts, &change.folder)];
    lines.extend(gate_lines(&gates));
    if let Some(diff) = facts.and_then(|facts| facts.diff) {
        lines.push(format!(
            "  Diff: {} files, +{} -{}",
            diff.files, diff.added, diff.removed
        ));
    }
    lines.extend(capability_lines(change));
    if let Some(line) = disclosure_line(change) {
        lines.push(line);
    }
    if let Some(halt) = read::halt(change) {
        let reason = halt.reason.as_deref().unwrap_or("unknown");
        lines.push(format!("  Halted: {reason}: {}", first_line(&halt.message)));
    }
    if let Some(stop) = read::sync_stop(change) {
        lines.push(format!(
            "  Sync stopped: {}: {}",
            stop.reason,
            first_line(&stop.message)
        ));
    }
    lines
}

/// The `Land:` headline for the change's landed state.
fn headline(facts: Option<&LandFacts>, folder: &str) -> String {
    let Some(facts) = facts else {
        return "Land: git is off".to_owned();
    };
    if facts.landed {
        return "Land: landed".to_owned();
    }
    let Some(commits) = facts.main_commits else {
        return format!("Land: not landed; branch osq/{folder} not found");
    };
    let branch = &facts.default_branch;
    if commits == 0 {
        return format!("Land: not landed; {branch} has not moved since archive");
    }
    let noun = if commits == 1 { "commit" } else { "commits" };
    format!(
        "Land: not landed; {branch} has {commits} new {noun} since archive, so osq land will sync and verify again"
    )
}

/// The first line of a message.
fn first_line(text: &str) -> &str {
    text.split('\n').next().unwrap_or("")
}

/// The `Gates at archive` block, or the none-recorded line.
fn gate_lines(gates: &[gates::Gate]) -> Vec<String> {
    if gates.is_empty() {
        return vec!["  Gates at archive: none recorded".to_owned()];
    }
    let mut lines = vec!["  Gates at archive:".to_owned()];
    lines.extend(gates.iter().map(gates::Gate::line));
    lines
}

/// The `Spec changes` block, or no lines without capabilities.
fn capability_lines(change: &Change) -> Vec<String> {
    let capabilities = read::capabilities(change);
    if capabilities.is_empty() {
        return Vec::new();
    }
    let mut lines = vec!["  Spec changes:".to_owned()];
    lines.extend(capabilities.iter().map(|capability| {
        format!(
            "    {}: {} added, {} modified, {} removed, {} renamed",
            capability.name,
            capability.added,
            capability.modified,
            capability.removed,
            capability.renamed
        )
    }));
    lines
}

/// The one-line disclosure summary, or no line when nothing was disclosed.
fn disclosure_line(change: &Change) -> Option<String> {
    let mut parts = Vec::new();
    for disclosure in read::disclosures(change) {
        if disclosure.deviated {
            parts.push(format!("task {} deviated", disclosure.task));
        }
        if disclosure.outside_scope {
            parts.push(format!("task {} outside scope", disclosure.task));
        }
    }
    (!parts.is_empty()).then(|| format!("  Disclosures: {}", parts.join(", ")))
}
