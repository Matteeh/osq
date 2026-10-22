//! The texts a refusal before a worktree approval prints.

use osq_kernel_config::ManualEdits;

/// The advice TypeScript's `MANUAL_KEEP_ADVICE` gives outside `block` mode.
const MANUAL_KEEP_ADVICE: &str = "keep them with osq manual \"<why>\"";

/// The refusal for HEAD on a branch other than the default branch.
///
/// Implements: rust-approve/approval-refusals-with-git-on
pub(crate) fn off_default(branch: Option<&str>, default: &str) -> String {
    let actual = branch.unwrap_or("a detached HEAD");
    format!(
        "HEAD is on {actual}, not the default branch {default}; pass --base-ok to approve from it"
    )
}

/// The refusal for uncommitted changes in task scope, with the mode's advice.
///
/// Implements: rust-approve/approval-refusals-with-git-on
pub(crate) fn dirty(paths: &[String], manual: ManualEdits) -> String {
    let advice = if manual == ManualEdits::Block {
        "commit them or pass --ignore-dirty".to_owned()
    } else {
        format!("{MANUAL_KEEP_ADVICE}, commit them, or pass --ignore-dirty")
    };
    format!(
        "uncommitted changes in task scope: {}; {advice}",
        paths.join(", ")
    )
}

/// The refusal for a change branch that is taken and not a rejected one.
///
/// Implements: rust-approve/approval-refusals-with-git-on
pub(crate) fn branch_exists(branch: &str) -> String {
    format!("branch {branch} already exists")
}
