//! The doctor feature's `Feature` implementation.

use osq_core::{Command, Feature, FeatureError, Invocation, Output};

use crate::doctor::run_doctor;

/// The doctor feature: a unit struct with no state (ADR 028).
///
/// Implements: rust-doctor/doctor-command
#[derive(Clone, Copy, Debug, Default)]
pub struct DoctorFeature;

impl Feature for DoctorFeature {
    /// The feature's name, `doctor`.
    ///
    /// Implements: rust-doctor/doctor-command
    fn name(&self) -> &'static str {
        "doctor"
    }

    /// The feature's one command, `doctor`, which checks the configuration and
    /// the pi harness.
    ///
    /// Implements: rust-doctor/doctor-command
    fn commands(&self) -> Vec<Command> {
        vec![Command::new(
            "doctor",
            "check the configuration and the pi harness",
            "",
        )]
    }

    /// Runs `doctor` with no arguments.
    ///
    /// # Errors
    ///
    /// Returns `UnknownCommand` for another command, `Usage` for `doctor` with
    /// arguments, and `Failed` with the printed check lines when a check fails.
    ///
    /// Implements: rust-doctor/doctor-arguments
    /// Implements: rust-doctor/doctor-pi-checks
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        match invocation.command.as_str() {
            "doctor" => {
                if !invocation.args.is_empty() {
                    return Err(FeatureError::usage(
                        "doctor",
                        format!("expected no arguments, got {}", invocation.args.len()),
                    ));
                }
                run_doctor(&invocation.root).map(Output::text)
            }
            other => Err(FeatureError::unknown_command(other)),
        }
    }
}
