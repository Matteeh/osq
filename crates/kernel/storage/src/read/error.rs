//! Why reading a change folder or its event files failed.
//!
//! Implements: rust-storage/event-file-errors

use std::fmt;
use std::path::PathBuf;

use osq_core::EventError;

/// Why storage could not read a file it needed.
#[derive(Debug)]
pub enum StorageError {
    /// A file that exists could not be read.
    Read {
        /// The path that could not be read.
        path: PathBuf,
        /// The operating system's error.
        source: std::io::Error,
    },
    /// An event line was refused, naming where it sits.
    EventLine {
        /// The events file that holds the line.
        path: PathBuf,
        /// The 1-based line number in that file.
        line: usize,
        /// Why rust-core refused the line.
        source: EventError,
    },
}

impl fmt::Display for StorageError {
    /// Writes the error's message, naming the file and, for a line, its number.
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Read { path, source } => {
                write!(formatter, "failed to read {}: {source}", path.display())
            }
            Self::EventLine { path, line, source } => {
                write!(formatter, "{}:{line}: {source}", path.display())
            }
        }
    }
}

impl std::error::Error for StorageError {
    /// The error that caused this one.
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Read { source, .. } => Some(source),
            Self::EventLine { source, .. } => Some(source),
        }
    }
}
