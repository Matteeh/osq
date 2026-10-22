//! The retry feature: clears a dead or regressed task or change so it runs again, as TypeScript's `osq retry` does.
//!
//! A feature crate depends only on kernel crates and core, never on another feature (ADR 022).

use osq_core::{Command, Feature, FeatureError, Invocation, Output};

/// The retry feature: a unit struct with no state (ADR 028).
///
/// Implements: rust-retry/retry-feature
#[derive(Clone, Copy, Debug, Default)]
pub struct RetryFeature;

impl Feature for RetryFeature {
    /// The feature's name, `retry`.
    ///
    /// Implements: rust-retry/retry-feature
    fn name(&self) -> &'static str {
        "retry"
    }

    /// The feature's commands, none yet.
    ///
    /// Implements: rust-retry/retry-feature
    fn commands(&self) -> Vec<Command> {
        vec![]
    }

    /// Refuses every invocation because the feature has no command yet.
    ///
    /// # Errors
    ///
    /// Always returns [`FeatureError::unknown_command`] naming the invocation's
    /// command.
    ///
    /// Implements: rust-retry/retry-feature
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        Err(FeatureError::unknown_command(invocation.command.as_str()))
    }
}
