//! Proves the alpha crate.

/// Proves two plus two.
///
/// Covers: alpha/two-plus-two
#[test]
fn two_plus_two() {
    assert_eq!(2 + 2, 4);
}

/// Names a scenario by its title instead of its id.
///
/// Covers: alpha/Two plus two
#[test]
fn two_plus_two_by_title() {}

/// A public test helper with no tag, which is not crate code.
pub fn helper() -> u32 {
    4
}
