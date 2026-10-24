//! Helpers shared by the loop's command-entry and delivery tests.
//!
//! Each test binary compiles this module on its own, so some helpers are
//! unused in a given binary even though another test uses them.
#![allow(dead_code)]

use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use osq_core::event::{DeadData, DeadReason, RejectedData};
use osq_core::{
    Command, Envelope, Event, EventKind, Feature, FeatureError, Invocation, Output, event_line,
};

/// One call a test feature recorded.
#[derive(Clone, Debug, PartialEq)]
pub enum Call {
    /// The feature's `run` was called for this command.
    Run(String),
    /// The feature's `react` was called for this change and event.
    React {
        /// The change folder's name.
        change: String,
        /// The event it was called with.
        event: Box<Event>,
    },
}

/// What a test feature does after recording one reaction.
#[derive(Clone)]
pub enum Behavior {
    /// Return nothing.
    Record,
    /// Append one `rejected` line with this reason to `change.jsonl`.
    AppendRejected(String),
}

/// A hand-written feature that records its calls.
#[derive(Clone)]
pub struct TestFeature {
    /// The feature's name.
    pub name: String,
    /// The commands the feature lists.
    pub commands: Vec<Command>,
    /// The event kinds the feature reacts to.
    pub kinds: Vec<EventKind>,
    /// What each listed command's `run` gives.
    pub runs: BTreeMap<String, Result<Output, FeatureError>>,
    /// What `react` does after recording the call.
    pub behavior: Behavior,
    /// Every call the feature recorded.
    pub calls: Arc<Mutex<Vec<Call>>>,
}

impl TestFeature {
    /// Builds a named feature with no commands, kinds or calls yet.
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_owned(),
            commands: Vec::new(),
            kinds: Vec::new(),
            runs: BTreeMap::new(),
            behavior: Behavior::Record,
            calls: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Adds one command the feature lists.
    pub fn command(mut self, name: &str, summary: &str, usage: &str) -> Self {
        self.commands.push(Command::new(name, summary, usage));
        self
    }

    /// Sets what one command's `run` gives.
    pub fn result(mut self, command: &str, result: Result<Output, FeatureError>) -> Self {
        self.runs.insert(command.to_owned(), result);
        self
    }

    /// Sets the event kinds the feature reacts to.
    pub fn kinds(mut self, kinds: &[EventKind]) -> Self {
        self.kinds = kinds.to_vec();
        self
    }

    /// Sets what `react` does after recording the call.
    pub fn behavior(mut self, behavior: Behavior) -> Self {
        self.behavior = behavior;
        self
    }

    /// The calls recorded so far.
    pub fn recorded(&self) -> Vec<Call> {
        self.calls.lock().expect("the call log is readable").clone()
    }
}

impl Feature for TestFeature {
    /// The feature's name.
    fn name(&self) -> &str {
        &self.name
    }

    /// The commands the feature lists.
    fn commands(&self) -> Vec<Command> {
        self.commands.clone()
    }

    /// Records the call and returns the command's configured result.
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        self.calls
            .lock()
            .expect("the call log is writable")
            .push(Call::Run(invocation.command.clone()));
        self.runs
            .get(&invocation.command)
            .cloned()
            .unwrap_or_else(|| Err(FeatureError::unknown_command(invocation.command.clone())))
    }

    /// The event kinds the feature reacts to.
    fn reacts_to(&self) -> Vec<EventKind> {
        self.kinds.clone()
    }

    /// Records the event and then does the configured behavior.
    fn react(&self, reaction: &osq_core::Reaction<'_>) -> Result<Output, FeatureError> {
        self.calls
            .lock()
            .expect("the call log is writable")
            .push(Call::React {
                change: folder_name(reaction.change),
                event: Box::new(reaction.envelope.event.clone()),
            });
        match &self.behavior {
            Behavior::Record => Ok(Output::text("")),
            Behavior::AppendRejected(reason) => {
                append_raw(
                    reaction.change,
                    "change.jsonl",
                    &format!("{}\n", rejected(reason)),
                );
                Ok(Output::text(""))
            }
        }
    }
}

/// A fresh scratch root under `CARGO_TARGET_TMPDIR`, named after its test and row.
pub fn scratch(test: &str, row: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("delivery_tests")
        .join(test)
        .join(row);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Creates one active change folder and returns its path.
pub fn active_change(root: &Path, folder: &str) -> PathBuf {
    let path = root.join("openspec").join("changes").join(folder);
    fs::create_dir_all(&path).expect("the change folder is created");
    path
}

/// Creates one archived change folder and returns its path.
pub fn archived_change(root: &Path, folder: &str) -> PathBuf {
    let path = root
        .join("openspec")
        .join("changes")
        .join("archive")
        .join(folder);
    fs::create_dir_all(&path).expect("the archived change folder is created");
    path
}

/// Writes complete event lines, each followed by a newline, to one event file.
pub fn write_events(change: &Path, file: &str, lines: &[String]) {
    let mut text = String::new();
    for line in lines {
        text.push_str(line);
        text.push('\n');
    }
    write_raw(change, file, &text);
}

/// Writes raw bytes to one event file.
pub fn write_raw(change: &Path, file: &str, text: &str) {
    let path = event_path(change, file);
    fs::create_dir_all(path.parent().expect("the event file has a folder"))
        .expect("the event folder is created");
    fs::write(path, text).expect("the event file is written");
}

/// Appends raw text to one event file, creating it when missing.
pub fn append_raw(change: &Path, file: &str, text: &str) {
    let path = event_path(change, file);
    fs::create_dir_all(path.parent().expect("the event file has a folder"))
        .expect("the event folder is created");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .expect("the event file is opened");
    file.write_all(text.as_bytes())
        .expect("the event text is written");
}

/// One event file's path inside a change folder.
pub fn event_path(change: &Path, file: &str) -> PathBuf {
    change.join(".run").join("events").join(file)
}

/// One feature's cursor file's path inside a change folder.
pub fn cursor_path(change: &Path, feature: &str) -> PathBuf {
    change.join(".run").join("delivered").join(feature)
}

/// Reads one feature's cursor file, or nothing when it is missing.
pub fn read_cursor(change: &Path, feature: &str) -> Option<String> {
    fs::read_to_string(cursor_path(change, feature)).ok()
}

/// Writes one feature's cursor file, creating its folder.
pub fn write_cursor(change: &Path, feature: &str, text: &str) {
    let path = cursor_path(change, feature);
    fs::create_dir_all(path.parent().expect("the cursor file has a folder"))
        .expect("the cursor folder is created");
    fs::write(path, text).expect("the cursor file is written");
}

/// The change folder's name.
pub fn folder_name(change: &Path) -> String {
    change
        .file_name()
        .expect("the change folder has a name")
        .to_string_lossy()
        .into_owned()
}

/// A complete `rejected` event line with the given reason.
pub fn rejected(reason: &str) -> String {
    event_line(&Envelope {
        timestamp: "2026-10-24T00:00:00Z".to_owned(),
        event: Event::Rejected(RejectedData {
            reason: reason.to_owned(),
        }),
    })
}

/// A complete `dead` event line.
pub fn dead() -> String {
    event_line(&Envelope {
        timestamp: "2026-10-24T00:00:00Z".to_owned(),
        event: Event::Dead(DeadData {
            task: "1".to_owned(),
            reason: DeadReason::NoResult,
        }),
    })
}
