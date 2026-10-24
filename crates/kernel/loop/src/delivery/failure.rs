//! The failure delivery reports for one feature, event and change.

use std::fmt;

/// One event a feature could not handle, or one delivery step that failed.
///
/// Implements: rust-loop/reaction-failures
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReactionFailure {
    /// The feature's name, or `delivery` for a failure no feature caused.
    pub feature: String,
    /// The event's type, empty for a failure that no event caused.
    pub event: String,
    /// The change folder's name, or `*` for a failure before any change.
    pub change: String,
    /// What went wrong.
    pub message: String,
}

impl ReactionFailure {
    /// Builds one failure from its feature, event, change and message.
    pub(crate) fn new(
        feature: impl Into<String>,
        event: impl Into<String>,
        change: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            feature: feature.into(),
            event: event.into(),
            change: change.into(),
            message: message.into(),
        }
    }
}

impl fmt::Display for ReactionFailure {
    /// Writes the failure as one stderr line.
    ///
    /// Implements: rust-loop/reaction-failures
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.event.is_empty() {
            write!(
                formatter,
                "{} could not deliver to {}: {}",
                self.feature, self.change, self.message
            )
        } else {
            write!(
                formatter,
                "{} could not handle {} for {}: {}",
                self.feature, self.event, self.change, self.message
            )
        }
    }
}
