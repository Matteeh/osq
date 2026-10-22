//! The show feature: prints one change's details as TypeScript's `osq show` does.
//!
//! A feature crate depends only on kernel crates and core, never on another feature (ADR 022).

use osq_core::{Command, Feature, FeatureError, Invocation, Output};

/// The show feature: a unit struct with no state (ADR 028).
///
/// Implements: rust-show/show-feature
#[derive(Clone, Copy, Debug, Default)]
pub struct ShowFeature;

impl Feature for ShowFeature {
    /// The feature's name, `show`.
    ///
    /// Implements: rust-show/show-feature
    fn name(&self) -> &'static str {
        "show"
    }

    /// The feature's commands, none yet.
    ///
    /// Implements: rust-show/show-feature
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
    /// Implements: rust-show/show-feature
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        Err(FeatureError::unknown_command(invocation.command.as_str()))
    }
}
