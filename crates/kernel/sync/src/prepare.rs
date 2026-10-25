//! Step 4: running `vcs.prepare` in the change's worktree.

use std::path::Path;

use osq_kernel_config::Timeouts;

use super::{command, stop::Stop};

/// Runs `vcs.prepare` in the worktree when it is set.
///
/// # Errors
///
/// Returns a `sync_failed` stop with the whole output when it exits non-zero.
///
/// Implements: rust-land/land-sync
pub(crate) fn run(
    worktree: &Path,
    folder: &str,
    prepare: Option<&str>,
    timeouts: &Timeouts,
) -> Result<(), Stop> {
    let Some(prepare) = prepare else {
        return Ok(());
    };
    let (exit_code, output) = command::run(worktree, prepare, timeouts);
    if exit_code == 0 {
        return Ok(());
    }
    Err(Stop::failed(format!(
        "prepare failed in worktree {} on branch osq/{folder}:\n{output}",
        worktree.display()
    )))
}
