//! The land view of an archived change.

mod gates;
mod read;

use osq_kernel_vcs::DiffStat;

use crate::events::{Event, read};
use crate::facts::LandFacts;
use crate::model::Change;

pub(crate) use read::{Capability, Disclosure};

/// Everything the land view prints, read once from files, refs and events.
pub(crate) struct View {
    /// The archived change folder's name.
    pub(crate) folder: String,
    /// Whether the default branch holds the archived folder; none with git off.
    pub(crate) landed: Option<bool>,
    /// The default branch name; none with git off.
    pub(crate) default_branch: Option<String>,
    /// The commits the default branch gained, when its change branch exists.
    pub(crate) main_commits: Option<u64>,
    /// The runs osq recorded while archiving the change.
    pub(crate) gates: Vec<gates::Gate>,
    /// What the change's branch changed under `openspec`.
    pub(crate) diff: Option<DiffStat>,
    /// The delta capabilities, in capability name order.
    pub(crate) capabilities: Vec<read::Capability>,
    /// Each result file with a real disclosure.
    pub(crate) disclosures: Vec<read::Disclosure>,
    /// The change-level halt marker, when it exists.
    pub(crate) halt: Option<read::Halt>,
    /// The last sync and any stop that came after it.
    pub(crate) sync: read::SyncState,
}

/// The land-view lines, or none for a change that was not archived.
///
/// Implements: rust-show/show-land-lines
pub(super) fn lines(change: &Change, facts: Option<&LandFacts>) -> Vec<String> {
    if !change.archived {
        return Vec::new();
    }
    let events = read(change);
    let view = view(change, facts, &events.timeline);
    render(&view)
}

/// The land-view facts of one archived change.
///
/// Implements: rust-show/show-json
pub(super) fn view(change: &Change, facts: Option<&LandFacts>, timeline: &[Event]) -> View {
    let commands = read::commands(change);
    let gates = gates::build(timeline, &commands.verify, commands.check.as_deref());
    View {
        folder: change.folder.clone(),
        landed: facts.map(|facts| facts.landed),
        default_branch: facts.map(|facts| facts.default_branch.clone()),
        main_commits: facts.and_then(|facts| facts.main_commits),
        gates,
        diff: facts.and_then(|facts| facts.diff),
        capabilities: read::capabilities(change),
        disclosures: read::disclosures(change),
        halt: read::halt(change),
        sync: read::sync(change),
    }
}

/// The land-view lines of one view, without a leading check for archiving.
///
/// Implements: rust-show/show-land-lines
fn render(view: &View) -> Vec<String> {
    let mut lines = vec![String::new(), headline(view)];
    lines.extend(gate_lines(&view.gates));
    if let Some(diff) = view.diff {
        lines.push(format!(
            "  Diff: {} files, +{} -{}",
            diff.files, diff.added, diff.removed
        ));
    }
    lines.extend(capability_lines(&view.capabilities));
    if let Some(line) = disclosure_line(&view.disclosures) {
        lines.push(line);
    }
    if let Some(halt) = &view.halt {
        let reason = halt.reason.as_deref().unwrap_or("unknown");
        lines.push(format!("  Halted: {reason}: {}", first_line(&halt.message)));
    }
    if let Some(stop) = &view.sync.stop {
        lines.push(format!(
            "  Sync stopped: {}: {}",
            stop.reason,
            first_line(&stop.message)
        ));
    }
    lines
}

/// The `Land:` headline for the change's landed state.
fn headline(view: &View) -> String {
    let Some(landed) = view.landed else {
        return "Land: git is off".to_owned();
    };
    if landed {
        return "Land: landed".to_owned();
    }
    let Some(commits) = view.main_commits else {
        return format!("Land: not landed; branch osq/{} not found", view.folder);
    };
    let branch = view.default_branch.as_deref().unwrap_or("main");
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
fn capability_lines(capabilities: &[Capability]) -> Vec<String> {
    if capabilities.is_empty() {
        return Vec::new();
    }
    let mut lines = vec!["  Spec changes:".to_owned()];
    lines.extend(capabilities.iter().map(|capability| {
        format!(
            "    {}: {} added, {} modified, {} removed, {} renamed",
            capability.name,
            capability.added.len(),
            capability.modified.len(),
            capability.removed.len(),
            capability.renamed.len()
        )
    }));
    lines
}

/// The one-line disclosure summary, or no line when nothing was disclosed.
fn disclosure_line(disclosures: &[Disclosure]) -> Option<String> {
    let mut parts = Vec::new();
    for disclosure in disclosures {
        if disclosure.deviated.is_some() {
            parts.push(format!("task {} deviated", disclosure.task));
        }
        if disclosure.outside_scope.is_some() {
            parts.push(format!("task {} outside scope", disclosure.task));
        }
    }
    (!parts.is_empty()).then(|| format!("  Disclosures: {}", parts.join(", ")))
}
