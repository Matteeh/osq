//! The outcome facts one task's own event stream gives the read model.
//!
//! Implements: rust-storage/task-stream-outcomes

use osq_core::Event;
use osq_core::event::MeasuresData;
use serde_json::Value;

/// What a task's own `<n>.jsonl` stream says, as TypeScript's
/// `deriveTaskOutcomes` reads it.
///
/// A task without a stream holds the [`Default`] facts: no `start_scope_files`,
/// no `scope_hash_paths`, no `changed_files` and `first_attempt_passed` false.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TaskOutcomeFacts {
    /// The `scopeFiles` of the first `measures` event whose phase is `start`.
    pub start_scope_files: Option<u64>,
    /// The keys of `scopeHashes` in the last `end` measures event that holds a
    /// JSON object, sorted by bytes.
    pub scope_hash_paths: Option<Vec<String>>,
    /// The `changedFiles` of the last `measures` event whose phase is `end`.
    pub changed_files: Option<u64>,
    /// Whether the first `started` event was followed by `done` first.
    pub first_attempt_passed: bool,
}

/// Where the first attempt of a task's stream stands.
#[derive(Clone, Copy)]
enum FirstAttempt {
    /// No `started` event has been seen yet.
    Before,
    /// The first `started` event has been seen and can still pass.
    Running,
    /// The first attempt is over.
    Settled,
}

/// Accumulates one task stream's outcome facts as its events arrive.
pub(super) struct OutcomeAccumulator {
    /// The facts gathered so far.
    facts: TaskOutcomeFacts,
    /// Where the first attempt stands.
    first: FirstAttempt,
}

impl OutcomeAccumulator {
    /// An accumulator for one task's stream, before any event.
    pub(super) fn new() -> Self {
        Self {
            facts: TaskOutcomeFacts::default(),
            first: FirstAttempt::Before,
        }
    }

    /// Records one parsed event of the task's own stream.
    pub(super) fn observe(&mut self, event: &Event) {
        match event {
            Event::Measures(data) => self.measures(data),
            Event::Started(_) => self.started(),
            Event::Done(_) => self.done(),
            Event::Dead(_) | Event::Regressed(_) => self.settle(),
            _ => {}
        }
    }

    /// Reads the first start's scope count and the last end's changes.
    fn measures(&mut self, data: &MeasuresData) {
        match data.phase.as_str() {
            "start" => {
                if self.facts.start_scope_files.is_none() {
                    self.facts.start_scope_files = Some(data.scope_files);
                }
            }
            "end" => {
                self.facts.changed_files = data.changed_files;
                if let Some(Value::Object(hashes)) = &data.scope_hashes {
                    let mut paths: Vec<String> = hashes.keys().cloned().collect();
                    paths.sort();
                    self.facts.scope_hash_paths = Some(paths);
                }
            }
            _ => {}
        }
    }

    /// Records one `started` event: a second start means the first did not pass.
    fn started(&mut self) {
        self.first = match self.first {
            FirstAttempt::Before => FirstAttempt::Running,
            FirstAttempt::Running | FirstAttempt::Settled => FirstAttempt::Settled,
        };
    }

    /// Records one `done` event, which passes a running first attempt.
    fn done(&mut self) {
        if matches!(self.first, FirstAttempt::Running) {
            self.facts.first_attempt_passed = true;
        }
        self.settle();
    }

    /// Ends the first attempt without passing it.
    fn settle(&mut self) {
        if matches!(self.first, FirstAttempt::Running) {
            self.first = FirstAttempt::Settled;
        }
    }

    /// Returns the gathered facts.
    pub(super) fn build(self) -> TaskOutcomeFacts {
        self.facts
    }
}
