//! Step 3's living spec and archive rebuilds.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use osq_kernel_specs::{MergedSpec, merge_change};
use osq_kernel_vcs::{GitVcs, Vcs};

use super::{Kind, files, stop::Stop, text};

/// The living specs folder under the worktree.
const SPECS: &str = "openspec/specs";

/// Resolves archive conflicts and writes the default branch's living specs.
///
/// An archived change then reapplies its deltas; an active change leaves the
/// living specs with the default branch's text.
///
/// # Errors
///
/// Returns a `sync_failed` stop for a git write or a delta that does not merge.
///
/// Implements: rust-land/land-sync
pub(crate) fn rebuild(
    vcs: &GitVcs,
    worktree: &Path,
    change: &Path,
    kind: Kind,
    default_branch: &str,
    conflicts: &[String],
) -> Result<(), Stop> {
    let mut staged = BTreeSet::new();
    archive_conflicts(vcs, worktree, default_branch, conflicts, &mut staged)?;
    let mut capabilities = folders(&worktree.join(SPECS));
    capabilities.extend(folders(&change.join("specs")));
    capabilities.sort();
    capabilities.dedup();
    for capability in capabilities {
        let relative = format!("{SPECS}/{capability}/spec.md");
        let content = vcs
            .show(default_branch, &relative)
            .map_err(|error| Stop::vcs(&error))?;
        let target = worktree.join(&relative);
        if content.is_none() && !target.exists() {
            continue;
        }
        files::write_or_remove(&target, content.as_deref())
            .map_err(|error| Stop::failed(error.to_string()))?;
        staged.insert(relative);
    }
    stage(vcs, &staged)?;
    if kind == Kind::Active {
        return Ok(());
    }
    let merged = merge_change(change, &worktree.join(SPECS))
        .map_err(|error| Stop::failed(error.to_string()))?;
    for spec in &merged {
        apply(worktree, spec)?;
        let relative = format!("{SPECS}/{}/spec.md", spec.capability);
        if worktree.join(&relative).exists() {
            staged.insert(relative);
        } else {
            staged.remove(&relative);
        }
    }
    stage(vcs, &staged)
}

/// Writes the default branch's copy of each conflicting archive path.
///
/// Implements: rust-land/land-sync
fn archive_conflicts(
    vcs: &GitVcs,
    worktree: &Path,
    default_branch: &str,
    conflicts: &[String],
    staged: &mut BTreeSet<String>,
) -> Result<(), Stop> {
    for conflict in conflicts {
        if !text::is_under("openspec/changes/archive", conflict) {
            continue;
        }
        let content = vcs
            .show(default_branch, conflict)
            .map_err(|error| Stop::vcs(&error))?;
        files::write_or_remove(&worktree.join(conflict), content.as_deref())
            .map_err(|error| Stop::failed(error.to_string()))?;
        staged.insert(conflict.clone());
    }
    Ok(())
}

/// The directory names directly under `folder`, in byte order.
///
/// Implements: rust-land/land-sync
fn folders(folder: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(folder) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect()
}

/// Writes a merged living spec, or removes a capability the change empties.
///
/// Implements: rust-land/land-sync
fn apply(worktree: &Path, spec: &MergedSpec) -> Result<(), Stop> {
    let folder = worktree.join(SPECS).join(&spec.capability);
    let path = folder.join("spec.md");
    if let Some(text) = &spec.text {
        fs::create_dir_all(&folder).map_err(|error| Stop::failed(error.to_string()))?;
        fs::write(&path, text).map_err(|error| Stop::failed(error.to_string()))
    } else {
        files::remove(&path).map_err(|error| Stop::failed(error.to_string()))?;
        files::remove(&folder.join("osq.yml")).map_err(|error| Stop::failed(error.to_string()))
    }
}

/// Stages every collected path.
///
/// Implements: rust-land/land-sync
fn stage(vcs: &GitVcs, paths: &BTreeSet<String>) -> Result<(), Stop> {
    let paths: Vec<&str> = paths.iter().map(String::as_str).collect();
    vcs.stage(&paths).map_err(|error| Stop::vcs(&error))
}
