//! The lint feature: checks a change folder with the specs kernel's validation and the linter kernel's gates and prints the findings, as TypeScript's `osq lint` does.
//!
//! A feature crate depends only on kernel crates and core, never on another feature (ADR 022).

use osq_core::{Command, Feature, FeatureError, Invocation, Output};

/// The lint feature: a unit struct with no state (ADR 028).
///
/// Implements: rust-lint/lint-feature
#[derive(Clone, Copy, Debug, Default)]
pub struct LintFeature;

impl Feature for LintFeature {
    /// The feature's name, `lint`.
    ///
    /// Implements: rust-lint/lint-feature
    fn name(&self) -> &'static str {
        "lint"
    }

    /// The feature's commands, none yet.
    ///
    /// Implements: rust-lint/lint-feature
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
    /// Implements: rust-lint/lint-feature
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        Err(FeatureError::unknown_command(invocation.command.as_str()))
    }
}
