//! Choosing the next change number from the checkout's change folders.

use std::path::Path;

/// The highest leading number under the active, archived and rejected folders,
/// plus one, padded to three digits.
///
/// Implements: rust-plan/next-change-number
pub(super) fn next(root: &Path) -> String {
    let changes = root.join("openspec").join("changes");
    let mut highest = 0_u128;
    for folder in [
        changes.clone(),
        changes.join("archive"),
        changes.join("rejected"),
    ] {
        let Ok(entries) = std::fs::read_dir(folder) else {
            continue;
        };
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if let Some(number) = leading_number(name) {
                    highest = highest.max(number);
                }
            }
        }
    }
    format!("{:03}", highest + 1)
}

/// Reads an entry name's leading digits into their value.
///
/// Implements: rust-plan/next-change-number
fn leading_number(name: &str) -> Option<u128> {
    let digits: String = name.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse().ok()
    }
}
