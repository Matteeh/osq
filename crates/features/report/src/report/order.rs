//! Ordering change ids and folder names by leading number, then by bytes.
//!
//! Implements: rust-report/report-history-blocks
//! Implements: rust-report/report-sizes

use std::cmp::Ordering;

/// Orders two names by leading number first, then by their bytes.
///
/// Implements: rust-report/report-history-blocks
/// Implements: rust-report/report-sizes
pub(crate) fn compare_numeric_prefix(left: &str, right: &str) -> Ordering {
    match (leading_number(left), leading_number(right)) {
        (Some(a), Some(b)) => a.cmp(&b).then_with(|| left.cmp(right)),
        _ => left.cmp(right),
    }
}

/// The number a name leads with, or none when it leads with no digit.
fn leading_number(name: &str) -> Option<u128> {
    let digits: String = name.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse().ok()
    }
}
