//! The delta crate.

/// Adds two numbers.
///
/// Implements: delta/adds-numbers
pub fn add(left: u32, right: u32) -> u32 {
    left + right
}

/// Sums a list.
///
/// Implements: delta/sums-lists
pub fn sum(values: &[u32]) -> u32 {
    values.iter().sum()
}
