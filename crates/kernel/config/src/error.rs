//! The typed errors `osq.toml` parsing reports.

use std::fmt;
use std::path::PathBuf;

/// Why `osq.toml` could not become a `Config`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConfigError {
    /// The file could not be read.
    Read {
        /// The path osq tried to read.
        path: PathBuf,
        /// The operating system's message.
        message: String,
    },
    /// The text is not valid TOML.
    Syntax {
        /// The parser's message.
        message: String,
    },
    /// The text holds a key `osq.toml` does not know.
    UnknownKey {
        /// The dotted path of the key.
        key: String,
    },
    /// A key holds a value of the wrong type.
    WrongType {
        /// The dotted path of the key.
        key: String,
        /// The type's name, such as `a boolean`.
        expected: &'static str,
    },
    /// A key holds a value TypeScript refuses.
    InvalidValue {
        /// The dotted path of the key.
        key: String,
        /// Why the value is refused.
        reason: String,
    },
}

impl fmt::Display for ConfigError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Read { path, message } => {
                write!(formatter, "cannot read {}: {message}", path.display())
            }
            Self::Syntax { message } => {
                write!(formatter, "osq.toml is not valid TOML: {message}")
            }
            Self::UnknownKey { key } => write!(formatter, "{key} is not an osq.toml key"),
            Self::WrongType { key, expected } => write!(formatter, "{key} must be {expected}"),
            Self::InvalidValue { key, reason } => write!(formatter, "{key} {reason}"),
        }
    }
}

impl std::error::Error for ConfigError {}
