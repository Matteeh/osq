//! The archived-only sections of one change.
//!
//! Implements: rust-show/show-text

mod land;
mod recertifications;
mod validation;
mod values;
mod verification;

use crate::facts::LandFacts;
use crate::model::Change;

/// The `Verification:` lines, or none for a change without a history.
///
/// Implements: rust-show/show-text
pub(crate) fn verification(change: &Change) -> Vec<String> {
    verification::lines(change)
}

/// The `Validation:` lines, or none for a change without a validation.
///
/// Implements: rust-show/show-text
pub(crate) fn validation(change: &Change) -> Vec<String> {
    validation::lines(change)
}

/// The `Recertifications:` lines, or none for a change without them.
///
/// Implements: rust-show/show-text
pub(crate) fn recertifications(change: &Change) -> Vec<String> {
    recertifications::lines(change)
}

/// The land-view lines, or none for a change that was not archived.
///
/// Implements: rust-show/show-land-lines
pub(crate) fn land(change: &Change, facts: Option<&LandFacts>) -> Vec<String> {
    land::lines(change, facts)
}
