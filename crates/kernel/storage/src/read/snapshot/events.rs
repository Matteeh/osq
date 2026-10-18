//! Reading a change's event files into a folded state and the table facts.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{ChangeState, Envelope, Event, Stream, TaskId, apply, parse_event_line};
use yaml_rust2::{Yaml, YamlLoader};

use crate::read::StorageError;
use crate::read::text::timestamp_ms;

use super::folder::read_events_file;
use super::{DeadAttempt, EventFacts};

/// Reads every events file of a change, folding it and gathering the facts.
///
/// `None` facts mean the change has no `.run/events/` directory at all.
pub(super) fn read_events(
    folder: &Path,
    task_ids: Vec<TaskId>,
) -> Result<(ChangeState, Option<EventFacts>), StorageError> {
    let dir = folder.join(".run").join("events");
    if !dir.is_dir() {
        return Ok((ChangeState::new(task_ids), None));
    }
    let mut state = ChangeState::new(task_ids);
    let mut facts = Facts::new();
    for (stream, path) in collect_files(&dir)? {
        state = read_stream(&path, &stream, state, &mut facts)?;
    }
    Ok((state, Some(facts.build())))
}

/// The event files of a directory: task streams in id order, then change, then validator.
fn collect_files(dir: &Path) -> Result<Vec<(Stream, PathBuf)>, StorageError> {
    let entries = fs::read_dir(dir).map_err(|source| StorageError::Read {
        path: dir.to_path_buf(),
        source,
    })?;
    let mut tasks: BTreeMap<TaskId, PathBuf> = BTreeMap::new();
    let mut change = None;
    let mut validator = None;
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        match Stream::from_file_name(name) {
            Some(Stream::Task(id)) => {
                tasks.insert(id, path);
            }
            Some(Stream::Change) => change = Some(path),
            Some(Stream::Validator) => validator = Some(path),
            None => {}
        }
    }
    let mut files: Vec<(Stream, PathBuf)> = tasks
        .into_iter()
        .map(|(id, path)| (Stream::Task(id), path))
        .collect();
    if let Some(path) = change {
        files.push((Stream::Change, path));
    }
    if let Some(path) = validator {
        files.push((Stream::Validator, path));
    }
    Ok(files)
}

/// Reads one file's lines in order, skipping blanks and failing on any other refusal.
fn read_stream(
    path: &Path,
    stream: &Stream,
    mut state: ChangeState,
    facts: &mut Facts,
) -> Result<ChangeState, StorageError> {
    let text = read_events_file(path)?;
    for (offset, line) in text.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        let envelope = parse_event_line(line).map_err(|source| StorageError::EventLine {
            path: path.to_path_buf(),
            line: offset + 1,
            source,
        })?;
        facts.observe(stream, &envelope, line);
        state = apply(state, stream, &envelope.event);
    }
    Ok(state)
}

/// The facts the read model tables need, gathered while the events fold.
struct Facts {
    /// The `started` events of each task stream, keyed by its task id.
    started: BTreeMap<TaskId, u64>,
    /// The `retry` events whose `automatic` is not true.
    halts: u64,
    /// The sum of every reported `tokens` cost.
    cost: f64,
    /// Whether any `tokens` event reported a finite cost.
    cost_reported: bool,
    /// The `dead` events of the task streams.
    dead: Vec<DeadAttempt>,
    /// The last `archived` event's timestamp in `change.jsonl`.
    archived_at: Option<String>,
}

impl Facts {
    /// An empty accumulator.
    fn new() -> Self {
        Self {
            started: BTreeMap::new(),
            halts: 0,
            cost: 0.0,
            cost_reported: false,
            dead: Vec::new(),
            archived_at: None,
        }
    }

    /// Records one parsed event of a stream, with its raw line for exact numbers.
    fn observe(&mut self, stream: &Stream, envelope: &Envelope, line: &str) {
        match &envelope.event {
            Event::Started(_) => self.record_started(stream),
            Event::Dead(data) => self.record_dead(stream, &data.task, &data.reason),
            Event::Retry(data) => self.record_retry(stream, data.automatic),
            Event::Tokens(_) => self.record_tokens(stream, line),
            Event::Archived(_) => self.record_archived(stream, &envelope.timestamp),
            _ => {}
        }
    }

    /// Counts one `started` event of a task stream.
    fn record_started(&mut self, stream: &Stream) {
        if let Stream::Task(id) = stream {
            *self.started.entry(id.clone()).or_insert(0) += 1;
        }
    }

    /// Records one `dead` event of a task stream, with its trimming rules.
    fn record_dead(&mut self, stream: &Stream, task: &str, reason: &str) {
        let Stream::Task(id) = stream else {
            return;
        };
        self.dead.push(DeadAttempt {
            task: non_empty(task).unwrap_or_else(|| id.as_str().to_owned()),
            reason: non_empty(reason).unwrap_or_else(|| String::from("unknown")),
        });
    }

    /// Counts one `retry` event of a task or change stream made by hand.
    fn record_retry(&mut self, stream: &Stream, automatic: Option<bool>) {
        if matches!(stream, Stream::Task(_) | Stream::Change) && automatic != Some(true) {
            self.halts += 1;
        }
    }

    /// Adds one task stream `tokens` event's finite cost, read exactly from
    /// its line so a 17-digit decimal sums as TypeScript's parse does.
    fn record_tokens(&mut self, stream: &Stream, line: &str) {
        if !matches!(stream, Stream::Task(_)) {
            return;
        }
        if let Some(value) = exact_cost(line).filter(|value| value.is_finite()) {
            self.cost += value;
            self.cost_reported = true;
        }
    }

    /// Keeps the last readable `archived` timestamp of the change stream.
    fn record_archived(&mut self, stream: &Stream, timestamp: &str) {
        if *stream == Stream::Change && timestamp_ms(timestamp).is_some() {
            self.archived_at = Some(timestamp.to_owned());
        }
    }

    /// Turns the accumulator into the facts task 2 reads.
    fn build(self) -> EventFacts {
        EventFacts {
            started: self.started,
            halts: self.halts,
            cost: self.cost_reported.then_some(self.cost),
            dead_attempts: self.dead,
            archived_at: self.archived_at,
        }
    }
}

/// A trimmed non-empty string, or `None`.
fn non_empty(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

/// The `cost` one `tokens` line reports, parsed exactly from its text.
///
/// The line is JSON, which is YAML, and `yaml-rust2` reads a decimal with
/// `f64::from_str`, which is correctly rounded, as TypeScript's number parse
/// is. The `serde_json` value the fold keeps is one unit in the last place off
/// for some 17-digit decimals, which would make the summed table cost differ.
fn exact_cost(line: &str) -> Option<f64> {
    let documents = YamlLoader::load_from_str(line).ok()?;
    let data = documents
        .first()?
        .as_hash()?
        .get(&Yaml::String(String::from("data")))?;
    data.as_hash()?
        .get(&Yaml::String(String::from("cost")))?
        .as_f64()
}
