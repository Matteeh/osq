//! The text a stacking refusal prints.

/// The refusal for a change that would stack on `folders`.
///
/// Implements: rust-approve/stacked-approval-refusal
pub(super) fn stacked(folder: &str, folders: &[String]) -> String {
    format!(
        "Change {folder} would stack on {}. Rust approve does not stack approvals yet.",
        folders.join(", ")
    )
}
