//! The retry feature's `Feature` implementation.

use osq_core::{Command, Feature, FeatureError, Invocation, Output};

use crate::retry;

/// The retry feature: a unit struct with no state (ADR 028).
///
/// Implements: rust-retry/retry-command
#[derive(Clone, Copy, Debug, Default)]
pub struct RetryFeature;

impl Feature for RetryFeature {
    /// The feature's name, `retry`.
    ///
    /// Implements: rust-retry/retry-command
    fn name(&self) -> &'static str {
        "retry"
    }

    /// The feature's one command, `retry`.
    ///
    /// Implements: rust-retry/retry-command
    fn commands(&self) -> Vec<Command> {
        vec![Command::new(
            "retry",
            "clear a dead or regressed task or change so it runs again",
            "<id> <task|change>",
        )]
    }

    /// Runs `retry` with a change id and a task or `change`.
    ///
    /// # Errors
    ///
    /// Returns `UnknownCommand` for another command, `Usage` for an argument
    /// count other than two, and `Failed` with the running command for every
    /// failure the retry requirements name.
    ///
    /// Implements: rust-retry/retry-arguments
    /// Implements: rust-retry/retry-refusals
    /// Implements: rust-retry/retry-record
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        match invocation.command.as_str() {
            "retry" => {
                if invocation.args.len() != 2 {
                    return Err(FeatureError::usage(
                        "retry",
                        format!(
                            "expected a change id and a target, got {}",
                            invocation.args.len()
                        ),
                    ));
                }
                retry::run(&invocation.root, &invocation.args[0], &invocation.args[1])
                    .map(Output::text)
            }
            other => Err(FeatureError::unknown_command(other)),
        }
    }
}
