//! Proves that `run_cli` prints an output's text and exits with its code.

use std::path::Path;

use osq_cli::{CliResult, run_cli};
use osq_core::{Command, Feature, FeatureError, Invocation, Output};

/// A feature that lists `check` and returns one fixed output.
struct CodeFeature {
    /// The text its `run` returns.
    text: &'static str,
    /// The code its `run` returns.
    code: i32,
}

impl Feature for CodeFeature {
    /// The feature's name.
    fn name(&self) -> &'static str {
        "code"
    }

    /// The commands the feature lists.
    fn commands(&self) -> Vec<Command> {
        vec![Command::new("check", "Checks", "")]
    }

    /// Returns the fixed output.
    fn run(&self, _invocation: &Invocation) -> Result<Output, FeatureError> {
        Ok(Output::with_code(self.text, self.code))
    }
}

/// A command line's arguments as owned strings.
fn args(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_owned()).collect()
}

/// Proves every row of "Output code through `run_cli`".
///
/// Covers: rust-cli/output-code-through-run-cli
#[test]
fn output_code_through_run_cli() {
    let cases: [(&'static str, i32, &'static str, i32); 3] = [
        ("fine\n", 0, "fine\n", 0),
        ("bad\n", 1, "bad\n", 1),
        ("odd\n", 3, "odd\n", 3),
    ];
    for (text, code, stdout, expected_code) in cases {
        let registry: Vec<Box<dyn Feature>> = vec![Box::new(CodeFeature { text, code })];
        let result = run_cli(&registry, Path::new("/project"), &args(&["check"]));
        assert_eq!(
            result,
            CliResult {
                stdout: stdout.to_owned(),
                stderr: String::new(),
                code: expected_code,
            },
            "{text:?} {code}"
        );
    }
}
