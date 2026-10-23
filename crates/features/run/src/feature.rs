//! The run feature's `Feature` implementation and its private pieces.

mod commit;
mod dead;
mod done;
mod events;
mod find;
mod lock;
mod message;
mod pause;
mod refusals;
mod run;
mod scope;
mod start;
mod text;
mod time;
mod verdict;
mod worktree;

use osq_core::{Command, Feature, FeatureError, Invocation, Output};

/// The run feature: a unit struct with no state (ADR 028).
///
/// Implements: rust-run/run-feature
#[derive(Clone, Copy, Debug, Default)]
pub struct RunFeature;

impl Feature for RunFeature {
    /// The feature's name, `run`.
    ///
    /// Implements: rust-run/run-feature
    fn name(&self) -> &'static str {
        "run"
    }

    /// The feature's one command, `run`.
    ///
    /// Implements: rust-run/run-feature
    fn commands(&self) -> Vec<Command> {
        vec![Command::new(
            "run",
            "run one task of an approved change once",
            "<id> <task>",
        )]
    }

    /// Runs `run` with a change id and a task.
    ///
    /// # Errors
    ///
    /// Returns `UnknownCommand` for another command, `Usage` for an argument
    /// count other than two, and `Failed` with the running command for every
    /// failure the run requirements name.
    ///
    /// Implements: rust-run/run-feature
    /// Implements: rust-run/run-refusals
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        match invocation.command.as_str() {
            "run" => {
                if invocation.args.len() != 2 {
                    return Err(FeatureError::usage("run", "expected <id> <task>"));
                }
                run::run_one(&invocation.root, &invocation.args[0], &invocation.args[1])
                    .map(Output::text)
            }
            other => Err(FeatureError::unknown_command(other)),
        }
    }
}
