//! Proves that `run_cli` prints a reaction failure and a delivery warning.

use std::fs::{self, OpenOptions};
use std::io::Write as _;
use std::path::{Path, PathBuf};

use osq_cli::{CliResult, run_cli};
use osq_core::event::RejectedData;
use osq_core::{
    Command, Envelope, Event, EventKind, Feature, FeatureError, Invocation, Output, Reaction,
    event_line,
};

/// The change folder both scenarios deliver to.
const CHANGE: &str = "001-a";

/// The event file both scenarios write.
const EVENT_FILE: &str = "change.jsonl";

/// A `make` feature that appends one line and returns `made`.
struct MakeFeature {
    /// The line `run` appends, without its newline.
    line: String,
}

impl Feature for MakeFeature {
    /// The feature's name.
    fn name(&self) -> &'static str {
        "make"
    }

    /// The commands the feature lists.
    fn commands(&self) -> Vec<Command> {
        vec![Command::new("make", "makes", "")]
    }

    /// Appends the line and returns `made`.
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        append_line(invocation, &self.line);
        Ok(Output::text("made"))
    }
}

/// A `watch` feature that reacts to `rejected` and optionally fails.
struct WatchFeature {
    /// Whether a reaction returns a failure.
    fails: bool,
}

impl Feature for WatchFeature {
    /// The feature's name.
    fn name(&self) -> &'static str {
        "watch"
    }

    /// The commands the feature lists.
    fn commands(&self) -> Vec<Command> {
        Vec::new()
    }

    /// Refuses every command, since `watch` offers none.
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        Err(FeatureError::unknown_command(invocation.command.clone()))
    }

    /// The event kinds the feature reacts to.
    fn reacts_to(&self) -> Vec<EventKind> {
        vec![EventKind::Rejected]
    }

    /// Returns a failure when configured to, and nothing otherwise.
    fn react(&self, _reaction: &Reaction<'_>) -> Result<Output, FeatureError> {
        if self.fails {
            Err(FeatureError::failed("watch", "no"))
        } else {
            Ok(Output::text(""))
        }
    }
}

/// The command line's arguments as owned strings.
fn args(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_owned()).collect()
}

/// A fresh scratch root named after its test, holding the active change.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("openspec").join("changes").join(CHANGE))
        .expect("the scratch change is created");
    root
}

/// Appends one line and its newline to the change's event file.
fn append_line(invocation: &Invocation, line: &str) {
    let path = invocation
        .root
        .join("openspec")
        .join("changes")
        .join(CHANGE)
        .join(".run")
        .join("events")
        .join(EVENT_FILE);
    fs::create_dir_all(path.parent().expect("the event file has a folder"))
        .expect("the event folder is created");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .expect("the event file is opened");
    writeln!(file, "{line}").expect("the event line is written");
}

/// A complete `rejected` event line, without its newline.
fn rejected() -> String {
    event_line(&Envelope {
        timestamp: "2026-10-24T00:00:00Z".to_owned(),
        event: Event::Rejected(RejectedData {
            reason: "no".to_owned(),
        }),
    })
}

/// Proves that a failed reaction reaches stderr and exits 1.
///
/// Covers: rust-cli/reaction-failure-through-the-cli
#[test]
fn reaction_failure_through_the_cli() {
    let root = scratch("reaction-failure-through-the-cli");
    let registry: Vec<Box<dyn Feature>> = vec![
        Box::new(MakeFeature { line: rejected() }),
        Box::new(WatchFeature { fails: true }),
    ];
    let result = run_cli(&registry, &root, &args(&["make"]));
    assert_eq!(
        result,
        CliResult {
            stdout: "made".to_owned(),
            stderr: "watch could not handle rejected for 001-a: watch failed: no\n".to_owned(),
            code: 1,
        }
    );
}

/// Proves that a refused event line warns on stderr and keeps the exit code.
///
/// Covers: rust-cli/delivery-warning-through-the-cli
#[test]
fn delivery_warning_through_the_cli() {
    let root = scratch("delivery-warning-through-the-cli");
    let registry: Vec<Box<dyn Feature>> = vec![
        Box::new(MakeFeature {
            line: "not json".to_owned(),
        }),
        Box::new(WatchFeature { fails: false }),
    ];
    let result = run_cli(&registry, &root, &args(&["make"]));
    assert_eq!(
        result,
        CliResult {
            stdout: "made".to_owned(),
            stderr:
                "watch passed over byte 0 of change.jsonl in 001-a: line is not one JSON object\n"
                    .to_owned(),
            code: 0,
        }
    );
}
