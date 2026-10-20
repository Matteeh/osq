//! The beta crate, which no capability owns.

/// Formats text.
///
/// Implements: alpha/adds-numbers
/// Adr: 9
pub fn format(text: &str) -> String {
    text.to_owned()
}
