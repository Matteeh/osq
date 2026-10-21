//! The pure refusals a land makes before it reports or writes anything.

use std::collections::{BTreeMap, HashSet};
use std::path::Path;

use osq_kernel_storage::LandFacts;
use osq_kernel_vcs::StatusEntry;

/// One worktree change as the earlier-change rule compares it.
#[derive(Clone, Debug)]
pub(crate) struct ComparedChange {
    /// The change's folder name.
    pub(crate) folder: String,
    /// The change's archived facts.
    pub(crate) facts: LandFacts,
    /// Whether the default branch already holds its archived folder.
    pub(crate) landed: bool,
    /// Whether its branch holds an archived approval.
    pub(crate) approved: bool,
}

/// The stacked-change refusal, unless the change names no base.
///
/// Implements: rust-land/land-refusals
pub(crate) fn stacked(folder: &str, facts: &LandFacts) -> Option<String> {
    if facts.stacked_on.is_empty() {
        return None;
    }
    Some(format!(
        "{folder} is stacked on {}; Rust land does not land stacked changes yet",
        facts.stacked_on.join(", ")
    ))
}

/// The checkout-branch refusal, unless HEAD is on the default branch.
///
/// Implements: rust-land/land-refusals
pub(crate) fn checkout_branch(default_branch: &str, branch: Option<&str>) -> Option<String> {
    match branch {
        Some(branch) if branch == default_branch => None,
        Some(branch) => Some(format!(
            "osq land runs on {default_branch}; the checkout is on {branch}"
        )),
        None => Some(format!(
            "osq land runs on {default_branch}; the checkout is on a detached HEAD"
        )),
    }
}

/// The unclean-worktree refusal, unless its status lists no entries.
///
/// Implements: rust-land/land-refusals
pub(crate) fn unclean_worktree(path: &Path, status: &[StatusEntry]) -> Option<String> {
    if status.is_empty() {
        return None;
    }
    let paths: Vec<&str> = status.iter().map(|entry| entry.path.as_str()).collect();
    Some(format!(
        "{} has uncommitted changes: {}; commit or discard them first",
        path.display(),
        paths.join(", ")
    ))
}

/// The first earlier change sharing a capability, unless none refuses.
///
/// Implements: rust-land/land-refusals
pub(crate) fn earlier_change(
    folder: &str,
    facts: &LandFacts,
    changes: &[ComparedChange],
) -> Option<String> {
    let mine = facts.archived_at.as_deref()?;
    let stacked = stacked_on(folder, changes);
    for other in changes {
        if stacked.contains(&other.folder) {
            continue;
        }
        if other.landed || !other.approved {
            continue;
        }
        let Some(theirs) = other.facts.archived_at.as_deref() else {
            continue;
        };
        if theirs < mine {
            let shared: Vec<&str> = facts
                .capabilities
                .iter()
                .filter(|capability| other.facts.capabilities.contains(capability))
                .map(String::as_str)
                .collect();
            if shared.is_empty() {
                continue;
            }
            return Some(format!(
                "{} archived before {folder} and also writes {}; land it first",
                other.folder,
                shared.join(", ")
            ));
        }
    }
    None
}

/// Every change stacked on `folder`, directly or through other changes.
///
/// Implements: rust-land/land-refusals
fn stacked_on<'a>(folder: &'a str, changes: &'a [ComparedChange]) -> HashSet<String> {
    let mut dependents: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for change in changes {
        for base in &change.facts.stacked_on {
            dependents
                .entry(base.as_str())
                .or_default()
                .push(change.folder.as_str());
        }
    }
    let mut stacked = HashSet::new();
    let mut frontier = vec![folder];
    while let Some(current) = frontier.pop() {
        for dependent in dependents.get(current).into_iter().flatten() {
            if stacked.insert((*dependent).to_owned()) {
                frontier.push(*dependent);
            }
        }
    }
    stacked
}
