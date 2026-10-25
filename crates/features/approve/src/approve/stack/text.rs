//! The texts a stacked approval writes and prints.

use std::fmt::Write as _;
use std::path::Path;

use super::Awaited;
use crate::approve::worktree::text::change_id;

/// The copy's `.run/stacked-on` body, with no newline after its last line.
///
/// Implements: rust-approve/stacked-approval
pub(super) fn stacked_on(awaited: &[Awaited]) -> String {
    awaited
        .iter()
        .map(|entry| match &entry.overlap {
            Some(capabilities) => format!(
                "{} {} overlap {}",
                entry.folder,
                entry.hash,
                capabilities.join(",")
            ),
            None => format!("{} {}", entry.folder, entry.hash),
        })
        .collect::<Vec<String>>()
        .join("\n")
}

/// The lines a stacked approval prints.
///
/// Implements: rust-approve/stacked-approval
/// Implements: rust-approve/rejected-branch-claim
pub(super) fn approved(
    folder: &str,
    seal: &str,
    kept: Option<&str>,
    awaited: &[Awaited],
    stacked: &Path,
) -> String {
    let kept = kept.map_or_else(String::new, |name| {
        format!("  Kept rejected branch: {name}\n")
    });
    let folders = awaited
        .iter()
        .map(|entry| entry.folder.as_str())
        .collect::<Vec<&str>>()
        .join(", ");
    let mut text = format!(
        "Approved {} ({folder})\n  Hash: {seal}\n{kept}  Waiting for: {folders}\n",
        change_id(folder)
    );
    for entry in awaited {
        if let Some(capabilities) = &entry.overlap {
            let _ = writeln!(
                text,
                "  Runs after {}, which also writes {}",
                entry.folder,
                capabilities.join(", ")
            );
        }
    }
    let _ = writeln!(text, "  Stacked: {}", stacked.display());
    text
}
