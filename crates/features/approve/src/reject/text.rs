//! The refusal and output texts `reject` prints.

use std::path::Path;

/// The refusal for an active change whose rejected destination exists.
///
/// Implements: rust-approve/reject-refusals
pub(crate) fn destination_exists(root: &Path, destination: &Path, folder: &str) -> String {
    let relative = destination.strip_prefix(root).unwrap_or(destination);
    format!(
        "Cannot reject {folder}: destination \"{}\" already exists.",
        relative.display()
    )
}

/// The refusal for a change that has a running task.
///
/// Implements: rust-approve/reject-refusals
pub(crate) fn running(folder: &str) -> String {
    format!("Change {folder} has a running task; rejection is refused.")
}

/// The refusal for an approved change that has not failed.
///
/// Implements: rust-approve/reject-refusals
pub(crate) fn healthy(folder: &str) -> String {
    format!("Change {folder} is approved and healthy; only a failed change may be rejected.")
}

/// The three lines a rejection prints.
///
/// Implements: rust-approve/rejection-record
pub(crate) fn rejected(folder: &str, reason: &str, destination: &Path) -> String {
    format!(
        "Rejected {} ({folder})\n  Reason: {reason}\n  Destination: {}\n",
        id(folder),
        destination.display()
    )
}

/// A folder's leading digits, or the whole name when it has none.
fn id(folder: &str) -> &str {
    let digits = folder.bytes().take_while(u8::is_ascii_digit).count();
    if digits == 0 {
        folder
    } else {
        &folder[..digits]
    }
}
