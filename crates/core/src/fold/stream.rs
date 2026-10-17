//! The stream an events file holds, and the order task ids sort in.
//!
//! Implements: rust-core/event-streams

use std::cmp::Ordering;
use std::fmt;

/// A task's id, ordered by its leading number first and then by its text.
///
/// The order matches the TypeScript `compareNumericPrefix`: `2` sorts before
/// `10`, because `2` is the smaller number.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct TaskId(String);

impl TaskId {
    /// Builds a task id from its text.
    ///
    /// Implements: rust-core/event-streams
    #[must_use]
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    /// The task id's text.
    ///
    /// Implements: rust-core/event-streams
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for TaskId {
    /// Writes the task id's text.
    ///
    /// Implements: rust-core/event-streams
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl Ord for TaskId {
    /// Orders by leading number first and then by text.
    ///
    /// Implements: rust-core/event-streams
    fn cmp(&self, other: &Self) -> Ordering {
        match (leading_number(&self.0), leading_number(&other.0)) {
            (Some(left), Some(right)) if left != right => left.cmp(&right),
            _ => self.0.cmp(&other.0),
        }
    }
}

impl PartialOrd for TaskId {
    /// Orders by leading number first and then by text.
    ///
    /// Implements: rust-core/event-streams
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl From<&str> for TaskId {
    /// Builds a task id from its text.
    ///
    /// Implements: rust-core/event-streams
    fn from(id: &str) -> Self {
        Self(id.to_owned())
    }
}

/// The stream one events file holds.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum Stream {
    /// A task's own stream.
    Task(TaskId),
    /// The change-level stream.
    Change,
    /// The validator's stream.
    Validator,
}

impl Stream {
    /// Reads the stream a file name holds, or `None` for any other name.
    ///
    /// Implements: rust-core/event-streams
    #[must_use]
    pub fn from_file_name(name: &str) -> Option<Self> {
        match name {
            "change.jsonl" => Some(Self::Change),
            "validator.jsonl" => Some(Self::Validator),
            _ => {
                let stem = name.strip_suffix(".jsonl")?;
                if stem.is_empty() || !stem.bytes().all(|byte| byte.is_ascii_digit()) {
                    return None;
                }
                Some(Self::Task(TaskId::new(stem)))
            }
        }
    }
}

/// The number a text leads with, or `None` when it leads with no digit.
fn leading_number(text: &str) -> Option<u128> {
    let digits: String = text.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse().ok()
    }
}
