//! The refusal and approval texts `approve` prints.

use std::fmt::Write as _;
use std::path::Path;

use super::steering::Trigger;

/// The refusal for a query that names no active change.
///
/// Implements: rust-approve/approve-lookup
pub(crate) fn not_found(query: &str, changes: &Path) -> String {
    format!("Spec \"{query}\" not found in {}", changes.display())
}

/// The refusal for a default-branch trigger.
///
/// Implements: rust-approve/steering-refusal
pub(crate) fn default_branch(folder: &str, triggers: &[Trigger]) -> String {
    format!(
        "Change {folder} needs steering: {}. Rust approve does not approve default-branch steering yet.",
        described(triggers)
    )
}

/// The refusal for a steered checkout change with git on.
///
/// Implements: rust-approve/steering-refusal
pub(crate) fn checkout_steering(folder: &str, triggers: &[Trigger]) -> String {
    format!(
        "Change {folder} needs steering: {}. Rust approve steers a change with git on only in its worktree.",
        described(triggers)
    )
}

/// The refusal for a task that still runs.
///
/// Implements: rust-approve/steering-refusal
pub(crate) fn running(folder: &str) -> String {
    format!("{folder} has a task running; approve it after the task ends")
}

/// Every trigger shown, joined by `, `.
///
/// Implements: rust-approve/steering-refusal
fn described(triggers: &[Trigger]) -> String {
    triggers
        .iter()
        .map(Trigger::describe)
        .collect::<Vec<String>>()
        .join(", ")
}

/// The lines a steered approval prints.
///
/// Implements: rust-approve/steered-approval
pub(crate) fn steered(
    folder: &str,
    seal: &str,
    worktree: Option<&Path>,
    continues: Option<&str>,
) -> String {
    let mut text = format!("Approved {} ({folder})\n  Hash: {seal}\n", id(folder));
    if let Some(worktree) = worktree {
        let _ = writeln!(text, "  Worktree: {}", worktree.display());
        let _ = writeln!(text, "  Branch: osq/{folder}");
    }
    if let Some(task) = continues {
        let _ = writeln!(text, "  Continues from task {task}");
    }
    text
}

/// The refusal when a steered approval's commit fails and does not land.
///
/// Implements: rust-approve/steered-approval
pub(crate) fn commit_failed(worktree: &Path, folder: &str, error: &str) -> String {
    format!(
        "the approved commit failed in {}: {error}. The approval seal is undone and the plan edits are kept; run osq approve {} again.",
        worktree.display(),
        id(folder)
    )
}

/// The two lines an approval prints.
///
/// Implements: rust-approve/approval-marker
pub(crate) fn approved(folder: &str, seal: &str) -> String {
    format!("Approved {} ({folder})\n  Hash: {seal}\n", id(folder))
}

/// A folder's leading digits, or the whole name when it has none.
///
/// Implements: rust-approve/approval-marker
fn id(folder: &str) -> &str {
    let digits = folder.bytes().take_while(u8::is_ascii_digit).count();
    if digits == 0 {
        folder
    } else {
        &folder[..digits]
    }
}
