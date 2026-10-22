//! The texts a worktree approval prints.

use std::path::Path;

/// The lines an approval into a worktree prints.
///
/// Implements: rust-approve/worktree-approval
/// Implements: rust-approve/rejected-branch-claim
pub(crate) fn approved(
    folder: &str,
    seal: &str,
    kept: Option<&str>,
    worktree: &Path,
    branch: &str,
) -> String {
    let kept = kept.map_or_else(String::new, |name| {
        format!("  Kept rejected branch: {name}\n")
    });
    format!(
        "Approved {} ({folder})\n  Hash: {seal}\n{kept}  Worktree: {}\n  Branch: {branch}\n",
        change_id(folder),
        worktree.display()
    )
}

/// The message for a prepare command that failed before the approval commit.
///
/// Implements: rust-approve/worktree-approval
pub(crate) fn prepare_failed(worktree: &Path, branch: &str, output: &str) -> String {
    format!(
        "prepare failed in worktree {} on branch {branch}:\n{output}",
        worktree.display()
    )
}

/// A folder's leading digits, or the whole name when it has none.
///
/// Implements: rust-approve/worktree-approval
pub(crate) fn change_id(folder: &str) -> &str {
    let digits = folder.bytes().take_while(u8::is_ascii_digit).count();
    if digits == 0 {
        folder
    } else {
        &folder[..digits]
    }
}
