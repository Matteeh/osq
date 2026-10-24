//! The one command entry point and the delivery pass it ends with.

use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{EventKind, Feature, FeatureError, Invocation, Output, Reaction, parse_event_line};
use osq_kernel_storage::ChangeEntry;

use super::changes::delivered_changes;
use super::cursor::{self, Cursor};
use super::event_file::{self, EventFile};
use super::failure::ReactionFailure;
use super::lock::{self, DeliveryLock};

/// What one command through the loop gave: its result and delivery's reports.
///
/// Implements: rust-loop/command-entry-point
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CommandRun {
    /// What the command itself gave.
    pub result: Result<Output, FeatureError>,
    /// Delivery failures, in the order they happened.
    pub failures: Vec<ReactionFailure>,
    /// Delivery warnings, in the order they happened.
    pub warnings: Vec<String>,
}

/// Runs one command through its feature, then delivers new events.
///
/// Implements: rust-loop/command-entry-point
#[must_use]
pub fn run_command(features: &[Box<dyn Feature>], invocation: &Invocation) -> CommandRun {
    let result = match features
        .iter()
        .find(|feature| lists(feature.as_ref(), &invocation.command))
    {
        Some(feature) => feature.run(invocation),
        None => Err(FeatureError::unknown_command(invocation.command.clone())),
    };
    let mut command_run = CommandRun {
        result,
        failures: Vec::new(),
        warnings: Vec::new(),
    };
    deliver(features, &invocation.root, &mut command_run);
    command_run
}

/// Whether a feature lists a command name.
///
/// Implements: rust-loop/command-entry-point
fn lists(feature: &dyn Feature, name: &str) -> bool {
    feature
        .commands()
        .iter()
        .any(|command| command.name == name)
}

/// Delivers the root's active changes when any feature reacts.
///
/// Implements: rust-loop/event-delivery
fn deliver(features: &[Box<dyn Feature>], root: &Path, run: &mut CommandRun) {
    let reacting: Vec<(&dyn Feature, Vec<EventKind>)> = features
        .iter()
        .filter_map(|feature| {
            let kinds = feature.reacts_to();
            if kinds.is_empty() {
                None
            } else {
                Some((feature.as_ref(), kinds))
            }
        })
        .collect();
    if reacting.is_empty() {
        return;
    }
    let changes = match delivered_changes(root) {
        Ok(changes) => changes,
        Err(failure) => {
            run.failures.push(failure);
            return;
        }
    };
    for change in changes {
        match lock::take(&change.path, &change.folder) {
            DeliveryLock::Held(_guard) => deliver_change(root, &change, &reacting, run),
            DeliveryLock::Skipped => {}
            DeliveryLock::Failed(failure) => run.failures.push(failure),
        }
    }
}

/// Delivers one change to each reacting feature, under its held lock.
///
/// Implements: rust-loop/event-delivery
fn deliver_change(
    root: &Path,
    change: &ChangeEntry,
    features: &[(&dyn Feature, Vec<EventKind>)],
    run: &mut CommandRun,
) {
    for &(feature, ref kinds) in features {
        let mut offsets = match cursor::read(&change.path, &change.folder, feature.name()) {
            Ok(offsets) => offsets,
            Err(failure) => {
                run.failures.push(failure);
                continue;
            }
        };
        let mut delivery = FeatureDelivery {
            root,
            change,
            feature,
            kinds,
            offsets: &mut offsets,
        };
        delivery.files(run);
    }
}

/// One feature's delivery to one change, with its kinds and cursor.
struct FeatureDelivery<'a> {
    /// The project root given to each reaction.
    root: &'a Path,
    /// The change being delivered.
    change: &'a ChangeEntry,
    /// The feature that reacts.
    feature: &'a dyn Feature,
    /// The event kinds the feature lists.
    kinds: &'a [EventKind],
    /// The feature's offsets for this change.
    offsets: &'a mut Cursor,
}

impl FeatureDelivery<'_> {
    /// Delivers each event file of the change, stopping when one fails a
    /// reaction.
    ///
    /// Implements: rust-loop/event-delivery
    fn files(&mut self, run: &mut CommandRun) {
        for (name, path) in event_files(&self.change.path) {
            if self.file(&name, &path, run) {
                break;
            }
        }
    }

    /// Delivers one event file, returning whether to stop the feature.
    ///
    /// Implements: rust-loop/event-delivery
    fn file(&mut self, name: &str, path: &Path, run: &mut CommandRun) -> bool {
        let mut file = match EventFile::open(path) {
            Ok(file) => file,
            Err(error) => {
                self.failure(run, format!("event file {name} could not be read: {error}"));
                return false;
            }
        };
        let offset = self.offsets.get(name).copied().unwrap_or(0);
        match file.size().cmp(&offset) {
            Ordering::Equal => return false,
            Ordering::Less => {
                self.failure(run, format!("event file {name} is shorter than its cursor"));
                return false;
            }
            Ordering::Greater => {}
        }
        if !file.starts_line(offset).unwrap_or(false) {
            self.failure(run, format!("cursor of {name} is not at a line start"));
            return false;
        }
        let bytes = match file.read_from(offset) {
            Ok(bytes) => bytes,
            Err(error) => {
                self.failure(run, format!("event file {name} could not be read: {error}"));
                return false;
            }
        };
        self.lines(name, offset, &bytes, run)
    }

    /// Delivers the complete lines read from one event file.
    ///
    /// Implements: rust-loop/event-delivery
    fn lines(&mut self, name: &str, offset: u64, bytes: &[u8], run: &mut CommandRun) -> bool {
        let mut position = offset;
        let mut moved = false;
        for line in event_file::lines(event_file::complete(bytes)) {
            let end = position + line.len() as u64 + 1;
            let text = String::from_utf8_lossy(line);
            let envelope = match parse_event_line(&text) {
                Ok(envelope) => envelope,
                Err(error) => {
                    run.warnings.push(format!(
                        "{} passed over byte {position} of {name} in {}: {error}",
                        self.feature.name(),
                        self.change.folder
                    ));
                    position = end;
                    moved = true;
                    continue;
                }
            };
            let kind = envelope.event.kind();
            if !self.kinds.contains(&kind) {
                position = end;
                moved = true;
                continue;
            }
            let reaction = Reaction::new(self.root, &self.change.path, &envelope);
            if let Err(error) = self.feature.react(&reaction) {
                run.failures.push(ReactionFailure::new(
                    self.feature.name(),
                    kind.name(),
                    &self.change.folder,
                    error.to_string(),
                ));
                if moved {
                    self.write_offset(name, position, run);
                }
                return true;
            }
            position = end;
            moved = true;
            if !self.write_offset(name, position, run) {
                return true;
            }
        }
        if moved {
            self.write_offset(name, position, run);
        }
        false
    }

    /// Writes one moved offset, reporting a write that fails.
    ///
    /// Implements: rust-loop/delivery-cursor
    fn write_offset(&mut self, name: &str, offset: u64, run: &mut CommandRun) -> bool {
        self.offsets.insert(name.to_owned(), offset);
        match cursor::write(&self.change.path, self.feature.name(), self.offsets) {
            Ok(()) => true,
            Err(error) => {
                self.failure(
                    run,
                    format!("cursor of {name} could not be written: {error}"),
                );
                false
            }
        }
    }

    /// Reports one failure with no event for this feature and change.
    ///
    /// Implements: rust-loop/reaction-failures
    fn failure(&self, run: &mut CommandRun, message: String) {
        run.failures.push(ReactionFailure::new(
            self.feature.name(),
            "",
            &self.change.folder,
            message,
        ));
    }
}

/// Lists a change's event files by name, in byte order.
///
/// Implements: rust-loop/event-delivery
fn event_files(change: &Path) -> Vec<(String, PathBuf)> {
    let directory = change.join(".run").join("events");
    let Ok(entries) = fs::read_dir(directory) else {
        return Vec::new();
    };
    let mut files: Vec<(String, PathBuf)> = entries
        .flatten()
        .filter_map(|entry| {
            if !entry.file_type().ok()?.is_file() {
                return None;
            }
            let path = entry.path();
            if path
                .extension()
                .is_none_or(|extension| extension != "jsonl")
            {
                return None;
            }
            let name = path.file_name()?.to_str()?.to_owned();
            Some((name, path))
        })
        .collect();
    files.sort_by(|left, right| left.0.as_bytes().cmp(right.0.as_bytes()));
    files
}
