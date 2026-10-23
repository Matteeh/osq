//! The detail a failed version control step reports.

use osq_kernel_vcs::VcsError;

/// Git's output for a refused command, or the display of every other error.
///
/// Implements: rust-retry/archived-retry
pub(crate) fn detail(error: &VcsError) -> String {
    match error {
        VcsError::Failed { output, .. } => output.clone(),
        other => other.to_string(),
    }
}
