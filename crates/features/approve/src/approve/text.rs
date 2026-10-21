//! The refusal and approval texts `approve` prints.

use std::path::Path;

/// The refusal for a query that names no active change.
///
/// Implements: rust-approve/approve-lookup
pub(crate) fn not_found(query: &str, changes: &Path) -> String {
    format!("Spec \"{query}\" not found in {}", changes.display())
}

/// The refusal for an approved change that needs steering.
///
/// Implements: rust-approve/steering-refusal
pub(crate) fn steering(folder: &str, triggers: &[String]) -> String {
    let joined = triggers.join(", ");
    format!(
        "Change {folder} needs steering: {joined}. Rust approve does not retire steering triggers yet."
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
