//! Why building the SQLite read model failed.

use std::fmt;

use crate::read::StorageError;

/// Why the read model could not be written.
#[derive(Debug)]
pub enum ReadModelError {
    /// Reading the archived changes failed.
    Storage(StorageError),
    /// Opening or writing the SQLite database failed.
    Sqlite(rusqlite::Error),
    /// A file operation failed: removing a leftover rebuild file, opening the
    /// rebuild database, or renaming it over the database path.
    Io(std::io::Error),
    /// A trial labels file is not a JSON object of true or false labels.
    Labels(String),
}

impl fmt::Display for ReadModelError {
    /// Writes the error's message.
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Storage(source) => write!(formatter, "{source}"),
            Self::Sqlite(source) => write!(formatter, "sqlite: {source}"),
            Self::Io(source) => write!(formatter, "io: {source}"),
            Self::Labels(message) => write!(formatter, "{message}"),
        }
    }
}

impl std::error::Error for ReadModelError {
    /// The error that caused this one.
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Storage(source) => Some(source),
            Self::Sqlite(source) => Some(source),
            Self::Io(source) => Some(source),
            Self::Labels(_) => None,
        }
    }
}

impl From<StorageError> for ReadModelError {
    /// Wraps a storage read failure.
    fn from(source: StorageError) -> Self {
        Self::Storage(source)
    }
}

impl From<rusqlite::Error> for ReadModelError {
    /// Wraps a SQLite failure.
    fn from(source: rusqlite::Error) -> Self {
        Self::Sqlite(source)
    }
}

impl From<std::io::Error> for ReadModelError {
    /// Wraps an operating system failure.
    fn from(source: std::io::Error) -> Self {
        Self::Io(source)
    }
}
