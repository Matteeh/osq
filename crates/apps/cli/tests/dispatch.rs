//! Proves the feature registry, help, dispatch and the crate's ownership.

use std::fs;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use osq_cli::{CliResult, features, run_cli};
use osq_core::{Command, Feature, FeatureError, Invocation, Output};

/// The top-level help the two test features give.
const TOP_HELP: &str =
    "Usage: osq-rs <command> [args]\n\nCommands:\n  one <id>  does one\n  two  does two\n";

/// The help for the `one` test command.
const ONE_HELP: &str = "Usage: osq-rs one <id>\n\ndoes one\n";

/// The help for the `two` test command.
const TWO_HELP: &str = "Usage: osq-rs two\n\ndoes two\n";

/// A small feature that lists its commands and returns fixed text.
struct TestFeature {
    /// The feature's name.
    name: &'static str,
    /// The commands the feature lists.
    commands: Vec<Command>,
    /// The text its `run` returns.
    text: &'static str,
    /// How many times `run` was called.
    calls: Arc<AtomicUsize>,
}

impl TestFeature {
    /// Builds a feature with one command and fixed output text.
    fn one(
        name: &'static str,
        command: &str,
        usage: &str,
        summary: &str,
        text: &'static str,
    ) -> Self {
        Self {
            name,
            commands: vec![Command::new(
                command.to_owned(),
                summary.to_owned(),
                usage.to_owned(),
            )],
            text,
            calls: Arc::new(AtomicUsize::new(0)),
        }
    }
}

impl Feature for TestFeature {
    /// The feature's name.
    fn name(&self) -> &str {
        self.name
    }

    /// The commands the feature lists.
    fn commands(&self) -> Vec<Command> {
        self.commands.clone()
    }

    /// Records the call and returns the fixed text.
    fn run(&self, _invocation: &Invocation) -> Result<Output, FeatureError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        Ok(Output::text(self.text))
    }
}

/// The two features the help and dispatch scenarios use.
fn two_features() -> Vec<Box<dyn Feature>> {
    vec![
        Box::new(TestFeature::one(
            "alpha", "one", "<id>", "does one", "first",
        )),
        Box::new(TestFeature::one("beta", "two", "", "does two", "second")),
    ]
}

/// A command line's arguments as owned strings.
fn args(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_owned()).collect()
}

/// Proves that the registry names every feature in its fixed order.
///
/// Covers: rust-cli/registered-features
#[test]
fn registered_features() {
    let registry = features();
    let names: Vec<&str> = registry.iter().map(|feature| feature.name()).collect();
    assert_eq!(
        names,
        [
            "plan", "approve", "run", "archive", "land", "inbox", "report", "show", "lint",
            "doctor", "retry", "manual",
        ]
    );
}

/// Proves each run row through the real registry, leaving the root empty.
///
/// Covers: rust-cli/run-through-the-registry
#[test]
fn run_through_the_registry() {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join("dispatch-run-through-the-registry");
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    let cases: [(&[&str], String); 2] = [
        (
            &["run", "1"],
            "usage of run: expected <id> <task>\n".to_owned(),
        ),
        (
            &["run", "1", "1"],
            format!(
                "run failed: Spec \"1\" not found in {}/openspec/changes\n",
                root.display()
            ),
        ),
    ];
    let registry = features();
    for (arguments, stderr) in cases {
        let result = run_cli(&registry, &root, &args(arguments));
        assert_eq!(
            result,
            CliResult {
                stdout: String::new(),
                stderr,
                code: 1,
            },
            "{arguments:?}"
        );
        let entries = fs::read_dir(&root)
            .expect("the scratch root is read")
            .count();
        assert_eq!(entries, 0, "the root stays empty after {arguments:?}");
    }
}

/// Proves every help row, byte for byte.
///
/// Covers: rust-cli/help-from-the-features-data
#[test]
fn help_from_the_features_data() {
    let registry = two_features();
    let cases: [(&[&str], &str); 5] = [
        (&[], TOP_HELP),
        (&["--help"], TOP_HELP),
        (&["-h"], TOP_HELP),
        (&["one", "--help"], ONE_HELP),
        (&["two", "-h"], TWO_HELP),
    ];
    for (arguments, expected) in cases {
        let result = run_cli(&registry, Path::new("/project"), &args(arguments));
        assert_eq!(
            result,
            CliResult {
                stdout: expected.to_owned(),
                stderr: String::new(),
                code: 0,
            },
            "{arguments:?}"
        );
    }
}

/// Proves that the top-level help lists each registered command once, in order.
///
/// Covers: rust-cli/help-lists-every-registered-command
#[test]
fn help_lists_every_registered_command() {
    let registry = features();
    let commands: Vec<Command> = registry
        .iter()
        .flat_map(|feature| feature.commands())
        .collect();
    let help = run_cli(&registry, Path::new("/project"), &args(&["--help"]));
    assert_eq!(help.stderr, "");
    assert_eq!(help.code, 0);
    let lines: Vec<&str> = help.stdout.lines().collect();
    assert_eq!(
        lines.first().copied(),
        Some("Usage: osq-rs <command> [args]")
    );
    assert_eq!(lines.get(1).copied(), Some(""));
    assert_eq!(lines.get(2).copied(), Some("Commands:"));
    assert_eq!(lines.len(), 3 + commands.len(), "one line per command");
    for (line, command) in lines[3..].iter().zip(&commands) {
        let usage = if command.usage.is_empty() {
            String::new()
        } else {
            format!(" {}", command.usage)
        };
        assert_eq!(
            *line,
            format!("  {}{}  {}", command.name, usage, command.summary),
            "{}",
            command.name
        );
    }
}

/// Proves that an unknown command fails and calls no feature.
///
/// Covers: rust-cli/unknown-command
#[test]
fn unknown_command() {
    let feature = TestFeature::one("alpha", "one", "", "does one", "first");
    let calls = Arc::clone(&feature.calls);
    let registry: Vec<Box<dyn Feature>> = vec![Box::new(feature)];
    let result = run_cli(&registry, Path::new("/project"), &args(&["nope"]));
    assert_eq!(
        result,
        CliResult {
            stdout: String::new(),
            stderr: "unknown command: nope\n".to_owned(),
            code: 1,
        }
    );
    assert_eq!(calls.load(Ordering::SeqCst), 0, "no feature ran");
}

/// Proves that dispatch picks the first feature that lists the name.
///
/// Covers: rust-cli/first-feature-wins
#[test]
fn first_feature_wins() {
    let first = TestFeature::one("alpha", "same", "", "does one", "first");
    let second = TestFeature::one("beta", "same", "", "does two", "second");
    let second_calls = Arc::clone(&second.calls);
    let registry: Vec<Box<dyn Feature>> = vec![Box::new(first), Box::new(second)];
    let result = run_cli(&registry, Path::new("/project"), &args(&["same"]));
    assert_eq!(result.stdout, "first");
    assert_eq!(result.stderr, "");
    assert_eq!(result.code, 0);
    assert_eq!(
        second_calls.load(Ordering::SeqCst),
        0,
        "the second feature ran"
    );
}

/// Proves that the rust-cli fixture maps the CLI crate's files to rust-cli.
///
/// Covers: rust-cli/cli-crate-ownership
#[test]
fn cli_crate_ownership() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/ownership");
    let spec = fs::read_to_string(root.join("openspec/specs/rust-cli/spec.md"))
        .expect("the ownership fixture spec reads");
    let source = spec
        .lines()
        .find_map(|line| {
            line.trim()
                .strip_prefix("<!-- source: ")
                .and_then(|rest| rest.strip_suffix(" -->"))
        })
        .expect("the ownership requirement names its source");
    assert_eq!(source, "crates/apps/cli/**");
    let crate_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    assert!(
        crate_dir.ends_with("crates/apps/cli"),
        "{} sits in the owned folder",
        crate_dir.display()
    );
    for file in ["src/lib.rs", "src/main.rs"] {
        assert!(crate_dir.join(file).is_file(), "{file} exists");
    }
}
