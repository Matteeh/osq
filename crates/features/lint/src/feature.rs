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
            "[--json] [--repository] [ids...]",
        )]
    }

    /// Runs `lint` with its flags and change ids.
    ///
    /// # Errors
    ///
    /// Returns `UnknownCommand` for another command, `Usage` for an unknown
    /// flag, and `Failed` with the command `lint` for every failure the other
    /// lint requirements name.
    ///
    /// Implements: rust-lint/lint-arguments
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        match invocation.command.as_str() {
            "lint" => {
                let args = Args::read(&invocation.args)?;
                lint::run_lint(&invocation.root, &args.ids, args.repository, args.json)
            }
            other => Err(FeatureError::unknown_command(other)),
        }
    }
}

/// The flags and change ids one `lint` invocation gives.
struct Args<'a> {
    /// The flags and ids in the order given.
    ids: Vec<&'a str>,
    /// Whether `--repository` was given.
    repository: bool,
    /// Whether `--json` was given.
    json: bool,
}

impl<'a> Args<'a> {
    /// Reads the args, taking `--json` and `--repository` as flags.
    ///
    /// Implements: rust-lint/lint-arguments
    fn read(args: &'a [String]) -> Result<Self, FeatureError> {
        let mut ids = Vec::new();
        let mut repository = false;
        let mut json = false;
        for arg in args {
            match arg.as_str() {
                "--repository" => repository = true,
                "--json" => json = true,
                other if other.starts_with("--") => {
                    return Err(FeatureError::usage("lint", format!("unknown flag {other}")));
                }
                other => ids.push(other),
            }
        }
        Ok(Self {
            ids,
            repository,
            json,
        })
    }
}
