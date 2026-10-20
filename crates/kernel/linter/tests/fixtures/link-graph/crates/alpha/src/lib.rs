//! The alpha crate.
//!
//! Implements: alpha/code-ownership

mod shared;

/// Adds two numbers.
///
/// Implements: alpha/adds-numbers
/// Adr: 2
pub fn add(left: u32, right: u32) -> u32 {
    left + right
}

/// A total.
pub struct Total(u32);

impl Total {
    /// Reads the total.
    ///
    /// Implements: alpha/missing-requirement
    pub fn value(&self) -> u32 {
        self.0
    }
}

/// Doubles a value.
///
/// Adr: 9
fn double(value: u32) -> u32 {
    value * 2
}
