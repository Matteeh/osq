//! The alpha crate.

mod shared;

/// Adds two numbers.
///
/// Implements: alpha/adds-numbers
/// Adr: 2
pub fn add(left: u32, right: u32) -> u32 {
    left + right
}

/// Subtracts two numbers.
pub fn subtract(left: u32, right: u32) -> u32 {
    left - right
}

/// A total.
pub struct Total(u32);

impl Total {
    /// Reads the total.
    ///
    /// Implements: alpha/reads-totals
    pub fn value(&self) -> u32 {
        self.0
    }

    /// Resets the total.
    pub fn reset(&mut self) {
        self.0 = 0;
    }

    /// Sets the total.
    pub(crate) fn set(&mut self, value: u32) {
        self.0 = value;
    }
}

/// Doubles a value.
fn double(value: u32) -> u32 {
    value * 2
}
