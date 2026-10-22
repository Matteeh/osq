//! The worktree copy's `.run` approval and provenance lines.

use std::fs;
use std::path::Path;

use osq_kernel_vcs::{GitVcs, Vcs};

/// Writes `.run/approved`, `.run/base` and `.run/approver` into `folder`.
///
/// # Errors
///
/// Returns the display of the first git or file error.
///
/// Implements: rust-approve/worktree-approval
pub(crate) fn write(
    folder: &Path,
    seal: &str,
    base: Option<&str>,
    vcs: &GitVcs,
) -> Result<(), String> {
    let run = folder.join(".run");
    fs::create_dir_all(&run).map_err(|error| error.to_string())?;
    fs::write(run.join("approved"), format!("{seal}\n")).map_err(|error| error.to_string())?;
    fs::write(run.join("base"), format!("{}\n", base.unwrap_or_default()))
        .map_err(|error| error.to_string())?;
    fs::write(run.join("approver"), approver(vcs)?).map_err(|error| error.to_string())
}

/// The approver line, `<name> <<email>>` with each value empty when unset.
fn approver(vcs: &GitVcs) -> Result<String, String> {
    let name = vcs
        .config_value("user.name")
        .map_err(|error| error.to_string())?
        .unwrap_or_default();
    let email = vcs
        .config_value("user.email")
        .map_err(|error| error.to_string())?
        .unwrap_or_default();
    Ok(format!("{name} <{email}>\n"))
}
