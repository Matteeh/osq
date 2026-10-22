//! Step 3's lock file rebuild for the lock files a merge conflicts in.

use std::path::Path;

use osq_kernel_config::Timeouts;
use osq_kernel_vcs::{GitVcs, Vcs};

use super::{command, files, stop::Stop, text};

/// The command that rebuilds a Cargo lock file offline.
const REBUILD: &str = "cargo update --workspace --offline";

/// Rebuilds each conflicting lock file from the change's manifests.
///
/// # Errors
///
/// Returns a `sync_failed` stop when a write, command or stage fails.
///
/// Implements: rust-land/land-sync
pub(crate) fn rebuild(
    vcs: &GitVcs,
    worktree: &Path,
    folder: &str,
    default_branch: &str,
    conflicts: &[String],
    timeouts: &Timeouts,
) -> Result<(), Stop> {
    let mut locks: Vec<&str> = conflicts
        .iter()
        .filter(|path| text::is_lockfile(path))
        .map(String::as_str)
        .collect();
    locks.sort_unstable();
    for lockfile in locks {
        rebuild_one(vcs, worktree, folder, default_branch, lockfile, timeouts)?;
    }
    Ok(())
}

/// Writes the default branch's copy, rebuilds and stages one lock file.
///
/// Implements: rust-land/land-sync
fn rebuild_one(
    vcs: &GitVcs,
    worktree: &Path,
    folder: &str,
    default_branch: &str,
    lockfile: &str,
    timeouts: &Timeouts,
) -> Result<(), Stop> {
    let target = worktree.join(lockfile);
    let content = vcs
        .show(default_branch, lockfile)
        .map_err(|error| Stop::vcs(&error))?;
    files::write_or_remove(&target, content.as_deref())
        .map_err(|error| Stop::failed(error.to_string()))?;
    let cwd = target.parent().unwrap_or(worktree);
    let (exit_code, output) = command::run(cwd, REBUILD, timeouts);
    if exit_code != 0 {
        let prefix = text::rebuild_failed(folder, lockfile, default_branch);
        return Err(Stop::failed(format!(
            "{prefix}\n{}",
            text::output_tail(&output)
        )));
    }
    vcs.stage(&[lockfile]).map_err(|error| Stop::vcs(&error))
}
