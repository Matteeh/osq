//! The delta crate.

/// Adds two numbers.
///
/// Implements: delta/adds-numbers
pub fn add(left: u32, right: u32) -> u32 {
    left + right
}

/// Reads a total.
///
/// Implements: delta/reads-totals
pub fn read(total: u32) -> u32 {
    total
}

/// Clears a total.
///
/// Implements: delta/clears-totals
pub fn clear(total: &mut u32) {
    *total = 0;
}

/// Sums a list.
///
/// Implements: delta/sums-lists
pub fn sum(values: &[u32]) -> u32 {
    values.iter().sum()
}
