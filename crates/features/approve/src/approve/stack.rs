//! Refusing a change that TypeScript would stack on an approved or archived one.

#[path = "stack/capabilities.rs"]
mod capabilities;
#[path = "stack/changes.rs"]
mod changes;
#[path = "stack/order.rs"]
mod order;
#[path = "stack/state.rs"]
mod state;
#[path = "stack/text.rs"]
mod text;

use std::collections::BTreeSet;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_config::Config;
use osq_kernel_specs::read_proposal;
use osq_kernel_vcs::GitVcs;

use crate::approve::{failed, find};

/// Refuses `folder` when TypeScript's `awaitedForApproval` would stack it.
///
/// # Errors
///
/// Returns a `Failed` error with the command `approve` and the stacking text
/// when the change would stack, and the display of a git error when a read
/// fails.
///
/// Implements: rust-approve/stacked-approval-refusal
pub(crate) fn refuse(repo: &Path, config: &Config, folder: &str) -> Result<(), FeatureError> {
    let vcs = GitVcs::new(repo).with_timeouts(&config.timeouts);
    let entries = changes::list(repo, config, &vcs)?;
    let declared = declared(repo, config, &vcs, &entries, folder)?;
    let overlaps = overlaps(repo, config, &vcs, &entries, folder, &declared)?;
    let folders = order::folders(declared, overlaps);
    if folders.is_empty() {
        return Ok(());
    }
    Err(failed(&text::stacked(folder, &folders)))
}

/// The `depends_on` folders that read approved or archived, in proposal order.
///
/// Implements: rust-approve/stacked-approval-refusal
fn declared(
    repo: &Path,
    config: &Config,
    vcs: &GitVcs,
    entries: &[osq_kernel_storage::ChangeEntry],
    folder: &str,
) -> Result<Vec<String>, FeatureError> {
    let path = repo
        .join("openspec")
        .join("changes")
        .join(folder)
        .join("proposal.md");
    let depends_on = read_proposal(&path)
        .map(|proposal| proposal.depends_on)
        .unwrap_or_default();
    let mut folders = Vec::new();
    for id in depends_on {
        let Some(entry) = entries
            .iter()
            .find(|entry| find::matches(&entry.folder, &id))
        else {
            continue;
        };
        if state::read(vcs, config, repo, &entry.folder)?.awaits() {
            folders.push(entry.folder.clone());
        }
    }
    Ok(folders)
}

/// The other approved or archived folders that share a delta capability.
///
/// Implements: rust-approve/stacked-approval-refusal
fn overlaps(
    repo: &Path,
    config: &Config,
    vcs: &GitVcs,
    entries: &[osq_kernel_storage::ChangeEntry],
    folder: &str,
    declared: &[String],
) -> Result<BTreeSet<String>, FeatureError> {
    let own = capabilities::read(&repo.join("openspec").join("changes").join(folder));
    let mut overlaps = BTreeSet::new();
    if own.is_empty() {
        return Ok(overlaps);
    }
    let mut seen = BTreeSet::new();
    for entry in entries {
        if entry.folder == folder || !seen.insert(entry.folder.clone()) {
            continue;
        }
        if declared.contains(&entry.folder) || capabilities::read(&entry.path).is_disjoint(&own) {
            continue;
        }
        if state::read(vcs, config, repo, &entry.folder)?.awaits() {
            overlaps.insert(entry.folder.clone());
        }
    }
    Ok(overlaps)
}
