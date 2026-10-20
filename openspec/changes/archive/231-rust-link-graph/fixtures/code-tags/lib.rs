//! A source that holds every kind of tagged item.
//!
//! Implements: tools/file-level

/// A declared module.
mod declared;

/// Adds two numbers.
///
/// Implements: tools/adds-numbers
/// Adr: 22
pub fn add(left: u32, right: u32) -> u32 {
    fn nested() {}
    nested();
    left + right
}

/// A helper with no tag.
fn helper() {}

/// A total.
pub struct Total(u32);

impl Total {
    /// Reads the total.
    ///
    /// Implements: tools/reads-totals
    pub fn value(&self) -> u32 {
        self.0
    }

    /// Resets the total.
    pub(crate) fn reset(&mut self) {
        self.0 = 0;
    }
}

impl std::fmt::Display for Total {
    /// Writes the total.
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}", self.0)
    }
}

impl Named for [u8] {
    /// Names bytes.
    fn name(&self) -> String {
        String::new()
    }
}

/// Things with a name.
pub trait Named {
    /// The name.
    ///
    /// Implements: tools/names
    fn name(&self) -> String;
}

/// Kinds of total.
pub enum Kind {
    /// A small total.
    Small,
}

/// An alias.
pub type Alias = u32;

/// A limit.
pub const LIMIT: u32 = 3;

/// A counter.
static COUNTER: u32 = 0;

/// An inline module.
pub mod inner {
    //! Implements: tools/inner-module

    /// Doubles a value.
    ///
    #[doc = "Implements: tools/doubles\nAdr: 9"]
    pub(crate) const fn double(value: u32) -> u32 {
        value * 2
    }
}

/// Proves addition.
///
/// Covers: tools/two-plus-two
#[test]
fn two_plus_two() {}

/// Proves addition later.
///
///   Covers:   tools/later-sums
#[tokio::test]
async fn later_sums() {}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(8))]

    /// Proves any sum.
    ///
    /// Covers: tools/any-sum
    #[test]
    fn any_sum(value in 0u32..10) {
        prop_assert!(value < 10);
    }
}

macro_rules! cases {
    ($name:ident) => {
        /// Covers: tools/macro-case
        #[test]
        fn $name() {}
    };
}

/// Mentions Implements: tools/not-a-tag mid-line.
pub fn mention() {}
