//! Why a git command failed.
//!
//! Implements: rust-vcs/git-command

use std::fmt;
use std::time::Duration;

/// Why a git command failed.
///
/// Implements: rust-vcs/git-command
#[derive(Debug)]
pub enum VcsError {
    /// The git program could not be started.
    Spawn {
        /// The program and every argument, joined by single spaces.
        command: String,
        /// The operating system's error starting the program.
        source: std::io::Error,
    },
    /// Git refused a write.
    Failed {
        /// The program and every argument, joined by single spaces.
        command: String,
        /// The command's standard output followed by its standard error.
        output: String,
    },
    /// The command outlived the limit that bounded it.
    TimedOut {
        /// The program and every argument, joined by single spaces.
        command: String,
        /// The limit that bounded the command.
        limit: Duration,
    },
}

impl fmt::Display for VcsError {
    /// Writes `could not run <command>: <source>`.
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Spawn { command, source } => {
                write!(formatter, "could not run {command}: {source}")
            }
            Self::Failed { command, output } => {
                write!(formatter, "{command} failed: {output}")
            }
            Self::TimedOut { command, limit } => {
                write!(formatter, "{command} timed out after {limit:?}")
            }
        }
    }
}

impl std::error::Error for VcsError {
    /// The error that caused this one.
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Spawn { source, .. } => Some(source),
            Self::Failed { .. } | Self::TimedOut { .. } => None,
        }
    }
}
