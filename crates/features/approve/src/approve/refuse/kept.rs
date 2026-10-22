//! The lowest free name for a rejected branch that moves aside.

/// The lowest `osq/<folder>-rejected-<n>` from 1 that `taken` does not hold.
///
/// Implements: rust-approve/rejected-branch-claim
pub(crate) fn next(branch: &str, taken: &[String]) -> String {
    let last = taken.len() + 1;
    let number = (1..=last)
        .find(|number| {
            let candidate = format!("{branch}-rejected-{number}");
            !taken.iter().any(|name| name == &candidate)
        })
        .unwrap_or(last);
    format!("{branch}-rejected-{number}")
}
