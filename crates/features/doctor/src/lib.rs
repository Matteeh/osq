//! The doctor feature: checks the tools osq runs, such as the pi harness, and prints what is wrong, as TypeScript's `osq doctor` does.
//!
//! A feature crate depends only on kernel crates and core, never on another feature (ADR 022).

use osq_core::{Command, Feature, FeatureError, Invocation, Output};

/// The doctor feature: a unit struct with no state (ADR 028).
///
/// Implements: rust-doctor/doctor-feature
#[derive(Clone, Copy, Debug, Default)]
pub struct DoctorFeature;

impl Feature for DoctorFeature {
    /// The feature's name, `doctor`.
    ///
    /// Implements: rust-doctor/doctor-feature
    fn name(&self) -> &'static str {
        "doctor"
    }

    /// The feature's commands, none yet.
    ///
    /// Implements: rust-doctor/doctor-feature
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
    /// Implements: rust-doctor/doctor-feature
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        Err(FeatureError::unknown_command(invocation.command.as_str()))
    }
}
