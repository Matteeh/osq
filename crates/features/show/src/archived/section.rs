//! The archived-only sections of one change.
//!
//! Implements: rust-show/show-text

mod land;
mod recertifications;
mod validation;
mod values;
mod verification;

use crate::events::Event;
use crate::facts::LandFacts;
use crate::model::Change;

pub(crate) use land::View;
pub(crate) use verification::History as Verification;

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

pub(crate) use recertifications::Row;

/// The recertification rows of an archived change, in display order.
pub(crate) fn recertification_rows(change: &Change) -> Vec<Row> {
    recertifications::rows(change)
}

/// The land-view lines, or none for a change that was not archived.
///
/// Implements: rust-show/show-land-lines
pub(crate) fn land(change: &Change, facts: Option<&LandFacts>) -> Vec<String> {
    land::lines(change, facts)
}

/// The land view of one archived change, or none for another change.
///
/// Implements: rust-show/show-json
pub(crate) fn land_view(
    change: &Change,
    facts: Option<&LandFacts>,
    timeline: &[Event],
) -> Option<View> {
    change.archived.then(|| land::view(change, facts, timeline))
}

/// The latest change-stream validator run, or none without one.
///
/// Implements: rust-show/show-json
pub(crate) fn validation_event(timeline: &[Event]) -> Option<&Event> {
    validation::latest(timeline)
}

/// The check and outcome rows of one timeline, or none when it holds neither.
///
/// Implements: rust-show/show-json
pub(crate) fn verification_history(timeline: &[Event]) -> Option<Verification> {
    verification::history(timeline)
}
