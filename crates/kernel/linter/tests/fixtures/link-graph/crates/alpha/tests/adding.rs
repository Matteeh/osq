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
/// Covers: alpha/Big sums
#[test]
fn big_sums_by_title() {}

/// A helper that names a scenario but is not a test.
///
/// Covers: alpha/two-plus-two
fn helper() {}

proptest! {
    /// Proves any sum.
    ///
    /// Covers: alpha/big-sums
    #[test]
    fn any_sum(value in 0u32..10) {
        prop_assert!(value < 10);
    }
}
