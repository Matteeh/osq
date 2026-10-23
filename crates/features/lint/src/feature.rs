//! The lint feature's `Feature` implementation.

use osq_core::{Command, Feature, FeatureError, Invocation, Output};

use crate::lint;

/// The lint feature: a unit struct with no state (ADR 028).
///
/// Implements: rust-lint/lint-command
#[derive(Clone, Copy, Debug, Default)]
pub struct LintFeature;

impl Feature for LintFeature {
    /// The feature's name, `lint`.
    ///
    /// Implements: rust-lint/lint-command
    fn name(&self) -> &'static str {
        "lint"
    }

    /// The feature's one command, `lint`, which validates a change's delta
    /// specs and the Rust link gates.
    ///
    /// Implements: rust-lint/lint-command
    fn commands(&self) -> Vec<Command> {
        vec![Command::new(
            "lint",
            "validate a change's delta specs and the Rust link gates",
            "<id>",
        )]
    }

    /// Runs `lint` with one change id.
    ///
    /// # Errors
    ///
    /// Returns `UnknownCommand` for another command, `Usage` for `lint` with an
    /// argument count other than one, and `Failed` with the command `lint` for
    /// every failure the other lint requirements name.
    ///
    /// Implements: rust-lint/lint-arguments
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        match invocation.command.as_str() {
            "lint" => {
                if invocation.args.len() != 1 {
                    return Err(FeatureError::usage(
                        "lint",
                        format!("expected one change id, got {}", invocation.args.len()),
                    ));
                }
                lint::run_lint(&invocation.root, &invocation.args[0]).map(Output::text)
            }
            other => Err(FeatureError::unknown_command(other)),
        }
    }
}
