//! The manual feature's `Feature` implementation.

use osq_core::{Command, Feature, FeatureError, Invocation, Output};

use crate::manual;

/// The manual feature.
///
/// Implements: rust-manual/manual-command
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ManualFeature {
    /// The fixed clock, or `None` to read the system clock at each run.
    now_ms: Option<i64>,
}

impl ManualFeature {
    /// The manual feature, reading the system clock at each run.
    ///
    /// Implements: rust-manual/manual-command
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// The manual feature with a fixed clock, `now_ms` in epoch milliseconds.
    ///
    /// Implements: rust-manual/manual-command
    #[must_use]
    pub fn at(now_ms: i64) -> Self {
        Self {
            now_ms: Some(now_ms),
        }
    }
}

impl Feature for ManualFeature {
    /// The feature's name, `manual`.
    ///
    /// Implements: rust-manual/manual-command
    fn name(&self) -> &'static str {
        "manual"
    }

    /// The feature's one command, `manual`.
    ///
    /// Implements: rust-manual/manual-command
    fn commands(&self) -> Vec<Command> {
        vec![Command::new(
            "manual",
            "keep uncommitted edits as a manual change with a comment",
            "<comment> [paths...]",
        )]
    }

    /// Runs `manual` with a comment and zero or more named paths.
    ///
    /// # Errors
    ///
    /// Returns `Usage` when the comment is missing, `UnknownCommand` for
    /// another command, and `Failed` for every refusal the requirements name.
    ///
    /// Implements: rust-manual/manual-command
    /// Implements: rust-manual/manual-refusals
    /// Implements: rust-manual/manual-keep
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        match invocation.command.as_str() {
            "manual" => {
                let Some((comment, paths)) = invocation.args.split_first() else {
                    return Err(FeatureError::usage(
                        "manual",
                        "expected <comment> [paths...]",
                    ));
                };
                manual::run(&invocation.root, comment, paths, self.now_ms)
            }
            other => Err(FeatureError::unknown_command(other)),
        }
    }
}
